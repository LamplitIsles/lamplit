import type { Workspace } from 'nanocodex-tools';
import { extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { ToolMap } from 'nanocodex/node';
import { z } from 'zod';
import type { Config, Credentials } from '../config.ts';
import type { Store } from '../store.ts';
import { rollDice } from './dice-core.ts';
import { encodeImageDataUrl, requestImage } from './image-core.ts';
import { companionTools } from './companion.ts';
import { mailTools } from './mail.ts';

const dice = z.object({ count: z.number().int().min(1).max(100).optional(), sides: z.number().int().min(2).max(1000000),
  modifier: z.number().int().min(-1000000).max(1000000).optional(), label: z.string().max(200).optional() }).strict();
const image = z.object({ prompt: z.string().trim().min(1).max(16000),
  filename: z.string().min(1).max(160).regex(/^[^/\\\x00-\x1f]+$/u),
  images: z.array(z.string().min(1).max(4096)).min(1).max(5).optional() }).strict();

export function createTools(config: Config, credentials: Credentials, store: Store,
  operationId: () => string, workspace: Workspace): ToolMap {
  const tools: ToolMap = {
    ...companionTools(store, operationId),
    view_attachment: { description: 'View a stored attachment or generated image by ID. In code mode pass the returned image_url to image(); do not print its base64 as text.',
      parameters: z.toJSONSchema(z.object({ id: z.string().regex(/^[a-f0-9]{64}$/u) }).strict()),
      async handler(input, context) {
        context.signal.throwIfAborted();
        const { id } = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/u) }).strict().parse(input);
        const stored = await store.image(id);
        if (!stored) throw new Error('Unknown image ID');
        return { image_url: encodeImageDataUrl(stored.data, stored.media_type) };
      } },
    roll_dice: { description: 'Roll dice with an optional modifier and label. Use the actual rolls and total as the source of truth.',
      parameters: z.toJSONSchema(dice), handler(input, context) { context.signal.throwIfAborted(); return rollDice(dice.parse(input)); } },
  };
  if (config.mail) {
    if (!credentials.mail) throw new Error('Configured mail requires a CLI-managed mail credential');
    Object.assign(tools, mailTools(config.mail, credentials.mail));
  }
  if (config.imagegen) {
    const imageConfig = config.imagegen;
    tools.kepos_image_generate = { description: 'Generate a PNG with an English prompt and descriptive filename. For edits, supply one to five image IDs from attachments/generations or local workspace file paths. The image is attached to your completed reply; no base64 is needed.',
      parameters: z.toJSONSchema(image), async handler(input, context) {
        const args = image.parse(input);
        const operation = operationId();
        if (!operation) throw new Error('Image generation requires an active conversation turn');
        const id = createHash('sha256').update(`${operation}:${context.callId}`).digest('hex');
        const existing = await store.image(id);
        if (existing) return { id, filename: existing.name, url: `/api/images/${id}` };
        const images = args.images ? await Promise.all(args.images.map(async (sourceId) => {
          if (/^[a-f0-9]{64}$/u.test(sourceId)) {
            const source = await store.image(sourceId);
            if (!source) throw new Error('Unknown source image ID');
            return encodeImageDataUrl(source.data, source.media_type);
          }
          const mediaType = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' } as const)[extname(sourceId).toLowerCase() as '.png'];
          if (!mediaType) throw new Error('Source file must be PNG, JPEG, WebP or GIF');
          const data = await workspace.readFile(sourceId);
          if (data.byteLength > 5 * 1024 * 1024) throw new Error('Source image exceeds 5 MiB');
          return encodeImageDataUrl(data, mediaType);
        })) : undefined;
        context.signal.throwIfAborted();
        const result = await requestImage({ fetch, baseUrl: imageConfig.url,
          model: images ? imageConfig.edit_model ?? imageConfig.model : imageConfig.model,
          prompt: args.prompt, images, signal: AbortSignal.any([context.signal, AbortSignal.timeout(300000)]) });
        const filename = args.filename.endsWith('.png') ? args.filename : `${args.filename}.png`;
        await store.saveImage({ id, operation_id: operation, name: filename, data: result.data });
        return { id, filename, url: `/api/images/${id}` };
      } };
  }
  return tools;
}
