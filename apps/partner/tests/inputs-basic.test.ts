import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { writeFile, readFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { createPartner } from '../runtime/partner.ts';
import { createWebServer } from '../runtime/server.ts';
import { Store } from '../runtime/store.ts';
import { inputImages } from '../runtime/images.ts';
import { skillTools } from '../runtime/tools/basic.ts';
import { fixture, eventually } from './fixture.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9F0AAAAASUVORK5CYII=';
const photo = { type: 'image' as const, mediaType: 'image/png' as const, name: 'sample.png', data: png };

test('image-only admission is atomic, recovers before SDK acceptance, projects outgoing and survives compaction', async () => {
  const f = await fixture(); let app;
  const id = randomUUID();
  const store = new Store(join(f.directory, 'session.sqlite'));
  await store.admit(id, '', inputImages(id, [photo]));
  await store.close();
  try {
    const partner = await createPartner(f.config, f.credentials);
    app = createWebServer(partner, join(f.directory, 'assets'));
    app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
    const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    await eventually(async () => (await partner.snapshot()).messages[0]?.answer !== null);
    assert.match(JSON.stringify(f.requests[0]), /data:image\/png;base64,/);
    const before = await partner.snapshot();
    assert.equal(before.messages[0].images.length, 0);
    assert.equal(before.messages[0].inputImages.length, 1);
    const image = before.messages[0].inputImages[0];
    const imagePath = join(f.directory, 'workspace', 'attachments', `${image.id}.png`);
    assert.equal((await readFile(imagePath)).toString('base64'), png);
    assert.ok(JSON.stringify(f.requests[0]).includes(imagePath));
    const response = await fetch(`${url}${image.url}`);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.from(await response.arrayBuffer()).toString('base64'), png);
    const submit = (value: unknown) => fetch(`${url}/api/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal((await submit({ id, input: '', images: [photo] })).status, 202);
    assert.equal((await submit({ id, input: '', images: [{ ...photo, name: 'changed.png' }] })).status, 400);
    assert.equal((await submit({ id: randomUUID(), input: '', images: [{ ...photo, mediaType: 'image/jpeg' }] })).status, 422);
    assert.equal((await partner.snapshot()).messages.length, 1);
    const diagnostics = await partner.diagnostics(0);
    const events = diagnostics.map(row => JSON.parse(String(row.data)));
    assert(events.some(event => event.type === 'execution.state'));
    assert(!events.some(event => event.type === 'api.event'));
    f.summarize(); const compact = await partner.compact();
    assert.doesNotMatch(JSON.stringify(compact?.installed_history), /data:image/);
    assert.deepEqual((await partner.snapshot()).messages, before.messages);
  } finally { await app?.close(); await f.close(); }
});

test('code mode composes durable workspace file tools and the naco shell', async () => {
  const f = await fixture(); const partner = await createPartner(f.config, f.credentials);
  try {
    f.useTools([{ name: 'write_file', args: { path: 'note.txt', content: 'a quiet evening' } },
      { name: 'exec_command', args: { cmd: 'cat note.txt' } }]);
    await partner.submit(randomUUID(), 'try the workspace');
    await eventually(async () => (await partner.snapshot()).messages[0]?.answer !== null);
    assert.equal(await readFile(join(f.directory, 'workspace/note.txt'), 'utf8'), 'a quiet evening');
    assert.match(JSON.stringify(f.requests.at(-1)), /a quiet evening/);
    assert.match(JSON.stringify(f.requests[0]), /"name":"exec"/);
  } finally { await partner.close(); await f.close(); }
});

test('skill CLI uses literal argv, workspace cwd, bounded results, and cancellation', async () => {
  const f = await fixture();
  try {
    const executable = join(f.directory, 'fake-skill');
    await writeFile(executable, '#!/usr/bin/env node\nif(process.argv.includes("wait"))setTimeout(()=>{},30000);else console.log(JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd()}));\n');
    await chmod(executable, 0o700);
    const tools = skillTools(f.directory, executable);
    const context = { signal: new AbortController().signal } as never;
    const found = await tools.skill_find.handler({ query: '$(touch forbidden); --help', limit: 3 }, context) as { argv: string[]; cwd: string };
    assert.deepEqual(found.argv, ['find', '--json', '--limit', '3', '--', '$(touch forbidden); --help']);
    assert.equal(found.cwd, f.directory);
    const controller = new AbortController();
    const pending = tools.skill_get.handler({ name: 'wait' }, { signal: controller.signal } as never);
    controller.abort(); await assert.rejects(Promise.resolve(pending), /abort/i);
  } finally { await f.close(); }
});

test('invalid image bytes are definitely rejected before admission while operational failures remain uncertain', async () => {
  const f = await fixture(); const partner = await createPartner(f.config, f.credentials);
  const app = createWebServer(partner, join(f.directory, 'assets'));
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const send = (data: string) => fetch(`http://127.0.0.1:${(app.server.address() as { port: number }).port}/api/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: randomUUID(), input: '', images: [{ ...photo, data }] }),
  });
  try {
    for (const data of [Buffer.from('GIF89a').toString('base64'), 'not-base64!']) {
      const response = await send(data);
      assert.equal(response.status, 422); assert.equal((await response.json()).code, 'invalid_message');
    }
    assert.equal((await partner.snapshot()).messages.length, 0); assert.equal(f.requests.length, 0);
    // A closed runtime is an operational failure, not evidence of invalid input.
    await partner.close();
    const response = await send(png);
    assert.notEqual(response.status, 422); assert.notEqual((await response.json()).code, 'invalid_message');
  } finally { await app.close(); await f.close(); }
});
