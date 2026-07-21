'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-session-rail-'));
const homeDir = path.join(tmpDir, 'home');
const repoDir = path.join(tmpDir, 'fleet-repo');
const repoAppDir = path.join(repoDir, 'apps', 'web');
const repoApiDir = path.join(repoDir, 'apps', 'api');
const looseDir = path.join(tmpDir, 'scratch');
const e2ePath = path.join(tmpDir, 'session-rail-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

for (const directory of [homeDir, repoAppDir, repoApiDir, looseDir]) fs.mkdirSync(directory, { recursive: true });
execFileSync('/usr/bin/git', ['init', '-q', repoDir]);
const canonicalRepoDir = fs.realpathSync(repoDir);

fs.writeFileSync(e2ePath, `
(async () => {
  const rail = window.chromuxTestRail;
  if (!rail) throw new Error('Missing session rail test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(100);

  const holder = rail.addSession({ name: 'holder', agent: '', cwd: ${JSON.stringify(looseDir)} });
  const web = rail.addSession({ name: 'web-agent', agent: 'codex', cwd: ${JSON.stringify(repoAppDir)} });
  const api = rail.addSession({ name: 'api-agent', agent: 'claude', cwd: ${JSON.stringify(repoApiDir)} });
  const webTwo = rail.addSession({ name: 'web-review', agent: 'grok', cwd: ${JSON.stringify(repoAppDir)} });
  rail.focus(holder);

  rail.emit(web, 'turn-start');
  rail.emit(web, 'turn-end', 'First background completion');
  expect(rail.attentionCount() === 1, 'background completion should increment attention count');
  rail.select('threads');
  expect(rail.mode() === 'threads' && rail.storedMode() === 'threads', 'Threads selection should persist');
  expect(rail.heading() === 'THREADS', 'Threads should set contextual heading');
  expect(rail.attentionCount() === 1, 'Attention count should remain visible outside Attention mode');

  const nav = rail.nav();
  expect(nav.length === 3 && nav.every((item) => item.label && item.title), 'rail controls need accessible labels and tooltips');
  expect(nav.find((item) => item.mode === 'threads').pressed === 'true', 'selected rail control needs pressed state');
  const modeButtons = [...document.querySelectorAll('[data-rail-mode]')];
  for (const button of modeButtons) {
    button.focus();
    expect(document.activeElement === button, 'each icon control should accept keyboard focus');
  }
  const threadGroups = rail.groups();
  const webGroup = threadGroups.find((group) => group.title === ${JSON.stringify(repoAppDir)});
  expect(webGroup && webGroup.label === 'web' && webGroup.count === 2 && webGroup.open,
    'Threads should group live sessions by exact cwd and start expanded');
  expect(threadGroups.some((group) => group.title === ${JSON.stringify(repoApiDir)} && group.count === 1),
    'different exact cwd should form another Threads group');
  expect(webGroup.rows.find((row) => row.id === web).status === 'Completed', 'completed row needs accessible status');

  expect(rail.clickRow(web) === web, 'Threads row should activate its session');
  expect(rail.turnState(web).attentionSeenAt >= rail.turnState(web).since, 'opening completed session should record seen timestamp');
  rail.select('attention');
  expect(!rail.attentionKinds().includes('COMPLETED'), 'seen completion should leave Attention');
  rail.focus(holder);
  expect(!rail.attentionKinds().includes('COMPLETED'), 'seen completion should stay removed after focus changes');
  rail.emit(web, 'turn-start');
  rail.emit(web, 'turn-end', 'Second background completion');
  expect(rail.attentionKinds().includes('COMPLETED'), 'a subsequent background turn should create new unseen completion');

  rail.focus(api);
  rail.emit(api, 'turn-start');
  rail.emit(api, 'turn-end');
  rail.focus(holder);
  expect(rail.attentionKinds().filter((kind) => kind === 'COMPLETED').length === 1,
    'completion in active session should never appear later');
  rail.emit(api, 'permission-required', 'Approve command');
  expect(rail.attentionKinds().includes('PERMISSION'), 'background actionable state should appear');
  rail.focus(api);
  rail.focus(holder);
  expect(rail.turnState(api).state === 'permission' && rail.attentionKinds().includes('PERMISSION'),
    'opening actionable session must not clear its state or attention');

  rail.select('threads');
  rail.title(webTwo, 'Dynamic review title');
  expect(rail.groups().flatMap((group) => group.rows).some((row) => row.name === 'Dynamic review title'),
    'grouped rows should update dynamic session titles');
  rail.emit(webTwo, 'turn-start');
  rail.emit(api, 'permission-required');
  let rows = rail.groups().flatMap((group) => group.rows);
  expect(rows.find((row) => row.id === webTwo).status === 'Working', 'working status should appear in Threads');
  expect(rows.find((row) => row.id === api).status === 'Action required', 'action-required status should appear in Threads');

  rail.select('git');
  await rail.waitForGit();
  expect(await rail.resolveGitRoot('relative/path') === null, 'gitRoot should reject relative cwd values');
  expect(await rail.resolveGitRoot('x'.repeat(5000)) === null, 'gitRoot should reject oversized cwd values');
  expect(await rail.resolveGitRoot(${JSON.stringify(looseDir)}) === null, 'gitRoot should return null outside a repository');
  expect(rail.gitCacheSize() === 3, 'renderer should cache Git lookup once per exact cwd');
  const gitGroups = rail.groups();
  const repoGroup = gitGroups.find((group) => group.title === ${JSON.stringify(canonicalRepoDir)});
  expect(repoGroup && repoGroup.label === 'fleet-repo' && repoGroup.count === 3,
    'Git should combine sessions under the exact repository root');
  expect(gitGroups.at(-1).label === 'Not a Git repository' && gitGroups.at(-1).count === 1,
    'non-Git sessions should appear in the final fallback group');
  expect(repoGroup.rows.every((row) => row.ariaLabel.includes(row.status)), 'Git rows need accessible status labels');

  const themes = window.chromuxTestThemes;
  for (const theme of themes.ids()) {
    themes.select(theme);
    for (const mode of themes.modes()) {
      themes.selectMode(mode);
      const railRect = document.querySelector('#rail').getBoundingClientRect();
      const navRect = document.querySelector('.rail-nav').getBoundingClientRect();
      const headRect = document.querySelector('.rail-head').getBoundingClientRect();
      expect(railRect.width >= 220 && railRect.width <= 260, theme + ' ' + mode + ' should keep narrow rail geometry');
      expect(navRect.bottom <= headRect.top + 1, theme + ' ' + mode + ' should keep two-row header order');
      expect(modeButtons.every((button) => button.getBoundingClientRect().right <= railRect.right + 1),
        theme + ' ' + mode + ' should keep icon controls inside rail');
    }
  }

  rail.exit(webTwo, 0);
  expect(rail.groups().find((group) => group.title === ${JSON.stringify(canonicalRepoDir)}).count === 2,
    'exited sessions should leave grouped rails immediately');
  expect(rail.mode() === 'git', 'incoming attention and status changes must not auto-switch rail mode');

  return JSON.stringify({ ok: true, threadGroups, gitGroups: rail.groups(), nav });
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
    CHROMUX_E2E_OUT: e2eOutPath,
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
  const output = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !output.includes('"ok":true')) {
    console.error('SESSION_RAIL_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', output || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('SESSION_RAIL_RENDERER_OK');
});
