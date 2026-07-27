'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const {
  CaptureControlClient,
  CaptureControlServer,
} = require('../capture/control');

function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() >= deadline) return reject(new Error('timed out'));
      setTimeout(poll, 20);
    };
    poll();
  });
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-capture-control-'));
  const socketPath = path.join(root, 'capture.sock');
  fs.writeFileSync(socketPath, 'stale');
  const seen = [];
  const disconnected = [];
  const server = new CaptureControlServer({
    chromuxHome: root,
    socketPath,
    dispatch: async (method, params, caller) => {
      seen.push({ method, params, caller });
      if (method === 'never') return new Promise(() => {});
      return { method, params, caller };
    },
    onDisconnect: (caller) => disconnected.push(caller.clientId),
  });
  const first = new CaptureControlClient({
    socketPath,
    timeoutMs: 1000,
    caller: { clientId: 'test:first', displayName: 'First test client', pid: 10 },
  });
  const second = new CaptureControlClient({
    socketPath,
    timeoutMs: 1000,
    caller: { clientId: 'test:second', displayName: 'Second test client', pid: 11 },
  });
  try {
    await server.start();
    if (process.platform !== 'win32') assert.equal(fs.statSync(socketPath).mode & 0o777, 0o600);
    if (process.platform !== 'win32') {
      assert.equal(server.server.address(), socketPath, 'capture control must bind only the Unix socket');
    }
    const [a, b] = await Promise.all([
      first.request('targets.list', { a: 1 }),
      second.request('targets.list', { b: 2 }),
    ]);
    assert.equal(a.caller.clientId, 'test:first');
    assert.equal(b.caller.clientId, 'test:second');
    assert.equal(seen.length, 2);

    const raw = net.createConnection(socketPath);
    let malformed = '';
    raw.setEncoding('utf8');
    raw.on('data', (chunk) => { malformed += chunk; });
    await new Promise((resolve) => raw.once('connect', resolve));
    raw.write('{bad json}\n');
    await waitFor(() => malformed.includes('invalid JSON'));
    raw.destroy();

    const identity = net.createConnection(socketPath);
    let identityOutput = '';
    identity.setEncoding('utf8');
    identity.on('data', (chunk) => { identityOutput += chunk; });
    await new Promise((resolve) => identity.once('connect', resolve));
    identity.write(`${JSON.stringify({
      id: 1,
      method: 'client.register',
      params: { clientId: 'test:stable', displayName: 'Stable identity', pid: 14 },
    })}\n`);
    await waitFor(() => identityOutput.includes('"clientId":"test:stable"'));
    identity.write(`${JSON.stringify({
      id: 2,
      method: 'client.register',
      params: { clientId: 'test:changed', displayName: 'Changed identity', pid: 15 },
    })}\n`);
    await waitFor(() => identityOutput.includes('identity is already registered'));
    identity.destroy();

    const timed = new CaptureControlClient({
      socketPath,
      timeoutMs: 40,
      caller: { clientId: 'test:timeout', displayName: 'Timeout client', pid: 12 },
    });
    await assert.rejects(() => timed.request('never'), /timed out/);
    timed.close();

    first.close();
    await waitFor(() => disconnected.includes('test:first'));
    assert(!disconnected.includes('test:second'), 'concurrent client ownership must stay isolated');
  } finally {
    first.close();
    second.close();
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }

  const unavailableRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-capture-unavailable-'));
  const unavailable = new CaptureControlClient({
    chromuxHome: unavailableRoot,
    caller: { clientId: 'test:missing', displayName: 'Missing app client', pid: 20 },
    timeoutMs: 100,
  });
  try {
    await assert.rejects(
      () => unavailable.request('targets.list'),
      /Chromux is not running\. Open Chromux/,
    );
  } finally {
    unavailable.close();
    fs.rmSync(unavailableRoot, { recursive: true, force: true });
  }
  console.log('capture control integration tests: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
