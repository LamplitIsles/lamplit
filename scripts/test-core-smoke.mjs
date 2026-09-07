#!/usr/bin/env node

/*
 * Disposable Core runtime smoke. The caller supplies an image reference; all
 * host paths and the container name are created for this invocation and are
 * removed in the finally block. No provider, mailbox, Hindsight, or Keet
 * credentials are passed to the container.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import http from "node:http";
import net from "node:net";

const image = process.env.LAMPLIT_CORE_IMAGE;
if (!image) {
  console.error("Set LAMPLIT_CORE_IMAGE to the Core image to smoke-test (for example ghcr.io/lamplitisles/lamplit:latest).");
  process.exit(64);
}

const root = join(tmpdir(), `lamplit-core-smoke-${process.pid}-${randomBytes(4).toString("hex")}`);
const state = join(root, "state");
const workspace = join(root, "workspace");
const identity = join(root, "keet-identity");
const container = `lamplit-core-smoke-${process.pid}-${randomBytes(3).toString("hex")}`;

const runDocker = (args, options = {}) => execFileSync("docker", args, {
  cwd: root,
  encoding: "utf8",
  stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  timeout: options.timeout ?? 30_000,
});

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close(() => reject(new Error("Docker smoke could not select a loopback port")));
      return;
    }
    const port = address.port;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});

const waitForRoute = async (port, path, deadlineMs = 180_000) => {
  const deadline = Date.now() + deadlineMs;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    try {
      const status = await new Promise((resolve, reject) => {
        const request = http.get({
          hostname: "127.0.0.1",
          port,
          path,
          agent: false,
          headers: { connection: "close" },
        }, (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        });
        request.setTimeout(3_000, () => request.destroy(new Error("request timeout")));
        request.once("error", reject);
      });
      if (status < 400) return status;
      lastError = `HTTP ${status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${path} did not become ready within ${deadlineMs / 1000}s (${lastError})`);
};

const waitForToken = async (previousToken, expectedPort, deadlineMs = 180_000) => {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    let latest;
    try {
      const logs = runDocker(["logs", container]);
      const urls = [...logs.matchAll(/https?:\/\/127\.0\.0\.1:(\d+)\/\?token=([^\s]+)/g)];
      latest = urls.at(-1);
    } catch { /* container is still initializing */ }
    const token = latest?.[2];
    if (token && token !== previousToken) {
      if (Number(latest[1]) !== expectedPort) {
        throw new Error(`DSH printed an internal token URL port ${latest[1]} instead of published port ${expectedPort}`);
      }
      return { emittedUrl: latest[0], token };
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Core did not print its startup token within ${deadlineMs / 1000}s`);
};

const waitForEmittedUrl = (port, emittedUrl) => {
  const url = new URL(emittedUrl);
  return waitForRoute(port, `${url.pathname}${url.search}`);
};

const start = (port) => runDocker([
  "run", "-d", "--name", container,
  "--user", "1000:1000",
  "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
  "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m,mode=1777",
  "--publish", `127.0.0.1:${port}:3080`,
  "--mount", `type=bind,src=${state},dst=/home/lamplit/.local/state/dsh,rw`,
  "--mount", `type=bind,src=${workspace},dst=/workspace,rw`,
  "--mount", `type=bind,src=${identity},dst=/var/lib/lamplit/keet,rw`,
  "--mount", `type=bind,src=${identity},dst=/workspace/.dsh/dsh-keet,rw`,
  image,
]);

let port;
let marker;
try {
  mkdirSync(state, { recursive: true, mode: 0o777 });
  mkdirSync(workspace, { recursive: true, mode: 0o777 });
  mkdirSync(identity, { recursive: true, mode: 0o777 });
  chmodSync(state, 0o777);
  chmodSync(workspace, 0o777);
  chmodSync(identity, 0o777);
  port = await freePort();

  start(port);
  // The documented command maps host port 3080 to the image's port 3080, so
  // the launcher must print a URL for that published container port. The
  // harness uses a disposable host port to avoid colliding with a local app;
  // the token itself is still exercised through that forwarded port below.
  const firstToken = await waitForToken(undefined, 3080);
  const stockStatus = await waitForEmittedUrl(port, firstToken.emittedUrl);
  const companionStatus = await waitForRoute(port, "/companion/");
  marker = `core-smoke-${Date.now()}`;
  // The smoke harness itself runs as the host user while the container uses
  // uid 1000. Keep these disposable markers world-readable so a rootless
  // restart can watch the state directory without changing real state files.
  writeFileSync(join(state, "smoke-marker"), marker, { mode: 0o666 });
  writeFileSync(join(workspace, "smoke-workspace-marker"), marker, { mode: 0o666 });
  const inContainer = readFileSync(join(workspace, "smoke-workspace-marker"), "utf8");
  if (inContainer !== marker) throw new Error("workspace marker was not writable through the mounted workspace");
  if (!readdirSync(state).length) throw new Error("Core did not seed the empty DSH state volume");

  runDocker(["stop", "--time", "10", container], { timeout: 20_000 });
  runDocker(["start", container]);
  const restartToken = await waitForToken(firstToken.token, 3080);
  await waitForEmittedUrl(port, restartToken.emittedUrl);
  if (readFileSync(join(state, "smoke-marker"), "utf8") !== marker) {
    throw new Error("Core restart did not preserve the DSH state volume");
  }
  if (readFileSync(join(workspace, "smoke-workspace-marker"), "utf8") !== marker) {
    throw new Error("Core restart did not preserve the Partner workspace");
  }
  console.log(JSON.stringify({ ok: true, image, container, port, routes: { "/": stockStatus, "/companion/": companionStatus }, stateSeeded: true, restartPreserved: true }, null, 2));
} finally {
  try { runDocker(["rm", "-f", container], { timeout: 20_000, stdio: "ignore" }); } catch { /* already gone */ }
  // Rootless engines map uid 1000 inside the container to a subordinate host
  // uid, so the host process cannot remove image-owned seed directories
  // directly. Use the same test image as a disposable root helper against the
  // test-owned mount, then remove the now-empty host directory.
  try {
    runDocker([
      "run", "--rm", "--user", "0:0", "--entrypoint", "/bin/sh",
      "--mount", `type=bind,src=${root},dst=/cleanup,rw`,
      image, "-ec", "find /cleanup -mindepth 1 -depth -delete",
    ], { timeout: 30_000, stdio: "ignore" });
  } catch { /* preserve the failure that triggered cleanup */ }
  try {
    // Podman's rootless Docker-compatible socket maps container uid 1000 to a
    // subordinate host uid. `unshare` gives cleanup the matching id map when
    // the helper container cannot remove those files through the bind mount.
    execFileSync("podman", ["unshare", "find", root, "-mindepth", "1", "-depth", "-delete"], {
      cwd: root,
      stdio: "ignore",
      timeout: 30_000,
    });
  } catch { /* podman is optional; rootful Docker needs no fallback */ }
  try { rmSync(root, { recursive: true, force: true }); } catch { /* rootless helper may be unavailable */ }
}
