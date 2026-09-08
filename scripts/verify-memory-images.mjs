#!/usr/bin/env node

/*
 * Verify the pulled release images by digest without rebuilding them. Probes
 * use disposable, network-disabled containers and never mount operator state
 * or credentials. Pull the Compose memory images before running this command.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "config/memory-images.json"), "utf8"));
const memoryService = YAML.parse(readFileSync(resolve(root, "compose.yaml"), "utf8")).services.hindsight;
const runtime = process.env.CONTAINER_RUNTIME ?? "docker";
const run = (args, options = {}) => execFileSync(runtime, args, {
  cwd: root,
  encoding: "utf8",
  stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  timeout: options.timeout ?? 180_000,
});

const inspect = (image) => JSON.parse(run(["image", "inspect", image]))[0];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const byDigest = (metadata, digest) => (metadata.RepoDigests ?? []).some((value) => value.endsWith(`@${digest}`));

const hindsight = manifest.images.hindsight;
const postgres = manifest.images.postgres;
const hindsightReference = `${hindsight.published}@${hindsight.publishedDigest}`;
const postgresReference = `${postgres.published}@${postgres.publishedDigest}`;
const hindsightMetadata = inspect(hindsightReference);
const postgresMetadata = inspect(postgresReference);
assert(byDigest(hindsightMetadata, hindsight.publishedDigest), `Hindsight image does not expose ${hindsight.publishedDigest}`);
assert(byDigest(postgresMetadata, postgres.publishedDigest), `PostgreSQL image does not expose ${postgres.publishedDigest}`);
assert(hindsightMetadata.Config?.Labels?.["org.opencontainers.image.version"] === hindsight.published.split(":").at(-1), "unexpected Hindsight image version");
assert(hindsightMetadata.Config?.Labels?.["org.opencontainers.image.embedding-model"] === hindsight.embeddingModel, "unexpected Hindsight embedding model");
assert(hindsightMetadata.Config?.Labels?.["org.opencontainers.image.revision"] === hindsight.sourceRevision, "unexpected Hindsight source revision");
assert(postgresMetadata.Config?.Labels?.["org.opencontainers.image.version"] === "0.1.1", "unexpected PostgreSQL image version");
assert(postgresMetadata.Config?.Labels?.["org.opencontainers.image.source"]?.includes("kosmos"), "PostgreSQL image is not the verified Kosmos artifact");

const embeddingOutput = run([
  "run", "--rm", "--network", "none", "--read-only", "--memory", "3g",
  "--cpus", String(memoryService.cpus), "--user", memoryService.user,
  "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
  "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m,mode=1777",
  "--env", `HINDSIGHT_API_EMBEDDINGS_PROVIDER=${memoryService.environment.HINDSIGHT_API_EMBEDDINGS_PROVIDER}`,
  "--env", `HINDSIGHT_API_EMBEDDINGS_ONNX_INTRA_OP_THREADS=${memoryService.environment.HINDSIGHT_API_EMBEDDINGS_ONNX_INTRA_OP_THREADS}`,
  "--volume", `${resolve(root, "tests/hindsight-image.py")}:/test.py:ro`,
  "--entrypoint", "python", hindsightReference, "/test.py", "embedding",
], { timeout: 300_000 });
const embedding = JSON.parse(embeddingOutput);
assert(embedding.dimensions === hindsight.embeddingDimensions, "unexpected embedding dimensions");
assert(embedding.intra_op_threads === memoryService.cpus, "unexpected embedding CPU budget");

const postgresProbe = [
  "set -eu",
  "export HOME=/tmp PGDATA=/tmp/lamplit-pgdata",
  "initdb --no-locale --encoding=UTF8 -D \"$PGDATA\" >/dev/null",
  "pg_ctl -D \"$PGDATA\" -o \"-c listen_addresses='' -c unix_socket_directories=/tmp\" -w start >/dev/null",
  "trap 'pg_ctl -D \"$PGDATA\" -m immediate stop >/dev/null 2>&1 || :' EXIT",
  "export PGHOST=/tmp",
  "createdb lamplit-check",
  "psql -d lamplit-check -v ON_ERROR_STOP=1 -Atqc \"CREATE EXTENSION pgroonga; CREATE EXTENSION vector; SELECT extname || '=' || extversion FROM pg_extension WHERE extname IN ('pgroonga', 'vector') ORDER BY extname;\"",
].join("\n");
const postgresOutput = run([
  "run", "--rm", "--network", "none", "--read-only", "--memory", "1g", "--cpus", "2", "--user", "999:999",
  "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m,mode=1777", "--entrypoint", "sh", postgresReference, "-ec", postgresProbe,
], { timeout: 180_000 });
assert(postgresOutput.trim() === "pgroonga=4.0.8\nvector=0.8.6", `PostgreSQL extension probe failed: ${postgresOutput}`);

process.stdout.write(`${JSON.stringify({
  ok: true,
  runtime,
  images: {
    hindsight: { published: hindsightReference, verification: embedding },
    postgres: { published: postgresReference, verification: postgresOutput.trim() },
    codexBridge: { published: `${manifest.images.codexBridge.published}@${manifest.images.codexBridge.digest}`, verification: "configured immutable reference" },
  },
}, null, 2)}\n`);
