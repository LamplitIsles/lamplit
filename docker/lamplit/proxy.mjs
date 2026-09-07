#!/usr/bin/env node

/*
 * Keep DSH's own listener on loopback (its web app intentionally rejects a
 * wildcard host) while making the container port reachable through Docker's
 * normal port-forwarding path. This is a byte-for-byte TCP proxy so HTTP,
 * server-sent events, and WebSocket upgrades use the same endpoint.
 */
import net from "node:net";

const [listenHost = "0.0.0.0", listenPort = "3080", targetHost = "127.0.0.1", targetPort = "3081"] = process.argv.slice(2);
const port = Number(listenPort);
const target = Number(targetPort);

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid proxy listen port: ${listenPort}`);
if (!Number.isInteger(target) || target < 1 || target > 65535) throw new Error(`invalid proxy target port: ${targetPort}`);

const clients = new Set();
const server = net.createServer((client) => {
  clients.add(client);
  client.once("close", () => clients.delete(client));
  const upstream = net.createConnection({ host: targetHost, port: target });
  client.setNoDelay(true);
  upstream.setNoDelay(true);
  client.pipe(upstream);
  upstream.pipe(client);
  const close = () => {
    client.destroy();
    upstream.destroy();
  };
  client.once("error", close);
  upstream.once("error", close);
  client.once("close", () => upstream.destroy());
  upstream.once("close", () => client.destroy());
});

server.on("error", (error) => {
  console.error(`lamplit proxy: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

const shutdown = () => {
  for (const client of clients) client.destroy();
  server.close(() => process.exit(0));
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
server.listen(port, listenHost);
