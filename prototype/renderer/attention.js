// Chromux — renderer-side agent attention domain.
// Normalizes lifecycle signals into turn state and projects the live triage
// queue from session/update/capture state. DOM actions stay in renderer.js.
'use strict';

(function attachChromuxAttention(global) {
  const TURN_SIGNAL_STATES = {
    'turn-start': 'working',
    'input-needed': 'needsInput',
    'turn-end': 'completed',
    'turn-started': 'working',
    'turn-completed': 'completed',
    'input-required': 'needsInput',
    'permission-required': 'permission',
    'authentication-required': 'authentication',
    'rate-limited': 'rateLimited',
    'tool-failed': 'toolFailed',
  };

  const PRIORITIES = {
    permission: 5,
    authentication: 6,
    input: 10,
    rateLimited: 12,
    toolFailed: 14,
    delivery: 20,
    updateReady: 30,
    updateFailed: 30,
    updateRunning: 35,
    queue: 40,
    completed: 50,
    updateWaiting: 60,
  };

  const V2_EVENTS = new Set(['turn-started', 'turn-completed', 'input-required',
    'permission-required', 'authentication-required', 'rate-limited', 'tool-failed']);
  function resetTurnProtocol(turn, now) {
    turn.protocol = null;
    turn.authoritative = false;
    turn.hasV2 = false;
    turn.inputAt = now;
    turn.reason = null;
    turn.source = null;
    turn.confidence = null;
    turn.turnId = null;
    turn.eventId = null;
    turn.stopped = false;
    turn.authoritativeAt = 0;
  }

  function normalizeTerminalOutput(output) {
    return String(output || '')
      // OSC/DCS/APC strings, including an incomplete string at the buffer end.
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)/g, '')
      .replace(/\x1b[PX^_][\s\S]*?(?:\x1b\\|$)/g, '')
      // CSI and remaining two-byte escape sequences.
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b[@-_]/g, '')
      // A carriage-return redraw starts a fresh visible line for our bounded
      // prompt check. Other C0 controls do not carry composer text.
      .replace(/\r\n?/g, '\n')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  }

  function applyTurnSignal(turn, signal, detail, now, envelope = null) {
    const next = TURN_SIGNAL_STATES[signal];
    if (!turn || !next) return false;
    if (envelope) {
      if (!V2_EVENTS.has(signal)) return false;
      if (turn.inputAt && envelope.timestamp <= turn.inputAt) return false;
      if (turn.eventIds && turn.eventIds.includes(envelope.eventId)) return false;
      if (Number.isFinite(turn.sequence) && envelope.sequence <= turn.sequence) return false;
      if (turn.turnId && envelope.turnId && envelope.turnId !== turn.turnId
        && signal !== 'turn-started') return false;
      if (turn.authoritative && signal === 'turn-started' && envelope.turnId === turn.turnId) return false;
      turn.authoritative = true;
      turn.hasV2 = true;
      turn.protocol = 'v2';
      turn.reason = envelope.reason || null;
      turn.source = envelope.source;
      turn.confidence = envelope.confidence;
      turn.turnId = envelope.turnId || null;
      turn.eventId = envelope.eventId;
      turn.eventIds = [...(turn.eventIds || []).slice(-63), envelope.eventId];
      turn.sequence = envelope.sequence;
      turn.stopped = envelope.stopped;
      turn.authoritativeAt = envelope.timestamp;
    } else if (turn.hasV2) {
      return false;
    } else {
      turn.protocol = 'v1';
      turn.source = 'legacy';
      turn.confidence = 'low';
    }
    turn.state = next;
    turn.instrumented = true;
    turn.detail = (envelope && envelope.message) || detail || null;
    turn.since = next === 'completed'
      ? Math.max(now, (Number(turn.attentionSeenAt) || 0) + 1)
      : now;
    turn.acknowledged = false;
    return true;
  }

  function applyUserInputTurnTransition(session, input, now, submittedLine = '') {
    const turn = session && session.turn;
    if (!turn) return false;
    const submitted = /[\r\n]/.test(input || '');
    if (!submitted) return false;
    if (session.agent === 'codex' && String(submittedLine || '').trim() === '/clear') return false;
    if (['idle', 'needsInput', 'permission', 'authentication', 'rateLimited', 'toolFailed', 'completed'].includes(turn.state)) {
      turn.state = 'working';
      turn.detail = null;
      turn.since = now;
      turn.acknowledged = false;
      turn.generation = (Number(turn.generation) || 0) + 1;
      turn.sawBusyRender = false;
      resetTurnProtocol(turn, now);
      return true;
    }
    if (session.agent === 'codex' && turn.state === 'unknown') {
      turn.state = 'working';
      turn.detail = null;
      turn.since = now;
      turn.acknowledged = false;
      turn.generation = (Number(turn.generation) || 0) + 1;
      turn.sawBusyRender = false;
      resetTurnProtocol(turn, now);
      return true;
    }
    if (session.agent === 'codex' && turn.state === 'working') {
      turn.detail = null;
      turn.since = now;
      turn.acknowledged = false;
      turn.generation = (Number(turn.generation) || 0) + 1;
      turn.sawBusyRender = false;
      resetTurnProtocol(turn, now);
      return true;
    }
    return false;
  }

  function consumeCompletedTurn(turn, now) {
    if (!turn || turn.state !== 'completed') return false;
    turn.state = 'idle';
    turn.detail = null;
    turn.since = now;
    turn.acknowledged = false;
    return true;
  }

  function applyCodexRenderedCompletionFallback(session, rendered, now) {
    const turn = session && session.turn;
    if (!turn || session.agent !== 'codex' || turn.state !== 'working') return false;
    const cursorLine = normalizeTerminalOutput(rendered && rendered.cursorLine).trimEnd();
    const nearbyLines = Array.isArray(rendered && rendered.nearbyLines)
      ? rendered.nearbyLines.map((line) => normalizeTerminalOutput(line)) : [];
    const composerAtCursor = /^\s*[›❯]\s*$/.test(cursorLine);
    const codexChrome = nearbyLines.some((line) => /(?:\?\s+for shortcuts|\bcontext left\b|^\s*Choose an option:)/i.test(line));
    const rateLimitChooser = nearbyLines.some((line) => /^\s*Choose an option:/i.test(line))
      && nearbyLines.some((line) => /Wait until the rate limit resets/i.test(line));
    if (!composerAtCursor || !codexChrome) {
      turn.sawBusyRender = true;
      return false;
    }
    if (!rateLimitChooser && !turn.sawBusyRender) return false;
    turn.state = 'completed';
    turn.detail = 'Codex turn finished';
    turn.since = Math.max(now, (Number(turn.attentionSeenAt) || 0) + 1);
    turn.acknowledged = false;
    turn.protocol = 'output';
    turn.source = 'codex:terminal-idle';
    turn.confidence = 'low';
    turn.stopped = rateLimitChooser;
    return true;
  }

  function sessionUpdateSafety(session) {
    if (!session || !session.lifecycle || !session.lifecycle.alive) {
      return { safe: true, reason: 'exited' };
    }
    const turnState = session.turn ? session.turn.state : 'unknown';
    if (turnState === 'needsInput') return { safe: true, reason: 'waiting for input' };
    if (turnState === 'permission') return { safe: true, reason: 'waiting for permission' };
    if (turnState === 'authentication') return { safe: true, reason: 'waiting for authentication' };
    if (turnState === 'rateLimited' || turnState === 'toolFailed') {
      return session.turn.stopped
        ? { safe: true, reason: turnState === 'rateLimited' ? 'rate limited and stopped' : 'tool failed and stopped' }
        : { safe: false, reason: 'nonterminal agent failure' };
    }
    if (turnState === 'completed') return { safe: true, reason: 'completed' };
    if (turnState === 'idle') return { safe: true, reason: 'idle' };
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
      const detail = next.reason ? `${next.reason}: ${next.url}` : next.url;
      items.push(scopedItem({
        type: 'queue',
        kind: `QUEUE ${queue.length}`,
        session,
        detail,
        cls: 'queue',
        primaryAction: 'OPEN',
        createdAt: next.ts,
      }));
    }

    const turn = session.turn || {};
    const actionable = {
      permission: ['permission', 'PERMISSION', 'Permission required'],
      authentication: ['authentication', 'AUTH REQUIRED', 'Authentication required'],
      needsInput: ['input', 'INPUT NEEDED', 'Agent is waiting on your input'],
      rateLimited: ['rateLimited', 'RATE LIMITED', 'Agent rate limited'],
      toolFailed: ['toolFailed', 'TOOL FAILED', 'Agent tool failed'],
    };
    if (!turn.acknowledged && actionable[turn.state]) {
      const [type, kind, fallback] = actionable[turn.state];
      items.push(scopedItem({ type, kind, session, detail: turn.detail || fallback,
        cls: type, primaryAction: 'FOCUS', createdAt: turn.since, acknowledged: false }));
    }
    if (!turn.acknowledged && turn.state === 'completed'
      && (Number(turn.since) || 0) > (Number(turn.attentionSeenAt) || 0)) {
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
      const canExecute = Boolean(updateStatus.managedInstall && updateStatus.managedInstall.available);
      return updateItem({
        type: 'updateReady',
        kind: 'UPDATE READY',
        detail: 'All sessions are safe. Install the update from the managed local source.',
        cls: 'update completed',
        primaryAction: canExecute ? 'EXECUTE' : 'DETAILS',
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
      const canExecute = Boolean(updateStatus.managedInstall && updateStatus.managedInstall.available);
      return updateItem({
        type: 'updateWaiting',
        kind: 'UPDATE WAITING',
        detail: `${blockers.length} live session${blockers.length === 1 ? '' : 's'} must complete, ask for input, or exit before installing the update.`,
        cls: 'update waiting',
        primaryAction: canExecute ? 'EXECUTE' : 'DETAILS',
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

  function projectSessionStatus(session, activityIndicators = true) {
    if (!session || !session.lifecycle || !session.lifecycle.alive) {
      return { kind: 'dead', icon: '', label: 'Exited', status: 'Session exited' };
    }
    const turnState = session.turn && session.turn.state;
    if (['needsInput', 'permission', 'authentication', 'rateLimited', 'toolFailed'].includes(turnState)) {
      return { kind: 'action', icon: '!', label: 'Action required', status: 'Action required' };
    }
    if (activityIndicators && turnState === 'working') {
      return { kind: 'working', icon: '', label: 'Working', status: 'Agent working' };
    }
    if (activityIndicators && turnState === 'completed') {
      return { kind: 'completed', icon: '✓', label: 'Completed', status: 'Turn completed' };
    }
    if (activityIndicators && turnState === 'idle') {
      return { kind: 'idle', icon: '', label: 'Idle', status: 'Agent idle' };
    }
    return { kind: 'live', icon: '', label: 'Live', status: 'Session live' };
  }

  function projectAttentionDiagnostic({ session, sessions, activeId, captures, updateQueue,
    updateStatus, activityIndicators = true }) {
    if (!session) return null;
    const projected = projectAttentionItems({ sessions, activeId, captures, updateQueue, updateStatus });
    const sessionItems = projected.filter((item) => item.sessionId === session.id);
    let suppression = null;
    if (session.id === activeId) suppression = 'active-session';
    else if (!session.lifecycle || !session.lifecycle.alive) suppression = 'exited';
    else if (session.turn && session.turn.acknowledged
      && ['completed', 'needsInput', 'permission', 'authentication', 'rateLimited', 'toolFailed'].includes(session.turn.state)) {
      suppression = 'acknowledged';
    } else if (session.turn && session.turn.state === 'completed'
      && (Number(session.turn.since) || 0) <= (Number(session.turn.attentionSeenAt) || 0)) {
      suppression = 'seen-completion';
    } else if (sessionItems.length === 0) suppression = 'no-actionable-state';
    return {
      expectedItem: sessionItems[0] || null,
      suppression,
      safety: sessionUpdateSafety(session),
      expectedTabIndicator: projectSessionStatus(session, activityIndicators).kind,
      projectedKinds: sessionItems.map((item) => item.kind),
      projectedOrder: projected.map((item) => item.id),
      queueCount: session.browser && Array.isArray(session.browser.queue) ? session.browser.queue.length : 0,
      queueHead: session.browser && Array.isArray(session.browser.queue) && session.browser.queue[0]
        ? session.browser.queue[0].url : null,
      updatePhase: updateQueue && updateQueue.phase || 'idle',
    };
  }

  const api = {
    applyTurnSignal,
    applyUserInputTurnTransition,
    consumeCompletedTurn,
    applyCodexRenderedCompletionFallback,
    projectSessionStatus,
    projectAttentionItems,
    projectAttentionDiagnostic,
    sessionUpdateSafety,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.chromuxAttention = api;
})(typeof window !== 'undefined' ? window : globalThis);
