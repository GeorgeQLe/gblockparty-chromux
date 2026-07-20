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
const ids = {
  exactA: '11111111-1111-4111-8111-111111111111',
  exactB: '22222222-2222-4222-8222-222222222222',
  inferredA: '33333333-3333-4333-8333-333333333333',
  inferredB: '44444444-4444-4444-8444-444444444444',
  codex: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  grok: '019f4ef1-dcd0-7440-beef-aec69c74a111',
};

fs.mkdirSync(path.join(homeDir, '.chromux'), { recursive: true });
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
  expect(mixed.sessions[0].resume.id === ${JSON.stringify(ids.codex)}, 'Codex candidate mismatch');
  expect(mixed.sessions[1].resume.id === ${JSON.stringify(ids.grok)}, 'Grok candidate mismatch');
  expect(mixed.sessions[2].resume.id !== '../../bad' && mixed.inferred.length === 3,
    'malformed saved ID must be discarded and inferred safely');

  const saved = await window.chromux.saveRestoreSnapshot({ reason: 'manual', sessions: [
    { name: 'valid', cwd: ${JSON.stringify(shared)}, agent: 'claude', resumeId: ${JSON.stringify(ids.exactB)} },
    { name: 'invalid', cwd: ${JSON.stringify(shared)}, agent: 'claude', resumeId: 'not/a/session' },
  ] });
  expect(saved.schemaVersion === 3, 'new snapshot must use schema v3');
  expect(saved.sessions[0].resumeId === ${JSON.stringify(ids.exactB)}, 'valid resumeId not persisted');
  expect(saved.sessions[1].resumeId === null, 'malformed resumeId persisted');
  return JSON.stringify({ ok: true });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
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
