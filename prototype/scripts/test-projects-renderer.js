'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-projects-'));
const homeDir = path.join(tmpDir, 'home');
const projectDir = path.join(tmpDir, 'sample-project');
const customProjectDir = path.join(tmpDir, 'custom-project');
const e2ePath = path.join(tmpDir, 'projects-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');
fs.mkdirSync(path.join(homeDir, '.chromux'), { recursive: true });
fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(customProjectDir, { recursive: true });
fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
  name: 'sample-project', packageManager: 'npm@11.0.0', scripts: {
    dev: "node -e \"require('net').createServer(()=>{}).listen(4173, '127.0.0.1', () => console.log('Local: http://localhost:4173/'))\"",
    projectrun: "node -e \"console.log('Local: http://localhost:4174/')\"",
    start: "node -e \"console.log('start')\"",
    serve: "node -e \"console.log('serve')\"",
    preview: "node -e \"console.log('preview')\"",
    'odd;name': "node -e \"console.log('safe')\"",
  },
}));
fs.writeFileSync(path.join(customProjectDir, 'package.json'), JSON.stringify({
  name: 'custom-project', packageManager: 'pnpm@10.0.0', scripts: { buildonly: "node -e \"console.log('build')\"" },
}));

fs.writeFileSync(e2ePath, `
(async () => {
  const p = window.chromuxTestProjects;
  const q = window.chromuxTestPreviews;
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const pollUntil = async (read, accept) => {
    const deadline = Date.now() + 10000;
    while (true) {
      const value = read();
      if (accept(value) || Date.now() >= deadline) return value;
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, deadline - Date.now())));
    }
  };
  await p.ready();
  const config = await p.config(${JSON.stringify(projectDir)});
  expect(config.valid && config.runner === 'npm' && config.scripts.includes('dev') && config.recommendedScript === 'dev',
    'package config should validate and recommend dev first');
  const resolved = await p.resolve(${JSON.stringify(projectDir)}, 'odd;name');
  expect(resolved.valid && resolved.command === "npm run 'odd;name'", 'resolver should shell-quote an allowlisted script');
  const rejected = await p.resolve(${JSON.stringify(projectDir)}, 'predev; rm -rf /');
  expect(!rejected.valid && !rejected.command, 'resolver must reject arbitrary command text');
  const invalid = await p.config(${JSON.stringify(path.join(tmpDir, 'missing'))});
  expect(!invalid.valid, 'missing cwd should be invalid');
  const saved = await p.replace([{ name: 'Sample', cwd: ${JSON.stringify(projectDir)}, script: 'dev' }, { name: 'Odd', cwd: ${JSON.stringify(projectDir)}, script: 'odd;name' }, { name: 'Unsafe', cwd: ${JSON.stringify(projectDir)}, script: 'predev; rm -rf /' }]);
  expect(saved.length === 2 && saved[0].startCommand === "npm run 'dev'", 'only allowlisted scripts should persist');
  expect(saved[1].startCommand === "npm run 'odd;name'", 'allowlisted unusual script names must be shell quoted');

  const originId = await q.addSession({ name: 'launcher-origin', cwd: ${JSON.stringify(projectDir)}, agent: 'codex' });
  q.failLoad(originId, 'http://localhost:4173/');
  await q.openServerLauncher(originId, 'http://localhost:4173/');
  const launcher = q.launcher(originId);
  expect(launcher.valid && launcher.recommendedScript === 'dev' && launcher.selectedScript === 'dev',
    'launcher should recommend dev from the originating project: ' + JSON.stringify(launcher));
  const activeBeforeLaunch = q.activeId();
  const serverSession = await q.launchServer(originId);
  expect(serverSession && q.activeId() === activeBeforeLaunch, 'background server tab must preserve source-session focus');
  const serverRow = await pollUntil(
    () => q.queueRows(originId)[0],
    (row) => row && row.status === 'READY',
  );
  expect(serverRow && serverRow.status === 'READY', 'launcher should poll the original URL until ready');
  expect(q.sessions().some((row) => row.name === 'sample-project dev server' && !row.active),
    'launcher should create a visible non-focused project server shell');

  const customId = await q.addSession({ name: 'custom-origin', cwd: ${JSON.stringify(customProjectDir)}, agent: 'codex' });
  q.failLoad(customId, 'http://localhost:4199/');
  await q.openServerLauncher(customId, 'http://localhost:4199/');
  const customLauncher = q.launcher(customId);
  expect(customLauncher.valid && customLauncher.recommendedScript === null && customLauncher.selectedScript === null,
    'project without a conventional server script should require explicit selection');
  expect(q.selectServerScript(customId, 'buildonly'), 'explicit allowlisted script selection should succeed');
  expect(!q.selectServerScript(customId, 'buildonly; rm -rf /'), 'arbitrary launcher command text should be rejected');

  const missingPackageId = await q.addSession({ name: 'missing-package', cwd: ${JSON.stringify(path.join(tmpDir, 'missing-package'))}, agent: 'codex' });
  q.failLoad(missingPackageId, 'http://localhost:4200/');
  await q.openServerLauncher(missingPackageId, 'http://localhost:4200/');
  expect(!q.launcher(missingPackageId).valid && /package|directory/i.test(q.launcher(missingPackageId).reason),
    'launcher should explain when the directory has no supported package scripts');

  await p.open(); await p.setCwd(${JSON.stringify(projectDir)}); p.setName('Started sample'); p.selectScript('projectrun');
  expect(p.startEnabled(), 'start should be enabled for a valid config');
  await p.start();
  const session = await pollUntil(
    () => p.sessionState(),
    (candidate) => candidate && candidate.queue.some((item) => item.url === 'http://localhost:4174/'),
  );
  expect(session && session.cwd === ${JSON.stringify(projectDir)}, 'start should create a project session');
  expect(session.collapsed && !session.currentUrl, 'start must not silently open the paired browser');
  expect(session.queue.some((item) => item.url === 'http://localhost:4174/'), 'server URL should enter the approval queue');
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
