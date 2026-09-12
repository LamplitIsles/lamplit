import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { once } from 'node:events';
import { createPartner } from '../runtime/partner.ts';
import { createWebServer } from '../runtime/server.ts';
import { fixture, eventually } from './fixture.ts';
import { partnerPaths } from '../runtime/storage-paths.ts';

test('real SDK context, tools, compaction, startup display repair, and terminal deduplication', { timeout: 20000 }, async () => {
  const f = await fixture(); let partner;
  try {
    partner = await createPartner(f.config, f.credentials);
    await assert.rejects(createPartner(f.config, f.credentials), /locked/);
    const id = randomUUID();
    f.useTool(); await partner.submit(id, 'hello');
    await eventually(async () => (await partner!.snapshot()).messages[0]?.answer !== null);
    assert.match(JSON.stringify(f.requests[0]), /<companion-context>/);
    assert.match(JSON.stringify(f.requests[1]), /custom_tool_call_output/);
    const before = await partner.snapshot();
    assert.equal(before.typing, false);
    f.summarize(); await partner.compact();
    assert.deepEqual((await partner.snapshot()).messages, before.messages);
    await partner.close(); partner = undefined;
    // Simulate the concrete crash gap: engine completion persisted while the
    // derived message result was not saved. Startup must repair it automatically.
    const db = new DatabaseSync(partnerPaths(join(f.directory, 'workspace')).database);
    db.prepare('UPDATE messages SET answer=NULL,usage=NULL WHERE id=?').run(id); db.close();
    const count = f.requests.length;
    f.config.provider.model = 'gpt-6-astra';
    await assert.rejects(createPartner(f.config, f.credentials), /Stored session uses/);
    f.config.provider.model = 'gpt-5.6-luna';
    partner = await createPartner(f.config, f.credentials);
    await eventually(async () => (await partner!.snapshot()).messages[0]?.answer !== null);
    await partner.submit(id, 'hello');
    assert.equal(f.requests.length, count);
    assert.equal((await partner.snapshot()).messages.length, 1);
    await assert.rejects(partner.submit(id, 'different input'));
    await partner.submit(randomUUID(), 'continue');
    await eventually(async () => (await partner!.snapshot()).messages[1]?.answer !== null);
    assert.match(JSON.stringify(f.requests.at(-1)), /PRIVATE_CHECKPOINT/);
    assert.equal(f.requests.at(-1)?.model, 'gpt-5.6-luna');
    assert.equal((await partner.snapshot()).typing, false);
    for (let index = 0; index < 5; index++) {
      await partner.submit(randomUUID(), `recent ${index}`);
      await eventually(async () => (await partner!.snapshot()).messages.at(-1)?.answer !== null);
    }
    f.summarize();
    const compacted = await partner.compact();
    const retainedUsers = compacted!.installed_history.filter(({ item }) => item.role === 'user');
    assert.equal(retainedUsers.length, 5);
    assert.doesNotMatch(JSON.stringify(retainedUsers), /hello/);
    assert.equal((await partner.snapshot()).messages.length, 7);
  } finally { await partner?.close(); await f.close(); }
});

test('Trusted local HTTP, reconnect snapshot, queue cancellation and resource release', { timeout: 20000 }, async () => {
  const f = await fixture();
  const partner = await createPartner(f.config, f.credentials);
  const app = createWebServer(partner, join(f.directory, 'assets'));
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const headers = { 'content-type': 'application/json' };
  try {
    assert.equal((await fetch(`${url}/api/session`)).status, 200);
    f.holdProvider(true);
    const first = randomUUID(), second = randomUUID();
    for (const id of [first, second]) assert.equal((await fetch(`${url}/api/messages`, { method: 'POST', headers, body: JSON.stringify({ id, input: id }) })).status, 202);
    await eventually(async () => (await partner.snapshot()).typing);
    await eventually(async () => f.requests.length === 1);
    const abort = new AbortController();
    const stream = await fetch(`${url}/api/events`, { headers, signal: abort.signal });
    const reader = stream.body!.getReader(); await reader.read(); abort.abort();
    assert.equal((await partner.snapshot()).typing, true);
    await partner.cancel(second); await partner.cancel(first);
    await eventually(async () => !(await partner.snapshot()).typing);
    const recovered = await (await fetch(`${url}/api/session`, { headers })).json();
    assert.equal(recovered.messages.length, 2);
    assert.equal(f.requests.length, 1);
  } catch (error) { console.error(error); throw error; }
  finally { try { await app.close(); } finally { await f.close(); } }
});

