// Chromux — renderer-side agent attention domain.
// Normalizes lifecycle signals into turn state and projects the live triage
// queue from session/update/capture state. DOM actions stay in renderer.js.
'use strict';

(function attachChromuxAttention(global) {
  const TURN_SIGNAL_STATES = {
    'turn-start': 'working',
    'input-needed': 'needsInput',
    'turn-end': 'completed',
  };

  const PRIORITIES = {
    input: 10,
    delivery: 20,
    updateReady: 30,
    updateFailed: 30,
    updateRunning: 35,
    queue: 40,
    completed: 50,
    updateWaiting: 60,
  };

  function applyTurnSignal(turn, signal, detail, now) {
    const next = TURN_SIGNAL_STATES[signal];
    if (!turn || !next) return false;
    turn.state = next;
    turn.instrumented = true;
    turn.detail = detail || null;
    turn.since = now;
    turn.acknowledged = false;
    return true;
  }

  function applyUserInputTurnTransition(session, input, now) {
    const turn = session && session.turn;
    if (!turn) return false;
    if (turn.state === 'needsInput' || turn.state === 'completed') {
      turn.state = 'working';
      turn.detail = null;
      turn.since = now;
      turn.acknowledged = false;
      return true;
    }
    if (session.agent === 'codex' && turn.state === 'unknown' && /\r/.test(input || '')) {
      turn.state = 'working';
      turn.since = now;
      turn.acknowledged = false;
      return true;
    }
    return false;
  }

  function applyCodexOutputCompletionFallback(session, output, now) {
    const turn = session && session.turn;
    if (!turn || session.agent !== 'codex' || turn.state !== 'working') return false;
    const text = String(output || '');
    const reachedIdle = /(?:^|\n)\s*(?:›|❯|>)\s*$/.test(text)
      || /(?:rate limit|usage limit|limit resets|try again later|wait until)/i.test(text);
    if (!reachedIdle) return false;
    turn.state = 'completed';
    turn.detail = 'Codex turn finished';
    turn.since = now;
    turn.acknowledged = false;
    return true;
  }

  function sessionUpdateSafety(session) {
    if (!session || !session.lifecycle || !session.lifecycle.alive) {
      return { safe: true, reason: 'exited' };
    }
    const turnState = session.turn ? session.turn.state : 'unknown';
    if (turnState === 'needsInput') return { safe: true, reason: 'waiting for input' };
    if (turnState === 'completed') return { safe: true, reason: 'completed' };
    return {
      safe: false,
      reason: turnState === 'working' ? 'agent turn in progress' : 'live work state unknown',
    };
  }

  function priorityFor(type) {
    return PRIORITIES[type] || 100;
  }

  function scopedItem({ type, kind, session, detail, cls, primaryAction, createdAt, acknowledged, captureId }) {
    return {
      id: captureId ? `${type}:${captureId}` : `${type}:${session.id}`,
      type,
      kind,
      scope: 'session',
      sessionId: session.id,
      captureId: captureId || null,
      detail,
      cls,
      priority: priorityFor(type),
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      acknowledged: Boolean(acknowledged),
      primaryAction,
    };
  }

  function updateItem({ type, kind, detail, cls, primaryAction, createdAt }) {
    return {
      id: `update:${type}`,
      type,
      kind,
      scope: 'global',
      sessionId: null,
      detail,
      cls,
      priority: priorityFor(type),
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      acknowledged: false,
      primaryAction,
    };
  }

  function projectSessionItems(session, activeId) {
    if (!session || session.id === activeId) return [];
    if (!session.lifecycle || !session.lifecycle.alive) return [];

    const items = [];
    const queue = session.browser && Array.isArray(session.browser.queue) ? session.browser.queue : [];
    if (queue.length > 0) {
      const next = queue[0];
      items.push(scopedItem({
        type: 'queue',
        kind: `QUEUE ${queue.length}`,
        session,
        detail: next.url,
        cls: 'queue',
        primaryAction: 'OPEN',
        createdAt: next.ts,
      }));
    }

    const turn = session.turn || {};
    if (!turn.acknowledged && turn.state === 'needsInput') {
      items.push(scopedItem({
        type: 'input',
        kind: 'INPUT NEEDED',
        session,
        detail: turn.detail || 'Agent is waiting on your input',
        cls: 'input',
        primaryAction: 'FOCUS',
        createdAt: turn.since,
        acknowledged: turn.acknowledged,
      }));
    }
    if (!turn.acknowledged && turn.state === 'completed') {
      items.push(scopedItem({
        type: 'completed',
        kind: 'COMPLETED',
        session,
        detail: turn.detail || 'Agent turn finished',
        cls: 'completed',
        primaryAction: 'VIEW',
        createdAt: turn.since,
        acknowledged: turn.acknowledged,
      }));
    }
    return items;
  }

  function projectDeliveryItems(captures, sessions, activeId) {
    const items = [];
    for (const rec of captures) {
      if (!rec || rec.status !== 'failed' || rec.acknowledged) continue;
      const session = sessions.get(rec.targetSessionId || rec.sessionId) || sessions.get(rec.sessionId);
      if (!session || session.id === activeId) continue;
      items.push(scopedItem({
        type: 'delivery',
        kind: 'DELIVERY FAIL',
        session,
        captureId: rec.id,
        detail: `Exit ${rec.exitCode}${rec.error ? ': ' + rec.error : ''}${rec.url ? ' — ' + rec.url : ''}`,
        cls: 'exited',
        primaryAction: 'VIEW',
        createdAt: rec.updatedAt || rec.ts,
        acknowledged: rec.acknowledged,
      }));
    }
    return items;
  }

  function projectUpdateItem(updateQueue, updateStatus, blockers) {
    if (!updateStatus || !updateStatus.updateAvailable || !updateQueue) return null;
    const createdAt = updateQueue.lastAttemptAt || 0;
    if (updateQueue.phase === 'ready') {
      return updateItem({
        type: 'updateReady',
        kind: 'UPDATE READY',
        detail: 'All sessions are safe. Install the update from the managed local source.',
        cls: 'update completed',
        primaryAction: 'INSTALL',
        createdAt,
      });
    }
    if (updateQueue.phase === 'failed') {
      return updateItem({
        type: 'updateFailed',
        kind: 'UPDATE FAILED',
        detail: updateQueue.error || 'Could not install the update. Review details in Settings.',
        cls: 'update exited',
        primaryAction: blockers.length === 0 ? 'RETRY' : 'DETAILS',
        createdAt,
      });
    }
    if (updateQueue.phase === 'running') {
      return updateItem({
        type: 'updateRunning',
        kind: 'UPDATE RUNNING',
        detail: 'Installing the Chromux update.',
        cls: 'update',
        primaryAction: 'DETAILS',
        createdAt,
      });
    }
    if (updateQueue.phase === 'waiting') {
      return updateItem({
        type: 'updateWaiting',
        kind: 'UPDATE WAITING',
        detail: `${blockers.length} live session${blockers.length === 1 ? '' : 's'} must complete, ask for input, or exit before installing the update.`,
        cls: 'update waiting',
        primaryAction: 'FOCUS',
        createdAt,
      });
    }
    return null;
  }

  function projectAttentionItems({ sessions, activeId, captures, updateQueue, updateStatus }) {
    const orderedSessions = Array.from(sessions || []);
    const sessionMap = new Map(orderedSessions.map((session) => [session.id, session]));
    const blockers = orderedSessions
      .map((session) => ({ session, safety: sessionUpdateSafety(session) }))
      .filter((row) => !row.safety.safe);

    const items = [];
    const update = projectUpdateItem(updateQueue, updateStatus, blockers);
    if (update) items.push(update);
    for (const session of orderedSessions) items.push(...projectSessionItems(session, activeId));
    items.push(...projectDeliveryItems(Array.from(captures || []), sessionMap, activeId));

    const sessionOrder = new Map(orderedSessions.map((session, index) => [session.id, index]));
    items.sort((a, b) => (a.priority - b.priority)
      || (a.createdAt - b.createdAt)
      || ((sessionOrder.get(a.sessionId) ?? Number.MAX_SAFE_INTEGER)
        - (sessionOrder.get(b.sessionId) ?? Number.MAX_SAFE_INTEGER))
      || a.id.localeCompare(b.id));
    return items;
  }

  const api = {
    applyTurnSignal,
    applyUserInputTurnTransition,
    applyCodexOutputCompletionFallback,
    projectAttentionItems,
    sessionUpdateSafety,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.chromuxAttention = api;
})(typeof window !== 'undefined' ? window : globalThis);
