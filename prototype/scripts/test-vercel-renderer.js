'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-vercel-renderer-'));
const home = path.join(temp, 'home');
const bin = path.join(temp, 'bin');
const project = path.join(temp, 'project');
const e2ePath = path.join(temp, 'e2e.js');
const outPath = path.join(temp, 'e2e.out');
fs.mkdirSync(path.join(home, '.chromux'), { recursive: true });
fs.mkdirSync(path.join(project, '.vercel'), { recursive: true });
const canonicalProject = fs.realpathSync(project);
fs.mkdirSync(bin, { recursive: true });
fs.writeFileSync(path.join(project, '.vercel', 'project.json'), JSON.stringify({
  orgId: 'team_fixture',
  projectId: 'prj_fixture',
}));
execFileSync('/usr/bin/git', ['init', '-b', 'main'], { cwd: project });
execFileSync('/usr/bin/git', ['config', 'user.name', 'Chromux Fixture'], { cwd: project });
execFileSync('/usr/bin/git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: project });
fs.writeFileSync(path.join(project, 'README.md'), 'fixture\n');
execFileSync('/usr/bin/git', ['add', '-A'], { cwd: project });
execFileSync('/usr/bin/git', ['commit', '-m', 'Fixture'], { cwd: project });
const vercelExecutable = path.join(bin, 'vercel');
fs.writeFileSync(vercelExecutable, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Vercel CLI 42.1.0"
  exit 0
fi
if [ "$1" = "whoami" ]; then
  echo "fixture-user"
  exit 0
fi
if [ "$1" = "deploy" ]; then
  if [ "$VERCEL_ORG_ID" != "team_fixture" ] || [ "$VERCEL_PROJECT_ID" != "prj_fixture" ]; then
    echo "missing mapped IDs" >&2
    exit 2
  fi
  echo "https://renderer-fixture.vercel.app"
  exit 0
fi
if [ "$1" = "inspect" ]; then
  echo "READY"
  exit 0
fi
echo "unsupported" >&2
exit 1
`);
fs.chmodSync(vercelExecutable, 0o755);

fs.writeFileSync(e2ePath, `
(async () => {
  const v = window.chromuxTestVercel;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const id = v.addSession({ name: 'renderer-vercel', cwd: ${JSON.stringify(project)} });
  let snapshot = await v.open(id);
  expect(snapshot.open, 'header button should open the setup wizard');
  expect(snapshot.capability.includes('42.1.0'), 'wizard should report the runtime-local CLI version');
  expect(snapshot.repositoryRoot === ${JSON.stringify(canonicalProject)},
    'linked project should resolve a repository root: ' + JSON.stringify(snapshot));
  expect(snapshot.deployRoot === ${JSON.stringify(canonicalProject)}, 'linked project should resolve the deploy root');
  expect(snapshot.orgId === 'team_fixture' && snapshot.projectId === 'prj_fixture',
    'wizard should prefill IDs from .vercel/project.json');
  snapshot = await v.connectCli();
  expect(snapshot.profiles.length === 1 && snapshot.profiles[0].kind === 'cli',
    'CLI login should create a non-secret connection profile');
  expect(snapshot.profileId === snapshot.profiles[0].id && !snapshot.saveDisabled,
    'new connection should be selected and enable saving');
  v.setProject({
    orgId: 'team_fixture',
    projectId: 'prj_fixture',
    trigger: 'direct',
    productionBranch: 'main',
    environment: 'preview',
  });
  snapshot = await v.save();
  expect(snapshot.headerReady && snapshot.header.includes('READY'),
    'saved setup should mark the terminal-header Vercel button ready');
  expect(snapshot.status.includes('saved'), 'wizard should confirm persistence');
  expect(snapshot.tokenValue === '', 'renderer must not retain token field contents');
  snapshot = await v.reviewShip('production');
  expect(snapshot.review && snapshot.review.production,
    'production review should name the protected target: ' + JSON.stringify(snapshot));
  v.confirmShip({ reviewed: true, productionConfirmation: 'wrong target' });
  snapshot = v.snapshot(id);
  expect(snapshot.shipDisabled, 'wrong production phrase must keep shipping disabled');
  v.confirmShip({ reviewed: true, productionConfirmation: snapshot.review.productionConfirmation });
  snapshot = v.snapshot(id);
  expect(!snapshot.shipDisabled, 'exact production phrase should unlock the second confirmation');
  snapshot = await v.startShip();
  const deadline = Date.now() + 5000;
  while ((!snapshot.job || snapshot.job.phase !== 'ready') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    snapshot = v.snapshot(id);
  }
  expect(snapshot.job && snapshot.job.phase === 'ready', 'live job updates should reach READY: ' + JSON.stringify(snapshot));
  expect(snapshot.job.deploymentUrl === 'https://renderer-fixture.vercel.app',
    'final Vercel preview URL should be presented');
  return JSON.stringify({
    ok: true,
    header: snapshot.header,
    profile: snapshot.profiles[0].kind,
    deploymentUrl: snapshot.job.deploymentUrl,
  });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: {
    ...process.env,
    HOME: home,
    PATH: `${bin}:/usr/bin:/bin`,
    CHROMUX_E2E: e2ePath,
    CHROMUX_E2E_OUT: outPath,
    CHROMUX_E2E_DISABLE_SAFE_STORAGE: '1',
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
  let result = null;
  try { result = output ? JSON.parse(output) : null; } catch { /* reported below */ }
  if (code !== 0 || signal || !result?.ok || result.header !== 'VERCEL · READY'
    || result.profile !== 'cli' || result.deploymentUrl !== 'https://renderer-fixture.vercel.app') {
    console.error('VERCEL_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', output || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('VERCEL_RENDERER_OK');
});
