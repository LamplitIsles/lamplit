// Restore only the accepted producer artifacts, never a dirty checkout's WASM.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const source = process.argv[2];
if (!source) throw new Error('Usage: node apps/partner/scripts/prepare-sdk.mjs <accepted-artifact-directory>');
const files = [
  ['nanocodex-0.5.0.tgz', 'nanocodex.tgz', '2f5254dd97ec44cbe7ec9bef0e499a924798c6abf0cbf1deb9a8bbc0c11682ae'],
  ['nanocodex-tools-0.1.0.tgz', 'nanocodex-tools.tgz', '27d984ecc36f00a74e7463a6985019ab2b56f852b202ad7b1cabb5c20d8ce25c'],
];
const verified = await Promise.all(files.map(async ([name, target, sha256]) => {
  const bytes = await readFile(resolve(source, name));
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`Unaccepted artifact: ${name}`);
  return { target, bytes };
}));
const destination = new URL('../../../.cache/nanocodex/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const { target, bytes } of verified) await writeFile(new URL(target, destination), bytes);
console.log('Accepted naco 3810b50e57ec4583ede48e21e76bfbb1afa12670 artifacts prepared.');
