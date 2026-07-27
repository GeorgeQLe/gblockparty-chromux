'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-project-launcher-'));
const homeDir = path.join(tmpDir, 'home');
const projectsRoot = path.join(homeDir, 'projects');
const replacementRoot = path.join(homeDir, 'workspace');
const cloneSource = path.join(tmpDir, 'Clone_Source');
const e2ePath = path.join(tmpDir, 'launcher-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');
fs.mkdirSync(path.join(homeDir, '.config', 'p'), { recursive: true });
fs.writeFileSync(path.join(homeDir, '.config', 'p', 'categories.conf'), [
  'libs|flat|Libraries',
  'web|lifecycle|Web apps',
  'sandbox|sandbox|Experiments',
  'sandbox_type:web',
  'sandbox_type:tools',
].join('\n'));
fs.mkdirSync(cloneSource, { recursive: true });
fs.writeFileSync(path.join(cloneSource, 'README.md'), '# fixture\n');
const init = spawnSync('git', ['-C', cloneSource, 'init'], { encoding: 'utf8' });
if (init.status !== 0) throw new Error(init.stderr || 'git init failed');
spawnSync('git', ['-C', cloneSource, 'add', 'README.md'], { encoding: 'utf8' });
spawnSync('git', ['-C', cloneSource, '-c', 'user.name=Chromux Test', '-c', 'user.email=test@chromux.invalid', 'commit', '-m', 'fixture'], { encoding: 'utf8' });

fs.writeFileSync(e2ePath, `
(async () => {
  const launcher = window.chromuxTestProjectLauncher;
  const shortcuts = window.chromuxTestShortcuts;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const config = await launcher.ready();
  expect(config.root === ${JSON.stringify(projectsRoot)}, 'P_BASE should initialize Projects Root');
  expect(config.categories.map((entry) => entry.name).join(',') === 'libs,web,sandbox',
    'configured p categories should populate the launcher');

  shortcuts.clearFocus();
  const direct = shortcuts.shortcutCreateProject();
  expect(direct?.mode === 'create' && launcher.mode() === 'create',
    'Command-N route should land directly on Create Project');
  launcher.selectSource('fresh');
  await launcher.setName('fresh-project');
  await launcher.setCategory('web');
  let preview = await launcher.preview();
  expect(preview.target === ${JSON.stringify(path.join(projectsRoot, 'web', 'dev', 'fresh-project'))},
    'lifecycle destination preview should include dev');
  expect(!launcher.sandboxVisible() && !launcher.cloneVisible(), 'fresh lifecycle fields should stay compact');
  expect(launcher.buttons().createOnly && launcher.buttons().createAndLaunch, 'valid preview should enable both actions');
  const createdOnly = await launcher.createOnly();
  expect(createdOnly?.target === preview.target, 'Create Only should return the canonical target');
  expect(launcher.status().includes('CREATED'), 'Create Only should visibly report the created path');
  preview = await launcher.preview();
  expect(preview.exists && !launcher.buttons().createOnly && launcher.status().includes('already exists'),
    'an existing destination should be actionable and disable creation');

  launcher.selectMode('open');
  expect(launcher.mode() === 'open', 'tabs should return to Open Existing');
  launcher.selectMode('create');
  launcher.selectSource('clone');
  expect(launcher.cloneVisible(), 'clone source should reveal the clone URL field');
  await launcher.setCloneUrl(${JSON.stringify(cloneSource)});
  await launcher.setName('');
  await launcher.setCategory('sandbox');
  await launcher.setSandboxType('web');
  preview = await launcher.preview();
  expect(launcher.sandboxVisible(), 'sandbox category should reveal sandbox type');
  expect(preview.name === 'clone-source', 'clone URL should derive an np-compatible name');
  expect(preview.target === ${JSON.stringify(path.join(projectsRoot, 'sandbox', 'web', 'clone-source'))},
    'sandbox preview should include the selected subtype');
  launcher.selectAgent('');
  const launched = await launcher.createAndLaunch();
  expect(launched?.target === preview.target, 'Create & Launch should create the clone');
  const session = launcher.sessionState();
  expect(session && session.cwd === launched.target && session.runtime === 'host' && session.agent === '',
    'Create & Launch should pass the canonical runtime path into session creation');

  const updated = await launcher.setRootFromSettings(${JSON.stringify(replacementRoot)});
  expect(updated.root === ${JSON.stringify(replacementRoot)}
    && updated.field === ${JSON.stringify(replacementRoot)}
    && updated.status.includes('SAVED'),
  'Settings should update Projects Root for the active runtime');
  await launcher.open('create');
  launcher.selectSource('fresh');
  await launcher.setName('root-check');
  await launcher.setCategory('libs');
  preview = await launcher.preview();
  expect(preview.target === ${JSON.stringify(path.join(replacementRoot, 'libs', 'root-check'))},
    'future previews should use the saved runtime root');

  return JSON.stringify({ ok: true, created: createdOnly.target, launched: launched.target, session });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: {
    ...process.env,
    HOME: homeDir,
    P_BASE: projectsRoot,
    PATH: `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
    CHROMUX_E2E: e2ePath,
    CHROMUX_E2E_OUT: e2eOutPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !output.includes('"ok":true')) {
    console.error('PROJECT_LAUNCHER_RENDERER_FAIL', { code, signal, output, stdout, stderr });
    process.exit(1);
  }
  console.log('PROJECT_LAUNCHER_RENDERER_OK');
});
