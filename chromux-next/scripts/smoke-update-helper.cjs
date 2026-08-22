'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { applyUpdate } = require('./update-helper-core.cjs');

const [, , previousApp, successorApp] = process.argv;
if (process.platform !== 'darwin' || !path.isAbsolute(previousApp ?? '') || !path.isAbsolute(successorApp ?? '')) process.exit(2);

const version = (appPath) => execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(appPath, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();
const copyApp = (source, destination) => execFileSync('/usr/bin/ditto', [source, destination]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-next-helper-smoke-'));
const current = path.join(root, 'Chromux Next.app');
const staged = path.join(root, 'Chromux Next staged.app');
const userData = path.join(root, 'user-data');
const marker = path.join(userData, 'update-startup-success-v1');

try {
  fs.mkdirSync(userData, { recursive: true, mode: 0o700 });
  copyApp(previousApp, current);
  copyApp(successorApp, staged);
  const oldVersion = version(current);
  const newVersion = version(staged);
  if (oldVersion === newVersion) throw new Error('qualification fixtures must have different versions');
  applyUpdate({
    pid: 2_147_483_647,
    current,
    staged,
    marker,
    processAlive: () => false,
    startupTimeoutMs: 20_000,
    launch: (appPath) => {
      const executable = path.join(appPath, 'Contents', 'MacOS', 'chromux-next');
      spawn(executable, ['--smoke'], { env: { ...process.env, CHROMUX_NEXT_SMOKE_USER_DATA: userData }, detached: true, stdio: 'ignore' }).unref();
    }
  });
  if (version(current) !== newVersion || fs.existsSync(`${current}.chromux-update-backup`)) throw new Error('successful replacement did not commit cleanly');

  fs.rmSync(current, { recursive: true, force: true });
  copyApp(previousApp, current);
  copyApp(successorApp, staged);
  let rolledBack = false;
  try {
    applyUpdate({ pid: 2_147_483_647, current, staged, marker, processAlive: () => false, startupTimeoutMs: 250, launch: () => undefined });
  } catch { rolledBack = true; }
  if (!rolledBack || version(current) !== oldVersion) throw new Error('startup timeout did not restore the previous app');
  console.log(`Chromux Next update helper smoke passed (${oldVersion} -> ${newVersion}, rollback restored ${oldVersion})`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
