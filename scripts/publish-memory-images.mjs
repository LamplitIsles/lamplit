#!/usr/bin/env node

/*
 * Publish the already verified Kosmos images unchanged. This command is
 * deliberately separate from the public Dagger module and requires an
 * explicit --push so a normal check cannot mutate a registry.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "config/memory-images.json"), "utf8"));
if (!process.argv.slice(2).includes("--push")) {
  console.error("Refusing to publish without --push. Run verify:memory-images first.");
  process.exit(64);
}

const runtime = process.env.CONTAINER_RUNTIME ?? "docker";
const run = (args, options = {}) => execFileSync(runtime, args, {
  cwd: root,
  encoding: "utf8",
  stdio: options.stdio ?? "inherit",
  timeout: options.timeout ?? 300_000,
});
const inspect = (image) => JSON.parse(run(["image", "inspect", image], { stdio: ["ignore", "pipe", "pipe"] }))[0];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const byDigest = (metadata, digest) => (metadata.RepoDigests ?? []).some((value) => value.endsWith(`@${digest}`));

for (const key of ["hindsight", "postgres"]) {
  const image = manifest.images[key];
  const localMetadata = inspect(image.local);
  assert(byDigest(localMetadata, image.localDigest), `${image.local} does not expose its verified local digest ${image.localDigest}`);
  run(["tag", image.local, image.published]);
  run(["push", image.published]);

  // A local RepoDigest can describe the source transport rather than the
  // manifest now served by the registry. Pull the published tag through the
  // authenticated runtime before inspecting it so this check cannot accept
  // that stale local metadata.
  run(["pull", image.published]);
  const remoteMetadata = inspect(image.published);
  assert(byDigest(remoteMetadata, image.publishedDigest), `${image.published} did not expose its published digest ${image.publishedDigest} after pull`);
  console.log(`${image.published}@${image.publishedDigest}`);
}

console.log("verified unchanged Kosmos memory images against their published registry digests");
