import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, access, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadCredentials } from './config.ts';
import { createPartner } from './partner.ts';
import { createWebServer } from './server.ts';

const [command, configPath, name] = process.argv.slice(2);
if (!configPath) throw new Error('Usage: cli.ts <serve|credential|logs> <config.toml> [provider|mail|speech]');
const config = await loadConfig(resolve(configPath));
if (command === 'credential') {
  if (!['provider', 'mail', 'speech'].includes(name)) throw new Error('Choose provider, mail or speech');
  if (process.stdin.isTTY) throw new Error('Supply the credential through stdin, not command arguments');
  let value = '';
  for await (const chunk of process.stdin) { value += chunk; if (value.length > 16384) throw new Error('Credential too large'); }
  value = value.trim(); if (!value) throw new Error('Credential is empty');
  await mkdir(config.state, { recursive: true, mode: 0o700 });
  const path = join(config.state, 'credentials.json');
  let previous: Record<string, string>;
  try { previous = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; previous = {}; }
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify({ ...previous, [name]: value }), { mode: 0o600, flag: 'wx' });
  try { await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
  console.log('Credential saved. Restart the runtime to apply it.');
} else if (command === 'logs') {
  let after = 0;
  for (;;) {
    const response = await fetch(`http://127.0.0.1:${config.port}/api/diagnostics?after=${after}`);
    if (!response.ok) throw new Error('Could not read runtime diagnostics');
    const rows = await response.json() as { cursor: number; created: number; data: string }[];
    if (!rows.length) break;
    for (const row of rows) console.log(JSON.stringify({ cursor: row.cursor, created: row.created, event: JSON.parse(row.data) }));
    after = rows.at(-1)!.cursor;
  }
} else if (command === 'serve') {
  const assets = fileURLToPath(new URL('../build/', import.meta.url));
  await access(join(assets, 'index.html'));
  const credentials = await loadCredentials(config.state);
  const partner = await createPartner(config, credentials);
  let app: ReturnType<typeof createWebServer>;
  try { app = createWebServer(partner, assets); }
  catch (error) { await partner.close(); throw error; }
  app.server.on('error', async (error) => { console.error(error.message); await partner.close(); process.exitCode = 1; });
  app.server.listen(config.port, '127.0.0.1', () => console.log(`Companion: http://127.0.0.1:${config.port}`));
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await app.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} else throw new Error('Unknown command');
