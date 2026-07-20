'use strict';

const { execFile } = require('child_process');
const { readHostMetrics, simulatorAdmission } = require('./policy');

const ACTIONS = new Set(['boot', 'shutdown', 'install', 'launch', 'terminate', 'erase']);

function run(file, args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}${stderr ? `: ${String(stderr).trim()}` : ''}`;
        reject(error);
      } else resolve({ stdout: String(stdout), stderr: String(stderr), exitCode: 0 });
    });
  });
}

function validUdid(value) {
  return typeof value === 'string' && /^[A-F0-9-]{8,64}$/i.test(value);
}

async function listSimulators() {
  const result = await run('/usr/bin/xcrun', ['simctl', 'list', 'devices', 'available', '--json'], 10000);
  const parsed = JSON.parse(result.stdout);
  const devices = [];
  for (const [runtime, rows] of Object.entries(parsed.devices || {})) {
    for (const row of rows) devices.push({ udid: row.udid, name: row.name, state: row.state, runtime });
  }
  return devices;
}

function validateActionArgs(action, args) {
  if (!ACTIONS.has(action)) throw new Error('unsupported simulator action');
  if (!Array.isArray(args) || args.length > 20 || args.some((arg) => typeof arg !== 'string' || arg.length > 4096 || arg.includes('\0'))) {
    throw new Error('invalid simulator arguments');
  }
  if (action === 'install' && args.length !== 1) throw new Error('install requires one app path');
  if (['launch', 'terminate'].includes(action) && (args.length < 1 || !/^[A-Za-z0-9.-]+$/.test(args[0]))) {
    throw new Error(`${action} requires a bundle identifier`);
  }
  if (['boot', 'shutdown', 'erase'].includes(action) && args.length) throw new Error(`${action} accepts no arguments`);
}

async function executeSimulatorAction({ action, udid, args = [], capacityOverride = 'auto', metricsReader = readHostMetrics }) {
  if (!validUdid(udid)) throw new Error('invalid simulator UDID');
  validateActionArgs(action, args);
  let admission = null;
  if (action === 'boot') {
    const [devices, metrics] = await Promise.all([listSimulators(), metricsReader()]);
    const alreadyBooted = devices.some((device) => device.udid === udid && device.state === 'Booted');
    admission = simulatorAdmission(metrics, {
      booted: devices.filter((device) => device.state === 'Booted').length,
      override: capacityOverride,
    });
    if (!alreadyBooted && !admission.admit) {
      const error = new Error('simulator admission paused by host capacity policy');
      error.admission = admission;
      throw error;
    }
  }
  const result = await run('/usr/bin/xcrun', ['simctl', action, udid, ...args]);
  return { ...result, action, udid, admission };
}

module.exports = { executeSimulatorAction, listSimulators, validUdid, validateActionArgs };
