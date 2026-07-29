'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-restore-identity-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'restore-identity-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');
const shared = path.join(homeDir, 'shared-project');
const codexCwd = path.join(homeDir, 'codex-project');
const grokCwd = path.join(homeDir, 'grok-project');
const restoreGood = path.join(homeDir, 'restore-good');
const restoreOther = path.join(homeDir, 'restore-other');
const ids = {
  exactA: '11111111-1111-4111-8111-111111111111',
  exactB: '22222222-2222-4222-8222-222222222222',
  inferredA: '33333333-3333-4333-8333-333333333333',
  inferredB: '44444444-4444-4444-8444-444444444444',
  codex: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  grok: '019f4ef1-dcd0-7440-beef-aec69c74a111',
};

fs.mkdirSync(path.join(homeDir, '.chromux'), { recursive: true });
fs.mkdirSync(restoreGood, { recursive: true });
fs.mkdirSync(restoreOther, { recursive: true });
fs.writeFileSync(path.join(homeDir, '.chromux', 'restore-sessions.json'), JSON.stringify({
  schemaVersion: 2,
  restoreId: 'legacy-v2',
  reason: 'manual',
  sessions: [{ name: 'legacy-readable', cwd: shared, agent: 'claude' }],
}));

const claudeDir = path.join(homeDir, '.claude', 'projects', shared.replace(/[^a-zA-Z0-9]/g, '-'));
fs.mkdirSync(claudeDir, { recursive: true });
for (const [offset, id] of [ids.exactA, ids.inferredA, ids.inferredB].entries()) {
  const file = path.join(claudeDir, `${id}.jsonl`);
  fs.writeFileSync(file, '{}\n');
  const time = new Date(Date.now() - offset * 1000);
  fs.utimesSync(file, time, time);
}

const codexDir = path.join(homeDir, '.codex', 'sessions', '2026', '07', '20');
fs.mkdirSync(codexDir, { recursive: true });
fs.writeFileSync(path.join(codexDir, `rollout-${ids.codex}.jsonl`), JSON.stringify({
  type: 'session_meta', timestamp: '2026-07-20T12:00:00Z', payload: { id: ids.codex, cwd: codexCwd },
}) + '\n');

const grokDir = path.join(homeDir, '.grok', 'sessions', encodeURIComponent(grokCwd), ids.grok);
fs.mkdirSync(grokDir, { recursive: true });
fs.writeFileSync(path.join(grokDir, 'summary.json'), JSON.stringify({
  info: { cwd: grokCwd }, updated_at: '2026-07-20T12:00:00Z',
}));

