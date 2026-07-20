'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-stable-mode-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'stable-e2e.js');
const outPath = path.join(tmpDir, 'e2e.out');
fs.mkdirSync(homeDir, { recursive: true });
fs.writeFileSync(e2ePath, `
(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const d = window.chromuxTestDiagnostics;
  if (!d || d.visible()) throw new Error('stable mode must hide diagnostics');
  if (document.querySelector('#settings-developer-mode').checked) throw new Error('stable toggle should be off');
  const id = d.addSession({ name: 'stable-session' });
  d.emit(id, 'turn-end');
  if (d.visible()) throw new Error('session events must not reveal diagnostics in stable mode');
  return JSON.stringify({ ok: true });
})()
`);
const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke', '--no-dev-mode'], {
  cwd: appDir,
  env: { ...process.env, HOME: homeDir, PATH: '/usr/bin:/bin', CHROMUX_E2E: e2ePath, CHROMUX_E2E_OUT: outPath },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = ''; let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  if (code !== 0 || signal || !output.includes('"ok":true')) {
    console.error('DEV_MODE_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '', 'e2e:', output || 'missing');
    console.error('stdout:', stdout.trim()); console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('DEV_MODE_RENDERER_OK');
});
