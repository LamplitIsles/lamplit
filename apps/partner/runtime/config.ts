import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
  persona: z.string().min(1),
  state: z.string().default('./state'),
  workspace: z.string().optional(),
  port: z.number().int().min(1024).max(65535).default(3082),
  provider: z.object({
    model: z.enum(['gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-6-astra']).default('gpt-5.6-sol'),
    base_url: z.url(), websocket_url: z.url().optional(),
  }).strict(),
  speech: z.object({ endpoint: z.url().default("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation") }).strict().optional(),
  mail: z.object({ url: z.url(), mailbox: z.email() }).strict().optional(),
  imagegen: z.object({ url: z.url(), model: z.string().min(1), edit_model: z.string().min(1).optional() }).strict().optional(),
}).strict();
export type Config = z.infer<typeof schema>;
export async function loadConfig(path: string): Promise<Config> {
  const config = schema.parse(parse(await readFile(path, 'utf8')));
  const base = dirname(resolve(path));
  return { ...config, state: resolve(base, config.state), persona: resolve(base, config.persona), workspace: resolve(base, config.workspace ?? `${config.state}/workspace`) };
}
export const credentialSchema = z.object({
  provider: z.string().min(1).optional(), mail: z.string().min(1).optional(), speech: z.string().min(1).optional(),
}).strict();
export type Credentials = z.infer<typeof credentialSchema>;
export async function loadCredentials(state: string): Promise<Credentials> {
  try { return credentialSchema.parse(JSON.parse(await readFile(resolve(state, 'credentials.json'), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
}
