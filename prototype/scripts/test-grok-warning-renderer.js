'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-grok-warning-'));
const e2ePath = path.join(tmpDir, 'grok-warning-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.writeFileSync(e2ePath, `
(() => {
  const warning = window.chromuxTestGrokWarning;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  warning.open();
  expect(!warning.visible(), 'warning should be hidden for the default Claude selection');
  warning.select('grok');
  expect(warning.visible(), 'warning should appear when Grok is selected');
  const copy = warning.text();
  expect(copy.includes('may transmit codebase contents'), 'warning should describe possible codebase transfer');
  expect(copy.includes('cybersecurity or data-security professional'), 'warning should recommend professional review');
  expect(JSON.stringify(warning.resources()) === JSON.stringify(['wire-analysis', 'reproduction-kit', 'independent-report', 'xai-privacy']), 'warning should provide research and provider links');
  warning.select('codex');
  expect(!warning.visible(), 'warning should hide when Grok is no longer selected');
  return JSON.stringify({ ok: true });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: { ...process.env, CHROMUX_E2E: e2ePath, CHROMUX_E2E_OUT: e2eOutPath },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = ''; let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const out = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !out.includes('"ok":true')) {
    console.error('GROK_WARNING_RENDERER_FAIL', { code, signal, out, stdout, stderr });
    process.exit(1);
  }
  console.log('GROK_WARNING_RENDERER_OK');
});
