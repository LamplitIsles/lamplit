import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { once } from 'node:events';
import { Store } from '../runtime/store.ts';
import { createPartner } from '../runtime/partner.ts';
import { createWebServer } from '../runtime/server.ts';
import { mergeMessages } from '../src/lib/message-pages.ts';
import { fixture, eventually } from './fixture.ts';

test('history pages and bounded change batches retain stable ordering and restart cursors', async () => {
  const f = await fixture(); let store = new Store(join(f.directory, 'session.sqlite'));
  const ids = Array.from({length: 65}, () => randomUUID());
  try {
    for (const [index,id] of ids.entries()) { await store.admit(id, `message ${index}`); await store.finish(id, `answer ${index}`, null); }
    const recent = await store.messagePage();
    assert.deepEqual(recent.messages.map(m=>m.id), ids.slice(35));
    assert.equal(recent.hasMore, true);
    const previous = await store.messagePage({before: recent.before!});
    assert.deepEqual(previous.messages.map(m=>m.id), ids.slice(5,35));
    const first = await store.messagePage({before: previous.before!});
    assert.deepEqual(first.messages.map(m=>m.id), ids.slice(0,5));
    assert.equal(first.hasMore, false);
    assert.equal((await store.messagePage({after:recent.cursor})).messages.length,0);
    // An older-page response can arrive after a newer update to the same message.
    await store.finish(ids[5], 'updated answer', null);
    const changed = await store.messagePage({after: recent.cursor});
    assert.equal(changed.messages.length,1);
    const merged = mergeMessages(mergeMessages(recent.messages,changed.messages),previous.messages);
    assert.equal(merged.find(m=>m.id===ids[5])?.answer, 'updated answer');
    assert.equal(new Set(merged.map(m=>m.id)).size,merged.length);
    await store.close(); store = new Store(join(f.directory,'session.sqlite'));
    assert.equal((await store.messagePage({after:changed.cursor})).messages.length,0);
    for (const id of ids) await store.touchMessage(id);
    let cursor=changed.cursor; const seen = new Set<string>(); let batches=0;
    for (;;) {
      const batch=await store.messagePage({after:cursor}); batches++;
      assert(batch.messages.length<=30); assert(batch.cursor>cursor);
      batch.messages.forEach(m=>{assert(!seen.has(m.id));seen.add(m.id)});
      cursor=batch.cursor;
      if(!batch.hasChangesMore)break;
    }
    assert.equal(batches,3); assert.equal(seen.size,65);
    await assert.rejects(store.messagePage({after:cursor+1}), /ahead/);
  } finally { await store.close(); await f.close(); }
});

test('HTTP refresh returns no unchanged messages and reports completed and cancelled changes', async () => {
  const f=await fixture(); const partner=await createPartner(f.config,f.credentials);
  const app=createWebServer(partner,join(f.directory,'assets'));
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const url=`http://127.0.0.1:${(app.server.address() as {port:number}).port}/api/session`;
  try {
    const initial=await(await fetch(url)).json();
    f.holdProvider(true);
    const id=randomUUID(), queued=randomUUID();
    await partner.submit(id,'one');await partner.submit(queued,'two');
    const pending=await(await fetch(`${url}?after=${initial.cursor}`)).json();
    assert.equal(pending.messages.length,2); assert(pending.cancellable.includes(queued));
    await partner.cancel(queued);
    const cancelled=await(await fetch(`${url}?after=${pending.cursor}`)).json();
    assert(cancelled.messages.some((m:{id:string;status:string})=>m.id===queued&&m.status==='cancelled'));
    await partner.cancel(id);f.holdProvider(false);
    await eventually(async()=>!(await partner.snapshot()).typing);
    await partner.submit(randomUUID(),'completed');
    await eventually(async()=> (await partner.snapshot()).messages.at(-1)?.answer!==null);
    const complete=await(await fetch(`${url}?after=${cancelled.cursor}`)).json();
    assert(complete.messages.some((m:{answer:string|null})=>m.answer!==null));
    const unchanged=await(await fetch(`${url}?after=${complete.cursor}`)).json();
    assert.deepEqual(unchanged.messages,[]);
    assert.equal((await fetch(`${url}?before=1&after=1`)).status,400);
    assert.equal((await fetch(`${url}?before=-1`)).status,400);
    assert.equal((await fetch(`${url}?after=1.5`)).status,400);
  } finally {await app.close();await f.close();}
});
