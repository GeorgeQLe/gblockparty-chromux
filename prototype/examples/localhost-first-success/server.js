#!/usr/bin/env node
'use strict';

const http = require('http');

const DEFAULT_PORT = 43117;
const HOST = '127.0.0.1';

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Chromux localhost first-success fixture</title>
  <style>
    :root { color-scheme: light dark; font: 17px/1.5 system-ui, sans-serif; }
    body { max-width: 52rem; margin: 4rem auto; padding: 0 1.5rem; }
    main { border: 2px solid currentColor; border-radius: 12px; padding: 2rem; }
    .status { color: #16803b; font-weight: 750; }
    .blocker { color: #b54708; font-weight: 750; }
    code { padding: .15rem .35rem; background: color-mix(in srgb, currentColor 10%, transparent); }
  </style>
</head>
<body>
  <main>
    <h1>Chromux localhost first-success fixture</h1>
    <p class="status" data-review-marker="release-status">Release status: candidate ready for review</p>
    <p class="blocker" data-review-marker="visible-blocker">Visible blocker: approval transcript is not archived</p>
    <p data-review-marker="copy-action-target">Copy/action target: archive the approved UAT transcript</p>
    <button type="button" data-action="archive-transcript">Archive approved transcript</button>
  </main>
</body>
</html>`;

function parsePort(value = process.env.PORT) {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer from 0 through 65535; received ${JSON.stringify(value)}`);
  }
  return port;
}

function createFixtureServer({ port = parsePort(), host = HOST, log = console.log } = {}) {
  if (host !== HOST) throw new Error(`localhost fixture must bind only to ${HOST}`);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${HOST}`);
    if (request.method !== 'GET') {
      response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET' });
      response.end('Method Not Allowed\n');
      return;
    }
    if (url.pathname === '/') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      });
      response.end(PAGE);
      return;
    }
    if (url.pathname === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end('{"ok":true}\n');
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not Found\n');
  });

  const ready = new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen({ host, port }, () => {
      server.off('error', onError);
      const address = server.address();
      const localUrl = `http://localhost:${address.port}/`;
      log(`Local: ${localUrl}`);
      resolve({ host, port: address.port, localUrl, healthUrl: `${localUrl}healthz` });
    });
  });

  return {
    server,
    ready,
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function main() {
  let fixture;
  try {
    fixture = createFixtureServer();
    await fixture.ready;
  } catch (error) {
    console.error(`localhost-first-success: ${error.code || error.message}`);
    process.exitCode = 1;
    return;
  }
  const shutdown = async () => {
    await fixture.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) main();

module.exports = { DEFAULT_PORT, HOST, PAGE, parsePort, createFixtureServer };
