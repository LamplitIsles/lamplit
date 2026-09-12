import { join } from 'node:path';
import type { Workspace } from 'nanocodex-tools';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PromptInput } from 'nanocodex/node';
import type { ImageAttachmentLimits } from '../src/lib/companion/client/contracts.ts';
import { decodeImageDataUrl, encodeImageDataUrl } from './tools/image-core.ts';
import { partnerPaths } from './storage-paths.ts';

export const imageLimits: ImageAttachmentLimits = { mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], maxImagesPerMessage: 5, maxImageBytes: 5 * 1024 * 1024, maxMessageImageBytes: 20 * 1024 * 1024 };
export const messageBodyLimit = Math.ceil(imageLimits.maxMessageImageBytes / 3) * 4 + 128 * 1024;
export const imageInputSchema = z.object({ type: z.literal('image'), mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']), data: z.string().max(Math.ceil(imageLimits.maxImageBytes / 3) * 4), name: z.string().max(160).optional() }).strict();
export type InputImage = { id: string; operation_id: string; name: string; media_type: z.infer<typeof imageInputSchema>['mediaType']; data: Uint8Array };
export class InvalidImageInput extends Error {}
export function inputImages(id: string, values: readonly z.infer<typeof imageInputSchema>[]): InputImage[] {
  if (values.length > imageLimits.maxImagesPerMessage) throw new InvalidImageInput('Too many images');
  let total = 0;
  return values.map((value, index) => {
    let decoded: ReturnType<typeof decodeImageDataUrl>;
    try { decoded = decodeImageDataUrl(`data:${value.mediaType};base64,${value.data}`); }
    catch { throw new InvalidImageInput('Invalid image encoding'); }
    const { data, mediaType } = decoded;
    total += data.byteLength;
    if (data.byteLength > imageLimits.maxImageBytes || total > imageLimits.maxMessageImageBytes) throw new InvalidImageInput('Images are too large');
    const bytes = Buffer.from(data);
    const signature = mediaType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mediaType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mediaType === 'image/gif' ? /^GIF8[79]a$/.test(bytes.subarray(0,6).toString()) : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
    if (!signature) throw new InvalidImageInput('Image format does not match its contents');
    const name = value.name ?? `image-${index + 1}.${mediaType.slice(6)}`;
    return { id: createHash('sha256').update(JSON.stringify([id, index, mediaType, name])).update(data).digest('hex'), operation_id: id, name, media_type: mediaType, data };
  });
}
export function imagePath(workspace: string, image: Pick<InputImage, 'id' | 'media_type'>): string {
  const extension = image.media_type === 'image/jpeg' ? 'jpg' : image.media_type.slice(6);
  return join(partnerPaths(workspace).attachments, `${image.id}.${extension}`);
}
export async function materializeImages(workspace: Workspace, images: readonly InputImage[]): Promise<void> {
  for (const image of images) {
    const path = imagePath(workspace.root, image);
    try { await workspace.readFile(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await workspace.writeFile(path, image.data);
    }
  }
}
export function imageText(text: string, images: readonly Omit<InputImage, 'data'>[], workspace: string): string {
  if (!images.length) return text;
  return `${text}\n\nAttached images (ordered; paths are local workspace files, IDs and paths both work for image editing):\n${images.map(image => JSON.stringify({ id: image.id, name: image.name, path: imagePath(workspace, image) })).join('\n')}`;
}
export function imagePrompt(text: string, images: readonly InputImage[], workspace: string): PromptInput {
  if (!images.length) return text;
  return [{ type: 'text', text: imageText(text, images, workspace) },
    ...images.map(image => ({ type: 'image' as const, image_url: encodeImageDataUrl(image.data, image.media_type) }))];
}
