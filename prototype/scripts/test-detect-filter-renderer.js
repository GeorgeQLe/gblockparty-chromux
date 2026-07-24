'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-detect-filter-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'detect-filter-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const q = window.chromuxTestDetect;
  if (!q) throw new Error('Missing detect test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  await wait(100);

  q.setRestoreSnapshot({
    savedAt: new Date(Date.now() - 3600_000).toISOString(),
    sessions: [
      {
        name: 'api-restore',
        cwd: '/workspace/api',
        agent: 'claude',
        currentUrl: 'http://localhost:4173/api',
      },
      {
        name: 'docs-restore',
        cwd: '/workspace/docs',
        agent: 'codex',
        currentUrl: 'http://localhost:5173/docs',
      },
    ],
  });
  q.setDetectRows([
    {
      tty: 'ttys001',
      agent: 'claude',
      command: 'claude',
      etime: '00:12:00',
      cwd: '/workspace/api',
      terminal: { app: 'Terminal', title: 'api claude' },
      resume: { id: '123e4567-e89b-12d3-a456-426614174000', ts: Date.now() - 60000 },
    },
    {
      tty: 'ttys002',
      agent: 'codex',
      command: 'codex',
      etime: '01:02:00',
      cwd: '/workspace/web',
      terminal: { app: 'iTerm2', title: 'web codex' },
      resume: {
        id: '223e4567-e89b-12d3-a456-426614174000',
        ts: Date.now() - 120000,
        name: 'Payment retry plan',
        agentMessagePreview: 'Handoff complete — retry path verified.',
      },
    },
    {
      tty: 'ttys003',
      agent: 'codex',
      command: 'codex',
      etime: '00:08:00',
      cwd: '/workspace/legacy',
      terminal: { app: 'Terminal', title: 'legacy codex' },
      resume: { id: '323e4567-e89b-12d3-a456-426614174000', ts: Date.now() - 180000 },
    },
    {
      tty: 'ttys004',
      agent: '',
      command: '-zsh',
      etime: '00:03:00',
      cwd: '/workspace/shell-tools',
      terminal: { app: 'Terminal', title: 'shell tools' },
      resume: null,
    },
  ]);

  expect(q.detectTitles().join('|') === 'api claude|Payment retry plan|legacy codex|shell tools',
    'expected enriched Codex title and unchanged fallback/non-Codex titles');
  expect(q.restoreTitles().join('|') === 'api-restore|docs-restore', 'expected all restore rows before filtering');
  expect(q.openAllText().startsWith('OPEN ALL AGENTS (3)'), 'expected unfiltered open-all count of 3');
  const details = q.detectDetails();
  const enriched = details.find((row) => row.title === 'Payment retry plan');
  expect(enriched && enriched.message === 'Handoff complete — retry path verified.',
    'enriched row should render a dedicated latest-agent-message line');
  expect(enriched.sub.includes('iTerm2 · web codex · ttys002')
    && enriched.sub.includes('/workspace/web')
    && enriched.sub.includes('up 1h 2m')
    && enriched.sub.includes('session 2m ago'),
  'enriched row should retain terminal title, tty, cwd, process age, and resume age metadata: ' + enriched.sub);
  expect(enriched.ariaLabel.includes('Payment retry plan')
    && enriched.ariaLabel.includes('Handoff complete — retry path verified.')
    && enriched.ariaLabel.includes('web codex'),
  'accessible label should include representative title, excerpt, and terminal metadata');
  expect(enriched.messageTitle === '' && !enriched.titleTitle.includes('Handoff complete'),
    'truncated message text should not be exposed through a tooltip');
  const legacy = details.find((row) => row.title === 'legacy codex');
  expect(legacy && legacy.message === '', 'fallback Codex response shape should remain renderer-compatible');

  q.setQuery('api');
  expect(q.detectTitles().join('|') === 'api claude', 'api query should keep matching Claude row');
  expect(q.restoreTitles().join('|') === 'api-restore', 'api query should keep matching restore row');
  expect(q.openAllText().startsWith('OPEN ALL AGENTS (1)'), 'api query should count one visible agent');

  q.setQuery('codex');
  expect(q.detectTitles().join('|') === 'Payment retry plan|legacy codex', 'codex query should keep matching Codex rows');
  expect(q.restoreTitles().join('|') === 'docs-restore', 'codex query should keep matching Codex restore row');
  expect(q.openAllText().startsWith('OPEN ALL AGENTS (2)'), 'codex query should count visible Codex agents');

  q.setQuery('payment retry');
  expect(q.detectTitles().join('|') === 'Payment retry plan', 'representative name should be searchable');
  q.setQuery('handoff complete');
  expect(q.detectTitles().join('|') === 'Payment retry plan', 'agent-message excerpt should be searchable');
  q.setQuery('web codex');
  expect(q.detectTitles().join('|') === 'Payment retry plan', 'enriched rows should remain searchable by terminal title');

  q.setQuery('shell-tools');
  expect(q.detectTitles().join('|') === 'shell tools', 'cwd query should keep matching shell row');
  expect(q.restoreTitles().length === 0, 'shell query should hide restore rows');
  expect(q.openAllText() === 'OPEN ALL AGENTS', 'shell-only query should leave no visible agent count');
  expect(q.openAllDisabled(), 'shell-only query should disable agent open-all');

  q.setQuery('zzzz-no-match');
  expect(q.detectTitles().length === 0, 'no-match query should hide all detect rows');
  expect(q.restoreTitles().length === 0, 'no-match query should hide all restore rows');
  expect(q.detectEmpty() === 'No matches for ‘zzzz-no-match’.', 'detect no-match empty state should mention query');
  expect(q.restoreEmpty() === 'No matches for ‘zzzz-no-match’.', 'restore no-match empty state should mention query');

  q.setQuery('');
  expect(q.detectTitles().join('|') === 'api claude|Payment retry plan|legacy codex|shell tools',
    'clearing query should restore all detect rows');
  expect(q.restoreTitles().join('|') === 'api-restore|docs-restore', 'clearing query should restore all restore rows');
  expect(q.openAllText().startsWith('OPEN ALL AGENTS (3)'), 'clearing query should restore open-all count');

  expect(q.nextSessionName('ttys002', 'resume') === 'Payment retry plan',
    'Codex RESUME should use the representative thread label');
  await window.chromuxTestSignals.addFakeSession({ name: 'Payment retry plan', agent: 'codex' });
  expect(q.nextSessionName('ttys002', 'resume') === 'Payment retry plan-2',
    'representative resume names should retain existing uniqueness suffixes');
  expect(q.nextSessionName('ttys003', 'resume') === 'legacy-resumed',
    'fallback Codex rows should retain the legacy directory-derived resume name');
  expect(q.nextSessionName('ttys002', 'fresh') === 'web',
    'Codex FRESH naming should remain directory-derived');

  q.setDetectRows([]);
  expect(q.detectEmpty() === 'No external terminal tabs found.', 'empty scan should use no-terminal empty state');
  expect(q.openAllDisabled(), 'empty scan should disable agent open-all');

  return JSON.stringify({ ok: true });
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

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
}, 30000);

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const e2eOut = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !e2eOut.includes('"ok":true')) {
    console.error('DETECT_FILTER_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('DETECT_FILTER_RENDERER_OK');
});
