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
fs.writeFileSync(path.join(repoDir, 'tracked.txt'), 'staged\n');
execFileSync('/usr/bin/git', ['-C', repoDir, 'add', 'tracked.txt']);
fs.appendFileSync(path.join(repoDir, 'tracked.txt'), 'unstaged\n');
fs.writeFileSync(path.join(repoAppDir, 'new-file.js'), 'export default true;\n');
const canonicalRepoDir = fs.realpathSync(repoDir);

fs.writeFileSync(e2ePath, `
(async () => {
  const rail = window.chromuxTestRail;
  if (!rail) throw new Error('Missing session rail test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(100);

  const holder = rail.addTerminalSession({ name: 'holder', agent: '', cwd: ${JSON.stringify(looseDir)} });
  const web = rail.addTerminalSession({ name: 'web-agent', agent: 'codex', cwd: ${JSON.stringify(repoAppDir)}, cols: 72, rows: 18 });
  const api = rail.addSession({ name: 'api-agent', agent: 'claude', cwd: ${JSON.stringify(repoApiDir)} });
  const webTwo = rail.addTerminalSession({ name: 'web-review', agent: 'grok', cwd: ${JSON.stringify(repoAppDir)}, cols: 54, rows: 14 });
  rail.focus(holder);
  await rail.write(web, Array.from({ length: 340 }, (_, index) => 'older line ' + index + '\\r\\n').join('')
    + '\\x1b[31mRECENT RED\\x1b[0m\\r\\ninitial output');
  rail.sourceScroll(web, -9);

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

  const sourceBefore = rail.sourceState(web);
  expect(sourceBefore.baseY > sourceBefore.viewportY, 'source fixture should begin scrolled away from its latest output');
  expect(rail.clickRow(web) === holder, 'inactive Threads row should preview without changing the active session');
  await wait(80);
  let preview = rail.preview();
  expect(preview && preview.sessionId === web, 'inactive Threads row should open one anchored preview');
  expect(preview.focused && preview.role === 'dialog', 'preview should receive keyboard focus as a dialog');
  expect(preview.ariaLabel.includes('web-agent') && preview.footer.includes('CLICK TO OPEN SESSION') && preview.footer.includes('ESC TO CLOSE'),
    'preview should expose its session and activation/dismissal instructions');
  expect(preview.cwdTitle === ${JSON.stringify(repoAppDir)}, 'preview should preserve the full cwd in its tooltip');
  expect(preview.text.includes('RECENT RED') && preview.coloredCells > 0, 'serialized mirror should preserve recent terminal text and ANSI colors');
  expect(preview.bufferLength <= 300 + preview.rows, 'serialized mirror should bound recent scrollback to 300 rows');
  expect(preview.cols === preview.sourceCols && preview.rows === preview.sourceRows,
    'preview should retain source terminal columns and rows while visually scaling');
  const sourceAfterPreview = rail.sourceState(web);
  expect(sourceAfterPreview.viewportY === sourceBefore.viewportY && sourceAfterPreview.baseY === sourceBefore.baseY,
    'opening and serializing a preview must not move the source terminal viewport');
  expect(rail.rowState(web).ariaExpanded === 'true' && rail.rowState(web).ariaControls === 'thread-terminal-preview',
    'inactive preview row should expose expanded and controls ARIA state');
  expect(rail.rowState(holder).ariaCurrent === 'true', 'active Threads row should expose aria-current');
  await rail.write(web, '\\r\\nLIVE UPDATE');
  await wait(80);
  preview = rail.preview();
  expect(preview.text.includes('LIVE UPDATE') && preview.refreshCount >= 2, 'subsequent terminal writes should refresh the live mirror');
  rail.title(web, 'Live preview title');
  await wait(60);
  expect(rail.preview()?.title === 'Live preview title' && rail.rowState(web).ariaExpanded === 'true',
    'rail rerenders should rebind the anchor and update the live preview header');
  await rail.write(web, '\\x1b[?1049h\\x1b[HALTERNATE PREVIEW');
  await wait(80);
  expect(rail.preview()?.text.includes('ALTERNATE PREVIEW'), 'live mirror should reproduce alternate-screen content');
  await rail.write(web, '\\x1b[?1049l');
  await wait(80);
  expect(rail.preview()?.text.includes('LIVE UPDATE'), 'leaving alternate screen should restore the mirrored normal buffer');
  expect(rail.cue(web).ptyInput === '', 'preview rendering must never send PTY input');

  rail.previewKey('Escape');
  expect(!rail.preview() && rail.rowState(web).focused, 'Escape should dismiss preview and restore focus to its row');
  expect(rail.rowState(web).ariaExpanded === 'false', 'dismissal should reset expanded ARIA state');
  rail.setPreviewSize('compact');
  rail.clickRow(web);
  await wait(40);
  const compactWidth = rail.preview().width;
  rail.setPreviewSize('large');
  await wait(60);
  expect(rail.preview().width > compactWidth + 100, 'Large accessibility size should materially increase effective terminal text space');
  expect(rail.previewSize().value === 'large' && rail.previewSize().stored === 'large' && rail.previewSize().control === 'large',
    'preview size should update state, Settings, and local persistence together');
  rail.setPreviewSize('comfortable');
  await wait(40);
  rail.previewKey('Enter');
  await wait(40);
  expect(rail.activeId() === web && !rail.preview(), 'Enter on preview should activate the session and close the preview');
  expect(rail.turnState(web).state === 'idle', 'opening completed session should consume it to idle');

  rail.select('threads');
  const consumedWeb = rail.groups().flatMap((group) => group.rows).find((row) => row.id === web);
  expect(consumedWeb && consumedWeb.status === 'Idle', 'consumed completion should render Idle in Threads');
  rail.clickRow(web);
  await wait(40);
  expect(!rail.preview(), 'clicking the already-active row should skip preview');
  await wait(40);
  expect(rail.rowState(web).confirm && rail.cue(web).pane, 'active-row click should link row and terminal confirmation animations');
  rail.clickRow(web);
  await wait(40);
  expect(rail.rowState(web).confirm && rail.cue(web).pane, 'repeated active-row clicks should restart both confirmation cues');
  rail.setReducedMotion(true);
  rail.clickRow(web);
  await wait(40);
  expect(rail.rowState(web).staticConfirm && rail.cue(web).staticPane, 'reduced motion should use an immediate static row and pane highlight');
  rail.setReducedMotion(null);

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
  expect(rail.turnState(api).state === 'idle', 'active completion should transition directly to idle');
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

  rail.focus(holder);
  rail.clickRow(web);
  await wait(40);
  rail.clickRow(webTwo);
  await wait(60);
  expect(rail.preview()?.sessionId === webTwo, 'opening another row should replace the existing preview');
  rail.outsideClick();
  expect(!rail.preview(), 'outside click should dismiss the preview');
  rail.clickRow(webTwo);
  await wait(40);
  rail.previewClick();
  await wait(40);
  expect(rail.activeId() === webTwo && !rail.preview(), 'clicking anywhere in the preview should activate its session');
  rail.focus(holder);
  rail.clickRow(webTwo);
  await wait(40);
  rail.select('attention');
  expect(!rail.preview(), 'rail mode changes should dismiss the preview');
  rail.select('threads');
  rail.clickRow(webTwo);
  await wait(40);
  rail.collapseAnchor(webTwo);
  await wait(60);
  expect(!rail.preview(), 'collapsing a group should dismiss a preview whose anchor becomes hidden');
  const webGroupDetails = [...document.querySelectorAll('#attention-list .rail-group')]
    .find((group) => group.dataset.groupKey === 'cwd:' + ${JSON.stringify(repoAppDir)});
  webGroupDetails.open = true;
  await wait(40);
  rail.clickRow(webTwo);
  await wait(40);
  rail.close(webTwo);
  await wait(40);
  expect(!rail.preview(), 'closing the previewed session should dispose and dismiss its preview');

  rail.select('git');
  await rail.waitForGit();
  expect(rail.heading() === 'GIT CHANGES', 'Git should identify itself as a change tracker');
  expect(await rail.resolveGitRoot('relative/path') === null, 'gitRoot should reject relative cwd values');
  expect(await rail.resolveGitRoot('x'.repeat(5000)) === null, 'gitRoot should reject oversized cwd values');
  expect(await rail.resolveGitRoot(${JSON.stringify(looseDir)}) === null, 'gitRoot should return null outside a repository');
  expect(rail.gitCacheSize() === 3, 'renderer should cache Git lookup once per exact cwd');
  const gitDiffs = rail.gitDiffs();
  const repoDiff = gitDiffs.find((group) => group.title === ${JSON.stringify(canonicalRepoDir)});
  expect(repoDiff && repoDiff.count === 2, 'Git should count changed files rather than sessions');
  expect(repoDiff.files.some((file) => file.path === 'tracked.txt' && file.status === 'Modified' && file.staged),
    'Git should expose staged and unstaged state for a tracked file');
  expect(repoDiff.files.some((file) => file.path === 'apps/web/new-file.js' && file.status === 'Untracked'),
    'Git should expose untracked files relative to the repository');
  expect(repoDiff.totals === '1 staged · 2 unstaged', 'Git should summarize staged and unstaged diff counts');

  const themes = window.chromuxTestThemes;
  rail.select('threads');
  rail.focus(holder);
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
      rail.clickRow(web);
      await wait(40);
      const geometry = rail.preview();
      expect(geometry && geometry.left >= 0 && geometry.top >= 0 && geometry.right <= window.innerWidth + 1 && geometry.bottom <= window.innerHeight + 1,
        theme + ' ' + mode + ' should clamp the preview inside the viewport');
      expect(geometry.cols === geometry.sourceCols && geometry.rows === geometry.sourceRows,
        theme + ' ' + mode + ' should preserve terminal geometry');
      expect(geometry.surfaceBackgrounds.every((color) => color.startsWith('rgb(')),
        theme + ' ' + mode + ' should keep popover, header/footer, and terminal backing fully opaque: ' + geometry.surfaceBackgrounds.join(', '));
      expect(Math.abs(geometry.padding.headerLeft - geometry.padding.terminalLeft) <= 2
        && Math.abs(geometry.padding.footerLeft - geometry.padding.terminalLeft) <= 2,
      theme + ' ' + mode + ' should align header, terminal, and footer insets: ' + JSON.stringify(geometry.padding));
      expect(geometry.padding.terminalTop >= 9 && geometry.padding.terminalRight >= 9 && geometry.padding.terminalBottom >= 9,
        theme + ' ' + mode + ' should preserve terminal padding on every edge: ' + JSON.stringify(geometry.padding));
      rail.previewKey('Escape');
    }
  }

  rail.select('git');
  expect(rail.gitDiffs().find((group) => group.title === ${JSON.stringify(canonicalRepoDir)}).count === 2,
    'Git diff counts should not mirror the number of live sessions');
  expect(rail.mode() === 'git', 'incoming attention and status changes must not auto-switch rail mode');

  return JSON.stringify({ ok: true, threadGroups, gitDiffs: rail.gitDiffs(), nav });
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
