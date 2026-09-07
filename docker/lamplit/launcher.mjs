#!/usr/bin/env node

/*
 * Run the loopback-bound DSH process and the public-port proxy as one
 * container entrypoint. DSH prints a one-time tokenized URL using its own
 * listen port; rewrite that port in the log so the URL works through the
 * published Lamplit port without exposing DSH's internal listener.
 */
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  if (index < 0 || !argv[index + 1] || argv[index + 1] === "--") {
    throw new Error(`missing launcher option ${name}`);
  }
  return argv[index + 1];
};

const separator = argv.indexOf("--");
if (separator < 0) throw new Error("launcher requires -- before DSH arguments");
const proxyHost = option("--proxy-host");
const proxyPort = option("--proxy-port");
const dshPort = option("--dsh-port");
const dshArgs = argv.slice(separator + 1);
const dshEntrypoint = "/opt/dsh-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js";
const proxyEntrypoint = "/usr/local/bin/lamplit-proxy.mjs";

const rewriteStream = (source, destination) => {
  let pending = "";
  const rewrite = (value) => value.replaceAll(`127.0.0.1:${dshPort}`, `127.0.0.1:${proxyPort}`);
  source.setEncoding("utf8");
  source.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) destination.write(`${rewrite(line)}\n`);
  });
  source.on("end", () => {
    if (pending) destination.write(rewrite(pending));
  });
};

const dsh = spawn(
  process.execPath,
  ["--expose-internals", dshEntrypoint, ...dshArgs],
  { stdio: ["ignore", "pipe", "pipe"] },
);
const proxy = spawn(
  process.execPath,
  [proxyEntrypoint, proxyHost, proxyPort, "127.0.0.1", dshPort],
  { stdio: ["ignore", "inherit", "inherit"] },
);
rewriteStream(dsh.stdout, process.stdout);
rewriteStream(dsh.stderr, process.stderr);

let stopping = false;
let finished = false;
const stop = (signal = "SIGTERM") => {
  if (stopping) return;
  stopping = true;
  dsh.kill(signal);
  proxy.kill(signal);
};
const finish = (code) => {
  if (finished) return;
  finished = true;
  stop();
  process.exitCode = code;
};

process.once("SIGTERM", () => finish(0));
process.once("SIGINT", () => finish(130));
dsh.once("error", (error) => {
  console.error(`lamplit: DSH failed to start: ${error instanceof Error ? error.message : String(error)}`);
  finish(1);
});
proxy.once("error", (error) => {
  console.error(`lamplit: proxy failed to start: ${error instanceof Error ? error.message : String(error)}`);
  finish(1);
});
dsh.once("exit", (code, signal) => {
  if (!stopping) finish(code ?? (signal ? 1 : 0));
});
proxy.once("exit", (code, signal) => {
  if (!stopping) finish(code ?? (signal ? 1 : 0));
});
