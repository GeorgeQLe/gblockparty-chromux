'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { BrokerClient } = require('../resource-broker/client');
const { listSimulators } = require('../resource-broker/simulator');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bootstatus = (udid) => new Promise((resolve, reject) => {
  execFile('/usr/bin/xcrun', ['simctl', 'bootstatus', udid, '-b'], { timeout: 120000 }, (error) => (error ? reject(error) : resolve()));
});

(async () => {
  const devices = await listSimulators();
  const device = devices.find((item) => item.state === 'Shutdown');
  if (!device) throw new Error('no shutdown simulator is available for smoke testing');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-simulator-smoke-'));
  const socketPath = path.join(temp, 'broker.sock');
  const daemon = spawn(process.execPath, [path.join(__dirname, '..', 'resource-broker', 'daemon.js')], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, CHROMUX_HOME_DIR: temp, CHROMUX_BROKER_SOCKET: socketPath, CHROMUX_BROKER_STATE: path.join(temp, 'state.json') },
  });
  let stderr = '';
  daemon.stderr.on('data', (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => daemon.once('exit', resolve));
  const client = new BrokerClient({ socketPath, client: { clientId: 'simulator-smoke', displayName: 'Simulator smoke', pid: process.pid } });
  let lease = null;
  let bootedByTest = false;
  try {
    for (let attempt = 0; attempt < 80 && !fs.existsSync(socketPath); attempt += 1) await wait(25);
    if (!fs.existsSync(socketPath)) throw new Error(`broker did not start: ${stderr}`);
    await client.connect();
    const acquired = await client.request('resources.acquire', {
      resources: [`ios-simulator:${device.udid}`], operationPid: process.pid, ttlMs: 180000,
    });
    if (acquired.status !== 'granted') throw new Error('simulator lease was unexpectedly queued');
    lease = acquired.lease;
    try {
      await client.request('simulator.execute', { leaseId: lease.id, udid: device.udid, action: 'boot', args: [] });
      bootedByTest = true;
      await bootstatus(device.udid);
      console.log(`SIMULATOR_BROKER_BOOT_OK ${device.name} ${device.udid}`);
    } catch (error) {
      if (!/admission paused/.test(error.message)) throw error;
      console.log(`SIMULATOR_BROKER_POLICY_BLOCKED ${device.name} ${device.udid}`);
    }
    if (bootedByTest) await client.request('simulator.execute', { leaseId: lease.id, udid: device.udid, action: 'shutdown', args: [] });
    await client.request('lease.release', { leaseId: lease.id });
    lease = null;
    console.log('SIMULATOR_BROKER_RELEASE_OK');
  } finally {
    if (lease) {
      if (bootedByTest) await client.request('simulator.execute', { leaseId: lease.id, udid: device.udid, action: 'shutdown', args: [] }).catch(() => {});
      await client.request('lease.release', { leaseId: lease.id }).catch(() => {});
    }
    client.close();
    if (daemon.exitCode === null) daemon.kill('SIGTERM');
    await exited;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
