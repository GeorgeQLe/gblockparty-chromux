'use strict';

const assert = require('assert');
const net = require('net');
const { previewProbe, previewProbeTarget } = require('../preview-probe');

function listen(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

(async () => {
  const ipv4 = await listen('127.0.0.1');
  const ipv4Port = ipv4.address().port;
  assert.deepStrictEqual(await previewProbe(`http://127.0.0.1:${ipv4Port}/path?q=kept#hash`), { status: 'ready' });
  assert.deepStrictEqual(await previewProbe(`http://localhost:${ipv4Port}/another`), { status: 'ready' });
  await close(ipv4);
  assert.deepStrictEqual(await previewProbe(`http://127.0.0.1:${ipv4Port}/closed`), { status: 'offline' });

  let ipv6 = null;
  try {
    ipv6 = await listen('::1');
    assert.deepStrictEqual(await previewProbe(`http://[::1]:${ipv6.address().port}/`), { status: 'ready' });
  } finally {
    if (ipv6) await close(ipv6);
  }

  assert.deepStrictEqual(previewProbeTarget('http://localhost/path?q=1'), { port: 80, hosts: ['127.0.0.1', '::1'] });
  assert.deepStrictEqual(previewProbeTarget('https://127.0.0.1/secure'), { port: 443, hosts: ['127.0.0.1'] });
  assert.strictEqual(previewProbeTarget('http://user:pass@localhost:3000/'), null);
  assert.strictEqual(previewProbeTarget('http://example.com:3000/'), null);
  assert.strictEqual(previewProbeTarget('file:///tmp/index.html'), null);
  assert.strictEqual(previewProbeTarget('not a url'), null);
  assert.deepStrictEqual(await previewProbe('https://example.com/'), { status: 'unsupported' });

  const started = Date.now();
  await previewProbe('http://127.0.0.1:9/', { timeoutMs: 25 });
  assert(Date.now() - started < 1000, 'closed/timeout probe must remain bounded');
  console.log('PREVIEW_PROBE_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
