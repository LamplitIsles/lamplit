#!/usr/bin/env node

/*
 * Verify the prebuilt Kosmos memory images without rebuilding them. The probe
 * uses disposable, network-disabled containers and never mounts operator
 * state or credentials. It is intentionally opt-in; ordinary Lamplit checks
 * do not require the private memory-image build environment.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "config/memory-images.json"), "utf8"));
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
const hindsightMetadata = inspect(hindsight.local);
const postgresMetadata = inspect(postgres.local);
assert(byDigest(hindsightMetadata, hindsight.localDigest), `local Hindsight image does not expose ${hindsight.localDigest}`);
assert(byDigest(postgresMetadata, postgres.localDigest), `local PostgreSQL image does not expose ${postgres.localDigest}`);
assert(hindsightMetadata.Config?.Labels?.["org.opencontainers.image.version"] === "0.1.1", "unexpected Hindsight image version");
assert(hindsightMetadata.Config?.Labels?.["org.opencontainers.image.embedding-model"] === hindsight.embeddingModel, "unexpected Hindsight embedding model");
assert(hindsightMetadata.Config?.Labels?.["org.opencontainers.image.source"]?.includes("kosmos"), "Hindsight image is not the verified Kosmos artifact");
assert(postgresMetadata.Config?.Labels?.["org.opencontainers.image.version"] === "0.1.1", "unexpected PostgreSQL image version");
assert(postgresMetadata.Config?.Labels?.["org.opencontainers.image.source"]?.includes("kosmos"), "PostgreSQL image is not the verified Kosmos artifact");

const embeddingProbe = [
  "from sentence_transformers import SentenceTransformer",
  `model = SentenceTransformer('/opt/hindsight-models/paraphrase-multilingual-MiniLM-L12-v2', device='cpu', local_files_only=True)`,
  "dimension = model.get_sentence_embedding_dimension()",
  "assert dimension == 384, dimension",
  "print(f'offline model verified: {dimension} dimensions on CPU')",
].join(";");
const embeddingOutput = run([
  "run", "--rm", "--network", "none", "--memory", "4g", "--cpus", "2",
  "--entrypoint", "/app/api/.venv/bin/python", hindsight.local, "-c", embeddingProbe,
], { timeout: 300_000 });
assert(embeddingOutput.includes("384 dimensions"), `Hindsight offline probe failed: ${embeddingOutput}`);

const postgresProbe = [
  "set -eu",
  "export HOME=/tmp PGDATA=/tmp/lamplit-pgdata",
  "rm -rf \"$PGDATA\"",
  "initdb --no-locale --encoding=UTF8 -D \"$PGDATA\" >/dev/null",
  "pg_ctl -D \"$PGDATA\" -o \"-c listen_addresses='' -c unix_socket_directories=/tmp\" -w start >/dev/null",
  "trap 'pg_ctl -D \"$PGDATA\" -m immediate stop >/dev/null 2>&1 || :' EXIT",
  "export PGHOST=/tmp",
  "createdb lamplit-check",
  "psql -d lamplit-check -v ON_ERROR_STOP=1 -Atqc \"CREATE EXTENSION pgroonga; CREATE EXTENSION vector; SELECT extname || '=' || extversion FROM pg_extension WHERE extname IN ('pgroonga', 'vector') ORDER BY extname;\"",
].join("\n");
const postgresOutput = run([
  "run", "--rm", "--network", "none", "--memory", "1g", "--cpus", "2", "--user", "999:999",
  "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m,mode=1777", "--entrypoint", "sh", postgres.local, "-ec", postgresProbe,
], { timeout: 180_000 });
assert(postgresOutput.trim() === "pgroonga=4.0.8\nvector=0.8.6", `PostgreSQL extension probe failed: ${postgresOutput}`);

process.stdout.write(`${JSON.stringify({
  ok: true,
  runtime,
  images: {
    hindsight: { local: hindsight.local, published: `${hindsight.published}@${hindsight.publishedDigest}`, verification: embeddingOutput.trim() },
    postgres: { local: postgres.local, published: `${postgres.published}@${postgres.publishedDigest}`, verification: postgresOutput.trim() },
    codexBridge: { published: `${manifest.images.codexBridge.published}@${manifest.images.codexBridge.digest}`, verification: "configured immutable reference" },
  },
}, null, 2)}\n`);
