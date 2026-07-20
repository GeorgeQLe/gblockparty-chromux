'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-prevent-sleep-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'prevent-sleep-e2e.js');
const outPath = path.join(tmpDir, 'e2e.out');
fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const waitFor = async (check, message) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const value = await check();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(message);
  };

  const toggle = document.querySelector('#settings-prevent-sleep');
  const label = document.querySelector('#settings-prevent-sleep-status');
  if (!toggle || !label) throw new Error('Prevent Sleep controls are missing');
  if (toggle.checked) throw new Error('Prevent Sleep should default off');

  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  const active = await waitFor(async () => {
    const status = (await window.chromux.getEnv()).preventSleep;
    return status.running ? status : null;
  }, 'caffeinate did not start');
  if (!toggle.checked || !label.classList.contains('running')) throw new Error('active state was not rendered');
  if (!Number.isInteger(active.pid)) throw new Error('active caffeinate PID is missing');

  toggle.checked = false;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(async () => !(await window.chromux.getEnv()).preventSleep.running, 'caffeinate did not stop');
  if (toggle.checked || label.textContent !== 'OFF') throw new Error('disabled state was not rendered');

  return JSON.stringify({ ok: true, activePid: active.pid });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: {
    ...process.env,
    HOME: homeDir,
    PATH: '/usr/bin:/bin',
    CHROMUX_E2E: e2ePath,
    CHROMUX_E2E_OUT: outPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  const preferencesPath = path.join(homeDir, '.chromux', 'preferences.json');
  const preferences = fs.existsSync(preferencesPath) ? JSON.parse(fs.readFileSync(preferencesPath, 'utf8')) : {};
  if (code !== 0 || signal || !output.includes('"ok":true') || preferences.preventSleep !== false) {
    console.error('PREVENT_SLEEP_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '', 'e2e:', output || 'missing');
    console.error('preferences:', JSON.stringify(preferences));
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('PREVENT_SLEEP_RENDERER_OK');
});
