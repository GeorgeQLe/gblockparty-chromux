'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { BrokerClient } = require('../resource-broker/client');

async function waitFor(predicate, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('timed out');
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-broker-test-'));
  const socketPath = path.join(temp, 'broker.sock');
  const statePath = path.join(temp, 'state.json');
  const daemon = spawn(process.execPath, [path.join(__dirname, '..', 'resource-broker', 'daemon.js')], {
    stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, CHROMUX_HOME_DIR: temp, CHROMUX_BROKER_SOCKET: socketPath, CHROMUX_BROKER_STATE: statePath },
  });
  let daemonError = '';
  daemon.stderr.on('data', (chunk) => { daemonError += chunk; });
  const daemonExit = new Promise((resolve) => daemon.once('exit', resolve));
  let restartedDaemon = null;
  let restartedExit = null;
  let c = null;
  const a = new BrokerClient({ socketPath, client: { clientId: 'integration-a', displayName: 'Integration A' } });
  const b = new BrokerClient({ socketPath, client: { clientId: 'integration-b', displayName: 'Integration B' } });
  try {
    await waitFor(() => {
      if (daemon.exitCode !== null) throw new Error(`daemon exited early: ${daemonError.trim()}`);
      return fs.existsSync(socketPath);
    });
    await Promise.all([a.connect(), b.connect()]);
    const leaseA = await a.request('resources.acquire', { resources: ['macos:foreground-input'], ttlMs: 5000 });
    const waitB = await b.request('resources.acquire', { resources: ['macos:foreground-input'], ttlMs: 5000 });
    assert.equal(leaseA.status, 'granted');
    assert.equal(waitB.status, 'queued');
    let state = await b.request('resources.list');
    assert.equal(state.leases.filter((lease) => lease.resources.includes('macos:foreground-input')).length, 1);
    a.close();
    await waitFor(async () => (await b.request('request.wait', { requestId: waitB.requestId })).status === 'granted');
    state = await b.request('resources.list');
    assert.equal(state.leases.find((lease) => lease.resources.includes('macos:foreground-input')).owner, 'integration-b');
    daemon.kill('SIGKILL');
    await daemonExit;
    b.close();
    restartedDaemon = spawn(process.execPath, [path.join(__dirname, '..', 'resource-broker', 'daemon.js')], {
      stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, CHROMUX_HOME_DIR: temp, CHROMUX_BROKER_SOCKET: socketPath, CHROMUX_BROKER_STATE: statePath },
    });
    restartedExit = new Promise((resolve) => restartedDaemon.once('exit', resolve));
    await new Promise((resolve) => setTimeout(resolve, 100));
    c = new BrokerClient({ socketPath, client: { clientId: 'integration-c', displayName: 'Integration C' } });
    await c.connect();
    state = await c.request('resources.list');
    assert.equal(state.leases.length, 0, 'daemon restart does not resurrect stale ownership');
    assert(state.recovered.some((lease) => lease.owner === 'integration-b'), 'restart reconciliation records stale owner');
    const afterRestart = await c.request('resources.acquire', { resources: ['macos:foreground-input'] });
    assert.equal(afterRestart.status, 'granted', 'resource is available after restart recovery');
    console.log('resource broker integration tests: ok');
  } finally {
    if (c) c.close();
    b.close();
    if (daemon.exitCode === null) daemon.kill('SIGTERM');
    await daemonExit;
    if (restartedDaemon && restartedDaemon.exitCode === null) restartedDaemon.kill('SIGTERM');
    if (restartedExit) await restartedExit;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
