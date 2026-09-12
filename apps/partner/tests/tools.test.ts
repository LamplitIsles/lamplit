import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createPartner } from '../runtime/partner.ts';
import { createWebServer } from '../runtime/server.ts';
import { fixture, eventually } from './fixture.ts';
import { rollDice } from '../runtime/tools/dice-core.ts';

test('tabletop preserves modifiers and labels and rejects invalid input before drawing', () => {
  assert.deepEqual(rollDice({ count: 2, sides: 6, modifier: -1, label: '判断' }, () => 4),
    { count: 2, sides: 6, rolls: [4, 4], modifier: -1, total: 7, label: '判断' });
  assert.throws(() => rollDice({ sides: 6, count: 0 }, () => { throw new Error('should not draw'); }), /count/);
});

test('real naco invokes all six fixed-mailbox MCP tools, and durable image generation/editing', { timeout: 20000 }, async () => {
  const f = await fixture();
  const mailCalls: { name: string; arguments: Record<string, unknown> }[] = [];
  const imageCalls: Record<string, unknown>[] = [];
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9F0AAAAASUVORK5CYII=', 'base64');
  const upstream = createServer(async (request, response) => {
    if (request.method === 'GET') { response.writeHead(405).end(); return; }
    let text = ''; for await (const chunk of request) text += chunk;
    const body = JSON.parse(text || '{}');
    if (request.url === '/codex/images') {
      imageCalls.push(body); response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ image_url: `data:image/png;base64,${png.toString('base64')}` })); return;
    }
    assert.equal(request.headers.authorization, 'Bearer fixture-mail-credential');
    if (body.id === undefined) { response.writeHead(202).end(); return; }
    let result;
    if (body.method === 'initialize') result = { protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
    else if (body.method === 'tools/call') { mailCalls.push(body.params); result = { content: [{ type: 'text', text: JSON.stringify({ ok: true, id: 'fixture-email' }) }] }; }
    else result = { tools: [] };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const url = `http://127.0.0.1:${(upstream.address() as { port: number }).port}`;
  f.config.mail = { url: `${url}/mcp`, mailbox: 'partner@example.com' };
  f.credentials.mail = 'fixture-mail-credential';
  f.config.imagegen = { url, model: 'fixture-generation', edit_model: 'fixture-edit' };
  const partner = await createPartner(f.config, f.credentials);
  const app = createWebServer(partner, join(f.directory, 'assets'));
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  try {
    f.useTools([
      { name: 'mail_list', args: { limit: 5 } },
      { name: 'mail_search', args: { query: 'weekend' } },
      { name: 'mail_read', args: { emailId: 'one' } },
      { name: 'mail_read_thread', args: { threadId: 'thread' } },
      { name: 'mail_send', args: { to: 'friend@example.com', subject: 'Hello', bodyHtml: '<p>Hello</p>' } },
      { name: 'mail_reply', args: { originalEmailId: 'one', to: 'friend@example.com', subject: 'Re: Hello', bodyHtml: '<p>Reply</p>' } },
      { name: 'kepos_image_generate', args: { prompt: 'A cup of tea', filename: '雨夜' } },
    ]);
    await partner.submit(randomUUID(), 'exercise configured tools');
    await eventually(async () => (await partner.snapshot()).messages[0]?.answer !== null);
    assert.deepEqual(mailCalls.map((call) => call.name), ['list_emails', 'search_emails', 'get_email', 'get_thread', 'send_email', 'send_reply']);
    assert(mailCalls.every((call) => call.arguments.mailboxId === 'partner@example.com'));
    assert.doesNotMatch(JSON.stringify(f.requests), /fixture-mail-credential|data:image/);
    const first = (await partner.snapshot()).messages[0].images[0];
    assert.equal(first.name, '雨夜.png');
    const address = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const response = await fetch(`${address}${first.url}`);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    f.useTools([{ name: 'kepos_image_generate', args: { prompt: 'Add a candle', filename: '烛光.png', images: [first.id] } }]);
    await partner.submit(randomUUID(), 'edit the picture');
    await eventually(async () => (await partner.snapshot()).messages[1]?.answer !== null);
    assert.equal(imageCalls.length, 2);
    assert.equal(imageCalls[1].model, 'fixture-edit');
    assert.match(JSON.stringify(imageCalls[1].images), /^\["data:image\/png;base64,/);
    assert.equal((await partner.snapshot()).messages[1].images.length, 1);
    const uploadId = randomUUID();
    const photo = { type: 'image' as const, mediaType: 'image/png' as const, name: 'input.png', data: png.toString('base64') };
    const { inputImages, imagePath } = await import('../runtime/images.ts');
    const path = imagePath(join(f.directory, 'workspace'), inputImages(uploadId, [photo])[0]);
    f.useTools([{ name: 'kepos_image_generate', args: { prompt: 'Edit the uploaded picture', filename: 'edited.png', images: [path] } }]);
    await partner.submit(uploadId, 'edit this upload by workspace path', [photo]);
    await eventually(async () => (await partner.snapshot()).messages[2]?.answer !== null);
    assert.equal(imageCalls.length, 3);
    assert.equal(imageCalls[2].model, 'fixture-edit');
    assert.deepEqual(imageCalls[2].images, [`data:image/png;base64,${png.toString('base64')}`]);
    assert.equal((await partner.snapshot()).messages[2].images.length, 1);
  } finally {
    try { await app.close(); } finally {
      upstream.closeAllConnections(); await new Promise<void>((resolve) => upstream.close(() => resolve())); await f.close();
    }
  }
});

test('Companion relationship tools persist atomic reactions, bound per-turn affinity and deduplicate retries', async () => {
  const f = await fixture();
  const { Store } = await import('../runtime/store.ts');
  const store = new Store(join(f.directory, 'relationship-test.sqlite'));
  try {
    const first = await store.updateRelationship('turn-one', 'call-one', { mood: { value: 'bright', note: '想出门走走', reason: '聊起了散步' }, affinity: { delta: 8, reason: '坦诚交流' } });
    assert.equal(first.affinity, 58);
    assert.equal((await store.updateRelationship('turn-one', 'call-two', { affinity: { delta: 8, reason: '继续聊' } })).affinity, 60);
    await store.updateRelationship('turn-one', 'call-one', { affinity: { delta: 8, reason: 'retry' } });
    assert.equal((await store.relationshipHistory()).length, 2);
    assert.equal((await store.relationshipHistory())[0].state.affinity, 60);
    assert.equal((await store.updateRelationship('turn-two', 'call-three', { affinity: { delta: -3, reason: '意见不同' } })).affinity, 57);
  } finally { await store.close(); await f.close(); }
});
