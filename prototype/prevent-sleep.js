'use strict';

const { spawn } = require('child_process');

const CAFFEINATE_PATH = '/usr/bin/caffeinate';
const CAFFEINATE_ARGS = Object.freeze(['-dims']);

function createPreventSleepController({
  platform = process.platform,
  parentPid = process.pid,
  spawnProcess = spawn,
  onStatus = () => {},
} = {}) {
  let child = null;
  let enabled = false;
  let shuttingDown = false;
  let lastError = null;

  function status() {
    return {
      available: platform === 'darwin',
      enabled,
      running: Boolean(child),
      pid: child && Number.isInteger(child.pid) ? child.pid : null,
      error: lastError,
    };
  }

  function publish() {
    const snapshot = status();
    onStatus(snapshot);
    return snapshot;
  }

  function handleStopped(target, error = null) {
    if (child !== target) return;
    child = null;
    if (shuttingDown) return;
    if (enabled) enabled = false;
    lastError = error ? error.message : 'caffeinate exited unexpectedly';
    publish();
  }

  function setEnabled(nextEnabled) {
    if (typeof nextEnabled !== 'boolean') throw new TypeError('enabled must be a boolean');
    if (nextEnabled && platform !== 'darwin') {
      enabled = false;
      lastError = 'Prevent Sleep is only available on macOS.';
      return publish();
    }
    if (nextEnabled === enabled && (nextEnabled === Boolean(child) || !nextEnabled)) return status();

    enabled = nextEnabled;
    lastError = null;
    if (!enabled) {
      const target = child;
      child = null;
      if (target) target.kill();
      return publish();
    }

    try {
      const args = [...CAFFEINATE_ARGS, '-w', String(parentPid)];
      const target = spawnProcess(CAFFEINATE_PATH, args, { stdio: 'ignore' });
      child = target;
      target.once('error', (error) => handleStopped(target, error));
      target.once('exit', () => handleStopped(target));
      return publish();
    } catch (error) {
      enabled = false;
      child = null;
      lastError = error.message;
      return publish();
    }
  }

  function shutdown() {
    shuttingDown = true;
    const target = child;
    child = null;
    if (target) target.kill();
  }

  return { setEnabled, shutdown, status };
}

module.exports = { CAFFEINATE_ARGS, CAFFEINATE_PATH, createPreventSleepController };
