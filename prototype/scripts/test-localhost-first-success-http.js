#!/usr/bin/env node
'use strict';

const assert = require('assert');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const { HOST, PAGE, createFixtureServer } = require('../examples/localhost-first-success/server');

async function request(url) {
  const response = await fetch(url);
  return { status: response.status, contentType: response.headers.get('content-type'), body: await response.text() };
}

async function runNode(script, args = []) {
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const result = await new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  return { ...result, stdout, stderr };
}

(async () => {
  const lines = [];
  const fixture = createFixtureServer({ port: 0, log: (line) => lines.push(line) });
  const ready = await fixture.ready;
  try {
    assert.equal(ready.host, HOST);
    assert(ready.port > 0);
    assert.deepEqual(lines, [`Local: http://localhost:${ready.port}/`]);
    assert.equal(fixture.server.address().address, HOST);

    const page = await request(ready.localUrl);
    assert.equal(page.status, 200);
    assert(page.contentType.startsWith('text/html'));
    for (const marker of ['release-status', 'visible-blocker', 'copy-action-target']) {
      assert(page.body.includes(`data-review-marker="${marker}"`), `missing marker ${marker}`);
    }
    assert.equal(page.body, PAGE);

    const health = await request(ready.healthUrl);
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), { ok: true });
    assert.equal((await request(`${ready.localUrl}unsupported`)).status, 404);
    assert.equal((await fetch(ready.localUrl, { method: 'POST' })).status, 405);
  } finally {
    await fixture.close();
  }
  assert.equal(fixture.server.listening, false);

  const occupied = net.createServer();
  await new Promise((resolve, reject) => occupied.once('error', reject).listen(0, HOST, resolve));
  const port = occupied.address().port;
  const child = spawn(process.execPath, [path.resolve(__dirname, '../examples/localhost-first-success/server.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exit = await new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  await new Promise((resolve) => occupied.close(resolve));
  assert.deepEqual(exit, { code: 1, signal: null });
  assert.equal(stdout, '');
  assert(stderr.includes('EADDRINUSE'), stderr);

  const uatScript = path.resolve(__dirname, 'uat-localhost-first-success.js');
  for (const args of [
    [],
    ['--allow-model-turns', '0'],
    ['--allow-model-turns', '2'],
    ['--allow-model-turns', '1', '--allow-model-turns', '1'],
  ]) {
    const refused = await runNode(uatScript, args);
    assert.equal(refused.code, 1, `UAT allowance unexpectedly accepted: ${args.join(' ')}`);
    assert(refused.stderr.includes('pass exactly --allow-model-turns 1'), refused.stderr);
  }

  console.log('localhost first-success HTTP tests: ok');
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
