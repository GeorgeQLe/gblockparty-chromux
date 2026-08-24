'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const pause = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
const openApp = (appPath, environment = process.env, spawnProcess = spawn) => {
  const args = ['-n'];
  for (const name of ['CHROMUX_NEXT_SMOKE_USER_DATA', 'CODEX_HOME']) {
    if (environment[name]) args.push('--env', `${name}=${environment[name]}`);
  }
  args.push(appPath);
  const launchEnvironment = { ...environment };
  delete launchEnvironment.ELECTRON_RUN_AS_NODE;
  spawnProcess('/usr/bin/open', args, { detached: true, stdio: 'ignore', env: launchEnvironment }).unref();
};
const isProcessAlive = (value) => { try { process.kill(value, 0); return true; } catch { return false; } };

function applyUpdate({ pid, current, staged, marker, startupTimeoutMs = 45_000, processTimeoutMs = 30_000, fileSystem = fs, launch = openApp, launchEnvironment = process.env, sleep = pause, processAlive = isProcessAlive }) {
  const backup = `${current}.chromux-update-backup`;
  const processDeadline = Date.now() + processTimeoutMs;
  while (Date.now() < processDeadline && processAlive(pid)) sleep(200);
  if (processAlive(pid)) throw new Error('application process did not exit');
  let backedUp = false;
  try {
    fileSystem.rmSync(marker, { force: true });
    fileSystem.rmSync(backup, { recursive: true, force: true });
    fileSystem.renameSync(current, backup);
    backedUp = true;
    fileSystem.renameSync(staged, current);
    launch(current, launchEnvironment);
    const startupDeadline = Date.now() + startupTimeoutMs;
    while (Date.now() < startupDeadline && !fileSystem.existsSync(marker)) sleep(250);
    if (!fileSystem.existsSync(marker)) throw new Error('startup marker timed out');
    fileSystem.rmSync(backup, { recursive: true, force: true });
    fileSystem.rmSync(marker, { force: true });
    return true;
  } catch (error) {
    try {
      if (backedUp) {
        fileSystem.rmSync(current, { recursive: true, force: true });
        if (fileSystem.existsSync(backup)) fileSystem.renameSync(backup, current);
      }
      launch(current, launchEnvironment);
    } catch { /* the recoverable adjacent backup remains for manual recovery */ }
    throw error;
  }
}

module.exports = { applyUpdate, openApp };
