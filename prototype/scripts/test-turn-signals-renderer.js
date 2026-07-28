// Renderer E2E: deterministic turn signals. Replaces the deleted
// test-attention-signals-renderer.js — regex attention heuristics no longer
// exist; the only agent-attention source is the Chromux OSC wire protocol.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-turn-signals-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'turn-signals-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const sig = window.chromuxTestSignals;
  if (!sig) throw new Error('Missing turn-signals test API');
  const composer = window.chromuxTestComposer;
  if (!composer) throw new Error('Missing composer test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const osc = (event, id) => '\\x1b]777;chromux;v1;' + event + ';' + id + '\\x07';
  const oscV2 = (envelope) => '\\x1b]777;chromux;v2;' + btoa(unescape(encodeURIComponent(JSON.stringify(envelope))))
    .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '') + '\\x07';
  const titleOsc = (title) => '\\x1b]0;' + title + '\\x07';
  const itemsFor = (kind, name) => sig.attentionItems()
    .filter((i) => i.kind === kind && (!name || i.name === name));

  await wait(100);

  // Focus holder: keeps background-only attention fixtures out of the active
  // session. Live action-required states remain visible even while focused.
  const holder = sig.addFakeSession({ name: 'holder', agent: '' });

  // Restored attention remains historical and independent from live turn state.
  const beforeRestart = Date.now() - 5000;
  const historical = sig.addFakeSession({ name: 'historical', agent: 'claude', attentionRecords: [
    { id: 'attention:permission:1:turn', type: 'permission', detail: 'Allow deployment?', occurredAt: beforeRestart },
    { id: 'attention:completed:2:turn', type: 'completed', detail: 'Earlier turn finished', occurredAt: beforeRestart + 1 },
  ] });
  expect(itemsFor('PERMISSION', 'historical')[0].detail === 'Before restart · Allow deployment?',
    'restored permission should be labeled as historical');
  expect(itemsFor('COMPLETED', 'historical').length === 1,
    'restored completion should return under its resumed thread');
  const historicalSnapshot = sig.snapshot().find((row) => row.name === 'historical');
  expect(historicalSnapshot.attentionRecords.length === 2,
    'snapshot should retain restored records while they remain outstanding');
  expect(JSON.stringify(historicalSnapshot.attentionRecords.map((record) => record.id))
    === JSON.stringify(sig.snapshot().find((row) => row.name === 'historical').attentionRecords.map((record) => record.id)),
  'repeated snapshots should preserve stable attention record identifiers');
  sig.focus(historical);
  expect(itemsFor('PERMISSION', 'historical').length === 0
    && itemsFor('COMPLETED', 'historical').length === 0,
  'focused restored historical records should remain suppressed');
  sig.focus(holder);
  expect(itemsFor('COMPLETED', 'historical').length === 0,
    'opening a resumed thread should consume its historical completion');
  expect(itemsFor('PERMISSION', 'historical').length === 1,
    'opening a resumed thread must not consume historical actionable records');
  sig.emitSignal(historical, 'input-needed', 'New live question');
  expect(itemsFor('PERMISSION', 'historical').length === 1
    && itemsFor('INPUT NEEDED', 'historical').length === 1,
  'new live attention should coexist with restored historical records');
  sig.dismissItem('PERMISSION', 'historical');
  expect(itemsFor('PERMISSION', 'historical').length === 0
    && itemsFor('INPUT NEEDED', 'historical').length === 1,
  'historical actionable records should clear only through explicit dismissal');

  const queueOnly = sig.addFakeSession({ name: 'queue-only', agent: 'codex', queue: [
    { url: 'http://localhost:4321', source: 'TERM', reason: 'Local preview', ts: Date.now() },
  ] });
  const queueSnapshot = sig.snapshot().find((row) => row.name === 'queue-only');
  expect(queueSnapshot.queue.length === 1 && !queueSnapshot.attentionRecords,
    'browser queues should persist only through queue storage, not attention records');
  const boundedDetail = sig.addFakeSession({ name: 'bounded-detail', agent: 'claude' });
  sig.emitSignal(boundedDetail, 'input-needed', '😀'.repeat(2000));
  const boundedRecord = sig.snapshot().find((row) => row.name === 'bounded-detail').attentionRecords[0];
  expect(new TextEncoder().encode(boundedRecord.detail).byteLength === 4096
    && !boundedRecord.detail.endsWith('�'),
  'live attention detail should be UTF-8 safely bounded before persistence');

  const secure = sig.addFakeSession({ name: 'secure', agent: 'claude' });
  sig.setSignalToken(secure, 'secret');
  const base = { v: 2, sessionId: secure, token: 'secret', agent: 'claude',
    resumeId: '11111111-2222-4333-8444-555555555555',
    reason: 'permission', message: 'Allow command?', turnId: 'turn-1', eventId: 'event-1',
    sequence: 1, timestamp: Date.now(), source: 'claude:Notification', confidence: 'high', stopped: false };
  sig.feedPtyChunk(secure, oscV2({ ...base, event: 'permission-required' }));
  expect(sig.turnState(secure).state === 'permission', 'v2 permission should create distinct state');
  expect(itemsFor('PERMISSION', 'secure').length === 1, 'v2 permission should create attention');
  expect(sig.resumeId(secure) === base.resumeId, 'authenticated provider ID should attach to the signaled tab');
  expect(sig.snapshot().find((row) => row.name === 'secure').resumeId === base.resumeId,
    'snapshot should include the live tab provider ID');
  const other = sig.addFakeSession({ name: 'other-secure', agent: 'claude' });
  expect(sig.resumeId(other) === null, 'provider ID must not leak to another tab');
  sig.feedPtyChunk(secure, oscV2({ ...base, token: 'wrong', eventId: 'event-2', sequence: 2, event: 'turn-completed' }));
  expect(sig.turnState(secure).state === 'permission', 'wrong token must not mutate state');
  sig.feedPtyChunk(secure, oscV2({ ...base, event: 'permission-required' }));
  expect(sig.turnState(secure).sequence === 1, 'duplicate event must not advance state');
  sig.feedPtyChunk(secure, oscV2({ ...base, resumeId: '../bad', eventId: 'event-bad', sequence: 2 }));
  expect(sig.resumeId(secure) === base.resumeId, 'malformed provider ID must not replace stored identity');

  // 1 — regex heuristics are dead: plain "complete" prose does nothing…
  const a = sig.addFakeSession({ name: 'claude-a', agent: 'claude' });
  sig.feedPtyChunk(a, 'Implementation complete. Ready for review.\\r\\n');
  expect(sig.turnState(a).state === 'unknown', 'prose completion text must not change turn state');
  expect(itemsFor('COMPLETED').length === 0, 'prose completion text must not create attention');
  // …but the same chunk with an embedded valid OSC turn-end does.
  sig.feedPtyChunk(a, 'Implementation complete. ' + osc('turn-end', a) + 'Ready.\\r\\n');
  expect(sig.turnState(a).state === 'completed', 'OSC turn-end should complete the turn');
  expect(sig.turnState(a).instrumented === true, 'OSC signal marks the session instrumented');
  expect(itemsFor('COMPLETED', 'claude-a').length === 1, 'completed background session appears in queue');
  expect(!sig.written(a).includes('777;chromux'), 'OSC bytes must be stripped from terminal output');

  // 2 — one OSC split across two PTY chunks → exactly one needsInput.
  const b = sig.addFakeSession({ name: 'claude-b', agent: 'claude' });
  const seq = osc('input-needed', b);
  sig.feedPtyChunk(b, 'approval? ' + seq.slice(0, 9));
  expect(sig.turnState(b).state === 'unknown', 'partial OSC must not fire early');
  sig.feedPtyChunk(b, seq.slice(9) + 'tail');
  expect(sig.turnState(b).state === 'needsInput', 'split OSC completes into needsInput');
  expect(itemsFor('INPUT NEEDED', 'claude-b').length === 1, 'exactly one INPUT NEEDED item');
  const bSignals = sig.events().filter((e) => e.type === 'turn-signal' && e.sessionId === b);
  expect(bSignals.length === 1, 'split OSC must produce exactly one turn-signal event');
  expect(sig.written(b) === 'approval? tail', 'clean text around split OSC survives, got ' + JSON.stringify(sig.written(b)));

  // 3 — Codex completion notify and provider-evidenced activity.
  const codexDone = sig.addFakeSession({ name: 'codex-done', agent: 'codex' });
  sig.feedPtyChunk(codexDone, osc('turn-end', codexDone));
  expect(sig.turnState(codexDone).state === 'completed', 'Codex notify turn-end should complete the turn');
  expect(itemsFor('COMPLETED', 'codex-done').length === 1, 'Codex notify completion creates completed attention');
  sig.focus(codexDone);
  expect(itemsFor('COMPLETED', 'codex-done').length === 0, 'focused completed Codex session is display-hidden');
  expect(sig.turnState(codexDone).state === 'idle', 'VIEW/focus must consume completed state to idle');
  expect(sig.turnState(codexDone).acknowledged === false, 'VIEW/focus must not acknowledge completion');
  sig.focus(holder);
  expect(itemsFor('COMPLETED', 'codex-done').length === 0, 'idle Codex completion stays hidden after blur');
  sig.feedPtyChunk(codexDone, osc('turn-start', codexDone) + osc('turn-end', codexDone));
  expect(itemsFor('COMPLETED', 'codex-done').length === 1, 'subsequent turn creates a new unseen completion');
  sig.dismissItem('COMPLETED', 'codex-done');
  expect(sig.turnState(codexDone).state === 'idle', 'DISMISS consumes completed state to idle');
  expect(sig.turnState(codexDone).acknowledged === false, 'idle is distinct from acknowledgement');
  expect(itemsFor('COMPLETED', 'codex-done').length === 0, 'dismissed completed row stays hidden');

  const codexIdleUnknown = sig.addFakeSession({ name: 'codex-idle-unknown', agent: 'codex' });
  sig.feedPtyChunk(codexIdleUnknown, 'Choose an option:\\r\\n1. Wait until the rate limit resets\\r\\n› ');
  expect(sig.turnState(codexIdleUnknown).state === 'unknown',
    'Codex idle/rate-limit output from unknown must not complete');
  expect(itemsFor('COMPLETED', 'codex-idle-unknown').length === 0,
    'Codex idle/rate-limit output from unknown must not create attention');

  const codexSubmit = sig.addTerminalSession({ name: 'codex-submit', agent: 'codex' });
  sig.focus(holder);
  sig.typeInput(codexSubmit, 'implement this\\r');
  expect(sig.turnState(codexSubmit).state === 'pending',
    'Codex submitted input should await provider activity instead of inferring working');
  expect(sig.turnState(codexSubmit).generation === 1, 'ordinary Codex submission should advance the turn generation');
  expect(sig.turnState(codexSubmit).completionBlocked === true,
    'pending Codex input should reject completion until activity is observed');
  expect(itemsFor('COMPLETED', 'codex-submit').length === 0, 'Codex submitted line should not create completed attention');
  sig.feedPtyChunk(codexSubmit, titleOsc('\\u2839 Implementing this'));
  expect(sig.turnState(codexSubmit).state === 'working'
    && sig.turnState(codexSubmit).activityObserved === true
    && sig.turnState(codexSubmit).completionBlocked === false,
  'a Braille-prefixed Codex title should confirm working activity');
  sig.feedPtyChunk(codexSubmit, titleOsc('codex-submit'));
  expect(sig.turnState(codexSubmit).state === 'completed',
    'a stable Codex title after observed activity should complete a background turn');
  sig.focus(codexSubmit);
  expect(sig.turnState(codexSubmit).state === 'idle',
    'viewing a title-completed Codex turn should consume it to idle');
  sig.focus(holder);
  sig.typeInput(codexSubmit, 'fallback request\\r');
  expect(sig.turnState(codexSubmit).state === 'pending',
    'each later Codex submission should return to pending');
  sig.feedPtyChunk(codexSubmit, 'Running compatibility fallback...\\r\\n');
  await wait(30); sig.flushRender();
  expect(sig.turnState(codexSubmit).state === 'working',
    'meaningful Codex terminal output should confirm working when title frames are unavailable');

  const liveRedraw = sig.addTerminalSession({ name: 'codex-live-redraw', agent: 'codex' });
  sig.focus(holder);
  sig.typeInput(liveRedraw, 'exercise repeated redraws\\r');
  const liveFrames = [
    'Inspecting the first live frame...',
    'Inspecting the second live frame...',
    'Inspecting the third live frame...',
  ];
  let previousLiveSince = 0;
  for (const frame of liveFrames) {
    sig.feedPtyChunk(liveRedraw, '\\x1b[2J\\x1b[H' + frame + '\\r\\n? for shortcuts\\r\\n› ');
    await wait(30); sig.flushRender();
    const liveTurn = sig.turnState(liveRedraw);
    expect(liveTurn.state === 'working'
      && liveTurn.activityObserved === true
      && liveTurn.completionBlocked === false,
    'meaningful Codex output must keep every composer-bearing live redraw working: '
      + JSON.stringify(liveTurn));
    expect(previousLiveSince === 0 || liveTurn.since > previousLiveSince,
      'each meaningful composer redraw should retain or refresh the working timestamp');
    previousLiveSince = liveTurn.since;
  }
  sig.feedPtyChunk(liveRedraw, '\\x1b[2J\\x1b[H? for shortcuts\\r\\n› ');
  await wait(30); sig.flushRender();
  expect(sig.turnState(liveRedraw).state === 'completed',
    'a later composer-only idle redraw should complete a background Codex turn');
  expect(itemsFor('COMPLETED', 'codex-live-redraw').length === 1,
    'a genuine idle redraw after repeated live frames should create completed attention');

  const focusedLiveRedraw = sig.addTerminalSession({
    name: 'codex-focused-live-redraw', agent: 'codex',
  });
  sig.focus(focusedLiveRedraw);
  sig.typeInput(focusedLiveRedraw, 'exercise focused redraws\\r');
  for (const frame of ['Focused live frame one...', 'Focused live frame two...']) {
    sig.feedPtyChunk(
      focusedLiveRedraw,
      '\\x1b[2J\\x1b[H' + frame + '\\r\\n? for shortcuts\\r\\n› ',
    );
    await wait(30); sig.flushRender();
    expect(sig.turnState(focusedLiveRedraw).state === 'working',
      'meaningful focused composer redraws should remain working: ' + frame);
  }
  sig.feedPtyChunk(focusedLiveRedraw, '\\x1b[2J\\x1b[H? for shortcuts\\r\\n› ');
  await wait(30); sig.flushRender();
  expect(sig.turnState(focusedLiveRedraw).state === 'idle'
    && itemsFor('COMPLETED', 'codex-focused-live-redraw').length === 0,
  'a later composer-only redraw should resolve a focused Codex turn directly to idle');
  sig.focus(holder);

  sig.feedPtyChunk(codexSubmit, 'Choose an option:\\r\\n1. Wait until the rate limit resets\\r\\n› ');
  await wait(30); sig.flushRender();
  expect(sig.turnState(codexSubmit).state === 'completed',
    'Codex rate-limit chooser from working should complete the turn');
  expect(itemsFor('COMPLETED', 'codex-submit').length === 1,
    'Codex fallback completion creates completed attention');
  sig.focus(codexSubmit);
  expect(itemsFor('COMPLETED', 'codex-submit').length === 0,
    'focused fallback-completed Codex session is display-hidden');
  sig.focus(holder);
  expect(itemsFor('COMPLETED', 'codex-submit').length === 0,
    'seen fallback-completed Codex row stays hidden after blur');
  expect(sig.turnState(codexSubmit).state === 'idle', 'viewed fallback completion should become idle');
  sig.typeInput(codexSubmit, 'next task\\r');
  expect(sig.turnState(codexSubmit).state === 'pending', 'new Codex input after fallback completion returns to pending');
  expect(itemsFor('COMPLETED', 'codex-submit').length === 0,
    'new Codex input clears fallback completed attention');

  const codexClear = sig.addTerminalSession({ name: 'codex-clear', agent: 'codex', turnState: 'idle' });
  sig.focus(holder);
  const clearGeneration = sig.turnState(codexClear).generation;
  sig.typeInput(codexClear, '   /clear   \\r');
  expect(sig.turnState(codexClear).state === 'pending',
    'direct /clear should use the same pending state as every Codex submission');
  expect(sig.turnState(codexClear).generation === clearGeneration + 1,
    'command submissions must advance the generation to invalidate pending render callbacks');
  expect(sig.turnState(codexClear).completionBlocked === true,
    'command submissions must block completion until activity is observed');
  sig.feedPtyChunk(codexClear, '/clear\\r\\n');
  await wait(30); sig.flushRender();
  expect(sig.turnState(codexClear).state === 'pending',
    'a rendered slash-command echo alone must not count as busy activity');
  sig.feedPtyChunk(codexClear, '? for shortcuts\\r\\n› ');
  await wait(30); sig.flushRender();
  expect(sig.turnState(codexClear).state === 'idle',
    'composer redraw without intervening activity should resolve direct /clear to idle');
  sig.emitSignal(codexClear, 'turn-end', 'late completion after command');
  expect(sig.turnState(codexClear).state === 'idle',
    'late completion after a command-only submission must remain rejected');
  sig.typeInput(codexClear, 'unsubmitted draft');
  expect(sig.turnState(codexClear).state === 'idle',
    'typing after /clear without submission should remain idle');

  const renderedClearIdle = composer.addSession({
    name: 'codex-rendered-clear-idle', agent: 'codex', turnState: 'idle', rows: 16, cols: 48,
  });
  sig.focus(holder);
  composer.nativeInput(renderedClearIdle, '/cl');
  await composer.renderPromptFixture(renderedClearIdle, '? for shortcuts\\r\\n› /cl', [
    '\\x1b[7m  /clear   start a new conversation\\x1b[27m',
    '  /compact summarize the conversation',
  ]);
  composer.nativeInput(renderedClearIdle, '\\t');
  await composer.renderPromptFixture(renderedClearIdle, '? for shortcuts\\r\\n› /clear');
  composer.nativeInput(renderedClearIdle, '\\r');
  expect(sig.turnState(renderedClearIdle).state === 'pending',
    'Tab-autocompleted /clear should enter generic pending before provider redraw');
  await composer.renderPromptFixture(renderedClearIdle, '');
  sig.feedPtyChunk(renderedClearIdle, '? for shortcuts\\r\\n› ');
  await wait(30); sig.flushRender();
  expect(sig.turnState(renderedClearIdle).state === 'idle',
    'Tab-autocompleted /clear should resolve idle from the composer redraw');

  const racedClearIdle = composer.addSession({
    name: 'codex-raced-clear-idle', agent: 'codex', turnState: 'idle', rows: 16, cols: 48,
  });
  composer.nativeInput(racedClearIdle, '/cle');
  await composer.renderPromptFixture(racedClearIdle, '? for shortcuts\\r\\n› /cle', [
    '\\x1b[7m  /clear   start a new conversation\\x1b[27m',
  ]);
  composer.nativeInput(racedClearIdle, '\\t');
  composer.nativeInput(racedClearIdle, '\\r');
  expect(sig.turnState(racedClearIdle).state === 'pending',
    'autocomplete Enter races should remain generic pending');
  await composer.renderPromptFixture(racedClearIdle, '');
  sig.feedPtyChunk(racedClearIdle, '? for shortcuts\\r\\n› ');
  await wait(30); sig.flushRender();
  expect(sig.turnState(racedClearIdle).state === 'idle'
    && sig.turnState(racedClearIdle).completionBlocked === true,
  'autocomplete Enter races should resolve idle from provider redraw evidence');
  sig.emitSignal(racedClearIdle, 'turn-end', 'stale completion after raced clear');
  expect(sig.turnState(racedClearIdle).state === 'idle',
    'the raced /clear path must retain the stale-completion barrier');
  composer.nativeInput(racedClearIdle, 'next raced request\\r');
  expect(sig.turnState(racedClearIdle).state === 'pending',
    'the next ordinary prompt after a raced /clear must return to pending');

  const ambiguousClearPrefix = composer.addSession({
    name: 'codex-ambiguous-clear-prefix', agent: 'codex', turnState: 'idle', rows: 16, cols: 48,
  });
  composer.nativeInput(ambiguousClearPrefix, '/cl');
  await composer.renderPromptFixture(ambiguousClearPrefix, '? for shortcuts\\r\\n› /cl', [
    '\\x1b[7m  /clear   start a new conversation\\x1b[27m',
    '  /classic use the classic interaction mode',
  ]);
  composer.nativeInput(ambiguousClearPrefix, '\\t');
  composer.nativeInput(ambiguousClearPrefix, '\\r');
  expect(sig.turnState(ambiguousClearPrefix).state === 'pending',
    'ambiguous autocomplete submissions should use the same generic pending behavior');

  const unrelatedSlashPrefix = composer.addSession({
    name: 'codex-unrelated-slash-prefix', agent: 'codex', turnState: 'idle', rows: 16, cols: 48,
  });
  composer.nativeInput(unrelatedSlashPrefix, '/comp');
  await composer.renderPromptFixture(unrelatedSlashPrefix, '? for shortcuts\\r\\n› /comp', [
    '\\x1b[7m  /compact summarize the conversation\\x1b[27m',
  ]);
  composer.nativeInput(unrelatedSlashPrefix, '\\t');
  composer.nativeInput(unrelatedSlashPrefix, '\\r');
  expect(sig.turnState(unrelatedSlashPrefix).state === 'pending',
    'unrelated slash autocomplete submissions should use generic pending behavior');

  const renderedClearArguments = composer.addSession({
    name: 'codex-rendered-clear-arguments', agent: 'codex', turnState: 'idle', rows: 16, cols: 48,
  });
  composer.nativeInput(renderedClearArguments, '/clear foo');
  await composer.renderPromptFixture(renderedClearArguments, '? for shortcuts\\r\\n› /clear foo', [
    '  /clear   start a new conversation',
  ]);
  composer.nativeInput(renderedClearArguments, '\\t');
  composer.nativeInput(renderedClearArguments, '\\r');
  expect(sig.turnState(renderedClearArguments).state === 'pending',
    'rendered command arguments should use generic pending behavior');

  const editedClearAutocomplete = composer.addSession({
    name: 'codex-edited-clear-autocomplete', agent: 'codex', turnState: 'idle', rows: 16, cols: 48,
  });
  composer.nativeInput(editedClearAutocomplete, '/cle');
  await composer.renderPromptFixture(editedClearAutocomplete, '? for shortcuts\\r\\n› /cle', [
    '\\x1b[7m  /clear   start a new conversation\\x1b[27m',
  ]);
  composer.nativeInput(editedClearAutocomplete, '\\t');
  composer.nativeInput(editedClearAutocomplete, '\\x7f');
  composer.nativeInput(editedClearAutocomplete, '\\r');
  expect(sig.turnState(editedClearAutocomplete).state === 'pending',
    'edited autocomplete submissions should use generic pending behavior');

  const claudeClearAutocomplete = composer.addSession({
    name: 'claude-clear-autocomplete', agent: 'claude', turnState: 'idle', rows: 16, cols: 48,
  });
  composer.nativeInput(claudeClearAutocomplete, '/cle');
  await composer.renderPromptFixture(claudeClearAutocomplete, '? for shortcuts\\r\\n› /cle', [
    '\\x1b[7m  /clear   start a new conversation\\x1b[27m',
  ]);
  composer.nativeInput(claudeClearAutocomplete, '\\t');
  composer.nativeInput(claudeClearAutocomplete, '\\r');
  expect(sig.turnState(claudeClearAutocomplete).state === 'working',
    'Tab-autocompleted /clear must retain ordinary behavior outside Codex sessions');

  const composerClear = composer.addSession({
    name: 'codex-composer-clear', agent: 'codex', turnState: 'idle', rows: 16, cols: 48,
  });
  sig.focus(holder);
  await composer.renderPromptFixture(composerClear, '? for shortcuts\\r\\n› ');
  composer.setDraft(composerClear, '/clear');
  await composer.submit(composerClear);
  expect(sig.turnState(composerClear).state === 'pending',
    'composer-submitted commands should enter generic pending');

  const clearDuringTurn = sig.addTerminalSession({ name: 'codex-clear-during-turn', agent: 'codex' });
  sig.focus(holder);
  sig.typeInput(clearDuringTurn, 'ordinary request\\r');
  const activeGeneration = sig.turnState(clearDuringTurn).generation;
  sig.feedPtyChunk(clearDuringTurn, 'busy output\\r\\n');
  sig.typeInput(clearDuringTurn, '/clear\\r');
  const clearedTurn = sig.turnState(clearDuringTurn);
  expect(clearedTurn.state === 'pending'
    && clearedTurn.generation === activeGeneration + 1
    && clearedTurn.completionBlocked === true,
  'a command during work must replace it with pending, advance generation, and arm completion suppression');
  expect(clearedTurn.detail === null && clearedTurn.protocol === null && clearedTurn.source === null
    && clearedTurn.confidence === null && clearedTurn.turnId === null && clearedTurn.eventId === null
    && clearedTurn.stopped === false && clearedTurn.activityObserved === false,
  'a new pending submission must remove stale turn metadata and activity evidence');
  sig.feedPtyChunk(clearDuringTurn, '? for shortcuts\\r\\n› ');
  await wait(30); sig.flushRender();
  expect(sig.turnState(clearDuringTurn).state === 'idle',
    'a composer redraw without new activity must resolve a command submission idle');
  sig.emitSignal(clearDuringTurn, 'turn-end', 'stale native completion');
  expect(sig.turnState(clearDuringTurn).state === 'idle',
    'a delayed native completion must not resurrect a cleared turn');
  sig.typeInput(clearDuringTurn, 'next ordinary request\\r');
  expect(sig.turnState(clearDuringTurn).state === 'pending'
    && sig.turnState(clearDuringTurn).completionBlocked === true,
  'the next ordinary prompt must await fresh activity');
  sig.feedPtyChunk(clearDuringTurn, titleOsc('\\u2839 Next ordinary request'));
  expect(sig.turnState(clearDuringTurn).state === 'working',
    'fresh title activity should start the next ordinary request');
  sig.emitSignal(clearDuringTurn, 'turn-end', 'new turn complete');
  expect(sig.turnState(clearDuringTurn).state === 'completed',
    'the ordinary prompt after /clear must accept its own completion');

  const renderedClearDuringTurn = composer.addSession({
    name: 'codex-rendered-clear-during-turn', agent: 'codex', rows: 16, cols: 48,
  });
  sig.focus(holder);
  composer.nativeInput(renderedClearDuringTurn, 'ordinary rendered request\\r');
  const renderedActiveGeneration = sig.turnState(renderedClearDuringTurn).generation;
  sig.feedPtyChunk(renderedClearDuringTurn, 'busy rendered output\\r\\n');
  composer.nativeInput(renderedClearDuringTurn, 'history draft');
  composer.nativeInput(renderedClearDuringTurn, '\\x1b[H');
  composer.nativeInput(renderedClearDuringTurn, 'edited ');
  await composer.renderPromptFixture(renderedClearDuringTurn, '? for shortcuts\\r\\n› /clear');
  composer.nativeInput(renderedClearDuringTurn, '\\r');
  const renderedClearedTurn = sig.turnState(renderedClearDuringTurn);
  expect(renderedClearedTurn.state === 'pending'
    && renderedClearedTurn.generation === renderedActiveGeneration + 1
    && renderedClearedTurn.completionBlocked === true,
  'rendered command submission should replace existing work with pending');
  await composer.renderPromptFixture(renderedClearDuringTurn, '');
  sig.feedPtyChunk(renderedClearDuringTurn, '? for shortcuts\\r\\n› ');
  await wait(30); sig.flushRender();
  expect(sig.turnState(renderedClearDuringTurn).state === 'idle',
    'rendered completion recovery captured before rendered /clear must stay rejected');
  sig.emitSignal(renderedClearDuringTurn, 'turn-end', 'stale rendered native completion');
  expect(sig.turnState(renderedClearDuringTurn).state === 'idle',
    'native completion captured before rendered /clear must stay rejected');
  composer.nativeInput(renderedClearDuringTurn, 'next rendered request\\r');
  expect(sig.turnState(renderedClearDuringTurn).state === 'pending',
    'the next ordinary rendered-session prompt must await provider evidence');
  sig.feedPtyChunk(renderedClearDuringTurn, titleOsc('\\u2839 Next rendered request'));
  expect(sig.turnState(renderedClearDuringTurn).state === 'working',
    'the next rendered-session prompt should start after title activity: '
      + JSON.stringify(sig.turnState(renderedClearDuringTurn)));
  sig.emitSignal(renderedClearDuringTurn, 'turn-end', 'rendered follow-up complete');
  expect(sig.turnState(renderedClearDuringTurn).state === 'completed',
    'rendered-session completion after re-arming must be accepted');

  const clearVariants = sig.addFakeSession({ name: 'codex-clear-variants', agent: 'codex', turnState: 'idle' });
  sig.typeInput(clearVariants, '/clear foo\\r');
  expect(sig.turnState(clearVariants).state === 'pending',
    '/clear with arguments should use ordinary pending Codex submission behavior');
  const claudeClear = sig.addFakeSession({ name: 'claude-clear', agent: 'claude', turnState: 'idle' });
  sig.typeInput(claudeClear, '/clear\\r');
  expect(sig.turnState(claudeClear).state === 'working',
    'exact /clear must retain ordinary submission behavior for non-Codex agents');

  const codexV2Recovery = sig.addTerminalSession({ name: 'codex-v2-recovery', agent: 'codex' });
  sig.focus(holder);
  sig.setSignalToken(codexV2Recovery, 'codex-secret');
  sig.typeInput(codexV2Recovery, 'first turn\\r');
  sig.feedPtyChunk(codexV2Recovery, titleOsc('\\u2839 codex-v2-recovery'));
  const codexBase = { v: 2, sessionId: codexV2Recovery, token: 'codex-secret', agent: 'codex',
    reason: null, message: 'First turn complete', turnId: 'codex-turn-1', eventId: 'codex-event-1',
    sequence: 7, timestamp: Date.now() + 10, source: 'codex:agent-turn-complete',
    confidence: 'high', stopped: true };
  sig.feedPtyChunk(codexV2Recovery, oscV2({ ...codexBase, event: 'turn-completed' }));
  expect(sig.turnState(codexV2Recovery).state === 'completed', 'Codex v2 should complete the first turn');
  expect(sig.turnState(codexV2Recovery).hasV2 === true, 'first turn should record v2 authority');
  sig.typeInput(codexV2Recovery, 'second turn\\r');
  expect(sig.turnState(codexV2Recovery).state === 'pending', 'second submitted turn should start pending');
  expect(sig.turnState(codexV2Recovery).hasV2 === false,
    'new turn must clear prior-turn v2 authority without clearing session history');
  expect(sig.turnState(codexV2Recovery).sequence === 7,
    'new turn must retain the accepted session event sequence');
  expect(sig.turnState(codexV2Recovery).eventIds.includes('codex-event-1'),
    'new turn must retain session event deduplication history');
  sig.feedPtyChunk(codexV2Recovery, titleOsc('\\u2839 codex-v2-recovery'));
  sig.feedPtyChunk(codexV2Recovery, '\\x1b[?25l\\x1b[2K\\r\\x1b[38;5;245m? for shortcuts\\r\\n');
  expect(sig.turnState(codexV2Recovery).state === 'working',
    'partial ANSI-rich idle redraw must not complete early');
  sig.feedPtyChunk(codexV2Recovery, '\\x1b[0m\\x1b[?25h\\u203a ');
  await wait(30); sig.flushRender();
  expect(sig.turnState(codexV2Recovery).state === 'completed',
    'chunk-split ANSI-rich Codex composer redraw should recover missed completion');
  expect(itemsFor('COMPLETED', 'codex-v2-recovery').length === 1,
    'recovered second turn should project the existing completed attention state');
  expect(sig.turnState(codexV2Recovery).source === 'codex:terminal-idle'
    && sig.turnState(codexV2Recovery).confidence === 'low',
    'rendered-composer recovery should retain low-confidence diagnostics');

  const alternateFooter = sig.addTerminalSession({ name: 'codex-alt-footer', agent: 'codex' });
  sig.focus(holder);
  sig.typeInput(alternateFooter, 'alternate footer\\r');
  sig.feedPtyChunk(alternateFooter, 'Working without an idle composer\\r\\n');
  sig.feedPtyChunk(alternateFooter, '\\u203a \\x1b[s\\r\\n? for shortcuts\\x1b[u');
  await wait(30); sig.flushRender();
  expect(sig.turnState(alternateFooter).state === 'completed',
    'Codex footer rendered below a saved composer cursor should recover completion');

  const liveComposer = sig.addTerminalSession({ name: 'codex-live-composer', agent: 'codex' });
  sig.focus(holder);
  sig.typeInput(liveComposer, 'keep composer visible\\r');
  sig.feedPtyChunk(liveComposer, '? for shortcuts\\r\\n\\u203a \\x1b[s\\r\\nRunning tests...\\x1b[u');
  await wait(30); sig.flushRender();
  expect(sig.turnState(liveComposer).state === 'working',
    'a composer that remains rendered immediately after submission must not complete live work');

  const falseGlyph = sig.addTerminalSession({ name: 'codex-false-glyph', agent: 'codex' });
  sig.focus(holder);
  sig.typeInput(falseGlyph, 'keep running\\r');
  sig.feedPtyChunk(falseGlyph, '\\r\\n\\u203a ');
  await wait(30); sig.flushRender();
  expect(sig.turnState(falseGlyph).state === 'pending',
    'a prompt glyph without Codex chrome or meaningful activity must remain pending');

  const staleComposer = sig.addTerminalSession({ name: 'codex-stale-composer', agent: 'codex' });
  sig.focus(holder);
  sig.typeInput(staleComposer, 'first request\\r');
  const staleGeneration = sig.turnState(staleComposer).generation;
  sig.feedPtyChunk(staleComposer, '? for shortcuts\\r\\n\\u203a ');
  sig.typeInput(staleComposer, 'second request\\r');
  await wait(30); sig.flushRender();
  expect(sig.turnState(staleComposer).state === 'pending'
    && sig.turnState(staleComposer).generation === staleGeneration + 1,
    'a prior turn composer callback must not resolve newly submitted input');

  const activeCodex = sig.addTerminalSession({ name: 'codex-active', agent: 'codex' });
  sig.typeInput(activeCodex, 'keep working\\r');
  sig.feedPtyChunk(activeCodex, '\\x1b[32mRunning tests and editing files...\\x1b[0m\\r\\n');
  await wait(30); sig.flushRender();
  expect(sig.turnState(activeCodex).state === 'working',
    'active Codex output without an idle composer must continue working');

  const beforeLate = JSON.stringify(sig.turnState(codexV2Recovery));
  sig.feedPtyChunk(codexV2Recovery, oscV2({
    ...codexBase, event: 'turn-completed', eventId: 'codex-event-late', sequence: 6,
    timestamp: Date.now() + 20,
  }));
  expect(JSON.stringify(sig.turnState(codexV2Recovery)) === beforeLate,
    'late completion with a stale sequence must not mutate the recovered turn');

  // 4 — control input and unsubmitted typing cannot start a turn.
  const idleInputs = [
    ['focus-in', '\\x1b[I'],
    ['focus-out', '\\x1b[O'],
    ['arrow-up', '\\x1b[A'],
    ['arrow-down', '\\x1b[B'],
    ['arrow-right', '\\x1b[C'],
    ['arrow-left', '\\x1b[D'],
    ['tab', '\\t'],
    ['mouse', '\\x1b[<0;12;8M'],
    ['unsubmitted typing', 'draft response'],
  ];
  const idleCodex = sig.addFakeSession({ name: 'codex-idle-inputs', agent: 'codex' });
  for (const [label, input] of idleInputs) {
    sig.typeInput(a, input);
    expect(sig.turnState(a).state === 'completed', label + ' must preserve an unseen completed turn');
    expect(itemsFor('COMPLETED', 'claude-a').length === 1,
      label + ' must preserve completed attention');
    sig.typeInput(idleCodex, input);
    expect(sig.turnState(idleCodex).state === 'unknown',
      label + ' must not infer a new Codex turn without submission');
  }
  sig.typeInput(b, 'approval response');
  expect(sig.turnState(b).state === 'needsInput', 'unsubmitted typing must preserve a waiting turn');

  // Submitted answers resume work; stale text cannot resurrect COMPLETED.
  sig.typeInput(a, 'y\\r');
  expect(sig.turnState(a).state === 'working', 'submitted user input after completed → working');
  expect(itemsFor('COMPLETED', 'claude-a').length === 0, 'COMPLETED item gone after typing');
  sig.typeInput(codexDone, 'resume from idle\\r');
  expect(sig.turnState(codexDone).state === 'pending', 'submitted Codex input after idle → pending');
  sig.feedPtyChunk(a, 'done! all set.\\r\\n');
  expect(sig.turnState(a).state === 'working', 'stale phrases must not resurrect completion');
  expect(itemsFor('COMPLETED', 'claude-a').length === 0, 'no resurrection in the queue either');

  // 5 — focus hides, blur re-shows, DISMISS acknowledges without deleting.
  expect(itemsFor('INPUT NEEDED', 'claude-b').length === 1, 'background needsInput visible');
  sig.focus(b);
  expect(itemsFor('INPUT NEEDED', 'claude-b').length === 1,
    'focused live needsInput should remain visible');
  expect(sig.turnState(b).state === 'needsInput', 'focus must not touch turn state');
  sig.focus(holder);
  expect(itemsFor('INPUT NEEDED', 'claude-b').length === 1, 'item reappears on blur');
  sig.dismissItem('INPUT NEEDED', 'claude-b');
  expect(sig.turnState(b).acknowledged === true, 'DISMISS sets acknowledged');
  expect(sig.turnState(b).state === 'needsInput', 'DISMISS never deletes state');

  const focusedActionCases = [
    ['focused-input', 'input-needed', 'INPUT NEEDED', ['FOCUS', 'DISMISS', 'DONE', 'SNOOZE']],
    ['focused-permission', 'permission-required', 'PERMISSION', ['FOCUS', 'DONE', 'SNOOZE']],
    ['focused-auth', 'authentication-required', 'AUTH REQUIRED', ['FOCUS', 'DONE', 'SNOOZE']],
    ['focused-rate-limit', 'rate-limited', 'RATE LIMITED', ['FOCUS', 'DONE', 'SNOOZE']],
    ['focused-tool-failure', 'tool-failed', 'TOOL FAILED', ['FOCUS', 'DONE', 'SNOOZE']],
  ];
  for (const [name, event, kind, actions] of focusedActionCases) {
    const id = sig.addFakeSession({ name, agent: 'claude' });
    sig.focus(id);
    sig.emitSignal(id, event, kind + ' detail');
    const item = itemsFor(kind, name)[0];
    expect(item && JSON.stringify(item.actions) === JSON.stringify(actions),
      name + ' should retain its focused label and actions: ' + JSON.stringify(item));
  }
  const focusedSuppressed = sig.addFakeSession({ name: 'focused-suppressed', agent: 'claude', queue: [
    { url: 'http://localhost:4555', source: 'TERM', reason: 'Focused queue', ts: Date.now() },
  ], attentionRecords: [
    { id: 'attention:permission:focused-history', type: 'permission', detail: 'Historical action', occurredAt: Date.now() - 1000 },
  ] });
  sig.focus(focusedSuppressed);
  expect(itemsFor('QUEUE 1', 'focused-suppressed').length === 0
    && itemsFor('PERMISSION', 'focused-suppressed').length === 0,
  'focused browser queues and restored historical records should remain suppressed');
  sig.emitSignal(focusedSuppressed, 'turn-end', 'Focused completion');
  expect(itemsFor('COMPLETED', 'focused-suppressed').length === 0,
    'focused completion should remain suppressed');
  expect(itemsFor('INPUT NEEDED', 'claude-b').length === 0, 'acknowledged item hidden');

  // 6 — bare shell fed prompt-glyph/approval text: never agent attention.
  const shell = sig.addFakeSession({ name: 'shell', agent: '' });
  sig.feedPtyChunk(shell, '$ sudo make install\\r\\nContinue? y/n\\r\\n\\u276f ');
  await wait(850);
  sig.flushRender();
  expect(sig.turnState(shell).state === 'unknown', 'shell text/prompt glyph must not signal');
  expect(itemsFor('INPUT NEEDED', 'shell').length === 0, 'no agent attention for shell session');

  // 7 — malformed and wrong-session-id OSC → signal-rejected, no state change.
  const beforeB = JSON.stringify(sig.turnState(b));
  sig.feedPtyChunk(b, '\\x1b]777;chromux;v1;not-real;' + b + '\\x07');
  expect(JSON.stringify(sig.turnState(b)) === beforeB, 'malformed signal must not mutate state');
  sig.feedPtyChunk(b, osc('turn-end', 'someone-else'));
  expect(JSON.stringify(sig.turnState(b)) === beforeB, 'foreign-id signal must not mutate state');
  const rejected = sig.events().filter((e) => e.type === 'signal-rejected');
  expect(rejected.length >= 3, 'wrong-token, malformed, and foreign-id signals recorded as signal-rejected');
  expect(rejected.some((e) => e.claimedSessionId === null), 'malformed signal recorded without claimed session');
  expect(rejected.some((e) => e.claimedSessionId === 'someone-else'),
    'foreign-id signal recorded with claimed session');

  // 8 — attention labels share the tab's dynamic terminal title and stay live.
  const titled = sig.addFakeSession({ name: 'session-3', agent: 'codex' });
  sig.feedPtyChunk(titled, titleOsc('chromux'));
  sig.emitSignal(titled, 'turn-end');
  expect(itemsFor('COMPLETED', 'chromux').length === 1,
    'attention item should use the same dynamic label as the session tab');
  expect(itemsFor('COMPLETED', 'session-3').length === 0,
    'attention item should not retain the launch name after a terminal title arrives');
  sig.feedPtyChunk(titled, titleOsc('chromux renamed'));
  expect(itemsFor('COMPLETED', 'chromux renamed').length === 1,
    'visible attention item should update when the terminal title changes');

  // Exited sessions: dead dot only, never a queue item.
  sig.exit(shell, 1);
  expect(sig.attentionItems().every((i) => i.kind !== 'EXITED'), 'no EXITED attention items');

  return JSON.stringify({ ok: true, items: sig.attentionItems() });
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
    console.error('TURN_SIGNALS_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('TURN_SIGNALS_RENDERER_OK');
});
