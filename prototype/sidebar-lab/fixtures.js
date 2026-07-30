'use strict';

const PROJECTS = Object.freeze([
  { id: 'atlas', name: 'Atlas Web', color: '#5ed6ff' },
  { id: 'relay', name: 'Relay API', color: '#a78bfa' },
  { id: 'harbor', name: 'Harbor Desktop', color: '#67e8a5' },
  { id: 'quartz', name: 'Quartz Docs', color: '#f6c85f' },
]);

const rawSessions = [
  ['atlas-auth', 'Fix OAuth callback', 'atlas', 'claude', 'approval', 'Needs OAuth scope approval', 3, 'feat/oauth', 'atlas-oauth', 1, 0, 0, 0],
  ['atlas-tests', 'Stabilize browser tests', 'atlas', 'codex', 'working', '', 7, 'fix/browser-tests', 'atlas-tests', 0, 0, 0, 0],
  ['atlas-copy', 'Rewrite onboarding copy', 'atlas', 'grok', 'ready', 'Ready for review', 14, 'copy/onboarding', 'atlas-copy', 0, 0, 0, 0],
  ['atlas-old', 'Legacy billing spike', 'atlas', 'codex', 'completed', '', 2880, 'spike/billing', 'atlas-old', 0, 0, 1, 1],
  ['atlas-nav', 'Responsive navigation', 'atlas', 'codex', 'idle', '', 62, 'feat/responsive-nav', 'atlas-nav', 0, 0, 0, 0],
  ['relay-schema', 'Review schema migration', 'relay', 'claude', 'ready', 'Migration needs review', 9, 'feat/schema-v4', 'relay-schema', 1, 0, 0, 0],
  ['relay-queue', 'Trace queue latency', 'relay', 'codex', 'working', '', 2, 'perf/queue', 'relay-queue', 0, 0, 0, 0],
  ['relay-secret', 'Rotate sandbox secret', 'relay', 'claude', 'approval', 'Waiting for credential choice', 22, 'ops/sandbox-secret', 'relay-secret', 0, 0, 0, 0],
  ['relay-sdk', 'SDK compatibility notes', 'relay', 'grok', 'snoozed', '', 180, 'docs/sdk-compat', 'relay-sdk', 0, 1, 0, 0],
  ['harbor-crash', 'Diagnose restore crash', 'harbor', 'codex', 'working', '', 5, 'fix/restore-crash', 'harbor-crash', 1, 0, 0, 0],
  ['harbor-sign', 'Prepare signed build', 'harbor', 'claude', 'ready', 'Build ready to verify', 18, 'release/signed-build', 'harbor-sign', 0, 0, 0, 0],
  ['harbor-menu', 'Native menu cleanup', 'harbor', 'grok', 'idle', '', 75, 'refactor/native-menu', 'harbor-menu', 0, 0, 0, 0],
  ['harbor-perf', 'Profile startup time', 'harbor', 'codex', 'snoozed', '', 360, 'perf/startup', 'harbor-perf', 0, 1, 0, 0],
  ['quartz-api', 'Document capture API', 'quartz', 'claude', 'working', '', 11, 'docs/capture-api', 'quartz-api', 0, 0, 0, 0],
  ['quartz-shot', 'Refresh screenshots', 'quartz', 'grok', 'ready', 'Screenshots ready to compare', 27, 'docs/screenshots', 'quartz-shot', 0, 0, 0, 0],
  ['quartz-links', 'Audit broken links', 'quartz', 'codex', 'idle', '', 95, 'fix/doc-links', 'quartz-links', 0, 0, 0, 0],
  ['quartz-archive', 'Old launch checklist', 'quartz', 'grok', 'completed', '', 4320, 'archive/launch', 'quartz-archive', 0, 0, 1, 1],
  ['quartz-tone', 'Voice and tone guide', 'quartz', 'claude', 'idle', '', 130, 'docs/tone', 'quartz-tone', 0, 0, 0, 0],
];

const SESSIONS = Object.freeze(rawSessions.map((row) => Object.freeze({
  id: row[0],
  title: row[1],
  projectId: row[2],
  agent: row[3],
  status: row[4],
  attentionReason: row[5] || null,
  activityMinutes: row[6],
  branch: row[7],
  worktree: `fixture://${row[8]}`,
  pinned: Boolean(row[9]),
  snoozed: Boolean(row[10]),
  settled: Boolean(row[11]),
  history: Boolean(row[12]),
  unread: ['atlas-auth', 'relay-schema', 'relay-secret', 'harbor-sign', 'quartz-shot'].includes(row[0]),
})));

const SCENARIOS = Object.freeze([
  {
    id: 'approval-blocker',
    name: 'Locate an approval blocker',
    instruction: 'Open “Fix OAuth callback,” which is waiting for approval.',
    targetSessionId: 'atlas-auth',
  },
  {
    id: 'remembered-after-churn',
    name: 'Resume after status churn',
    instruction: 'After the simulated status update, reopen “Responsive navigation.”',
    targetSessionId: 'atlas-nav',
    transition: { id: 'atlas-nav', status: 'ready', attentionReason: 'Ready after interruption', unread: true },
  },
  {
    id: 'cross-project-switch',
    name: 'Switch across projects',
    instruction: 'Open “Trace queue latency,” then “Diagnose restore crash.”',
    targetSessionIds: ['relay-queue', 'harbor-crash'],
  },
  {
    id: 'interruption-reorientation',
    name: 'Reorient after interruption',
    instruction: 'Find the pinned “Review schema migration” session.',
    targetSessionId: 'relay-schema',
  },
  {
    id: 'working-versus-review',
    name: 'Working versus review',
    instruction: 'Open the working “Document capture API,” then the review-ready “Refresh screenshots.”',
    targetSessionIds: ['quartz-api', 'quartz-shot'],
  },
  {
    id: 'close-and-recover',
    name: 'Close and recover work',
    instruction: 'Recover “Old launch checklist” from history.',
    targetSessionId: 'quartz-archive',
    includeHistory: true,
  },
]);

function createFixture() {
  return {
    id: 'contextual-sidebar-v1',
    projects: PROJECTS.map((row) => ({ ...row })),
    sessions: SESSIONS.map((row) => ({ ...row })),
  };
}

module.exports = { PROJECTS, SCENARIOS, SESSIONS, createFixture };
