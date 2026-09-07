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

test("memory artifacts retain distinct local and published digests", () => {
  for (const key of ["hindsight", "postgres"]) {
    const image = manifest.images[key];
    assert.match(image.localDigest, /^sha256:[0-9a-f]{64}$/);
    assert.match(image.publishedDigest, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(image.localDigest, image.publishedDigest);
  }
});

test("Compose consumes the published memory manifest digests", () => {
  const expectedHindsight = `${manifest.images.hindsight.published}@${manifest.images.hindsight.publishedDigest}`;
  const expectedPostgres = `${manifest.images.postgres.published}@${manifest.images.postgres.publishedDigest}`;
  assert.equal(defaultImageReference(compose.services.hindsight.image), expectedHindsight);
  assert.equal(defaultImageReference(compose.services["hindsight-postgres"].image), expectedPostgres);
});
