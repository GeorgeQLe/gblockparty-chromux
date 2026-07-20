'use strict';

const os = require('os');
const { execFile } = require('child_process');

const GIB = 1024 ** 3;

function automaticSimulatorLimit(totalMemoryBytes) {
  if (totalMemoryBytes < 32 * GIB) return 1;
  if (totalMemoryBytes < 64 * GIB) return 2;
  return 3;
}

function simulatorAdmission(metrics, { booted = 0, override = 'auto' } = {}) {
  const hardLimit = override === 'auto'
    ? automaticSimulatorLimit(metrics.totalMemoryBytes)
    : Math.max(1, Math.min(8, Number(override) || 1));
  const freeRatio = metrics.totalMemoryBytes > 0
    ? metrics.freeMemoryBytes / metrics.totalMemoryBytes
    : 0;
  const signals = {
    belowLimit: booted < hardLimit,
    memory: freeRatio >= 0.25,
    load: metrics.normalizedLoad < 0.75,
    swap: metrics.swapGrowthBytes <= 64 * 1024 * 1024,
    thermal: !metrics.thermalState || metrics.thermalState === 'nominal',
  };
  return {
    admit: Object.values(signals).every(Boolean),
    hardLimit,
    freeRatio,
    signals,
  };
}

function simulatorDrainCandidates(devices, activeUdids, hardLimit) {
  const active = new Set(activeUdids || []);
  const booted = (devices || []).filter((device) => device.state === 'Booted');
  const excess = Math.max(0, booted.length - Math.max(1, hardLimit));
  return booted.filter((device) => !active.has(device.udid)).slice(0, excess);
}

function execFileText(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 1500 }, (error, stdout) => resolve(error ? '' : String(stdout)));
  });
}

let previousSwap = null;
async function readHostMetrics() {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const normalizedLoad = os.loadavg()[0] / Math.max(1, os.cpus().length);
  let swapUsed = 0;
  let thermalState = null;
  if (process.platform === 'darwin') {
    const [swap, thermal] = await Promise.all([
      execFileText('/usr/sbin/sysctl', ['-n', 'vm.swapusage']),
      execFileText('/usr/bin/pmset', ['-g', 'therm']),
    ]);
    const match = swap.match(/used\s*=\s*([0-9.]+)([MG])/i);
    if (match) swapUsed = Number(match[1]) * (match[2].toUpperCase() === 'G' ? GIB : 1024 ** 2);
    if (/CPU_Speed_Limit\s*=\s*100/.test(thermal) && !/CPU_Scheduler_Limit\s*=\s*(?!100)/.test(thermal)) {
      thermalState = 'nominal';
    }
  }
  const swapGrowthBytes = previousSwap === null ? 0 : Math.max(0, swapUsed - previousSwap);
  previousSwap = swapUsed;
  return { totalMemoryBytes, freeMemoryBytes, normalizedLoad, swapGrowthBytes, thermalState };
}

module.exports = { automaticSimulatorLimit, simulatorAdmission, simulatorDrainCandidates, readHostMetrics };
