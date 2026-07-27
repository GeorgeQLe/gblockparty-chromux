'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-activity-lab-smoke-'));
const profile = path.join(temp, 'profile');
const output = path.join(temp, 'result.json');
const electron = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(electron, ['activity-lab-main.js', '--activity-lab', `--user-data-dir=${profile}`], {
  cwd: appDir,
  env: {
    ...process.env,
    CHROMUX_ACTIVITY_LAB_SMOKE: '1',
    CHROMUX_ACTIVITY_LAB_SMOKE_OUT: output,
    CHROMUX_ACTIVITY_LAB_CODEX: path.join(__dirname, 'fixtures', 'fake-codex-activity.js'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timer = setTimeout(() => child.kill('SIGTERM'), 20_000);
child.on('close', (code) => {
  clearTimeout(timer);
  try {
    assert.strictEqual(code, 0, stderr);
    const result = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.strictEqual(result.isolatedProfile, true);
    assert.strictEqual(result.normalChromuxBypassed, true);
    assert.strictEqual(result.explicitRunGate, true);
    assert.strictEqual(result.scenarioCount, 5);
    assert.strictEqual(result.onlyWorkingAnimates, true);
    console.log('ACTIVITY_LAB_SMOKE_OK');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
