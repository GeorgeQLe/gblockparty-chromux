'use strict';

const assert = require('assert');
const attention = require('../renderer/attention');
const session = (patch = {}) => ({
  id: patch.id || 's1', lifecycle: { alive: patch.alive !== false },
  turn: { state: patch.state || 'unknown', acknowledged: Boolean(patch.acknowledged), stopped: Boolean(patch.stopped) },
  browser: { queue: patch.queue || [] }, ...patch.extra,
});
const diagnostic = (target, activeId = null) => attention.projectAttentionDiagnostic({
  session: target, sessions: [target], activeId, captures: [],
  updateQueue: { phase: 'idle' }, updateStatus: null, activityIndicators: true,
});

assert.deepStrictEqual(attention.projectSessionStatus(session({ alive: false, state: 'working' }), false),
  { kind: 'dead', icon: '', label: 'Exited', status: 'Session exited' });
for (const state of ['needsInput', 'permission', 'authentication', 'rateLimited', 'toolFailed']) {
  assert.deepStrictEqual(attention.projectSessionStatus(session({ state }), false),
    { kind: 'action', icon: '!', label: 'Action required', status: 'Action required' });
}
assert.strictEqual(attention.projectSessionStatus(session({ state: 'working' })).kind, 'working');
assert.strictEqual(attention.projectSessionStatus(session({ state: 'completed' })).kind, 'completed');
assert.strictEqual(attention.projectSessionStatus(session({ state: 'idle' })).kind, 'idle');
assert.strictEqual(attention.projectSessionStatus(session({ state: 'working' }), false).kind, 'live');

let row = diagnostic(session({ state: 'completed' }), 's1');
assert.strictEqual(row.suppression, 'active-session');
assert.strictEqual(row.expectedTabIndicator, 'completed');
const focusedActions = {
  needsInput: ['INPUT NEEDED', 'FOCUS'],
  permission: ['PERMISSION', 'FOCUS'],
  authentication: ['AUTH REQUIRED', 'FOCUS'],
  rateLimited: ['RATE LIMITED', 'FOCUS'],
  toolFailed: ['TOOL FAILED', 'FOCUS'],
};
for (const [state, [kind, primaryAction]] of Object.entries(focusedActions)) {
  row = diagnostic(session({ state }), 's1');
  assert.strictEqual(row.suppression, null, `${state} should remain visible while focused`);
  assert.deepStrictEqual(row.projectedKinds, [kind]);
  assert.strictEqual(row.expectedItem.primaryAction, primaryAction);
}
row = diagnostic(session({ state: 'permission', acknowledged: true }), 's1');
assert.strictEqual(row.suppression, 'active-session');
assert.deepStrictEqual(row.projectedKinds, []);
row = diagnostic(session({ queue: [{ url: 'http://localhost:3000', ts: 1 }] }), 's1');
assert.strictEqual(row.suppression, 'active-session');
assert.deepStrictEqual(row.projectedKinds, []);
const focusedDeliverySession = session();
assert.deepStrictEqual(attention.projectAttentionItems({
  sessions: [focusedDeliverySession],
  activeId: focusedDeliverySession.id,
  captures: [{
    id: 'capture-1',
    sessionId: focusedDeliverySession.id,
    status: 'failed',
    acknowledged: false,
    exitCode: 1,
    ts: 1,
  }],
  updateQueue: { phase: 'idle' },
  updateStatus: null,
}), []);
row = diagnostic(session({ alive: false, state: 'working' }));
assert.strictEqual(row.suppression, 'exited');
assert.deepStrictEqual(row.safety, { safe: true, reason: 'exited' });
row = diagnostic(session({ state: 'completed', acknowledged: true }));
assert.strictEqual(row.suppression, 'acknowledged');
row = diagnostic(session({ state: 'needsInput', acknowledged: true }));
assert.strictEqual(row.suppression, 'acknowledged');
row = diagnostic(session({ state: 'needsInput' }));
assert.deepStrictEqual(row.safety, { safe: true, reason: 'waiting for input' });
assert.deepStrictEqual(row.projectedKinds, ['INPUT NEEDED']);
row = diagnostic(session({ state: 'working' }));
assert.strictEqual(row.safety.safe, false);
assert.strictEqual(row.expectedTabIndicator, 'working');
row = diagnostic(session({ state: 'idle' }));
assert.deepStrictEqual(row.safety, { safe: true, reason: 'idle' });
assert.strictEqual(row.expectedTabIndicator, 'idle');
row = diagnostic(session({ state: 'unknown' }));
assert.strictEqual(row.safety.reason, 'live work state unknown');
row = diagnostic(session({ state: 'rateLimited', stopped: false }));
assert.deepStrictEqual(row.safety, { safe: false, reason: 'nonterminal agent failure' });
row = diagnostic(session({ state: 'toolFailed', stopped: true }));
assert.deepStrictEqual(row.safety, { safe: true, reason: 'tool failed and stopped' });
row = diagnostic(session({ queue: [{ url: 'http://localhost:3000', ts: 1 }] }));
assert.deepStrictEqual(row.projectedKinds, ['QUEUE 1']);
assert.strictEqual(row.queueHead, 'http://localhost:3000');
console.log('ATTENTION_DIAGNOSTICS_OK');
