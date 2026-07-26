#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const scripts = fs.readdirSync(__dirname)
  .filter((name) => /^test-.*\.js$/.test(name))
  .filter((name) => !process.env.CHROMUX_TEST_FROM || name >= process.env.CHROMUX_TEST_FROM)
  .sort();
for (const script of scripts) {
  let result;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    result = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status === 0) break;
    if (attempt === 1) console.warn(`Retrying ${script} once after exit ${result.status || 1}`);
  }
  if (result.status !== 0) process.exit(result.status || 1);
  // Electron may report process exit just before Chromium's guest/view
  // subprocesses finish shutting down. Keep sequential smoke profiles from
  // racing those stragglers on constrained CI hosts.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
}
