import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { test } from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "config/memory-images.json"), "utf8"));
const compose = YAML.parse(readFileSync(join(root, "compose.yaml"), "utf8"));

const defaultImageReference = (value) => /:-([^}]+)}/.exec(String(value))?.[1] ?? String(value);

test("memory artifacts identify their immutable published releases", () => {
  for (const key of ["hindsight", "postgres"]) {
    const image = manifest.images[key];
    assert.match(image.published, /^ghcr\.io\/lamplitisles\/lamplit-hindsight(?:-postgres)?:\d+\.\d+\.\d+$/);
    assert.match(image.publishedDigest, /^sha256:[0-9a-f]{64}$/);
  }
  assert.match(manifest.images.hindsight.sourceRevision, /^[0-9a-f]{40}$/);
});

test("Compose consumes the published memory manifest digests", () => {
  const expectedHindsight = `${manifest.images.hindsight.published}@${manifest.images.hindsight.publishedDigest}`;
  const expectedPostgres = `${manifest.images.postgres.published}@${manifest.images.postgres.publishedDigest}`;
  assert.equal(defaultImageReference(compose.services.hindsight.image), expectedHindsight);
  assert.equal(defaultImageReference(compose.services["hindsight-postgres"].image), expectedPostgres);
});

test("Compose follows Full and Bridge rolling tags while retaining an immutable Bridge snapshot", () => {
  assert.equal(defaultImageReference(compose.services.lamplit.image), "ghcr.io/lamplitisles/lamplit:full");
  assert.equal(defaultImageReference(compose.services["codex-bridge"].image), "ghcr.io/lamplitisles/kepos-codex-bridge:latest");
  const bridge = manifest.images.codexBridge;
  assert.match(bridge.digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(bridge.sourceTag, /^sha-[0-9a-f]{40}$/);
  assert.equal(bridge.published, `ghcr.io/lamplitisles/kepos-codex-bridge:${bridge.sourceTag}`);
});

test("Full uses ONNX with an explicit CPU budget and the existing database volume", () => {
  const memory = compose.services.hindsight;
  const environment = memory.environment;
  assert.equal(memory.cpus, 4);
  assert.equal(Number(environment.HINDSIGHT_API_EMBEDDINGS_ONNX_INTRA_OP_THREADS), memory.cpus);
  assert.equal(environment.HINDSIGHT_API_EMBEDDINGS_PROVIDER, "onnx");
  assert.equal(compose.volumes.hindsight_postgres_data.name, "lamplit-hindsight-postgres");
  assert.deepEqual(compose.services["hindsight-postgres"].volumes, ["hindsight_postgres_data:/var/lib/postgresql/data"]);
});
