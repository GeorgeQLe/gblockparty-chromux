#!/usr/bin/env node
'use strict';

const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ResourceBroker } = require('./core');
const { executeSimulatorAction, listSimulators } = require('./simulator');
const { readHostMetrics, simulatorAdmission, simulatorDrainCandidates } = require('./policy');
const { brokerSocketPath } = require('./paths');

const chromuxHome = process.env.CHROMUX_HOME_DIR || path.join(os.homedir(), '.chromux');
const socketPath = brokerSocketPath(chromuxHome, process.env.CHROMUX_BROKER_SOCKET);
const statePath = process.env.CHROMUX_BROKER_STATE || path.join(chromuxHome, 'resource-broker-state.json');
const lockPath = process.env.CHROMUX_BROKER_LOCK || path.join(chromuxHome, 'resource-broker.lock');
fs.mkdirSync(chromuxHome, { recursive: true, mode: 0o700 });

let ownsLock = false;
function acquireLock() {
  try {
    const descriptor = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, String(process.pid));
    fs.closeSync(descriptor);
    ownsLock = true;
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let pid = 0;
    try { pid = Number(fs.readFileSync(lockPath, 'utf8')); } catch { /* stale */ }
    try {
      if (pid > 0) { process.kill(pid, 0); return false; }
    } catch { /* stale */ }
    try { fs.unlinkSync(lockPath); } catch { return false; }
    return acquireLock();
  }
}
if (!acquireLock()) process.exit(0);

let recovered = [];
let capacityOverride = process.env.CHROMUX_SIMULATOR_CAPACITY || 'auto';
let excessSince = null;
try {
  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  recovered = (saved.leases || []).map((lease) => ({ ...lease, recoveredAt: Date.now(), reason: 'daemon-restart' }));
  if (saved.capacityOverride === 'auto' || [1, 2, 3].includes(saved.capacityOverride)) capacityOverride = saved.capacityOverride;
} catch { /* first start or malformed state */ }

const broker = new ResourceBroker({ recovered });
broker.registerResource('macos:foreground-input', { kind: 'macos', label: 'macOS foreground input', exclusive: true });

function persist() {
  const snapshot = broker.snapshot();
  const temp = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ leases: snapshot.leases, capacityOverride, savedAt: Date.now() }), { mode: 0o600 });
  fs.renameSync(temp, statePath);
}

async function refreshSimulators() {
  try {
    const [devices, metrics] = await Promise.all([listSimulators(), readHostMetrics()]);
    const booted = devices.filter((device) => device.state === 'Booted').length;
    const capacity = simulatorAdmission(metrics, { booted, override: capacityOverride });
    for (const device of devices) broker.registerResource(`ios-simulator:${device.udid}`, {
      kind: 'ios-simulator', label: device.name, udid: device.udid, runtime: device.runtime, state: device.state,
      capacity: { ...capacity, mode: capacityOverride, booted }, exclusive: true,
    });
    const activeUdids = broker.snapshot().leases.flatMap((lease) => lease.resources)
      .filter((resourceId) => resourceId.startsWith('ios-simulator:'))
      .map((resourceId) => resourceId.slice('ios-simulator:'.length));
    const drain = simulatorDrainCandidates(devices, activeUdids, capacity.hardLimit);
    if (drain.length) {
      excessSince = excessSince || Date.now();
      if (Date.now() - excessSince >= 15000) {
        for (const device of drain) {
          executeSimulatorAction({ action: 'shutdown', udid: device.udid }).catch(() => {});
        }
        excessSince = null;
      }
    } else {
      excessSince = null;
    }
  } catch { /* Xcode is optional */ }
}

async function dispatch(method, params, socketClientId) {
  const clientId = params?.clientId || socketClientId;
  switch (method) {
    case 'client.register': return broker.registerClient(params);
    case 'client.rename': return broker.renameClient(clientId, params.displayName);
    case 'resources.list': await refreshSimulators(); return broker.snapshot();
    case 'resources.acquire': return broker.acquire({ ...params, clientId });
    case 'request.wait': return broker.wait(params.requestId, clientId);
    case 'request.cancel': return broker.cancel(params.requestId, clientId, Boolean(params.force));
    case 'lease.renew': return broker.renew(params.leaseId, clientId, params.ttlMs);
    case 'lease.release': return broker.release(params.leaseId, clientId, Boolean(params.force));
    case 'resource.register': return broker.registerResource(params.resourceId, params.details);
    case 'capacity.set': {
      const value = params.value === 'auto' ? 'auto' : Number(params.value);
      if (value !== 'auto' && ![1, 2, 3].includes(value)) throw new Error('capacity must be auto, 1, 2, or 3');
      capacityOverride = value;
      await refreshSimulators();
      return { value: capacityOverride };
    }
    case 'simulator.execute': {
      broker.assertLease(params.leaseId, clientId, [`ios-simulator:${params.udid}`]);
      return executeSimulatorAction({ ...params, capacityOverride });
    }
    default: throw new Error(`unknown method: ${method}`);
  }
}

try { if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath); } catch { /* stale socket */ }
const server = net.createServer((socket) => {
  let buffer = '';
  let socketClientId = null;
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > 1024 * 1024) {
      socket.destroy(new Error('broker request exceeds 1 MiB'));
      return;
    }
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { socket.write(`${JSON.stringify({ error: 'invalid JSON' })}\n`); continue; }
      Promise.resolve(dispatch(message.method, message.params || {}, socketClientId)).then((result) => {
        if (message.method === 'client.register') socketClientId = result.id;
        persist();
        socket.write(`${JSON.stringify({ id: message.id, result })}\n`);
      }).catch((error) => {
        socket.write(`${JSON.stringify({ id: message.id, error: { message: error.message, admission: error.admission || null } })}\n`);
      });
    }
  });
  socket.on('close', () => {
    if (socketClientId) { broker.disconnect(socketClientId); persist(); }
  });
});
server.on('error', (error) => {
  console.error(`resource broker failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(socketPath, () => {
  fs.chmodSync(socketPath, 0o600);
  refreshSimulators().then(persist).catch(() => {});
});

const sweep = setInterval(() => { broker.expire(); persist(); }, 1000);
sweep.unref();
function shutdown() {
  clearInterval(sweep);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('exit', () => {
  if (!ownsLock) return;
  try { fs.unlinkSync(lockPath); } catch { /* already removed */ }
  try { fs.unlinkSync(socketPath); } catch { /* already removed */ }
});