fs.writeFileSync(e2ePath, `
(async () => {
  const expect = (value, message) => { if (!value) throw new Error(message); };
  const legacy = await window.chromux.getRestoreSnapshot();
  expect(legacy.schemaVersion === 2 && legacy.sessions[0].resumeId === null,
    'schema v2 snapshot must remain readable');
  expect(legacy.sessions[0].lastActivityAt === '1970-01-01T00:00:00.000Z',
    'legacy snapshots without savedAt should share the epoch fallback for alphabetical ties');

  const legacySavedAt = '2026-07-21T10:11:12.000Z';
  for (let schemaVersion = 1; schemaVersion <= 6; schemaVersion += 1) {
    const compatible = await window.chromuxTest.restorePayload({
      schemaVersion,
      savedAt: legacySavedAt,
      sessions: [{ name: 'legacy-' + schemaVersion, cwd: ${JSON.stringify(shared)}, agent: 'claude',
        lastActivityAt: '2099-01-01T00:00:00.000Z' }],
    });
    expect(compatible.schemaVersion === schemaVersion
      && compatible.sessions[0].lastActivityAt === legacySavedAt,
    'schema v' + schemaVersion + ' should use snapshot savedAt instead of an unsupported session activity field');
  }

  const schemaSeven = await window.chromuxTest.restorePayload({
    schemaVersion: 7,
    savedAt: legacySavedAt,
    sessions: [
      { name: 'valid-activity', cwd: ${JSON.stringify(shared)}, agent: 'claude',
        lastActivityAt: '2026-07-22T12:34:56Z',
        customTabGroupId: 'group-must-be-ignored', wasActive: true, wasLastActiveInGroup: true },
      { name: 'bad-activity', cwd: ${JSON.stringify(shared)}, agent: 'claude', lastActivityAt: 'not-a-time' },
    ],
  });
  expect(schemaSeven.sessions[0].lastActivityAt === '2026-07-22T12:34:56.000Z',
    'schema v7 should normalize valid session activity timestamps');
  expect(schemaSeven.sessions[1].lastActivityAt === legacySavedAt,
    'schema v7 should replace malformed session activity timestamps with snapshot savedAt');
  expect(!Object.prototype.hasOwnProperty.call(schemaSeven.sessions[0], 'customTabGroupId')
    && !Object.prototype.hasOwnProperty.call(schemaSeven.sessions[0], 'wasActive')
    && !Object.prototype.hasOwnProperty.call(schemaSeven.sessions[0], 'wasLastActiveInGroup'),
  'schema v7 must ignore schema-v8 grouping fields');

  const schemaEight = await window.chromuxTest.restorePayload({
    schemaVersion: 8,
    savedAt: legacySavedAt,
    sessions: [
      { name: 'focus-valid', cwd: ${JSON.stringify(shared)}, agent: 'claude',
        customTabGroupId: 'group-restore-valid', wasActive: true, wasLastActiveInGroup: false },
      { name: 'focus-invalid', cwd: ${JSON.stringify(shared)}, agent: 'claude',
        customTabGroupId: '../bad', wasActive: 'true', wasLastActiveInGroup: 1 },
    ],
  });
  expect(schemaEight.sessions[0].customTabGroupId === 'group-restore-valid'
    && schemaEight.sessions[0].wasActive === true
    && schemaEight.sessions[0].wasLastActiveInGroup === false,
  'schema v8 must sanitize and preserve valid custom membership and focus booleans');
  expect(!Object.prototype.hasOwnProperty.call(schemaEight.sessions[1], 'customTabGroupId')
    && !Object.prototype.hasOwnProperty.call(schemaEight.sessions[1], 'wasActive')
    && !Object.prototype.hasOwnProperty.call(schemaEight.sessions[1], 'wasLastActiveInGroup'),
  'schema v8 must discard malformed custom membership and focus fields');
  expect(!Object.prototype.hasOwnProperty.call(schemaEight.sessions[0], 'chatMessages')
    && !Object.prototype.hasOwnProperty.call(schemaEight.sessions[0], 'stagedBrowserContexts')
    && schemaEight.sessions[0].browserLayoutMode === 'terminal'
    && schemaEight.sessions[0].fullBrowserComposerOpen === false
    && !Object.prototype.hasOwnProperty.call(schemaEight.sessions[0], 'chatOpen'),
  'schema v8 must migrate with empty routed-Composer state');

  const schemaNine = await window.chromuxTest.restorePayload({
    schemaVersion: 9,
    savedAt: legacySavedAt,
    sessions: [{
      name: 'composer-valid', cwd: ${JSON.stringify(shared)}, agent: 'codex',
      chatMessages: [{
        id: 'discard-me', role: 'assistant', text: 'old derived output',
        createdAt: '2026-07-23T01:02:04.000Z', source: 'terminal',
        status: 'streaming', truncated: false,
      }],
      stagedBrowserContexts: [{
        captureId: 'capture-1',
        payloadPath: '/tmp/capture/payload.yaml',
        screenshotPath: '/tmp/capture/screenshot.png',
        url: 'https://example.com/page',
        title: 'Example',
        capturedAt: '2026-07-23T01:02:03.000Z',
        visibleTextTruncated: true,
      }],
      browserLayoutMode: 'browserChromux',
      chatOpen: true,
    }],
  });
  expect(!Object.prototype.hasOwnProperty.call(schemaNine.sessions[0], 'chatMessages')
    && !Object.prototype.hasOwnProperty.call(schemaNine.sessions[0], 'chatOpen'),
  'schema v9 should discard the old terminal-derived chat ledger');
  expect(schemaNine.sessions[0].stagedBrowserContexts.length === 1
    && schemaNine.sessions[0].browserLayoutMode === 'browserChromux'
    && schemaNine.sessions[0].fullBrowserComposerOpen === true,
  'schema v9 should preserve staged browser context and migrate old chatOpen to the Composer drawer');
  expect(Array.isArray(schemaNine.inboxTriage) && schemaNine.inboxTriage.length === 0,
    'schema v9 should migrate with empty inbox triage state');

  const schemaTenQueue = await window.chromuxTest.restorePayload({
    schemaVersion: 10,
    savedAt: legacySavedAt,
    sessions: [{
      name: 'queue-visibility', cwd: ${JSON.stringify(shared)}, agent: 'codex',
      queue: [
        { url: 'https://example.com/browser-only', source: 'TERM',
          reason: 'detected in agent output', visibility: 'browser', ts: 1 },
        { url: 'https://example.com/legacy', source: 'TERM', ts: 2 },
      ],
    }],
  });
  expect(schemaTenQueue.sessions[0].queue[0].visibility === 'browser'
    && schemaTenQueue.sessions[0].queue[1].visibility === 'attention',
  'schema v10 should preserve explicit browser visibility and default legacy queue records to attention');

  const exact = await window.chromux.resolveRestoreSessions({ sessions: [
    { name: 'tab-a', cwd: ${JSON.stringify(shared)}, agent: 'claude', resumeId: ${JSON.stringify(ids.exactA)} },
    { name: 'tab-b', cwd: ${JSON.stringify(shared)}, agent: 'claude', resumeId: ${JSON.stringify(ids.exactB)} },
  ] });
  expect(exact.sessions[0].resume.id === ${JSON.stringify(ids.exactA)}, 'first exact ID changed');
  expect(exact.sessions[1].resume.id === ${JSON.stringify(ids.exactB)}, 'second exact ID changed');
  expect(exact.sessions[0].command.includes(${JSON.stringify(ids.exactA)})
    && exact.sessions[1].command.includes(${JSON.stringify(ids.exactB)}),
    'same-directory tabs must launch their respective resume commands');
  expect(exact.inferred.length === 0 && exact.unresolved.length === 0, 'exact IDs must not be inferred');

  const precedence = await window.chromux.resolveRestoreSessions({ sessions: [
    { name: 'legacy-first', cwd: ${JSON.stringify(shared)}, agent: 'claude' },
    { name: 'exact-later', cwd: ${JSON.stringify(shared)}, agent: 'claude', resumeId: ${JSON.stringify(ids.exactA)} },
  ] });
  expect(precedence.sessions[0].resume.id === ${JSON.stringify(ids.inferredA)}, 'legacy tab stole reserved exact ID');
  expect(precedence.sessions[1].resume.id === ${JSON.stringify(ids.exactA)}, 'exact ID lost precedence');

  const duplicate = await window.chromux.resolveRestoreSessions({ sessions: [
    { name: 'duplicate-owner', cwd: ${JSON.stringify(shared)}, agent: 'claude', resumeId: ${JSON.stringify(ids.exactA)} },
    { name: 'duplicate-fallback', cwd: ${JSON.stringify(shared)}, agent: 'claude', resumeId: ${JSON.stringify(ids.exactA)} },
  ] });
  expect(duplicate.sessions[0].resume.id === ${JSON.stringify(ids.exactA)}, 'duplicate owner lost exact ID');
  expect(duplicate.sessions[1].resume.id === ${JSON.stringify(ids.inferredA)}, 'duplicate did not use unused candidate');
  expect(duplicate.inferred[0].reason === 'duplicate-resume-id', 'duplicate inference reason missing');

  const legacyDistinct = await window.chromux.resolveRestoreSessions({ sessions: [
    { name: 'legacy-1', cwd: ${JSON.stringify(shared)}, agent: 'claude' },
    { name: 'legacy-2', cwd: ${JSON.stringify(shared)}, agent: 'claude' },
    { name: 'legacy-exhausted', cwd: ${JSON.stringify(shared)}, agent: 'claude' },
    { name: 'legacy-exhausted-2', cwd: ${JSON.stringify(shared)}, agent: 'claude' },
  ] });
  expect(new Set(legacyDistinct.sessions.slice(0, 3).map((row) => row.resume.id)).size === 3,
    'legacy tabs must receive distinct candidates');
  expect(legacyDistinct.sessions[3].command === null && legacyDistinct.unresolved.length === 1,
    'exhausted legacy tab must remain unresolved');

  const mixed = await window.chromux.resolveRestoreSessions({ sessions: [
    { name: 'codex', cwd: ${JSON.stringify(codexCwd)}, agent: 'codex' },
    { name: 'grok', cwd: ${JSON.stringify(grokCwd)}, agent: 'grok' },
    { name: 'bad-id', cwd: ${JSON.stringify(shared)}, agent: 'claude', resumeId: '../../bad' },
  ] });
  expect(mixed.sessions[0].resume.id === ${JSON.stringify(ids.codex)},
    'Codex rollout fallback must preserve the inferred resume ID when app-server enrichment is unavailable');
  expect(mixed.sessions[1].resume.id === ${JSON.stringify(ids.grok)}, 'Grok candidate mismatch');
  expect(mixed.sessions[2].resume.id !== '../../bad' && mixed.inferred.length === 3,
    'malformed saved ID must be discarded and inferred safely');

  const saved = await window.chromux.saveRestoreSnapshot({ reason: 'manual', inboxTriage: [
    { id: 'attention:session:permission:s1', state: 'done',
      updatedAt: '2026-07-23T01:02:03.000Z', reopenToken: 'turn:1' },
    { id: 'git:worktree-1', state: 'snoozed',
      updatedAt: '2026-07-23T01:02:03.000Z', snoozedUntil: '2026-07-30T01:02:03.000Z',
      reopenToken: 'head:status' },
    { id: '', state: 'done', updatedAt: 'bad' },
    { id: 'bad-state', state: 'ignored', updatedAt: '2026-07-23T01:02:03.000Z' },
  ], sessions: [
    { name: 'valid', cwd: ${JSON.stringify(shared)}, agent: 'claude', resumeId: ${JSON.stringify(ids.exactB)}, composerDraft: 'saved draft',
      customTabGroupId: 'group-saved-valid', wasActive: true, wasLastActiveInGroup: true,
      chatMessages: [{ id: 'discard-saved', role: 'assistant', text: 'discard',
        createdAt: '2026-07-23T01:02:04.000Z', source: 'terminal',
        status: 'streaming', truncated: false }],
      stagedBrowserContexts: [{
        captureId: 'saved-capture', payloadPath: '/tmp/saved/payload.yaml',
        screenshotPath: '/tmp/saved/screenshot.png', url: 'https://example.com/saved',
        title: 'Saved page', capturedAt: '2026-07-23T01:02:03.000Z', visibleTextTruncated: false,
      }],
      browserLayoutMode: 'browserChromux', fullBrowserComposerOpen: true,
      resume: { id: ${JSON.stringify(ids.exactB)}, name: 'transient detect name',
        agentMessagePreview: 'transient detect excerpt' },
      agentMessagePreview: 'transient detect excerpt',
      lastActivityAt: '2026-07-23T01:02:03.000Z',
      browserTabs: [
        { id: 'page-a', type: 'page', url: 'https://example.com/a', title: 'A' },
        { id: 'explorer-a', type: 'explorer', path: 'docs', query: 'guide' },
      ],
      activeBrowserTabId: 'explorer-a',
      attentionRecords: Array.from({ length: 25 }, (_, index) => ({
        id: 'attention:completed:' + index, type: 'completed', detail: 'Finished ' + index,
        occurredAt: Date.now() + index,
      })) },
    { name: 'invalid', cwd: ${JSON.stringify(shared)}, agent: 'claude', resumeId: 'not/a/session', composerDraft: 'x'.repeat(65537),
      attentionRecords: [
        { id: 'unknown:1', type: 'mystery', detail: 'no', occurredAt: Date.now() },
        { id: 'bad id', type: 'permission', detail: 'no', occurredAt: Date.now() },
        { id: 'oversized:1', type: 'input', detail: 'x'.repeat(4097), occurredAt: Date.now() },
        { id: 'bad-time:1', type: 'delivery', detail: 'no', occurredAt: 0 },
      ] },
  ] });
  expect(saved.schemaVersion === 10, 'new snapshot must use schema v10');
  expect(saved.inboxTriage.length === 2
    && saved.inboxTriage[0].state === 'done'
    && saved.inboxTriage[1].state === 'snoozed',
  'schema v10 should bound and sanitize Done/Snooze inbox records');
  expect(saved.sessions[0].lastActivityAt === '2026-07-23T01:02:03.000Z'
    && typeof saved.sessions[1].lastActivityAt === 'string',
  'schema v10 should retain schema-v7 activity timestamps and provide a valid fallback for malformed or absent activity');
  expect(saved.sessions[0].resumeId === ${JSON.stringify(ids.exactB)}, 'valid resumeId not persisted');
  expect(saved.sessions[0].customTabGroupId === 'group-saved-valid'
    && saved.sessions[0].wasActive === true && saved.sessions[0].wasLastActiveInGroup === true,
  'schema v10 group membership and focus metadata did not round-trip');
  expect(!Object.prototype.hasOwnProperty.call(saved.sessions[0], 'chatMessages')
    && !Object.prototype.hasOwnProperty.call(saved.sessions[0], 'chatOpen')
    && saved.sessions[0].stagedBrowserContexts.length === 1
    && saved.sessions[0].browserLayoutMode === 'browserChromux'
    && saved.sessions[0].fullBrowserComposerOpen === true,
  'schema v10 Composer context and presentation metadata did not round-trip');
  expect(!Object.prototype.hasOwnProperty.call(saved.sessions[0], 'resume')
    && !Object.prototype.hasOwnProperty.call(saved.sessions[0], 'agentMessagePreview'),
  'transient DETECT name/excerpt metadata must not enter restore snapshots');
  expect(saved.sessions[1].resumeId === null, 'malformed resumeId persisted');
  expect(saved.sessions[0].composerDraft === 'saved draft', 'bounded composer draft not persisted');
  expect(saved.sessions[0].browserTabs.length === 2
    && saved.sessions[0].activeBrowserTabId === 'explorer-a'
    && saved.sessions[0].browserTabs[1].query === 'guide',
  'browser page/explorer tab snapshot was not preserved');
  expect(!Object.prototype.hasOwnProperty.call(saved.sessions[1], 'composerDraft'), 'oversized composer draft persisted');
  expect(saved.sessions[0].attentionRecords.length === 20, 'attention record count bound not enforced');
  expect(saved.sessions[0].attentionRecords[0].type === 'completed'
    && saved.sessions[0].attentionRecords[0].detail === 'Finished 0', 'valid attention record changed');
  expect(!Object.prototype.hasOwnProperty.call(saved.sessions[1], 'attentionRecords'),
    'malformed or oversized attention records persisted');

  const tabs = window.chromuxTestTabs;
  const grouping = tabs && tabs.grouping;
  expect(grouping, 'missing grouping restore test API');
  const restoreGroup = grouping.create('Restore Team');
  grouping.setEnabled(true);
  await window.chromuxTest.restorePayload({
    schemaVersion: 8,
    restoreId: 'partial-group-restore',
    reason: 'app-close',
    savedAt: new Date().toISOString(),
    consumed: false,
    sessions: [
      { name: 'same-group-fallback', cwd: ${JSON.stringify(restoreGood)}, agent: '',
        customTabGroupId: restoreGroup.id, wasLastActiveInGroup: true },
      { name: 'failed-active', cwd: ${JSON.stringify(path.join(homeDir, 'missing-restore-cwd'))}, agent: '',
        customTabGroupId: restoreGroup.id, wasActive: true },
      { name: 'orphan-membership', cwd: ${JSON.stringify(restoreOther)}, agent: '',
        customTabGroupId: 'group-no-longer-local' },
    ],
  });
  const partial = await grouping.autoRestore(['failed-active']);
  expect(!partial.sessions.some((session) => session.name === 'failed-active'),
    'a failed restore must not leave a partial runtime session');
  expect(partial.sessions.find((session) => session.id === partial.activeId).name === 'same-group-fallback',
    'failed exact active restore must fall back within the same group');
  expect(partial.sessions.find((session) => session.name === 'orphan-membership').customTabGroupId === null,
    'orphaned custom membership must fall back to automatic directory grouping');

  await window.chromuxTest.restorePayload({
    schemaVersion: 8,
    restoreId: 'exact-group-restore',
    reason: 'app-close',
    savedAt: new Date().toISOString(),
    consumed: false,
    sessions: [
      { name: 'not-active', cwd: ${JSON.stringify(restoreOther)}, agent: '' },
      { name: 'exact-active', cwd: ${JSON.stringify(restoreGood)}, agent: '',
        customTabGroupId: restoreGroup.id, wasActive: true, wasLastActiveInGroup: true },
    ],
  });
  const exactFocus = await grouping.autoRestore();
  expect(exactFocus.sessions.find((session) => session.id === exactFocus.activeId).name === 'exact-active',
    'successful schema-v8 restore must recover the exact prior active group and session');
  return JSON.stringify({ ok: true });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [
  electronCli,
  '.',
  '--smoke',
  `--user-data-dir=${path.join(tmpDir, 'electron-profile')}`,
], {
  cwd: appDir,
  env: { ...process.env, HOME: homeDir, PATH: '/usr/bin:/bin', CHROMUX_E2E: e2ePath, CHROMUX_E2E_OUT: e2eOutPath },
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
  let report = null;
  try { report = JSON.parse(output); } catch { /* reported below */ }
  if (code !== 0 || signal || !report || report.ok !== true) {
    console.error('RESTORE_SESSION_IDENTITY_FAIL');
    console.error({ code, signal, output, stdout, stderr });
    process.exit(1);
  }
  console.log('RESTORE_SESSION_IDENTITY_OK');
});
