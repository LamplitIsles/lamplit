import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { stringify } from 'smol-toml';
import { fixture, eventually } from './fixture.ts';

test('SIGKILL after durable acceptance resumes once in a fresh CLI process', { timeout: 20000 }, async () => {
  const f = await fixture(); let child: ChildProcess | undefined;
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const configPath = join(f.directory, 'config.toml');
  await writeFile(configPath, stringify({ ...f.config, port }));
  await writeFile(join(f.directory, 'credentials.json'), JSON.stringify(f.credentials), { mode: 0o600 });
  const url = `http://127.0.0.1:${port}`;
  const headers = { origin: url, 'content-type': 'application/json' };
  const start = async () => {
    child = spawn(process.execPath, [fileURLToPath(new URL('../runtime/cli.ts', import.meta.url)), 'serve', configPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout!.on('data', (chunk) => { output += chunk; });
    child.stderr!.on('data', (chunk) => { output += chunk; });
    await eventually(async () => {
      if (child!.exitCode !== null) throw new Error(output);
      return output.includes('Companion:');
    });
  };
  try {
    f.holdProvider(true); await start();
    const id = randomUUID();
    const accepted = await fetch(`${url}/api/messages`, { method: 'POST', headers, body: JSON.stringify({ id, input: 'persist this accepted message' }) });
    assert.equal(accepted.status, 202);
    await eventually(async () => f.requests.length === 1);
    const exit = once(child!, 'exit'); child!.kill('SIGKILL'); await exit; child = undefined;
    assert.equal(f.requests.length, 1);
    f.holdProvider(false); await start();
    await eventually(async () => {
      const view = await (await fetch(`${url}/api/session`, { headers })).json();
      return view.messages[0]?.answer != null;
    });
    assert.equal(f.requests.length, 2);
    const view = await (await fetch(`${url}/api/session`, { headers })).json();
    assert.equal(view.messages.length, 1); assert.equal(view.typing, false);
  } finally {
    if (child && child.exitCode === null) { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; }
    await f.close();
  }
});
