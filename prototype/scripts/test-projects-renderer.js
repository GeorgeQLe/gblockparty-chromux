'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-projects-'));
const homeDir = path.join(tmpDir, 'home');
const projectDir = path.join(tmpDir, 'sample-project');
const e2ePath = path.join(tmpDir, 'projects-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');
fs.mkdirSync(path.join(homeDir, '.chromux'), { recursive: true });
fs.mkdirSync(projectDir, { recursive: true });
fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
  name: 'sample-project', packageManager: 'npm@11.0.0', scripts: {
    dev: "node -e \"console.log('Local: http://localhost:4173/')\"",
    'odd;name': "node -e \"console.log('safe')\"",
  },
}));

fs.writeFileSync(e2ePath, `
(async () => {
  const p = window.chromuxTestProjects;
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  await p.ready();
  const config = await p.config(${JSON.stringify(projectDir)});
  expect(config.valid && config.runner === 'npm' && config.scripts.includes('dev'), 'package config should validate');
  const invalid = await p.config(${JSON.stringify(path.join(tmpDir, 'missing'))});
  expect(!invalid.valid, 'missing cwd should be invalid');
  const saved = await p.replace([{ name: 'Sample', cwd: ${JSON.stringify(projectDir)}, script: 'dev' }, { name: 'Odd', cwd: ${JSON.stringify(projectDir)}, script: 'odd;name' }, { name: 'Unsafe', cwd: ${JSON.stringify(projectDir)}, script: 'predev; rm -rf /' }]);
  expect(saved.length === 2 && saved[0].startCommand === "npm run 'dev'", 'only allowlisted scripts should persist');
  expect(saved[1].startCommand === "npm run 'odd;name'", 'allowlisted unusual script names must be shell quoted');
  await p.open(); await p.setCwd(${JSON.stringify(projectDir)}); p.setName('Started sample'); p.selectScript('dev');
  expect(p.startEnabled(), 'start should be enabled for a valid config');
  await p.start(); await new Promise((resolve) => setTimeout(resolve, 1200));
  const session = p.sessionState();
  expect(session && session.cwd === ${JSON.stringify(projectDir)}, 'start should create a project session');
  expect(session.collapsed && !session.currentUrl, 'start must not silently open the paired browser');
  expect(session.queue.some((item) => item.url === 'http://localhost:4173/'), 'server URL should enter the approval queue');
  return JSON.stringify({ ok: true, session });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: { ...process.env, HOME: homeDir, PATH: `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ''}`, CHROMUX_E2E: e2ePath, CHROMUX_E2E_OUT: e2eOutPath },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = ''; let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const out = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !out.includes('"ok":true')) {
    console.error('PROJECTS_RENDERER_FAIL', { code, signal, out, stdout, stderr }); process.exit(1);
  }
  console.log('PROJECTS_RENDERER_OK');
});