test('graceful close drains accepted messages instead of cancelling them', { timeout: 15000 }, async () => {
  const f = await fixture(); let partner = await createPartner(f.config, f.credentials);
  try {
    await partner.submit(randomUUID(), 'finish before normal shutdown');
    await partner.close();
    partner = await createPartner(f.config, f.credentials);
    const view = await partner.snapshot();
    assert.equal(view.messages[0].status, 'completed');
    assert.equal(view.messages[0].error, null);
    assert.equal(f.requests.length, 1);
  } finally { await partner.close(); await f.close(); }
});

test('Companion retains compact boundaries and exact context observation across restart', async () => {
  const f = await fixture(); let partner = await createPartner(f.config, f.credentials);
  try {
    const id = randomUUID(); await partner.submit(id, 'before compact');
    await eventually(async () => (await partner.snapshot()).messages[0]?.answer !== null);
    f.summarize(); await partner.compact();
    const compacted = await partner.snapshot();
    assert.equal(compacted.compactions.length, 1);
    assert.equal(compacted.compactions[0].anchorId, id);
    assert.equal(compacted.compactions[0].position, 'after');
    assert(compacted.context && compacted.context.activeTokens > 0);
    const afterId = randomUUID(); await partner.submit(afterId, 'after compact');
    await eventually(async () => (await partner.snapshot()).messages[1]?.answer !== null);
    const settled = await partner.snapshot(); await partner.close();
    partner = await createPartner(f.config, f.credentials);
    const reopened = await partner.snapshot();
    assert.deepEqual(reopened.compactions, settled.compactions);
    assert.deepEqual(reopened.context, settled.context);
    assert.equal(reopened.messages.length, 2);
    assert.doesNotMatch(JSON.stringify(reopened.compactions), /PRIVATE_CHECKPOINT/);
    f.summarize(); await partner.compact();
    const afterRestartCompact = await partner.snapshot();
    assert.equal(afterRestartCompact.compactions.at(-1)?.anchorId, afterId);
    assert.equal(afterRestartCompact.compactions.at(-1)?.position, 'after');
    assert.equal(afterRestartCompact.lifecycle.latest?.status, 'complete');
    await partner.close(); partner = await createPartner(f.config, f.credentials);
    assert.equal((await partner.snapshot()).lifecycle.latest, undefined);
  } finally { await partner.close(); await f.close(); }
});

test('failed compaction reports a transient failure without creating a boundary', async () => {
  const f = await fixture(); const partner = await createPartner(f.config, f.credentials);
  const { Store } = await import('../runtime/store.ts');
  try {
    await partner.submit(randomUUID(), 'prepare compact failure');
    await eventually(async () => (await partner.snapshot()).messages[0]?.answer !== null);
    f.summarize();
    const originalMessages = Store.prototype.messages;
    Store.prototype.messages = async function () { throw new Error('forced compact failure'); };
    try { await assert.rejects(partner.compact(), /forced compact failure/); }
    finally { Store.prototype.messages = originalMessages; }
    const view = await partner.snapshot();
    assert.equal(view.compactions.length, 0);
    assert.equal(view.lifecycle.latest?.status, 'failed');
  } finally { await partner.close(); await f.close(); }
});
