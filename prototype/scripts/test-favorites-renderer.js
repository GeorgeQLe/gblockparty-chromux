'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-favorites-'));
const homeDir = path.join(tmpDir, 'home');
const chromuxDir = path.join(homeDir, '.chromux');
const favoritesPath = path.join(chromuxDir, 'favorites.json');
const e2ePath = path.join(tmpDir, 'favorites-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(chromuxDir, { recursive: true });
fs.writeFileSync(favoritesPath, JSON.stringify([
  { url: 'https://example.com/docs', title: 'Existing docs', createdAt: '2026-07-12T12:00:00.000Z' },
]));

fs.writeFileSync(e2ePath, `
(async () => {
  const f = window.chromuxTestFavorites;
  if (!f) throw new Error('Missing favorites test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

  await f.ready();
  expect(JSON.stringify(f.urls()) === JSON.stringify(['https://example.com/docs']),
    'initial favorites should load from disk: ' + JSON.stringify(f.urls()));

  const first = f.addSession({ name: 'first', url: 'https://example.com/docs#intro' });
  const second = f.addSession({ name: 'second', url: null, queue: [
    { url: 'http://localhost:5173/guide', source: 'TERM', ts: 1 },
  ] });

  f.focus(first);
  expect(f.toolbar(first).active, 'normalized current URL should show as favorited');
  await f.toolbarToggle(first);
  expect(f.urls().length === 0, 'toolbar should unpin normalized URL');
  await f.toolbarToggle(first);
  expect(JSON.stringify(f.urls()) === JSON.stringify(['https://example.com/docs']),
    'toolbar should normalize fragments and deduplicate');

  f.focus(second);
  await f.queueToggle(second, 'http://localhost:5173/guide');
  expect(JSON.stringify(f.urls()) === JSON.stringify([
    'https://example.com/docs', 'http://localhost:5173/guide',
  ]), 'queue pin should add a global favorite');
  expect(f.pickerUrls(first).includes('http://localhost:5173/guide'),
    'favorites should be globally visible in every session');
  await f.queueToggle(second, 'http://localhost:5173/guide');
  expect(!f.urls().includes('http://localhost:5173/guide'), 'queue action should unpin');

  f.collapse(second);
  f.openFavorite('https://example.com/docs');
  await wait();
  const state = f.state(second);
  expect(!state.collapsed, 'opening a favorite should restore a collapsed browser');
  expect(state.currentUrl === 'https://example.com/docs',
    'favorite should open in the active session paired browser');

  const persisted = await f.readPersisted();
  expect(persisted.length === 1 && persisted[0].url === 'https://example.com/docs',
    'favorites should persist as validated records');
  const filtered = await f.replaceRaw([...persisted, {
    url: 'javascript:alert(1)', title: 'unsafe', createdAt: new Date().toISOString(),
  }]);
  expect(filtered.length === 1 && filtered[0].url === 'https://example.com/docs',
    'unsupported protocols should be rejected without retaining the unsafe record');
  return JSON.stringify({ ok: true, urls: f.urls(), active: second });
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
  const e2eOut = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !e2eOut.includes('"ok":true')) {
    console.error('FAVORITES_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('FAVORITES_RENDERER_OK');
});
