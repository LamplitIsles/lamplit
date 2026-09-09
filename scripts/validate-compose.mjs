#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const composePath = process.env.LAMPLIT_COMPOSE_FILE ?? join(root, "compose.yaml");
const document = YAML.parseDocument(readFileSync(composePath, "utf8"));
if (document.errors.length) {
  throw new Error(document.errors.map((error) => error.message).join("\n"));
}
const compose = document.toJS();
const memoryImages = JSON.parse(readFileSync(join(root, "config/memory-images.json"), "utf8"));
const services = compose?.services;
if (!services || typeof services !== "object") throw new Error("Compose has no services map");

const expected = ["lamplit", "hindsight", "hindsight-postgres", "codex-bridge"];
const names = Object.keys(services).sort();
if (JSON.stringify(names) !== JSON.stringify([...expected].sort())) {
  throw new Error(`Full Compose must have exactly ${expected.join(", ")}; found ${names.join(", ")}`);
}
const serialized = JSON.stringify(compose).toLowerCase();
if (serialized.includes("redis") || serialized.includes("valkey")) {
  throw new Error("Full Compose must not contain Redis or Valkey");
}

const app = services.lamplit;
const memory = services.hindsight;
const database = services["hindsight-postgres"];
const bridge = services["codex-bridge"];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const defaultImageReference = (value) => {
  const text = String(value);
  const match = /:-([^}]+)}/.exec(text);
  return match?.[1] ?? text;
};
const assertDigestReference = (value, message) => {
  assert(typeof value === "string" && /@sha256:[0-9a-f]{64}$/.test(value), message);
};
const mounts = (service) => (service.volumes ?? []).map((mount) =>
  typeof mount === "string" ? mount : `${mount.source ?? ""}:${mount.target ?? ""}:${mount.read_only ? "ro" : "rw"}`,
);

assert(String(app.image).includes("lamplit"), "Lamplit service must use the Lamplit image");
assert(String(app.image).includes("full"), "Lamplit service must use the Full image tag");
assert(app.user === "1000:1000", "Lamplit must run as uid/gid 1000");
assert(app.read_only === true, "Lamplit root filesystem must be read-only");
assert(Array.isArray(app.cap_drop) && app.cap_drop.includes("ALL"), "Lamplit must drop all capabilities");
assert((app.security_opt ?? []).includes("no-new-privileges:true"), "Lamplit must set no-new-privileges");
assert((app.ports ?? []).every((port) => String(port).startsWith("127.0.0.1:")), "Lamplit ports must bind loopback");
for (const target of ["/home/lamplit/.local/state/dsh", "/workspace", "/opt/keet-runtime", "/var/lib/lamplit/keet"]) {
  assert(mounts(app).some((mount) => mount.includes(target)), `Lamplit mount contract is missing ${target}`);
}
assert(mounts(app).some((mount) => mount.includes("/opt/keet-runtime") && mount.endsWith(":ro")), "Keet runtime must be read-only");
assert(mounts(app).some((mount) => mount.includes("/var/lib/lamplit/keet")), "Keet identity needs a separate writable mount");
assert(mounts(app).some((mount) => mount.includes("/workspace")), "Partner workspace needs its own mount");

assert(memory.user === "1000:1000", "Hindsight must run as uid/gid 1000");
assert(memory.read_only === true, "Hindsight root filesystem must be read-only");
assert((memory.ports ?? []).every((port) => String(port).startsWith("127.0.0.1:")), "Hindsight ports must bind loopback");
assert(!database.ports, "PostgreSQL must not publish a host port");
assert(database.user === "999:999", "PostgreSQL must run as its non-root uid/gid");
assert(database.depends_on === undefined, "PostgreSQL cannot depend on an application service");
assert(memory.depends_on?.["hindsight-postgres"]?.condition === "service_healthy", "Hindsight must wait for database health");
assert((memory.networks ?? []).includes("hindsight-internal"), "Hindsight must use the internal database network");
assert((database.networks ?? []).includes("hindsight-internal"), "PostgreSQL must use the internal database network");
assert(compose.networks?.["hindsight-internal"]?.internal === true, "Database network must be internal");
assert(memory.environment?.HINDSIGHT_API_EMBEDDINGS_PROVIDER === "onnx", "Hindsight must use ONNX embeddings");
assert(memory.cpus === 4, "Hindsight must use the verified four-CPU budget");
assert(Number(memory.environment?.HINDSIGHT_API_EMBEDDINGS_ONNX_INTRA_OP_THREADS) === memory.cpus, "Hindsight ORT threads must match its CPU budget");
assert(memory.environment?.HINDSIGHT_API_RERANKER_PROVIDER === "rrf", "Hindsight must use RRF reranking");
assert(memory.environment?.HINDSIGHT_API_VECTOR_EXTENSION === "pgvector", "Hindsight must use pgvector");
assert(memory.environment?.HINDSIGHT_API_TEXT_SEARCH_EXTENSION === "pgroonga", "Hindsight must use PGroonga");
assert(String(memory.environment?.HINDSIGHT_API_DATABASE_URL).includes("hindsight-postgres"), "Hindsight must use the internal database endpoint");
assert((bridge.volumes ?? []).some((mount) => String(mount).includes("/var/lib/kepos-codex-bridge")), "Codex auth needs a separate persistent mount");
assert(!app.depends_on, "Lamplit must remain independently startable when optional services fail");
assertDigestReference(defaultImageReference(memory.image), "Hindsight must use an immutable registry digest");
assertDigestReference(defaultImageReference(database.image), "Hindsight PostgreSQL must use an immutable registry digest");
const expectedHindsight = `${memoryImages.images.hindsight.published}@${memoryImages.images.hindsight.publishedDigest}`;
const expectedPostgres = `${memoryImages.images.postgres.published}@${memoryImages.images.postgres.publishedDigest}`;
const bridgeSnapshot = memoryImages.images.codexBridge;
const expectedBridge = `${bridgeSnapshot.published.slice(0, bridgeSnapshot.published.lastIndexOf(":"))}:latest`;
assert(String(memory.image).includes(expectedHindsight), "Compose must consume the verified Hindsight artifact");
assert(String(database.image).includes(expectedPostgres), "Compose must consume the verified Hindsight PostgreSQL artifact");
assert(defaultImageReference(bridge.image) === expectedBridge, "Compose must follow the Codex Bridge rolling tag");
assert(defaultImageReference(app.image) === "ghcr.io/lamplitisles/lamplit:full", "Compose must follow the Full application rolling tag");
assertDigestReference(`${bridgeSnapshot.published}@${bridgeSnapshot.digest}`, "Bridge snapshot must record a verified digest");
assert(/^sha-[0-9a-f]{40}$/.test(bridgeSnapshot.sourceTag), "Bridge snapshot must record its immutable source tag");

const result = {
  ok: true,
  file: composePath,
  services: names,
  internalNetwork: "hindsight-internal",
  mounts: {
    lamplit: mounts(app),
    postgres: mounts(database),
    bridge: mounts(bridge),
  },
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
