import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import type { Config, Credentials } from '../runtime/config.ts';

export async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'lamplit-partner-test-'));
  await mkdir(join(directory, 'assets'));
  const requests: Record<string, unknown>[] = [];
  const providerEvents: { kind: 'receive' | 'send'; at: number; requestIndex: number; bytes: number }[] = [];
  let hold = false;
  let summary = false;
  const toolCalls: { name: string; args: unknown }[] = [];
  let reply = 0;
  const provider = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(provider, 'listening');
  const providerPort = (provider.address() as { port: number }).port;
  provider.on('connection', (socket) => socket.on('message', (bytes) => {
    const receiveAt = performance.now();
    const requestBytes = Buffer.isBuffer(bytes) ? bytes : Array.isArray(bytes) ? Buffer.concat(bytes) : Buffer.from(bytes);
    requests.push(JSON.parse(requestBytes.toString()));
    const resolvedRequestIndex = requests.length - 1;
    providerEvents.push({ kind: 'receive', at: receiveAt, requestIndex: resolvedRequestIndex, bytes: requestBytes.length });
    if (hold) return;
    let output;
    if (toolCalls.length) {
      const call = toolCalls.shift()!;
      output = [{ type: 'custom_tool_call', name: 'exec', call_id: `call-${requests.length}`, input: call.name === 'exec' ? call.args as string : `text(await tools.${call.name}(${JSON.stringify(call.args)}));` }];
    } else {
      output = [{ type: 'message', role: 'assistant', content: [{ type: 'output_text',
        text: summary ? 'PRIVATE_CHECKPOINT' : `回应 ${++reply}：在这里，慢慢说。` }] }];
      summary = false;
    }
    const response = JSON.stringify({ type: 'response.completed', response: {
      id: `r-${requests.length}`, status: 'completed', output,
      usage: { input_tokens: 50, output_tokens: 10, total_tokens: 60 },
    } });
    providerEvents.push({ kind: 'send', at: performance.now(), requestIndex: resolvedRequestIndex, bytes: Buffer.byteLength(response, 'utf8') });
    socket.send(response);
  }));
  const persona = join(directory, 'persona.md');
  await writeFile(persona, 'Your name is Mica. This is a fictional test conversation.');
  const config: Config = { name: 'Mica', persona, state: directory, port: 3082,
    provider: { model: 'gpt-5.6-luna', base_url: `http://127.0.0.1:${providerPort}/v1`, websocket_url: `ws://127.0.0.1:${providerPort}` } };
  const credentials: Credentials = { provider: 'dummy' };
  return { directory, config, credentials, requests, providerEvents,
    holdProvider(value: boolean) { hold = value; },
    summarize() { summary = true; },
    useTool() { toolCalls.push({ name: 'roll_dice', args: { count: 2, sides: 6 } }); },
    useTools(calls: typeof toolCalls) { toolCalls.push(...calls); },
    async close() {
      for (const socket of provider.clients) socket.terminate();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    } };
}
export async function eventually(check: () => Promise<boolean>) {
  const until = Date.now() + 10000;
  while (!await check()) {
    if (Date.now() > until) throw new Error('Timed out waiting for observable state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
