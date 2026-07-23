'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-browser-tabs-html-'));
const homeDir = path.join(tmpDir, 'home');
const projectDir = path.join(homeDir, 'project');
const outsideDir = path.join(homeDir, 'outside');
const e2ePath = path.join(tmpDir, 'browser-tabs-html-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

for (const directory of [
  projectDir,
  path.join(projectDir, 'docs'),
  path.join(projectDir, 'a'),
  path.join(projectDir, 'b'),
  path.join(projectDir, 'dist'),
  path.join(projectDir, 'node_modules'),
  outsideDir,
]) fs.mkdirSync(directory, { recursive: true });
execFileSync('git', ['init', '-q', projectDir]);
fs.writeFileSync(path.join(projectDir, 'index.html'), '<title>Index</title>');
fs.writeFileSync(path.join(projectDir, 'docs', 'guide #1.html'), '<title>Guide</title>');
fs.writeFileSync(path.join(projectDir, 'docs', 'live.html'), '<title>Docs live</title>');
fs.writeFileSync(path.join(projectDir, 'a', 'shared.html'), '<title>A shared</title>');
fs.writeFileSync(path.join(projectDir, 'b', 'shared.html'), '<title>B shared</title>');
fs.writeFileSync(path.join(projectDir, 'b', 'live.html'), '<title>B live</title>');
fs.writeFileSync(path.join(projectDir, 'dist', 'generated.htm'), '<title>Generated</title>');
fs.writeFileSync(path.join(projectDir, 'node_modules', 'ignored.html'), '<title>Ignored</title>');
fs.writeFileSync(path.join(projectDir, 'notes.txt'), 'not html');
fs.writeFileSync(path.join(outsideDir, 'escaped.html'), '<title>Outside</title>');
try { fs.symlinkSync(outsideDir, path.join(projectDir, 'linked-outside'), 'dir'); } catch { /* unsupported */ }

fs.writeFileSync(e2ePath, `
(async () => {
  const b = window.chromuxTestBrowser;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
  const projectDir = ${JSON.stringify(projectDir)};

  const index = await window.chromux.projectHtmlIndex({ launchCwd: projectDir });
  expect(index.ok && index.root.endsWith('/home/project'), 'project index root mismatch: ' + JSON.stringify(index));
  const paths = index.files.map((file) => file.path);
  expect(paths.includes('index.html') && paths.includes('docs/guide #1.html')
    && paths.includes('dist/generated.htm'), 'source and generated HTML should be indexed: ' + JSON.stringify(paths));
  expect(!paths.some((file) => file.includes('node_modules') || file.includes('linked-outside')),
    'dependency and outside symlink HTML must be excluded: ' + JSON.stringify(paths));

  const explicit = await window.chromux.resolveProjectHtml({ launchCwd: projectDir, reference: './docs/guide #1.html' });
  expect(explicit.ok && explicit.url.includes('guide%20%231.html'),
    'spaces and hash characters must be encoded: ' + JSON.stringify(explicit));
  const homeRelative = await window.chromux.resolveProjectHtml({
    launchCwd: projectDir, reference: '~/project/index.html',
  });
  expect(homeRelative.ok && homeRelative.path === 'index.html', 'home-relative HTML did not resolve');
  const unique = await window.chromux.resolveProjectHtml({ launchCwd: projectDir, reference: 'generated.htm' });
  expect(unique.ok && unique.path === 'dist/generated.htm', 'unique repository fallback failed');
  const ambiguous = await window.chromux.resolveProjectHtml({ launchCwd: projectDir, reference: 'shared.html' });
  expect(!ambiguous.ok && ambiguous.status === 'ambiguous' && ambiguous.matches.length === 2,
    'duplicate filename must remain ambiguous: ' + JSON.stringify(ambiguous));
  const escaped = await window.chromux.resolveProjectHtml({
    launchCwd: projectDir, reference: '../outside/escaped.html',
  });
  expect(!escaped.ok && !escaped.url, 'escaped-project reference must not open');
  const nonHtml = await window.chromux.resolveProjectHtml({ launchCwd: projectDir, reference: 'notes.txt' });
  expect(!nonHtml.ok && nonHtml.status === 'invalid', 'non-HTML reference must be rejected');
  await window.chromux.ptyCreate({ id: 'html-live-cwd', cwd: projectDir, cols: 80, rows: 24 });
  window.chromux.ptyInput('html-live-cwd', 'cd docs\\r');
  await wait(180);
  const liveCwd = await window.chromux.resolveProjectHtml({
    sessionId: 'html-live-cwd', launchCwd: projectDir, reference: 'live.html',
  });
  window.chromux.ptyKill('html-live-cwd');
  expect(liveCwd.ok && liveCwd.path === 'docs/live.html',
    'live PTY cwd must win before ambiguous repository fallback: ' + JSON.stringify(liveCwd));

  const sessionId = b.addSession({ name: 'tabs', cwd: projectDir, url: homeRelative.url });
  const secondId = b.openNew(sessionId, unique.url, 'Generated');
  expect(secondId, 'second page tab was not created');
  const focusedId = b.openNew(sessionId, homeRelative.url, 'Index duplicate');
  let tabs = b.tabs(sessionId);
  expect(focusedId === tabs[0].id && tabs.filter((tab) => tab.type === 'page').length === 2,
    'normalized duplicate URL must focus instead of duplicating: ' + JSON.stringify(tabs));

  b.setTabConsole(sessionId, tabs[0].id, 3);
  b.setTabConsole(sessionId, secondId, 7);
  b.activateTab(sessionId, tabs[0].id);
  expect(b.consoleText(sessionId).includes('3 logs'), 'first page console must be isolated');
  b.activateTab(sessionId, secondId);
  expect(b.consoleText(sessionId).includes('7 logs'), 'second page console must be isolated');

  const explorerId = b.explore(sessionId, { path: 'docs', query: 'guide' });
  const sameExplorerId = b.explore(sessionId, { query: 'shared.html' });
  expect(explorerId === sameExplorerId, 'only one explorer tab may exist per session');
  await wait();
  tabs = b.tabs(sessionId);
  expect(tabs.filter((tab) => tab.type === 'explorer').length === 1
    && tabs.find((tab) => tab.id === explorerId).query === 'shared.html',
  'explorer state should preserve/update its filter: ' + JSON.stringify(tabs));

  b.closeTab(sessionId, explorerId);
  tabs = b.tabs(sessionId);
  expect(tabs.some((tab) => tab.active) && tabs.find((tab) => tab.active).id === secondId,
    'closing active explorer should select nearest page tab: ' + JSON.stringify(tabs));
  b.closeTab(sessionId, secondId);
  b.closeTab(sessionId, tabs[0].id);
  expect(b.tabs(sessionId).length === 0 && b.state(sessionId).currentUrl === null,
    'closing the last tab must return to blank state');

  b.explore(sessionId);
  b.submit(sessionId, homeRelative.url);
  await wait();
  tabs = b.tabs(sessionId);
  expect(tabs.some((tab) => tab.type === 'explorer') && tabs.some((tab) => tab.type === 'page' && tab.active),
    'typed web URL from explorer should create an active page tab');

  const snapshot = b.snapshot().find((row) => row.name === 'tabs');
  expect(snapshot.browserTabs.length === tabs.length && snapshot.activeBrowserTabId,
    'restore snapshot must retain browser tab order and active tab');

  const linkSession = b.addSession({ name: 'link', cwd: projectDir });
  b.clickTerminalLink(linkSession, homeRelative.url);
  b.clickTerminalLink(linkSession, homeRelative.url);
  expect(b.tabs(linkSession).filter((tab) => tab.type === 'page').length === 1,
    'terminal links must open-or-focus without duplicates');
  const osc = b.clickOsc8Link(linkSession, 'http://localhost:9/osc-8');
  const unsafeOsc = b.clickOsc8Link(linkSession, 'javascript:alert(1)');
  expect(osc.activated && osc.prevented && !unsafeOsc.activated && !unsafeOsc.prevented,
    'OSC 8 HTTP(S) links should route internally while unsafe schemes stay inactive');
  return JSON.stringify({ ok: true, indexed: paths.length, tabs: snapshot.browserTabs.length });
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
    console.error('BROWSER_TABS_HTML_EXPLORER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', output || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('BROWSER_TABS_HTML_EXPLORER_OK');
});
