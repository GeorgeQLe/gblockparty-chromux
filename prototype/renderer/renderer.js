// Chromux v1 — renderer. Sessions (xterm ↔ pty), 1:1 paired browser panes,
// preview detection, review queue, element picker, capture → claude -p.
'use strict';

/* global Terminal, FitAddon */

const $ = (sel) => document.querySelector(sel);

const state = {
  sessions: new Map(), // id -> session
  activeId: null,
  counter: 0,
  env: null,
  captures: new Map(), // captureId -> CaptureRecord
  deliveryIndex: new Map(), // deliveryId -> captureId
  events: [], // ring buffer of applied events (diagnostics), max EVENT_RING_MAX
  ui: {
    captureModal: null, // { captureId, pngBase64, payloadBase } while composing/delivering
    dirty: new Set(),
    rafScheduled: false,
    lastQueueShortcutFocus: null,
  },
  lastCwd: null,
  contextMenu: null,
  updateStatus: null,
  detect: null, // last external-terminal scan
  detectQuery: '',
  restoreSessions: null,
  restoreWarningDismissed: false,
  lifecyclePrompt: null,
  testInstallUpdateResult: null,
  updateQueue: {
    phase: 'idle',
    error: null,
    output: '',
    lastAttemptAt: null,
  },
};

const BOUNDS = {
  consoleTail: 50,
  consoleMsgChars: 500,
  outerHtmlChars: 8000,
  reloadThrottleMs: 3000,
};

// ───────────────────────────────────────────────────────────────────────────
// Terminal theme (matches the flight-deck palette)
// ───────────────────────────────────────────────────────────────────────────

const TERM_THEME = {
  background: '#08090c',
  foreground: '#c7d1dd',
  cursor: '#ffb454',
  cursorAccent: '#08090c',
  selectionBackground: 'rgba(255,180,84,0.25)',
  black: '#1d232e', brightBlack: '#3d4756',
  red: '#f2707c', brightRed: '#ff8a94',
  green: '#63d98b', brightGreen: '#8af0ab',
  yellow: '#ffb454', brightYellow: '#ffcf8a',
  blue: '#5fc6ff', brightBlue: '#8ad6ff',
  magenta: '#d2a6ff', brightMagenta: '#e2c4ff',
  cyan: '#73e0d8', brightCyan: '#98f0e9',
  white: '#c7d1dd', brightWhite: '#eef3f8',
};

// ───────────────────────────────────────────────────────────────────────────
// Preview detection — scan complete terminal lines for localhost URLs and
// local .html paths (idea-brief wedge #1 and #2).
// ───────────────────────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[@-_]/g;
// Requires a port or a path after the host — a bare "http://localhost" is
// almost always a soft-wrapped fragment of a longer URL, not a dev server.
const LOCALHOST_URL_START_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/gi;
const HTMLFILE_RE = /(?:file:\/\/)?(\/(?:[^\s"'<>:*?]+\/)*[^\s"'<>:*?]+\.html?)\b/gi;
const UPDATE_QUEUE_PHASES = new Set(['idle', 'waiting', 'ready', 'running', 'failed']);

function stripTerminalControlsForPreview(raw) {
  return String(raw || '')
    .replace(ANSI_RE, ' ')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ');
}

function normalizePreviewUrl(raw) {
  let url = String(raw || '');
  url = url.replace(/[.,;)\]]+$/, '');
  url = url.replace('://0.0.0.0', '://localhost').replace('://[::1]', '://localhost');
  return url;
}

function terminalTokenEnd(line, start) {
  let i = start;
  while (i < line.length) {
    if (/[\s"'<>)\]]/.test(line[i]) && !line.slice(start, i + 1).match(/^https?:\/\/\[[^\]]+\]$/i)) break;
    i += 1;
  }
  return i;
}

function localhostPreviewAt(line, start) {
  const tokenEnd = terminalTokenEnd(line, start);
  const token = line.slice(start, tokenEnd);
  if (!token) return null;
  if (/[›❯]/.test(token) || /https?:\/\//i.test(token.slice(1))) {
    return { url: null, end: tokenEnd };
  }

  const host = token.match(/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i);
  if (!host) return null;

  let cursor = host[0].length;
  if (token[cursor] === ':') {
    const portStart = cursor + 1;
    let portEnd = portStart;
    while (/\d/.test(token[portEnd] || '')) portEnd += 1;
    if (portEnd === portStart) return null;
    cursor = portEnd;
    if (token[cursor] === '/') cursor = token.length;
    else if (cursor !== token.length) return { url: null, end: tokenEnd };
  } else if (token[cursor] === '/') {
    cursor = token.length;
  } else {
    return null;
  }

  const url = normalizePreviewUrl(token.slice(0, cursor));
  return url ? { url, end: tokenEnd } : { url: null, end: tokenEnd };
}

function scanLineForPreviews(line) {
  const found = [];
  let m;
  LOCALHOST_URL_START_RE.lastIndex = 0;
  while ((m = LOCALHOST_URL_START_RE.exec(line)) !== null) {
    const hit = localhostPreviewAt(line, m.index);
    if (hit && hit.end > m.index) LOCALHOST_URL_START_RE.lastIndex = hit.end;
    if (hit && hit.url) found.push({ url: hit.url, source: 'TERM' });
  }
  HTMLFILE_RE.lastIndex = 0;
  while ((m = HTMLFILE_RE.exec(line)) !== null) {
    found.push({ url: 'file://' + encodeURI(m[1]).replace(/#/g, '%23'), source: 'FILE' });
  }
  return found;
}

function trackTypedPreviewSuppressions(session, data) {
  if (!session || !data) return;
  const hits = scanLineForPreviews(stripTerminalControlsForPreview(data))
    .filter((hit) => hit.source === 'TERM');
  if (hits.length === 0) return;
  const suppress = session.term.previewSuppress;
  for (const hit of hits) suppress.set(hit.url, (suppress.get(hit.url) || 0) + 1);
}

function consumeTypedPreviewSuppression(session, url, source) {
  if (!session || source !== 'TERM') return false;
  const suppress = session.term.previewSuppress;
  const count = suppress.get(url) || 0;
  if (count <= 0) return false;
  if (count === 1) suppress.delete(url);
  else suppress.set(url, count - 1);
  return true;
}

function feedDetector(session, chunk) {
  const t = session.term;
  t.lineBuf += chunk;
  const parts = t.lineBuf.split(/\r?\n|\r/);
  t.lineBuf = parts.pop() || '';
  if (t.lineBuf.length > 2048) t.lineBuf = t.lineBuf.slice(-2048);
  for (const rawLine of parts) {
    const line = stripTerminalControlsForPreview(rawLine);
    if (!line) continue;
    for (const hit of scanLineForPreviews(line)) {
      if (hit.source === 'FILE') {
        // Soft-wrapped terminal lines can split a long path into a shorter,
        // still-plausible one — only route paths that exist on disk.
        const p = decodeURIComponent(hit.url.replace(/^file:\/\//, ''));
        window.chromux.fileExists(p).then((ok) => {
          if (ok) routePreview(session, hit.url, hit.source);
        });
      } else {
        routePreview(session, hit.url, hit.source);
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Terminal links — ⌘-click (ctrl-click) a URL or .html path in the terminal
// to open it in the paired browser pane. Detects http(s) URLs plus absolute,
// ~/, and cwd-relative .html paths; paths must exist on disk to become links.
// ───────────────────────────────────────────────────────────────────────────

const LINK_URL_RE = /https?:\/\/[^\s"'<>\[\]{}]+/g;
const LINK_ABS_HTML_RE = /(?:file:\/\/)?(\/(?:[^\s"'<>:*?]+\/)*[^\s"'<>:*?]+\.html?)\b/gi;
const LINK_REL_HTML_RE = /(?:^|[\s"'`(=])((?:~\/|\.{1,2}\/)?(?:[\w.@+-]+\/)*[\w.@+-]+\.html?)\b/gi;

function normalizeLocalPath(p) {
  const parts = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

function fileUrlFor(p) {
  return 'file://' + encodeURI(p).replace(/#/g, '%23');
}

// Assemble the logical (unwrapped) line containing bufferRow. Each buffer row
// contributes exactly term.cols chars so string index i maps back to cell
// (i % cols, startRow + i / cols) — wide glyphs skew this, but links are ASCII.
function logicalLineAt(term, bufferRow) {
  const buffer = term.buffer.active;
  let start = bufferRow;
  while (start > 0) {
    const line = buffer.getLine(start);
    if (!line || !line.isWrapped) break;
    start -= 1;
  }
  let end = bufferRow;
  while (end + 1 < buffer.length) {
    const next = buffer.getLine(end + 1);
    if (!next || !next.isWrapped) break;
    end += 1;
  }
  let text = '';
  for (let y = start; y <= end; y += 1) {
    const line = buffer.getLine(y);
    text += line ? line.translateToString(false) : '';
  }
  return { start, text };
}

function registerTerminalLinks(session) {
  session.term.term.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) {
      const term = session.term.term;
      const row = bufferLineNumber - 1;
      if (!term.buffer.active.getLine(row)) {
        callback(undefined);
        return;
      }
      const { start, text } = logicalLineAt(term, row);
      const cols = term.cols;
      const home = state.env ? state.env.home : null;

      const candidates = [];
      const overlaps = (a, b) => a.index < b.index + b.text.length && b.index < a.index + a.text.length;
      const push = (index, matchText, kind, resolve) => {
        candidates.push({ index, text: matchText, kind, resolve });
      };
      const resolveFile = (p) => {
        let abs = p;
        if (p.startsWith('~/')) {
          if (!home) return Promise.resolve(null);
          abs = home + p.slice(1);
        } else if (!p.startsWith('/')) {
          abs = session.cwd + '/' + p;
        }
        abs = normalizeLocalPath(abs);
        return window.chromux.fileExists(abs).then((ok) => (ok ? fileUrlFor(abs) : null));
      };

      let m;
      LINK_URL_RE.lastIndex = 0;
      while ((m = LINK_URL_RE.exec(text)) !== null) {
        const cleaned = normalizePreviewUrl(m[0]);
        push(m.index, cleaned, 'url', () => Promise.resolve(cleaned));
      }
      LINK_ABS_HTML_RE.lastIndex = 0;
      while ((m = LINK_ABS_HTML_RE.exec(text)) !== null) {
        const p = m[1];
        push(m.index, m[0], 'file', () => resolveFile(p));
      }
      LINK_REL_HTML_RE.lastIndex = 0;
      while ((m = LINK_REL_HTML_RE.exec(text)) !== null) {
        const p = m[1];
        push(m.index + m[0].indexOf(p), p, 'file', () => resolveFile(p));
      }

      Promise.all(candidates.map(async (c) => {
        try { c.url = await c.resolve(); } catch { c.url = null; }
      })).then(() => {
        // Overlap resolution happens only among candidates that resolved, so a
        // bogus absolute suffix (the "/index.html" inside "alignment/index.html")
        // can't shadow the real relative path. URLs win over file paths (a path
        // inside "http://host/x.html" stays part of the URL), then longer text.
        const resolved = candidates.filter((c) => c.url);
        resolved.sort((a, b) => (a.kind !== b.kind
          ? (a.kind === 'url' ? -1 : 1)
          : b.text.length - a.text.length));
        const claimed = [];
        const links = [];
        for (const c of resolved) {
          if (claimed.some((s) => overlaps(s, c))) continue;
          claimed.push(c);
          const endIndex = c.index + c.text.length - 1;
          const url = c.url;
          links.push({
            text: c.text,
            range: {
              start: { x: (c.index % cols) + 1, y: start + Math.floor(c.index / cols) + 1 },
              end: { x: (endIndex % cols) + 1, y: start + Math.floor(endIndex / cols) + 1 },
            },
            decorations: { pointerCursor: true, underline: true },
            activate(event) {
              // Plain clicks stay with the terminal app (mouse-mode TUIs); only
              // ⌘/ctrl-click routes to the paired pane.
              if (!event.metaKey && !event.ctrlKey) return;
              event.preventDefault();
              openInPane(session, url);
            },
          });
        }
        links.sort((a, b) => (a.range.start.y - b.range.start.y) || (a.range.start.x - b.range.start.x));
        callback(links);
      });
    },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Event seam — domain state mutates only inside apply(); every applied event
// lands in a bounded ring buffer (state.events) for diagnosis, then dirty UI
// areas are invalidated and coalesced into one rAF flush.
// ───────────────────────────────────────────────────────────────────────────

const EVENT_RING_MAX = 500;

function recordEvent(event) {
  // Keystroke payloads and bulky blobs stay out of the diagnostic ring.
  const { data, patch, ...rest } = event;
  state.events.push({ ...rest, ts: Date.now() });
  if (state.events.length > EVENT_RING_MAX) {
    state.events.splice(0, state.events.length - EVENT_RING_MAX);
  }
}

function captureRecordOf(event) {
  return event.captureId ? state.captures.get(event.captureId) : null;
}

function apply(event) {
  const session = event.sessionId ? state.sessions.get(event.sessionId) : null;
  let recorded = false;
  switch (event.type) {
    case 'turn-signal':
      if (session) {
        window.chromuxAttention.applyTurnSignal(session.turn, event.signal, event.detail, Date.now());
      }
      break;
    case 'user-input':
      // Only state-changing input is worth ring space — raw typing is noise.
      recorded = true;
      if (session) trackTypedPreviewSuppressions(session, event.data);
      if (session && window.chromuxAttention.applyUserInputTurnTransition(session, event.data, Date.now())) {
        recordEvent({ type: 'user-input', sessionId: session.id, turnState: session.turn.state });
      }
      break;
    case 'session-exited':
      if (session) {
        session.lifecycle.alive = false;
        session.lifecycle.exitCode = Number.isFinite(event.exitCode) ? event.exitCode : null;
        session.lifecycle.exitedAt = Date.now();
      }
      break;
    case 'session-focused':
      // Display-only: never touches turn state, so looking at a completed
      // session cannot regress the update queue.
      state.activeId = event.sessionId;
      break;
    case 'attention-dismissed':
      if (session) session.turn.acknowledged = true;
      break;
    case 'preview-queued':
      if (session) session.browser.queue.push({ url: event.url, source: event.source, ts: Date.now() });
      break;
    case 'preview-opened':
    case 'preview-dismissed':
      if (session) session.browser.queue = session.browser.queue.filter((q) => q.url !== event.url);
      break;
    case 'capture-created':
      state.captures.set(event.captureId, {
        id: event.captureId,
        sessionId: event.sessionId,
        targetSessionId: null,
        url: event.url || null,
        status: 'composing',
        payloadPath: null,
        screenshotPath: null,
        deliveryId: null,
        exitCode: null,
        error: null,
        acknowledged: false,
        ts: Date.now(),
        updatedAt: Date.now(),
      });
      break;
    case 'capture-written': {
      const rec = captureRecordOf(event);
      if (rec) {
        rec.status = 'written';
        rec.payloadPath = event.payloadPath || null;
        rec.screenshotPath = event.screenshotPath || null;
        rec.targetSessionId = event.targetSessionId !== undefined ? event.targetSessionId : rec.targetSessionId;
        rec.updatedAt = Date.now();
      }
      break;
    }
    case 'capture-delivering': {
      const rec = captureRecordOf(event);
      if (rec) {
        rec.status = 'delivering';
        rec.deliveryId = event.deliveryId;
        rec.targetSessionId = event.targetSessionId !== undefined ? event.targetSessionId : rec.targetSessionId;
        rec.updatedAt = Date.now();
        state.deliveryIndex.set(event.deliveryId, rec.id);
      }
      break;
    }
    case 'capture-delivered': {
      const rec = captureRecordOf(event);
      if (rec) {
        rec.status = 'delivered';
        rec.exitCode = 0;
        rec.updatedAt = Date.now();
        state.deliveryIndex.delete(rec.deliveryId);
      }
      break;
    }
    case 'capture-failed': {
      const rec = captureRecordOf(event);
      if (rec) {
        rec.status = 'failed';
        rec.exitCode = Number.isFinite(event.exitCode) ? event.exitCode : null;
        rec.error = event.error || null;
        rec.acknowledged = false;
        rec.updatedAt = Date.now();
        state.deliveryIndex.delete(rec.deliveryId);
      }
      break;
    }
    case 'capture-acknowledged': {
      const rec = captureRecordOf(event);
      if (rec) {
        rec.acknowledged = true;
        rec.updatedAt = Date.now();
      }
      break;
    }
    case 'update-queue-phase':
      state.updateQueue = { ...state.updateQueue, ...event.patch, phase: event.phase };
      reconcileUpdateQueue();
      break;
    case 'update-queue-dismissed':
      state.updateQueue = {
        ...state.updateQueue,
        phase: 'idle',
        error: null,
        output: '',
      };
      break;
    case 'signal-rejected':
    case 'session-created':
    case 'session-closed':
      break; // ring-buffer records only
    default:
      break;
  }
  if (!recorded) recordEvent(event);
  invalidate('attention', 'update', 'badges', 'captureChips');
}

// ───────────────────────────────────────────────────────────────────────────
// Render coalescing — invalidate() marks areas dirty and schedules one rAF;
// flushRender() is exported to tests for synchronous flushing.
// ───────────────────────────────────────────────────────────────────────────

function invalidate(...areas) {
  for (const area of areas) state.ui.dirty.add(area);
  if (state.ui.rafScheduled) return;
  state.ui.rafScheduled = true;
  requestAnimationFrame(() => flushRender());
}

function flushRender() {
  state.ui.rafScheduled = false;
  const dirty = state.ui.dirty;
  if (dirty.size === 0) return;
  state.ui.dirty = new Set();
  if (dirty.has('update')) renderUpdateControls();
  if (dirty.has('attention')) renderAttentionQueue();
  if (dirty.has('badges')) updateBadges();
  if (dirty.has('captureChips')) renderCaptureChips();
}

// ───────────────────────────────────────────────────────────────────────────
// Session shape — explicit state domains. Identity is flat and immutable;
// lifecycle, turn, browser-pane, and terminal state live in their own domains.
// ───────────────────────────────────────────────────────────────────────────

function newSessionShape({ id, name, cwd, agent }) {
  return {
    id, name, cwd, agent,
    lifecycle: { alive: true, exitCode: null, exitedAt: null },
    turn: {
      state: 'unknown', // 'unknown' | 'working' | 'needsInput' | 'completed'
      instrumented: false, // true once a deterministic signal has arrived
      detail: null,
      since: 0,
      acknowledged: false, // explicit DISMISS — hides the item, keeps the state
    },
    browser: {
      webview: null, webContentsId: null, currentUrl: null, lastReload: 0,
      queue: [], consoleBuf: [], consoleTotal: 0, picking: false,
      collapsed: false,
      expandedGridTemplate: 'minmax(320px, 46%) 6px minmax(360px, 1fr)',
    },
    term: {
      term: null,
      fitAddon: null,
      fit: () => {},
      lineBuf: '',
      signalBuf: '',
      previewSuppress: new Map(),
    },
    els: null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Review queue — never hot-swap the pane. Auto-fill only an empty pane;
// refresh only when the pane's own URL is re-emitted; everything else queues.
// ───────────────────────────────────────────────────────────────────────────

function routePreview(session, url, source) {
  if (consumeTypedPreviewSuppression(session, url, source)) return;
  const b = session.browser;
  if (b.currentUrl && b.currentUrl === url) {
    const now = Date.now();
    if (now - b.lastReload > BOUNDS.reloadThrottleMs && b.webview) {
      b.lastReload = now;
      try { b.webview.reload(); } catch { /* not ready */ }
      flashRefresh(session);
    }
    return;
  }
  if (!b.webview) {
    openInPane(session, url); // empty pane: auto-fill is not attention-stealing
    return;
  }
  if (b.queue.some((q) => q.url === url)) return;
  apply({ type: 'preview-queued', sessionId: session.id, url, source });
  renderQueue(session);
}

function flashRefresh(session) {
  const el = session.els.refreshFlash;
  el.classList.add('show');
  clearTimeout(session._flashT);
  session._flashT = setTimeout(() => el.classList.remove('show'), 1400);
}

function renderQueue(session) {
  const host = session.els.queueList;
  const queue = session.browser.queue;
  host.innerHTML = '';
  if (queue.length === 0) {
    const d = document.createElement('div');
    d.className = 'queue-empty';
    d.textContent = 'No queued previews. New URLs from this session land here instead of stealing your pane.';
    host.appendChild(d);
  }
  for (const item of queue) {
    const row = document.createElement('div');
    row.className = 'queue-item';
    const src = document.createElement('span');
    src.className = 'qi-src';
    src.textContent = item.source;
    const u = document.createElement('span');
    u.className = 'qi-url';
    u.textContent = item.url;
    u.title = item.url;
    const open = document.createElement('button');
    open.className = 'qi-btn open';
    open.dataset.queueOpenUrl = item.url;
    open.textContent = 'OPEN';
    open.onclick = () => {
      apply({ type: 'preview-opened', sessionId: session.id, url: item.url });
      openInPane(session, item.url);
      renderQueue(session);
    };
    const dismiss = document.createElement('button');
    dismiss.className = 'qi-btn';
    dismiss.textContent = 'DISMISS';
    dismiss.onclick = () => {
      apply({ type: 'preview-dismissed', sessionId: session.id, url: item.url });
      renderQueue(session);
    };
    row.append(src, u, open, dismiss);
    host.appendChild(row);
  }
  session.els.queueBadge.textContent = String(queue.length);
  session.els.queueBadge.classList.toggle('zero', queue.length === 0);
  session.els.queueBtn.classList.toggle('attention', queue.length > 0);
  invalidate('attention', 'badges');
}

function deliveredCaptureCount() {
  let n = 0;
  for (const rec of state.captures.values()) {
    if (rec.status === 'delivered') n += 1;
  }
  return n;
}

function updateBadges() {
  let queued = 0;
  for (const s of state.sessions.values()) {
    if (!s.els || !s.els.tabBadge) continue;
    queued += s.browser.queue.length;
    s.els.tabBadge.textContent = String(s.browser.queue.length);
    s.els.tabBadge.classList.toggle('zero', s.browser.queue.length === 0);
  }
  $('#g-queued').textContent = String(queued);
  $('#g-sessions').textContent = String(state.sessions.size);
  // "SENT" counts exactly what its label says: deliveries that exited 0.
  $('#g-captures').textContent = String(deliveredCaptureCount());
}

// ───────────────────────────────────────────────────────────────────────────
// Browser pane — one webview per session, created on first preview.
// ───────────────────────────────────────────────────────────────────────────

function openInPane(session, url) {
  const b = session.browser;
  b.currentUrl = url;
  b.lastReload = Date.now();
  session.els.urlBar.value = url;
  invalidate('captureChips');
  if (!b.webview) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:chromux');
    wv.setAttribute('preload', window.chromux.webviewPreloadPath);
    wv.setAttribute('src', url);
    b.webview = wv;

    wv.addEventListener('console-message', (e) => {
      const levels = ['debug', 'info', 'warn', 'error'];
      b.consoleBuf.push({
        ts: new Date().toISOString(),
        level: levels[e.level] || String(e.level),
        message: String(e.message).slice(0, BOUNDS.consoleMsgChars),
      });
      b.consoleTotal += 1;
      if (b.consoleBuf.length > BOUNDS.consoleTail) b.consoleBuf.shift();
      renderConsoleChip(session);
    });
    wv.addEventListener('did-navigate', (e) => {
      b.currentUrl = e.url;
      session.els.urlBar.value = e.url;
      invalidate('captureChips');
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
      if (e.isMainFrame) {
        b.currentUrl = e.url;
        session.els.urlBar.value = e.url;
        invalidate('captureChips');
      }
    });
    wv.addEventListener('dom-ready', () => {
      try { b.webContentsId = wv.getWebContentsId(); } catch { /* ok */ }
    });
    wv.addEventListener('ipc-message', (e) => {
      if (e.channel === 'chromux-pick') onElementPicked(session, e.args[0] || {});
      else if (e.channel === 'chromux-pick-cancel') setPicking(session, false);
    });

    session.els.placeholder.classList.add('hidden');
    session.els.webHost.appendChild(wv);
    session.els.pickBtn.disabled = false;
    session.els.captureBtn.disabled = false;
  } else {
    b.webview.loadURL(url).catch(() => {});
  }
}

function renderConsoleChip(session) {
  const b = session.browser;
  const errors = b.consoleBuf.filter((c) => c.level === 'error').length;
  const chip = session.els.consoleChip;
  chip.textContent = errors > 0 ? `⚠ ${errors} err · ${b.consoleTotal} logs` : `${b.consoleTotal} logs`;
  chip.classList.toggle('has-errors', errors > 0);
}

function refitTerminal(session) {
  requestAnimationFrame(() => session.term.fit());
}

function applyBrowserLayout(session) {
  if (!session.els) return;
  const collapsed = Boolean(session.browser.collapsed);
  session.els.view.classList.toggle('browser-collapsed', collapsed);
  session.els.webPane.classList.toggle('collapsed', collapsed);
  session.els.divider.classList.toggle('disabled', collapsed);
  session.els.divider.setAttribute('aria-disabled', collapsed ? 'true' : 'false');
  if (collapsed) {
    session.els.view.style.gridTemplateColumns = 'minmax(320px, 1fr) 6px 40px';
  } else {
    session.els.view.style.gridTemplateColumns = session.browser.expandedGridTemplate;
  }
  session.els.collapseBtn.textContent = collapsed ? 'RESTORE' : 'COLLAPSE';
  session.els.collapseBtn.title = collapsed ? 'Restore paired browser' : 'Collapse paired browser';
  session.els.collapseBtn.setAttribute('aria-label', session.els.collapseBtn.title);
  refitTerminal(session);
}

function setBrowserCollapsed(session, collapsed) {
  const next = Boolean(collapsed);
  if (session.browser.collapsed === next) return;
  if (next) session.browser.expandedGridTemplate = session.els.view.style.gridTemplateColumns || session.browser.expandedGridTemplate;
  session.browser.collapsed = next;
  if (next) session.els.queuePanel.classList.add('hidden');
  applyBrowserLayout(session);
}

// ───────────────────────────────────────────────────────────────────────────
// Element picker — injected into the guest page; reports via webview preload.
// ───────────────────────────────────────────────────────────────────────────

const PICKER_JS = String.raw`
(() => {
  if (window.__chromuxPickerActive) return;
  window.__chromuxPickerActive = true;
  const box = document.createElement('div');
  box.id = '__chromux_pick_box';
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #ffb454;background:rgba(255,180,84,.14);box-shadow:0 0 0 4000px rgba(4,5,8,.25);transition:all .05s linear;left:-10px;top:-10px;width:0;height:0;';
  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#ffb454;color:#14100a;font:700 11px/1.6 ui-monospace,monospace;padding:1px 7px;max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;left:-1000px;top:-1000px;';
  document.documentElement.appendChild(box);
  document.documentElement.appendChild(tag);
  let current = null;
  const selectorOf = (el) => {
    if (!el) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 8) {
      let part = node.tagName.toLowerCase();
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      const cls = [...node.classList].slice(0, 2).map((c) => '.' + CSS.escape(c)).join('');
      if (cls) part += cls;
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  };
  const move = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === box || el === tag) return;
    current = el;
    const r = el.getBoundingClientRect();
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    tag.textContent = selectorOf(el);
    tag.style.left = Math.max(4, r.left) + 'px';
    tag.style.top = Math.max(4, r.top - 20) + 'px';
  };
  const cleanup = () => {
    removeEventListener('mousemove', move, true);
    removeEventListener('click', click, true);
    removeEventListener('keydown', key, true);
    box.remove(); tag.remove();
    window.__chromuxPickerActive = false;
  };
  const click = (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = current;
    const sel = selectorOf(el);
    const html = el ? el.outerHTML : '';
    cleanup();
    if (window.__chromux) window.__chromux.report('chromux-pick', {
      selector: sel,
      outerHTML: html,
      url: location.href,
      title: document.title,
    });
  };
  const key = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      if (window.__chromux) window.__chromux.report('chromux-pick-cancel', {});
    }
  };
  addEventListener('mousemove', move, true);
  addEventListener('click', click, true);
  addEventListener('keydown', key, true);
})();`;

function setPicking(session, on) {
  session.browser.picking = on;
  session.els.pickBtn.classList.toggle('armed', on);
  session.els.pickBtn.textContent = on ? 'PICKING… ESC' : '⌖ PICK ELEMENT';
}

async function startPick(session) {
  if (!session.browser.webview || session.browser.picking) return;
  setPicking(session, true);
  try {
    await session.browser.webview.executeJavaScript(PICKER_JS);
  } catch {
    setPicking(session, false);
  }
}

function onElementPicked(session, data) {
  setPicking(session, false);
  openCaptureModal(session, {
    selector: data.selector || null,
    outerHTML: data.outerHTML || null,
    pageTitle: data.title || null,
    pageUrl: data.url || session.browser.currentUrl,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Capture modal — compose payload, preview YAML, deliver via claude -p or
// file-drop. The payload contract lives in docs/capture-payload.md.
// ───────────────────────────────────────────────────────────────────────────

async function openCaptureModal(session, selection) {
  const b = session.browser;
  let pngBase64 = null;
  let shotDataUrl = null;
  try {
    const image = await b.webview.capturePage();
    shotDataUrl = image.toDataURL();
    pngBase64 = shotDataUrl.split(',')[1];
  } catch { /* screenshot failure keeps the payload (dx-journey failure map) */ }

  let title = selection.pageTitle;
  if (!title) {
    try { title = await b.webview.executeJavaScript('document.title'); } catch { title = null; }
  }

  const outerHTML = selection.outerHTML || null;
  const truncatedHtml = outerHTML !== null && outerHTML.length > BOUNDS.outerHtmlChars;
  const pageUrl = selection.pageUrl || b.currentUrl;

  state.counter += 1;
  const captureId = 'c' + state.counter;
  apply({ type: 'capture-created', captureId, sessionId: session.id, url: pageUrl });
  state.ui.captureModal = {
    captureId,
    pngBase64,
    payloadBase: {
      schema_version: 1,
      captured_at: new Date().toISOString(),
      session: {
        id: session.id,
        name: session.name,
        project_path: session.cwd,
      },
      page: {
        url: pageUrl,
        title: title || null,
      },
      selection: selection.selector ? {
        selector: selection.selector,
        outer_html: truncatedHtml ? outerHTML.slice(0, BOUNDS.outerHtmlChars) : outerHTML,
        truncated: truncatedHtml,
      } : null,
      console: {
        total_captured: b.consoleTotal,
        included: b.consoleBuf.length,
        truncated: b.consoleTotal > b.consoleBuf.length,
        entries: b.consoleBuf.slice(),
      },
      screenshot: pngBase64 ? { path: '(assigned on save)', mode: 'visible-viewport' } : { path: null, mode: 'unavailable' },
    },
  };

  // summary
  const sum = $('#cap-summary');
  sum.innerHTML = '';
  const addRow = (k, v, cls = '') => {
    const row = document.createElement('div');
    row.className = 'row';
    const kk = document.createElement('span'); kk.className = 'k'; kk.textContent = k;
    const vv = document.createElement('span'); vv.className = 'v ' + cls; vv.textContent = v; vv.title = v;
    row.append(kk, vv);
    sum.appendChild(row);
  };
  addRow('SESSION', `${session.name} — ${session.cwd}`);
  addRow('URL', pageUrl || '—', 'url');
  addRow('ELEMENT', selection.selector || 'none (page-level capture)', selection.selector ? 'sel' : '');
  addRow('CONSOLE', `${b.consoleBuf.length} of ${b.consoleTotal} entries (tail)`);

  const shot = $('#cap-shot');
  shot.innerHTML = '';
  if (shotDataUrl) {
    const img = document.createElement('img');
    img.src = shotDataUrl;
    shot.appendChild(img);
  } else {
    shot.innerHTML = '<span class="dim">screenshot unavailable — payload kept without it</span>';
  }

  // target picker: paired session by default, redirectable (interview R2·Q3)
  const target = $('#cap-target');
  target.innerHTML = '';
  const optPaired = document.createElement('option');
  optPaired.value = session.id;
  optPaired.textContent = `PAIRED — ${session.name} (claude -p in ${session.cwd})`;
  target.appendChild(optPaired);
  for (const other of state.sessions.values()) {
    if (other.id === session.id) continue;
    const o = document.createElement('option');
    o.value = other.id;
    o.textContent = `${other.name} (claude -p in ${other.cwd})`;
    target.appendChild(o);
  }
  const oneOff = document.createElement('option');
  oneOff.value = '__oneoff__';
  oneOff.textContent = `ONE-OFF — claude -p in ${state.env ? state.env.home : '~'}`;
  target.appendChild(oneOff);

  $('#cap-notes').value = '';
  refreshYamlPreview();

  $('#cap-compose').classList.remove('hidden');
  $('#cap-foot-compose').classList.remove('hidden');
  $('#cap-deliver').classList.add('hidden');
  $('#cap-foot-deliver').classList.add('hidden');
  $('#cap-title').textContent = 'CAPTURE → AGENT';
  $('#modal-capture').classList.remove('hidden');
}

function buildPayload() {
  const modal = state.ui.captureModal;
  const targetId = $('#cap-target').value;
  const notes = $('#cap-notes').value.trim() || null;
  const targetSession = targetId === '__oneoff__' ? null : state.sessions.get(targetId);
  return {
    payload: {
      ...modal.payloadBase,
      delivery: {
        adapter: 'claude -p',
        target: targetSession ? targetSession.name : 'one-off',
        target_cwd: targetSession ? targetSession.cwd : (state.env ? state.env.home : null),
      },
      notes,
    },
    targetSession,
    notes,
  };
}

function refreshYamlPreview() {
  if (!state.ui.captureModal) return;
  const { payload } = buildPayload();
  $('#cap-yaml').textContent = window.chromux.toYaml(payload);
}

async function persistCapture() {
  const modal = state.ui.captureModal;
  const { payload, targetSession, notes } = buildPayload();
  const res = await window.chromux.capturePrepare(payload, modal.pngBase64);
  apply({
    type: 'capture-written',
    captureId: modal.captureId,
    payloadPath: res.payloadPath,
    screenshotPath: res.screenshotPath,
    targetSessionId: targetSession ? targetSession.id : null,
  });
  return { ...res, targetSession, notes, payload };
}

async function sendCapture() {
  const modal = state.ui.captureModal;
  if (!modal) return;
  $('#cap-send').disabled = true;
  const { payloadPath, screenshotPath, yamlText, targetSession, notes } = await persistCapture();
  const cwd = targetSession ? targetSession.cwd : (state.env ? state.env.home : null);
  const deliveryId = 'd' + Date.now();
  apply({
    type: 'capture-delivering',
    captureId: modal.captureId,
    deliveryId,
    targetSessionId: targetSession ? targetSession.id : null,
  });

  $('#cap-compose').classList.add('hidden');
  $('#cap-foot-compose').classList.add('hidden');
  $('#cap-deliver').classList.remove('hidden');
  $('#cap-foot-deliver').classList.remove('hidden');
  $('#deliver-done').classList.add('hidden');
  $('#deliver-cancel').classList.remove('hidden');
  $('#cap-title').textContent = 'DELIVERY — claude -p';
  const status = $('#deliver-status');
  status.className = 'deliver-status';
  $('#deliver-status-text').textContent =
    `DELIVERING VIA claude -p — TARGET: ${targetSession ? targetSession.name.toUpperCase() : 'ONE-OFF'}`;
  $('#deliver-output').textContent = '';
  $('#deliver-meta').innerHTML =
    `payload: <code>${payloadPath}</code><br>` +
    (screenshotPath ? `screenshot: <code>${screenshotPath}</code><br>` : '') +
    `manual retry: <code>cd '${cwd}' &amp;&amp; claude -p "$(cat '${payloadPath}')"</code>`;

  await window.chromux.deliverClaude({
    deliveryId,
    payloadPath,
    yamlText,
    cwd,
    targetSession: targetSession ? targetSession.name : 'one-off',
    notes,
  });
  $('#cap-send').disabled = false;
}

async function filedropCapture() {
  if (!state.ui.captureModal) return;
  const { payloadPath, screenshotPath, targetSession } = await persistCapture();
  window.chromux.logFiledrop({
    payloadPath,
    targetSession: targetSession ? targetSession.name : 'one-off',
    cwd: targetSession ? targetSession.cwd : null,
  });
  $('#cap-compose').classList.add('hidden');
  $('#cap-foot-compose').classList.add('hidden');
  $('#cap-deliver').classList.remove('hidden');
  $('#cap-foot-deliver').classList.remove('hidden');
  $('#deliver-cancel').classList.add('hidden');
  $('#deliver-done').classList.remove('hidden');
  $('#cap-title').textContent = 'FILE-DROP COMPLETE';
  const status = $('#deliver-status');
  status.className = 'deliver-status ok';
  $('#deliver-status-text').textContent = 'PAYLOAD WRITTEN — INSPECT OR RETRY MANUALLY';
  $('#deliver-output').textContent = 'File-drop mode: no agent was invoked.\nThe payload is on disk and manually retryable.';
  $('#deliver-meta').innerHTML =
    `payload: <code>${payloadPath}</code><br>` +
    (screenshotPath ? `screenshot: <code>${screenshotPath}</code><br>` : '') +
    `manual send: <code>claude -p "$(cat '${payloadPath}')"</code>`;
}

// Is the capture modal currently showing this delivery?
function modalShowsDelivery(deliveryId) {
  const modal = state.ui.captureModal;
  return Boolean(modal && state.deliveryIndex.get(deliveryId) === modal.captureId);
}

window.chromux.onDeliverOutput(({ deliveryId, chunk }) => {
  if (!modalShowsDelivery(deliveryId)) return;
  const out = $('#deliver-output');
  out.textContent += chunk;
  out.scrollTop = out.scrollHeight;
});

// Delivery outcomes resolve through state.deliveryIndex — never through the
// focused session or the currently open modal, so overlapping deliveries
// settle independently and a failure attributes to the record that owns it.
function handleDeliverClose({ deliveryId, exitCode, error }) {
  const captureId = state.deliveryIndex.get(deliveryId);
  if (!captureId) return; // unknown/duplicate close — nothing to attribute
  const showing = modalShowsDelivery(deliveryId);
  if (exitCode === 0) {
    apply({ type: 'capture-delivered', captureId, deliveryId });
  } else {
    apply({ type: 'capture-failed', captureId, deliveryId, exitCode, error: error || null });
  }
  if (!showing) return;
  const status = $('#deliver-status');
  $('#deliver-cancel').classList.add('hidden');
  $('#deliver-done').classList.remove('hidden');
  if (exitCode === 0) {
    status.className = 'deliver-status ok';
    $('#deliver-status-text').textContent = 'DELIVERED — claude -p EXITED 0';
  } else {
    status.className = 'deliver-status fail';
    $('#deliver-status-text').textContent =
      `DELIVERY FAILED — EXIT ${exitCode}${error ? ' — ' + error : ''} (PAYLOAD KEPT, RETRY MANUALLY)`;
  }
}

window.chromux.onDeliverClose(handleDeliverClose);

// ───────────────────────────────────────────────────────────────────────────
// Session creation / lifecycle
// ───────────────────────────────────────────────────────────────────────────

const AGENT_LABELS = { claude: 'CLAUDE CODE', codex: 'CODEX', '': 'SHELL' };

// POSIX single-quoting: close the quote, emit an escaped ', reopen. Safe for
// any byte the filesystem allows (spaces, quotes, backslashes).
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// Launch command for an agent CLI. Claude sessions get `--settings` pointing
// at the Chromux hooks file (merges with, never replaces, the user's own
// settings) so deterministic turn signals flow back over the PTY.
function agentCommand(agent, resumeId = null) {
  if (agent === 'claude') {
    const settingsPath = state.env && state.env.hooksSettingsPath;
    const base = settingsPath ? `claude --settings ${shellQuote(settingsPath)}` : 'claude';
    return resumeId ? `${base} --resume ${shellQuote(resumeId)}` : base;
  }
  if (agent === 'codex') {
    // Verified: the notify child's /dev/tty write rides the PTY back to us.
    // Codex only reports turn completion, so codex sessions signal turn-end
    // only; needsInput never fires and working is inferred from typed input.
    const notifyPath = state.env && state.env.codexNotifyPath;
    // The path sits inside a TOML string inside a shell arg — escape both
    // layers: backslash-escape for TOML, then single-quote for the shell.
    const base = notifyPath
      ? `codex -c ${shellQuote(`notify=["${notifyPath.replace(/[\\"]/g, '\\$&')}"]`)}`
      : 'codex';
    return resumeId ? `${base} resume ${shellQuote(resumeId)}` : base;
  }
  return null;
}

function agentLabel(agent) {
  return AGENT_LABELS[agent || ''] || (agent || 'shell').toUpperCase();
}

function otherAgent(agent) {
  if (agent === 'claude') return 'codex';
  if (agent === 'codex') return 'claude';
  return 'claude';
}

function uniqueSessionName(base) {
  const existing = new Set([...state.sessions.values()].map((s) => s.name));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

async function duplicateSession(source, agent, mode) {
  const suffix = mode === 'other' ? agent : 'copy';
  const name = uniqueSessionName(`${source.name}-${suffix}`);
  return createSession({
    name,
    cwd: source.cwd,
    agent,
    initialUrl: source.browser.currentUrl,
  });
}

function closeSessionContextMenu() {
  if (!state.contextMenu) return;
  state.contextMenu.remove();
  state.contextMenu = null;
}

function openSessionContextMenu(session, x, y) {
  closeSessionContextMenu();

  const menu = document.createElement('div');
  menu.className = 'session-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const addItem = (label, detail, action, danger = false) => {
    const item = document.createElement('button');
    item.className = 'session-menu-item' + (danger ? ' danger' : '');
    const text = document.createElement('span');
    text.className = 'smi-label';
    text.textContent = label;
    const hint = document.createElement('span');
    hint.className = 'smi-detail';
    hint.textContent = detail;
    item.append(text, hint);
    item.onclick = () => {
      closeSessionContextMenu();
      action();
    };
    menu.appendChild(item);
  };

  const crossAgent = otherAgent(session.agent);
  addItem('Duplicate session', agentLabel(session.agent), () => {
    duplicateSession(session, session.agent, 'same').catch(() => {});
  });
  addItem(`Open in ${agentLabel(crossAgent)}`, session.cwd, () => {
    duplicateSession(session, crossAgent, 'other').catch(() => {});
  });
  addItem('Close session', session.name, () => closeSession(session.id), true);

  document.body.appendChild(menu);
  state.contextMenu = menu;

  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
}

function buildSessionView(session) {
  const view = document.createElement('section');
  view.className = 'session-view offstage';
  view.style.gridTemplateColumns = session.browser.expandedGridTemplate;

  // terminal pane
  const termPane = document.createElement('div');
  termPane.className = 'pane term-pane';
  const termHead = document.createElement('div');
  termHead.className = 'pane-head';
  const termLabel = document.createElement('span');
  termLabel.className = 'pane-label';
  termLabel.innerHTML = `TERMINAL <span class="lit">· ${session.agent ? session.agent.toUpperCase() : 'SHELL'}</span>`;
  const termCwd = document.createElement('span');
  termCwd.className = 'term-head-cwd';
  termCwd.textContent = session.cwd;
  termHead.append(termLabel, termCwd);
  const termHost = document.createElement('div');
  termHost.className = 'term-host';
  termPane.append(termHead, termHost);

  // divider
  const divider = document.createElement('div');
  divider.className = 'divider';

  // browser pane
  const webPane = document.createElement('div');
  webPane.className = 'pane web-pane';
  const webHead = document.createElement('div');
  webHead.className = 'pane-head';
  const webLabel = document.createElement('span');
  webLabel.className = 'pane-label';
  webLabel.innerHTML = 'PAIRED <span class="lit">BROWSER</span>';
  const browserToolbar = document.createElement('div');
  browserToolbar.className = 'browser-toolbar';

  const back = document.createElement('button'); back.className = 'nav-btn'; back.textContent = '‹'; back.title = 'Back';
  const reload = document.createElement('button'); reload.className = 'nav-btn'; reload.textContent = '⟳'; reload.title = 'Reload';
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'head-btn collapse-btn';
  collapseBtn.textContent = 'COLLAPSE';
  collapseBtn.title = 'Collapse paired browser';
  collapseBtn.setAttribute('aria-label', 'Collapse paired browser');
  const urlBar = document.createElement('input');
  urlBar.className = 'url-bar'; urlBar.type = 'text'; urlBar.spellcheck = false;
  urlBar.placeholder = 'awaiting preview — or type a URL and hit ⏎';

  const queueBtn = document.createElement('button');
  queueBtn.className = 'head-btn';
  const queueBadge = document.createElement('span');
  queueBadge.className = 'q-badge zero';
  queueBadge.textContent = '0';
  queueBtn.append(document.createTextNode('QUEUE '), queueBadge);

  const consoleChip = document.createElement('span');
  consoleChip.className = 'console-chip';
  consoleChip.textContent = '0 logs';

  const captureChip = document.createElement('span');
  captureChip.className = 'capture-chip hidden';
  captureChip.title = 'A capture for the URL in this pane was submitted';

  const pickBtn = document.createElement('button');
  pickBtn.className = 'head-btn'; pickBtn.textContent = '⌖ PICK ELEMENT'; pickBtn.disabled = true;
  const captureBtn = document.createElement('button');
  captureBtn.className = 'head-btn'; captureBtn.textContent = '⚡ CAPTURE'; captureBtn.disabled = true;
  captureBtn.title = 'Capture page (console + screenshot + URL) without picking an element';

  browserToolbar.append(back, reload, urlBar, consoleChip, captureChip, queueBtn, pickBtn, captureBtn, collapseBtn);
  webHead.append(webLabel, browserToolbar);

  const queuePanel = document.createElement('div');
  queuePanel.className = 'queue-panel hidden';
  const queueHead = document.createElement('div');
  queueHead.className = 'queue-head';
  queueHead.innerHTML = '<span class="microlabel">REVIEW QUEUE — NEW PREVIEWS WAIT HERE</span>';
  const queueList = document.createElement('div');
  queuePanel.append(queueHead, queueList);

  const webHost = document.createElement('div');
  webHost.className = 'web-host';
  const placeholder = document.createElement('div');
  placeholder.className = 'web-placeholder';
  placeholder.innerHTML = `
    <div class="wp-radar"></div>
    <div class="wp-title">AWAITING PREVIEW</div>
    <div class="wp-sub">Chromux watches this session's terminal for <em>localhost</em> dev-server URLs
    and local <em>.html</em> paths.<br/>The first one auto-opens here; later ones queue — they never
    steal the pane you're viewing.<br/>You can also <em>⌘-click</em> any URL or .html path in the
    terminal to open it here.</div>`;
  const refreshFlash = document.createElement('div');
  refreshFlash.className = 'refresh-flash';
  refreshFlash.textContent = 'AUTO-REFRESHED';
  webHost.append(placeholder, refreshFlash);

  webPane.append(webHead, queuePanel, webHost);
  view.append(termPane, divider, webPane);
  $('#views').appendChild(view);

  // wiring
  back.onclick = () => { if (session.browser.webview) session.browser.webview.goBack(); };
  reload.onclick = () => { if (session.browser.webview) session.browser.webview.reload(); };
  urlBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      let u = urlBar.value.trim();
      if (!u) return;
      if (!/^(https?|file):\/\//.test(u)) u = u.startsWith('/') ? 'file://' + u : 'http://' + u;
      openInPane(session, u);
    }
  });
  queueBtn.onclick = () => queuePanel.classList.toggle('hidden');
  collapseBtn.onclick = () => setBrowserCollapsed(session, !session.browser.collapsed);
  pickBtn.onclick = () => (session.browser.picking ? null : startPick(session));
  captureBtn.onclick = () => openCaptureModal(session, { selector: null, outerHTML: null, pageTitle: null, pageUrl: session.browser.currentUrl });

  // divider drag
  divider.addEventListener('mousedown', (e) => {
    if (session.browser.collapsed) return;
    e.preventDefault();
    document.body.classList.add('dragging');
    const onMove = (ev) => {
      const rect = view.getBoundingClientRect();
      const pct = Math.min(72, Math.max(18, ((ev.clientX - rect.left) / rect.width) * 100));
      session.browser.expandedGridTemplate = `${pct}% 6px 1fr`;
      view.style.gridTemplateColumns = session.browser.expandedGridTemplate;
      session.term.fit();
    };
    const onUp = () => {
      document.body.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      session.term.fit();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  return {
    view, termHost, urlBar, queueBtn, queueBadge, queuePanel, queueList,
    consoleChip, captureChip, pickBtn, captureBtn, webHost, placeholder, refreshFlash,
    divider, webPane, browserToolbar, collapseBtn,
  };
}

// "Capture submitted for this URL" chip — derived purely from capture records
// that match the pane's current URL.
const CAPTURE_CHIP_LABELS = {
  written: '⚡ CAPTURE WRITTEN',
  delivering: '⚡ CAPTURE DELIVERING…',
  delivered: '⚡ CAPTURE SENT',
  failed: '⚡ CAPTURE FAILED',
};

function renderCaptureChips() {
  for (const session of state.sessions.values()) {
    const chip = session.els && session.els.captureChip;
    if (!chip) continue;
    let latest = null;
    for (const rec of state.captures.values()) {
      if (rec.sessionId !== session.id || rec.status === 'composing') continue;
      if (!rec.url || rec.url !== session.browser.currentUrl) continue;
      if (!latest || rec.updatedAt > latest.updatedAt) latest = rec;
    }
    chip.classList.toggle('hidden', !latest);
    chip.classList.toggle('failed', Boolean(latest && latest.status === 'failed'));
    chip.textContent = latest ? CAPTURE_CHIP_LABELS[latest.status] || '⚡ CAPTURE' : '';
  }
}

function orderedSessions() {
  return [...state.sessions.values()];
}

function buildSessionTab(session) {
  const tab = document.createElement('button');
  tab.className = 'session-tab';
  tab.title = `${session.name} — ${session.cwd}`;
  const dot = document.createElement('span'); dot.className = 'tab-dot live';
  const name = document.createElement('span'); name.className = 'tab-name'; name.textContent = session.name;
  const badge = document.createElement('span'); badge.className = 'tab-badge zero'; badge.textContent = '0';
  const x = document.createElement('button'); x.className = 'tab-x'; x.textContent = '✕'; x.title = 'Close session';
  x.onclick = (e) => { e.stopPropagation(); closeSession(session.id); };
  tab.append(dot, name, badge, x);
  tab.onclick = () => activateSession(session.id);
  tab.oncontextmenu = (e) => {
    e.preventDefault();
    activateSession(session.id);
    openSessionContextMenu(session, e.clientX, e.clientY);
  };
  $('#tab-list').appendChild(tab);
  return { tab, dot, tabBadge: badge };
}

function renderTabs() {
  for (const s of state.sessions.values()) {
    if (!s.els || !s.els.tab) continue;
    s.els.tab.classList.toggle('active', s.id === state.activeId);
  }
}

function attentionItems() {
  reconcileUpdateQueue();
  return window.chromuxAttention.projectAttentionItems({
    sessions: orderedSessions(),
    activeId: state.activeId,
    captures: state.captures.values(),
    updateQueue: state.updateQueue,
    updateStatus: state.updateStatus,
  }).map((item) => ({
    session: item.sessionId
      ? state.sessions.get(item.sessionId)
      : { name: 'Chromux update', cwd: '' },
    item,
  })).filter((row) => row.session);
}

function attentionAction(item) {
  if (item.scope === 'global') {
    if (item.type === 'updateReady' || item.type === 'updateFailed') {
      const blockers = updateBlockers();
      if (item.type === 'updateFailed' && blockers.length > 0) return openSettings;
      return () => installUpdate().catch(showUpdateInstallError);
    }
    if (item.type === 'updateWaiting') return focusFirstUpdateBlocker;
    return openSettings;
  }
  return () => {
    const session = state.sessions.get(item.sessionId);
    if (!session) return;
    activateSession(session.id);
    if (item.type === 'queue') session.els.queuePanel.classList.remove('hidden');
  };
}

function dismissAttentionItem(item) {
  if (item.scope === 'global') {
    if (item.type !== 'updateRunning') dismissUpdateQueue();
    return;
  }
  if (item.type === 'delivery' && item.captureId) {
    apply({ type: 'capture-acknowledged', captureId: item.captureId });
  } else if (item.type === 'input' || item.type === 'completed') {
    apply({ type: 'attention-dismissed', sessionId: item.sessionId });
  }
}

function renderAttentionQueue() {
  const host = $('#attention-list');
  if (!host) return;
  host.innerHTML = '';
  const items = attentionItems();
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'attention-empty';
    empty.textContent = 'No sessions need attention. Queued previews, delivery failures, and agent input/completion signals will appear here.';
    host.appendChild(empty);
    return;
  }
  for (const { session, item } of items) {
    const row = document.createElement('div');
    row.className = `attention-item ${item.cls || ''}`;
    const action = attentionAction(item);
    row.onclick = action;
    const top = document.createElement('div');
    top.className = 'attention-top';
    const kind = document.createElement('span');
    kind.className = 'attention-kind';
    kind.textContent = item.kind;
    const name = document.createElement('span');
    name.className = 'attention-name';
    name.textContent = session.name;
    top.append(kind, name);
    const detail = document.createElement('div');
    detail.className = 'attention-detail';
    detail.textContent = item.detail || session.cwd;
    detail.title = item.detail || session.cwd;
    const actions = document.createElement('div');
    actions.className = 'attention-actions';
    const primary = document.createElement('button');
    primary.className = 'qi-btn open';
    primary.textContent = item.primaryAction || 'VIEW';
    primary.onclick = (e) => {
      e.stopPropagation();
      action();
    };
    actions.appendChild(primary);
    if (item.type !== 'queue' && item.type !== 'updateRunning') {
      const dismiss = document.createElement('button');
      dismiss.className = 'qi-btn';
      dismiss.textContent = 'DISMISS';
      dismiss.onclick = (e) => {
        e.stopPropagation();
        dismissAttentionItem(item);
      };
      actions.appendChild(dismiss);
    }
    row.append(top, detail, actions);
    host.appendChild(row);
  }
}

async function createSession({ name, cwd, agent, initialUrl = null, initialQueue = [], command = undefined }) {
  state.counter += 1;
  const id = 's' + state.counter;
  const session = newSessionShape({ id, name, cwd, agent });

  const viewEls = buildSessionView(session);
  const tabEls = buildSessionTab(session);
  session.els = { ...viewEls, ...tabEls };

  const term = new Terminal({
    fontFamily: '"SF Mono", Menlo, monospace',
    fontSize: 12.5,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 8000,
    macOptionIsMeta: true,
    theme: TERM_THEME,
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(viewEls.termHost);
  session.term.term = term;
  session.term.fitAddon = fitAddon;
  session.term.fit = () => {
    try {
      fitAddon.fit();
      window.chromux.ptyResize(id, term.cols, term.rows);
    } catch { /* hidden */ }
  };
  session.term.fit();
  registerTerminalLinks(session);

  term.onData((data) => {
    apply({ type: 'user-input', sessionId: id, data });
    window.chromux.ptyInput(id, data);
  });
  new ResizeObserver(() => session.term.fit()).observe(viewEls.termHost);

  state.sessions.set(id, session);
  apply({ type: 'session-created', sessionId: id, name, cwd, agent });
  await window.chromux.ptyCreate({
    id, cwd,
    command: command !== undefined ? command : agentCommand(agent),
    cols: term.cols, rows: term.rows,
  });

  session.browser.queue = Array.isArray(initialQueue)
    ? initialQueue.map((item) => ({
      url: item.url,
      source: item.source || 'RESTORE',
      ts: Number.isFinite(item.ts) ? item.ts : Date.now(),
    })).filter((item) => item.url)
    : [];
  renderQueue(session);
  if (initialUrl) openInPane(session, initialUrl);
  activateSession(id);
  renderTabs();
  state.lastCwd = cwd;
  return session;
}

function activateSession(id) {
  apply({ type: 'session-focused', sessionId: id });
  for (const s of state.sessions.values()) {
    const active = s.id === id;
    s.els.view.classList.toggle('offstage', !active);
    s.els.tab.classList.toggle('active', active);
    if (active) {
      requestAnimationFrame(() => {
        s.term.fit();
        s.term.term.focus();
      });
    }
  }
  $('#empty-state').classList.toggle('hidden', state.sessions.size > 0);
  renderTabs();
}

function closeSession(id) {
  const s = state.sessions.get(id);
  if (!s) return;
  window.chromux.ptyKill(id);
  s.term.term.dispose();
  s.els.view.remove();
  s.els.tab.remove();
  state.sessions.delete(id);
  apply({ type: 'session-closed', sessionId: id });
  if (state.activeId === id) {
    const next = state.sessions.keys().next();
    state.activeId = next.done ? null : next.value;
    if (state.activeId) activateSession(state.activeId);
  }
  $('#empty-state').classList.toggle('hidden', state.sessions.size > 0);
  renderTabs();
}

function setUpdateQueuePhase(phase, patch = {}) {
  if (!UPDATE_QUEUE_PHASES.has(phase)) return;
  apply({ type: 'update-queue-phase', phase, patch });
}

function updateAvailable() {
  return Boolean(state.updateStatus && state.updateStatus.updateAvailable);
}

// Safety derives from turn state alone: exited/needsInput/completed are safe;
// working/unknown block. `acknowledged` (a display flag) never affects safety,
// and focusing a session cannot change its turn state — so looking at a
// completed session no longer regresses the update queue.
function updateSessionSafety(session) {
  return window.chromuxAttention.sessionUpdateSafety(session);
}

function updateBlockers() {
  return orderedSessions()
    .map((session) => ({ session, safety: updateSessionSafety(session) }))
    .filter((row) => !row.safety.safe);
}

function reconcileUpdateQueue() {
  if (!updateAvailable()) {
    state.updateQueue.phase = 'idle';
    state.updateQueue.error = null;
    state.updateQueue.output = '';
    return;
  }
  if (!['waiting', 'ready'].includes(state.updateQueue.phase)) return;
  state.updateQueue.phase = updateBlockers().length === 0 ? 'ready' : 'waiting';
}

function queueUpdate() {
  if (!updateAvailable() || state.updateQueue.phase === 'running') return;
  setUpdateQueuePhase(updateBlockers().length === 0 ? 'ready' : 'waiting', { error: null, output: '' });
}

function dismissUpdateQueue() {
  apply({ type: 'update-queue-dismissed' });
}

function focusFirstUpdateBlocker() {
  const blocker = updateBlockers()[0];
  if (blocker) activateSession(blocker.session.id);
}

function updateStatusMessage(status) {
  if (status.error) return `Update check failed: ${status.error}`;
  if (!status.updateAvailable) {
    return status.latestVersion
      ? `Chromux is current. Latest release is ${status.latestTag || 'unknown'}.`
      : 'Chromux is current, or no valid GitHub Release was found.';
  }
  return `Update available: ${status.latestTag} is newer than ${status.currentVersion}.`;
}

function renderUpdateControls() {
  const status = state.updateStatus;
  const ready = $('#btn-update-ready');
  const statusEl = $('#settings-update-status');
  const command = $('#settings-update-command');
  const install = $('#settings-install-update');
  if (!status || !ready || !statusEl || !command || !install) return;

  const available = Boolean(status.updateAvailable);
  reconcileUpdateQueue();
  const phase = state.updateQueue.phase;
  const blockers = updateBlockers();
  ready.classList.toggle('hidden', !available);
  ready.textContent = phase === 'waiting' ? 'UPDATE WAITING'
    : (phase === 'running' ? 'UPDATE RUNNING'
      : (phase === 'failed' ? 'UPDATE FAILED' : 'UPDATE READY'));
  ready.title = available
    ? (phase === 'idle' ? 'Queue Chromux update' : 'Open update settings')
    : 'Chromux is current';

  $('#settings-current-version').textContent = status.currentVersion || '—';
  $('#settings-source-version').textContent = status.latestTag || status.latestVersion || '—';
  const sourceDir = $('#settings-source-dir');
  sourceDir.textContent = status.releaseUrl || status.releasesUrl || '—';
  sourceDir.title = status.releaseUrl || status.releasesUrl || '';

  statusEl.className = 'settings-status ' + (available ? (phase === 'failed' ? 'fail' : 'ready') : 'current');
  if (!available) {
    statusEl.textContent = updateStatusMessage(status);
  } else if (phase === 'waiting') {
    statusEl.textContent = `Update queued. Waiting for ${blockers.length} live session${blockers.length === 1 ? '' : 's'} to complete, ask for input, or exit before installing.`;
  } else if (phase === 'ready') {
    statusEl.textContent = status.managedInstall && status.managedInstall.available
      ? 'Update queued and ready. Install from the managed local source.'
      : 'Update queued, but no managed install source is available. Use the release URL to update manually.';
  } else if (phase === 'running') {
    statusEl.textContent = 'Installing the Chromux update.';
  } else if (phase === 'failed') {
    statusEl.textContent = state.updateQueue.error || 'Could not install the update. Review details below and retry when ready.';
  } else {
    statusEl.textContent = updateStatusMessage(status);
  }

  if (available) {
    command.classList.remove('hidden');
    command.textContent = state.updateQueue.output
      || (status.managedInstall && status.managedInstall.available
        ? `${status.managedInstall.command} in ${status.managedInstall.sourceDir}`
        : (status.managedInstall && status.managedInstall.message) || status.releaseUrl || '');
  } else {
    command.classList.add('hidden');
    command.textContent = '';
  }

  install.classList.toggle('hidden', !available);
  install.disabled = !available || phase === 'running';
  if (phase === 'waiting') {
    install.textContent = 'FOCUS BLOCKER';
  } else if (phase === 'ready') {
    install.textContent = 'INSTALL UPDATE';
  } else if (phase === 'failed') {
    install.textContent = blockers.length === 0 ? 'RETRY INSTALL' : 'FOCUS BLOCKER';
  } else {
    install.textContent = 'QUEUE UPDATE';
  }
}

function renderUpdateStatus(status) {
  state.updateStatus = status;
  invalidate('update', 'attention');
}

async function checkUpdates(manual = false) {
  const btn = $('#settings-check-updates');
  if (btn) btn.disabled = true;
  try {
    renderUpdateStatus(await window.chromux.checkUpdates({ manual }));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function snapshotOpenSessions() {
  return orderedSessions().map((session) => ({
    name: session.name,
    cwd: session.cwd,
    agent: session.agent || '',
    alive: Boolean(session.lifecycle.alive),
    currentUrl: session.browser.currentUrl || null,
    queue: session.browser.queue.map((item) => ({
      url: item.url,
      source: item.source || 'QUEUE',
      ts: item.ts || Date.now(),
    })),
    savedAt: new Date().toISOString(),
  }));
}

function liveSessions() {
  return orderedSessions().filter((session) => session.lifecycle.alive);
}

function showLifecyclePrompt(reason) {
  const live = liveSessions();
  const alwaysConfirm = reason === 'app-quit';
  if (live.length === 0 && reason !== 'update-install' && !alwaysConfirm) return Promise.resolve(true);
  if (state.lifecyclePrompt) return state.lifecyclePrompt.promise;

  const isUpdate = reason === 'update-install';
  const isQuit = reason === 'app-quit';
  $('#lifecycle-title').textContent = isUpdate
    ? 'INSTALL UPDATE WITH LIVE SESSIONS'
    : (isQuit ? 'QUIT CHROMUX?' : 'CLOSE CHROMUX WITH LIVE SESSIONS');
  $('#lifecycle-copy').textContent = isUpdate
    ? 'Continuing will stop live PTYs, save a workspace snapshot, install the update, and reopen the sessions after restart using Claude/Codex resume where possible.'
    : (live.length === 0
      ? 'Chromux will close after you confirm.'
      : 'Continuing will stop live PTYs and save a workspace snapshot. When Chromux opens again, it will reopen the sessions using Claude/Codex resume where possible.');
  const host = $('#lifecycle-list');
  host.innerHTML = '';
  for (const session of live) {
    const row = document.createElement('div');
    row.className = 'lifecycle-item';
    const name = document.createElement('b');
    name.textContent = session.name;
    const detail = document.createElement('span');
    detail.textContent = `${agentLabel(session.agent)} — ${session.cwd}`;
    detail.title = detail.textContent;
    row.append(name, detail);
    host.appendChild(row);
  }
  $('#lifecycle-confirm').textContent = isUpdate ? 'SAVE & INSTALL' : (isQuit ? 'QUIT' : 'SAVE & CLOSE');

  let resolvePrompt;
  const promise = new Promise((resolve) => { resolvePrompt = resolve; });
  const cleanup = (answer) => {
    $('#modal-lifecycle').classList.add('hidden');
    state.lifecyclePrompt = null;
    resolvePrompt(answer);
  };
  state.lifecyclePrompt = { promise, cleanup };
  $('#modal-lifecycle').classList.remove('hidden');
  return promise;
}

async function installUpdate() {
  const btn = $('#settings-install-update');
  const check = $('#settings-check-updates');
  const statusEl = $('#settings-update-status');
  const command = $('#settings-update-command');
  if (!updateAvailable() || state.updateQueue.phase === 'running') return;
  if (state.updateQueue.phase === 'idle') {
    queueUpdate();
    return;
  }
  const blockers = updateBlockers();
  if (blockers.length > 0) {
    focusFirstUpdateBlocker();
    return;
  }
  setUpdateQueuePhase('ready');
  if (!state.testInstallUpdateResult) {
    if (!(await showLifecyclePrompt('update-install'))) return;
    await window.chromux.saveRestoreSnapshot({
      reason: 'update-install',
      sessions: snapshotOpenSessions(),
    });
  }
  setUpdateQueuePhase('running', {
    error: null,
    output: '',
    lastAttemptAt: Date.now(),
  });
  btn.disabled = true;
  check.disabled = true;
  statusEl.className = 'settings-status ready';
  statusEl.textContent = 'Installing the Chromux update.';
  try {
    const res = state.testInstallUpdateResult
      ? state.testInstallUpdateResult
      : await window.chromux.installUpdate({ status: state.updateStatus });
    command.classList.remove('hidden');
    command.textContent = res.output || res.logPath || res.sourceDir || res.releaseUrl || res.error || res.message || '';
    if (res.ok) {
      setUpdateQueuePhase('running', { error: null, output: res.logPath || res.output || '' });
      statusEl.className = 'settings-status current';
      statusEl.textContent = 'Installing update. Chromux will quit and reopen when the install finishes.';
    } else {
      setUpdateQueuePhase('failed', {
        error: res.message || res.error || 'Could not install the update.',
        output: res.output || res.error || res.message || '',
      });
      statusEl.className = 'settings-status fail';
      statusEl.textContent = res.message || res.error || 'Could not install the update.';
      btn.disabled = false;
    }
  } finally {
    check.disabled = false;
    invalidate('update', 'attention');
  }
}

function showUpdateInstallError(err) {
  setUpdateQueuePhase('failed', {
    error: 'Could not install update: ' + err.message,
    output: err.stack || err.message,
  });
}

function openSettings() {
  $('#modal-settings').classList.remove('hidden');
  checkUpdates(false).catch(() => {});
}

// pty event routing — Chromux OSC signals are extracted (chunk-boundary safe)
// before anything reaches the terminal or the preview detector. A signal whose
// session id does not match the PTY it arrived on is dropped and recorded as
// signal-rejected (guards `claude -p` children and pasted logs).
function handlePtyData(id, data) {
  const s = state.sessions.get(id);
  if (!s) return;
  const res = window.chromuxSignals.extractChromuxSignals(s.term.signalBuf, data);
  s.term.signalBuf = res.buf;
  for (const sig of res.signals) {
    if (sig.malformed || sig.sessionId !== id) {
      apply({
        type: 'signal-rejected',
        sessionId: id,
        signal: sig.malformed ? null : sig.event,
        claimedSessionId: sig.sessionId || null,
      });
    } else {
      apply({ type: 'turn-signal', sessionId: id, signal: sig.event, detail: sig.detail });
    }
  }
  if (res.clean) {
    s.term.term.write(res.clean);
    if (window.chromuxAttention.applyCodexOutputCompletionFallback(s, res.clean, Date.now())) {
      invalidate('update', 'attention', 'badges');
    }
    feedDetector(s, res.clean);
  }
}

window.chromux.onPtyData(({ id, data }) => handlePtyData(id, data));

window.chromux.onPtyExit(({ id, exitCode }) => {
  const s = state.sessions.get(id);
  if (!s) return;
  apply({ type: 'session-exited', sessionId: id, exitCode });
  s.els.dot.classList.remove('live');
  s.els.dot.classList.add('dead');
  s.term.term.write(`\r\n\x1b[38;5;210m── session exited (${exitCode}) ──\x1b[0m\r\n`);
});

// popups intercepted in main → paired session's review queue
window.chromux.onWebviewPopup(({ webContentsId, url }) => {
  for (const s of state.sessions.values()) {
    if (s.browser.webContentsId === webContentsId) {
      routePreview(s, normalizePreviewUrl(url), 'POPUP');
      return;
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Detect — adopt open terminal tabs and their claude/codex sessions into
// Chromux. Per row: RESUME (continue the CLI's latest saved conversation for
// that project) or FRESH; agents can also be opened en masse.
// ───────────────────────────────────────────────────────────────────────────

function formatEtime(etime) {
  // ps etime: [[dd-]hh:]mm:ss
  const m = String(etime || '').match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return etime || '';
  const [, d, h, min] = m;
  if (d) return `${+d}d ${+(h || 0)}h`;
  if (h) return `${+h}h ${+min}m`;
  return `${+min}m`;
}

function formatAge(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function resumeCommandFor(row) {
  if (!row.resume || !/^[0-9a-f-]+$/i.test(row.resume.id)) return null;
  return agentCommand(row.agent, row.resume.id);
}

function restoreAgeLabel(snapshot) {
  if (!snapshot || !snapshot.savedAt) return 'saved session list';
  const ts = Date.parse(snapshot.savedAt);
  return Number.isFinite(ts) ? `saved ${formatAge(ts)}` : 'saved session list';
}

function detectQuery() {
  return String(state.detectQuery || '').trim().toLowerCase();
}

function appendDetectEmpty(host, message) {
  const empty = document.createElement('div');
  empty.className = 'detect-empty';
  empty.textContent = message;
  host.replaceChildren(empty);
}

function detectNoMatchesText() {
  return `No matches for ‘${String(state.detectQuery || '').trim()}’.`;
}

function searchMatches(fields, query) {
  if (!query) return true;
  return fields.some((field) => String(field || '').toLowerCase().includes(query));
}

function compactCwd(cwd) {
  const home = state.env ? state.env.home : '';
  return cwd ? (home ? cwd.replace(home, '~') : cwd) : '';
}

function detectedRowSearchFields(row) {
  const sessionAge = row.resume ? `session ${formatAge(row.resume.ts)}` : '';
  const status = row.opened
    ? 'opened'
    : row.agent
      ? `agent ${resumeCommandFor(row) ? 'resume' : 'no saved session found'} fresh open`
      : `shell open shell ${row.cwd ? 'openable' : 'cwd unknown'}`;
  return [
    row.agent,
    agentLabel(row.agent),
    row.terminal && row.terminal.title,
    row.terminal && row.terminal.app,
    row.tty,
    row.command,
    row.cwd,
    compactCwd(row.cwd),
    row.currentUrl,
    row.etime,
    formatEtime(row.etime),
    sessionAge,
    row.resume && row.resume.id,
    status,
  ];
}

function restoreRowSearchFields(row, snapshot) {
  const status = row.opened || row.restoredAt || (snapshot && snapshot.consumed)
    ? 'restored restored backup opened'
    : 'reopen open backup workspace snapshot';
  return [
    row.agent,
    agentLabel(row.agent || ''),
    row.name,
    row.cwd,
    compactCwd(row.cwd),
    row.command,
    row.currentUrl,
    row.resume && row.resume.id,
    restoreAgeLabel(snapshot),
    status,
  ];
}

function visibleDetectedRows() {
  const rows = state.detect && Array.isArray(state.detect.rows) ? state.detect.rows : [];
  const query = detectQuery();
  return rows.filter((row) => searchMatches(detectedRowSearchFields(row), query));
}

function visibleRestoreRows() {
  const snapshot = state.restoreSessions;
  const rows = snapshot && Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
  const query = detectQuery();
  return rows.filter((row) => searchMatches(restoreRowSearchFields(row, snapshot), query));
}

async function openRestoredSession(row) {
  let resolved = row;
  if (row.agent && !row.command && !row.resume) {
    const res = await window.chromux.resolveRestoreSessions({ sessions: [row] });
    resolved = res.sessions && res.sessions[0] ? { ...row, ...res.sessions[0] } : row;
  }
  const name = uniqueSessionName(row.name || (row.cwd ? row.cwd.split('/').filter(Boolean).pop() : 'restored'));
  const session = await createSession({
    name,
    cwd: resolved.cwd || (state.env ? state.env.home : '~'),
    agent: resolved.agent || '',
    initialUrl: resolved.currentUrl || null,
    initialQueue: resolved.queue || [],
    command: resolved.command || undefined,
  });
  row.opened = true;
  row.restoredAt = new Date().toISOString();
  return session;
}

function renderRestoreSessions() {
  const snapshot = state.restoreSessions;
  const block = $('#restore-block');
  const host = $('#restore-list');
  if (!block || !host) return;
  host.innerHTML = '';
  const rows = snapshot && Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
  const visibleRows = visibleRestoreRows();
  block.classList.toggle('hidden', rows.length === 0);
  if (rows.length === 0) return;
  if (visibleRows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'restore-empty';
    empty.textContent = detectQuery() ? detectNoMatchesText() : 'No backup workspace sessions found.';
    host.appendChild(empty);
  }

  for (const row of visibleRows) {
    const el = document.createElement('div');
    el.className = 'detect-row' + (row.opened ? ' opened' : '');

    const badge = document.createElement('span');
    badge.className = 'dr-badge ' + (row.agent || 'shell');
    badge.textContent = agentLabel(row.agent || '');

    const main = document.createElement('div');
    main.className = 'dr-main';
    const title = document.createElement('div');
    title.className = 'dr-title';
    title.textContent = row.name || row.cwd || 'restored session';
    const sub = document.createElement('div');
    sub.className = 'dr-sub';
    const home = state.env ? state.env.home : '';
    const cwdText = row.cwd ? (home ? row.cwd.replace(home, '~') : row.cwd) : 'cwd unknown';
    const bits = [cwdText, restoreAgeLabel(snapshot)];
    if (row.restoredAt || row.opened || snapshot.consumed) bits.push('restored backup');
    if (row.currentUrl) bits.push(row.currentUrl);
    sub.textContent = bits.join('  —  ');
    sub.title = row.currentUrl || row.cwd || '';
    main.append(title, sub);

    const actions = document.createElement('div');
    actions.className = 'dr-actions';
    if (row.opened || row.restoredAt) {
      const done = document.createElement('span');
      done.className = 'dr-opened';
      done.textContent = 'RESTORED';
      actions.appendChild(done);
    } else {
      const open = document.createElement('button');
      open.className = 'qi-btn open';
      open.textContent = 'REOPEN';
      open.onclick = () => openRestoredSession(row).then(() => {
        renderRestoreSessions();
        renderDetectList();
      }).catch(() => {});
      actions.appendChild(open);
    }
    el.append(badge, main, actions);
    host.appendChild(el);
  }

  const pending = visibleRows.filter((r) => !r.opened && !r.restoredAt);
  const openAll = $('#restore-open-all');
  openAll.disabled = pending.length === 0;
  openAll.textContent = pending.length > 0
    ? `OPEN ALL (${pending.length})`
    : (visibleRows.length > 0 ? 'ALL OPENED' : 'OPEN ALL');
}

async function openDetectedRow(row, mode) {
  const base = row.cwd ? row.cwd.split('/').filter(Boolean).pop() : row.tty;
  const name = uniqueSessionName(mode === 'resume' ? `${base}-resumed` : base);
  const command = mode === 'resume' ? resumeCommandFor(row) : agentCommand(row.agent);
  await createSession({ name, cwd: row.cwd || (state.env ? state.env.home : '~'), agent: row.agent, command });
  row.opened = true;
}

function renderDetectList() {
  const det = state.detect;
  const host = $('#detect-list');
  host.innerHTML = '';
  if (!det || det.rows.length === 0) {
    appendDetectEmpty(host, 'No external terminal tabs found.');
    $('#detect-open-all').disabled = true;
    return;
  }
  const rows = visibleDetectedRows();
  if (rows.length === 0) {
    appendDetectEmpty(host, detectQuery() ? detectNoMatchesText() : 'No external terminal tabs found.');
  }
  for (const row of rows) {
    const el = document.createElement('div');
    el.className = 'detect-row' + (row.opened ? ' opened' : '');

    const badge = document.createElement('span');
    badge.className = 'dr-badge ' + (row.agent || 'shell');
    badge.textContent = agentLabel(row.agent);

    const main = document.createElement('div');
    main.className = 'dr-main';
    const title = document.createElement('div');
    title.className = 'dr-title';
    title.textContent = (row.terminal && row.terminal.title) || row.command;
    title.title = row.command;
    const sub = document.createElement('div');
    sub.className = 'dr-sub';
    const home = state.env ? state.env.home : '';
    const cwdText = row.cwd ? (home ? row.cwd.replace(home, '~') : row.cwd) : 'cwd unknown';
    const bits = [
      (row.terminal ? row.terminal.app : 'terminal') + ' · ' + row.tty,
      cwdText,
      'up ' + formatEtime(row.etime),
    ];
    if (row.agent) {
      bits.push(row.resume ? `↺ session ${formatAge(row.resume.ts)}` : 'no saved session found');
    }
    sub.textContent = bits.join('  —  ');
    sub.title = row.cwd || '';
    main.append(title, sub);

    const actions = document.createElement('div');
    actions.className = 'dr-actions';
    if (row.opened) {
      const done = document.createElement('span');
      done.className = 'dr-opened';
      done.textContent = 'OPENED ✓';
      actions.appendChild(done);
    } else if (row.agent) {
      if (resumeCommandFor(row)) {
        const resume = document.createElement('button');
        resume.className = 'qi-btn open';
        resume.textContent = 'RESUME';
        resume.title = resumeCommandFor(row);
        resume.onclick = () => openDetectedRow(row, 'resume').then(renderDetectList).catch(() => {});
        actions.appendChild(resume);
      }
      const fresh = document.createElement('button');
      fresh.className = 'qi-btn';
      fresh.textContent = 'FRESH';
      fresh.title = `${agentCommand(row.agent)} in ${row.cwd || '~'}`;
      fresh.onclick = () => openDetectedRow(row, 'fresh').then(renderDetectList).catch(() => {});
      actions.appendChild(fresh);
    } else {
      const open = document.createElement('button');
      open.className = 'qi-btn';
      open.textContent = 'OPEN SHELL';
      open.disabled = !row.cwd;
      open.onclick = () => openDetectedRow(row, 'fresh').then(renderDetectList).catch(() => {});
      actions.appendChild(open);
    }

    el.append(badge, main, actions);
    host.appendChild(el);
  }

  const pendingAgents = rows.filter((r) => r.agent && !r.opened);
  const openAll = $('#detect-open-all');
  openAll.disabled = pendingAgents.length === 0;
  openAll.textContent = pendingAgents.length > 0
    ? `OPEN ALL AGENTS (${pendingAgents.length}) — RESUME WHERE POSSIBLE`
    : (rows.some((r) => r.agent) ? 'ALL AGENTS OPENED' : 'OPEN ALL AGENTS');
}

async function scanExternal() {
  const status = $('#detect-status');
  const statusText = $('#detect-status-text');
  statusText.textContent = 'SCANNING — ps · lsof · terminal tabs · session stores…';
  status.classList.remove('hidden');
  status.classList.add('scanning');
  $('#detect-list').innerHTML = '';
  renderRestoreSessions();
  $('#detect-rescan').disabled = true;
  $('#detect-open-all').disabled = true;
  try {
    const { rows, tabTitles } = await window.chromux.detectExternal();
    state.detect = { rows };
    const agents = rows.filter((r) => r.agent).length;
    statusText.textContent =
      `${rows.length} TERMINAL TAB${rows.length === 1 ? '' : 'S'} — ${agents} AGENT SESSION${agents === 1 ? '' : 'S'} (CLAUDE/CODEX), ${rows.length - agents} SHELL`
      + (rows.length > 0 && !tabTitles ? ' — TAB TITLES UNAVAILABLE (GRANT AUTOMATION ACCESS TO TERMINAL)' : '');
  } catch (err) {
    state.detect = { rows: [] };
    statusText.textContent = 'SCAN FAILED — ' + err.message;
  } finally {
    status.classList.remove('scanning');
    $('#detect-rescan').disabled = false;
  }
  renderDetectList();
}

function openDetectModal() {
  $('#modal-detect').classList.remove('hidden');
  renderRestoreSessions();
  scanExternal().catch(() => {});
  setTimeout(() => $('#detect-search')?.focus(), 0);
}

async function openAllDetectedAgents() {
  const det = state.detect;
  if (!det) return;
  const btn = $('#detect-open-all');
  btn.disabled = true;
  for (const row of visibleDetectedRows()) {
    if (!row.agent || row.opened) continue;
    try {
      await openDetectedRow(row, resumeCommandFor(row) ? 'resume' : 'fresh');
    } catch { /* keep going — remaining rows still open */ }
    renderDetectList();
  }
}

async function openAllRestoredSessions() {
  const snapshot = state.restoreSessions;
  const rows = visibleRestoreRows();
  const btn = $('#restore-open-all');
  btn.disabled = true;
  for (const row of rows) {
    if (row.opened || row.restoredAt) continue;
    try {
      await openRestoredSession(row);
    } catch { /* keep going */ }
    renderRestoreSessions();
  }
}

function renderRestoreWarning(unresolved) {
  const host = $('#restore-warning');
  if (!host) return;
  host.innerHTML = '';
  const rows = Array.isArray(unresolved) ? unresolved : [];
  if (rows.length === 0 || state.restoreWarningDismissed) {
    host.classList.add('hidden');
    return;
  }
  const main = document.createElement('div');
  main.className = 'rw-main';
  const title = document.createElement('div');
  title.className = 'rw-title';
  title.textContent = 'Some saved sessions reopened fresh';
  const detail = document.createElement('div');
  detail.className = 'rw-detail';
  const names = rows.map((row) => `${row.name || row.agent} (${row.cwd || '~'})`);
  detail.textContent = `Chromux could not match ${rows.length} Claude/Codex saved conversation${rows.length === 1 ? '' : 's'}: ${names.join('; ')}`;
  detail.title = detail.textContent;
  main.append(title, detail);
  const dismiss = document.createElement('button');
  dismiss.className = 'rw-dismiss';
  dismiss.textContent = 'DISMISS';
  dismiss.onclick = () => {
    state.restoreWarningDismissed = true;
    host.classList.add('hidden');
  };
  host.append(main, dismiss);
  host.classList.remove('hidden');
}

async function autoRestoreWorkspace() {
  const snapshot = await window.chromux.getRestoreSnapshot();
  state.restoreSessions = snapshot || null;
  renderRestoreSessions();
  if (!snapshot || snapshot.consumed || !Array.isArray(snapshot.sessions) || snapshot.sessions.length === 0) return;
  if (!['update-install', 'app-close'].includes(snapshot.reason)) return;

  const res = await window.chromux.resolveRestoreSessions({ sessions: snapshot.sessions });
  const restored = [];
  for (const row of res.sessions || []) {
    try {
      const name = uniqueSessionName(row.name || (row.cwd ? row.cwd.split('/').filter(Boolean).pop() : 'restored'));
      const session = await createSession({
        name,
        cwd: row.cwd || (state.env ? state.env.home : '~'),
        agent: row.agent || '',
        initialUrl: row.currentUrl || null,
        initialQueue: row.queue || [],
        command: row.command || undefined,
      });
      restored.push({ name: row.name, cwd: row.cwd, agent: row.agent, sessionId: session.id });
      row.opened = true;
      row.restoredAt = new Date().toISOString();
    } catch { /* keep restoring remaining sessions */ }
  }
  const consumed = await window.chromux.markRestoreSnapshotConsumed({
    restoreId: snapshot.restoreId,
    restoredSessions: restored,
  });
  state.restoreSessions = consumed || snapshot;
  renderRestoreSessions();
  renderRestoreWarning(res.unresolved || []);
}

// ───────────────────────────────────────────────────────────────────────────
// Modals, drawer, chrome wiring
// ───────────────────────────────────────────────────────────────────────────

function openNewSessionModal() {
  $('#ns-name').value = `session-${state.counter + 1}`;
  $('#ns-cwd').value = state.lastCwd || (state.env ? state.env.home : '');
  $('#modal-new').classList.remove('hidden');
  $('#ns-name').focus();
  $('#ns-name').select();
}

$('#btn-new-session').onclick = openNewSessionModal;
$('#btn-first-session').onclick = openNewSessionModal;
$('#btn-detect').onclick = openDetectModal;
$('#btn-first-detect').onclick = openDetectModal;
$('#detect-search').oninput = (e) => {
  state.detectQuery = e.target.value;
  renderRestoreSessions();
  renderDetectList();
};
$('#detect-rescan').onclick = () => scanExternal().catch(() => {});
$('#detect-open-all').onclick = () => openAllDetectedAgents().catch(() => {});
$('#restore-open-all').onclick = () => openAllRestoredSessions().catch(() => {});
$('#btn-settings').onclick = openSettings;
$('#btn-update-ready').onclick = () => {
  if (updateAvailable() && state.updateQueue.phase === 'idle') queueUpdate();
  else openSettings();
};

$('#ns-browse').onclick = async () => {
  const dir = await window.chromux.pickDirectory();
  if (dir) $('#ns-cwd').value = dir;
};

$('#ns-agent').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  for (const b of $('#ns-agent').children) b.classList.toggle('on', b === btn);
});

$('#ns-create').onclick = async () => {
  const name = $('#ns-name').value.trim() || `session-${state.counter + 1}`;
  let cwd = $('#ns-cwd').value.trim() || (state.env ? state.env.home : '~');
  if (cwd.startsWith('~')) cwd = (state.env ? state.env.home : '') + cwd.slice(1);
  const agent = $('#ns-agent .on').dataset.agent;
  $('#modal-new').classList.add('hidden');
  await createSession({ name, cwd, agent });
};

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $('#' + btn.dataset.close).classList.add('hidden');
    // Closing the modal drops only the compose context — the capture record
    // survives, so in-flight deliveries still resolve and stay attributable.
    if (btn.dataset.close === 'modal-capture') state.ui.captureModal = null;
  });
});

$('#cap-notes').addEventListener('input', refreshYamlPreview);
$('#cap-target').addEventListener('change', refreshYamlPreview);
$('#cap-send').onclick = () => sendCapture().catch((err) => {
  $('#deliver-status-text').textContent = 'DELIVERY ERROR — ' + err.message;
});
$('#cap-filedrop').onclick = () => filedropCapture().catch(() => {});
$('#deliver-cancel').onclick = () => {
  const modal = state.ui.captureModal;
  const rec = modal ? state.captures.get(modal.captureId) : null;
  if (rec && rec.deliveryId && rec.status === 'delivering') window.chromux.deliverCancel(rec.deliveryId);
};
$('#deliver-reveal').onclick = () => {
  const modal = state.ui.captureModal;
  const rec = modal ? state.captures.get(modal.captureId) : null;
  if (rec && rec.payloadPath) window.chromux.revealPath(rec.payloadPath);
};

$('#storage-path').onclick = () => {
  if (state.env) window.chromux.revealPath(state.env.capturesDir);
};

$('#settings-source-dir').onclick = () => {
  if (state.updateStatus && state.updateStatus.releaseUrl) window.chromux.openUpdateRelease({ status: state.updateStatus });
};
$('#settings-check-updates').onclick = () => checkUpdates(true).catch(() => {});
$('#settings-install-update').onclick = () => installUpdate().catch(showUpdateInstallError);

function answerLifecyclePrompt(answer) {
  if (state.lifecyclePrompt) state.lifecyclePrompt.cleanup(answer);
}

$('#lifecycle-cancel').onclick = () => answerLifecyclePrompt(false);
$('#lifecycle-cancel-x').onclick = () => answerLifecyclePrompt(false);
$('#lifecycle-confirm').onclick = () => answerLifecyclePrompt(true);

window.chromux.onLifecycleConfirmClose(async (payload = {}) => {
  if (!(await showLifecyclePrompt(payload.reason || 'app-close'))) return;
  await window.chromux.confirmAppClose({ sessions: snapshotOpenSessions() });
});

window.chromux.onShortcutActivateSessionIndex(handleShortcutActivateSessionIndex);
window.chromux.onShortcutFocusNextQueueItem(handleShortcutFocusNextQueueItem);

$('#btn-log').onclick = async () => {
  const drawer = $('#drawer-log');
  if (!drawer.classList.contains('hidden')) {
    drawer.classList.add('hidden');
    return;
  }
  const entries = await window.chromux.readDeliveryLog();
  const host = $('#log-entries');
  host.innerHTML = '';
  if (entries.length === 0) {
    host.innerHTML = '<div class="log-empty">No deliveries yet. Captures land in ~/.chromux/captures and are logged here.</div>';
  }
  for (const e of entries) {
    const row = document.createElement('div');
    row.className = 'log-entry';
    const ts = document.createElement('span'); ts.className = 'le-ts';
    ts.textContent = (e.ts || '').replace('T', ' ').slice(0, 19);
    const ad = document.createElement('span'); ad.className = 'le-adapter'; ad.textContent = e.adapter || '?';
    const tg = document.createElement('span'); tg.className = 'le-target'; tg.textContent = e.target_session || '—';
    const st = document.createElement('span');
    st.className = 'le-status ' + (e.exit_status === 0 ? 'ok' : 'fail');
    st.textContent = e.exit_status === 0 ? 'OK' : `EXIT ${e.exit_status}`;
    const p = document.createElement('span'); p.className = 'le-path';
    p.textContent = e.payload_path || '';
    p.onclick = () => window.chromux.revealPath(e.payload_path);
    row.append(ts, ad, tg, st, p);
    host.appendChild(row);
  }
  drawer.classList.remove('hidden');
};
$('#drawer-close').onclick = () => $('#drawer-log').classList.add('hidden');

function modalOpen() {
  return [...document.querySelectorAll('.overlay')].some((el) => !el.classList.contains('hidden'));
}

function editableFocused() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.closest('.hidden')) return false;
  if (el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function activateSessionByIndex(index) {
  const session = orderedSessions()[index];
  if (session) activateSession(session.id);
}

function focusNextQueuedPreview(now = Date.now()) {
  const session = orderedSessions().find((s) => s.browser.queue.length > 0);
  if (!session) return null;
  const item = session.browser.queue[0];
  const key = `${session.id}\n${item.url}`;
  const last = state.ui.lastQueueShortcutFocus;
  if (last && last.key === key && now - last.at < 900) {
    return { sessionId: session.id, url: item.url, ignored: true };
  }

  activateSession(session.id);
  session.els.queuePanel.classList.remove('hidden');
  renderQueue(session);
  const openButton = session.els.queueList.querySelector(`.qi-btn.open[data-queue-open-url="${CSS.escape(item.url)}"]`)
    || session.els.queueList.querySelector('.qi-btn.open');
  if (openButton) {
    openButton.focus();
    state.ui.lastQueueShortcutFocus = { key, at: now };
  }
  return { sessionId: session.id, url: item.url, ignored: false, focused: Boolean(openButton) };
}

function handleShortcutActivateSessionIndex(payload) {
  const index = Number(payload && payload.index);
  if (!Number.isInteger(index) || modalOpen() || editableFocused()) return;
  activateSessionByIndex(index);
}

function handleShortcutFocusNextQueueItem() {
  if (modalOpen() || editableFocused()) return null;
  return focusNextQueuedPreview();
}

if (window.chromuxTest) {
  window.chromuxTestDetect = {
    setDetectRows(rows) {
      state.detect = { rows: rows.map((row) => ({ ...row })) };
      renderDetectList();
    },
    setRestoreSnapshot(snapshot) {
      state.restoreSessions = snapshot ? {
        ...snapshot,
        sessions: Array.isArray(snapshot.sessions) ? snapshot.sessions.map((row) => ({ ...row })) : [],
      } : null;
      renderRestoreSessions();
    },
    setQuery(query) {
      state.detectQuery = String(query || '');
      const input = $('#detect-search');
      if (input) input.value = state.detectQuery;
      renderRestoreSessions();
      renderDetectList();
    },
    detectTitles: () => [...document.querySelectorAll('#detect-list .dr-title')].map((el) => el.textContent),
    restoreTitles: () => [...document.querySelectorAll('#restore-list .dr-title')].map((el) => el.textContent),
    detectEmpty: () => $('#detect-list .detect-empty')?.textContent || '',
    restoreEmpty: () => $('#restore-list .restore-empty')?.textContent || '',
    openAllText: () => $('#detect-open-all').textContent,
    openAllDisabled: () => $('#detect-open-all').disabled,
    restoreOpenAllText: () => $('#restore-open-all').textContent,
    restoreOpenAllDisabled: () => $('#restore-open-all').disabled,
  };

  const testSession = (id) => {
    const session = state.sessions.get(id);
    if (!session) throw new Error(`Unknown test session: ${id}`);
    return session;
  };

  const addFakeSession = ({ name = 'test-session', agent = 'codex', cwd = '/tmp', alive = true, turnState = 'unknown', queue = [] } = {}) => {
    state.counter += 1;
    const session = newSessionShape({ id: 's' + state.counter, name, cwd, agent });
    session.lifecycle.alive = alive;
    session.turn.state = turnState;
    session.browser.queue = queue;
    const written = [];
    session._written = written;
    session.term.term = { write: (d) => written.push(d), focus() {}, dispose() {} };
    session.els = fakeSessionEls();
    state.sessions.set(session.id, session);
    if (!state.activeId) state.activeId = session.id;
    apply({ type: 'session-created', sessionId: session.id, name, cwd, agent });
    renderQueue(session);
    flushRender();
    return session.id;
  };

  window.chromuxTestUpdateQueue = {
    setStatus(status) {
      renderUpdateStatus({
        currentVersion: '0.0.0',
        latestVersion: '0.0.1',
        latestTag: 'chromux-v0.0.1',
        releaseUrl: 'https://github.com/GeorgeQLe/gblockparty-chromux/releases/tag/chromux-v0.0.1',
        reason: 'release',
        updateAvailable: true,
        ...status,
      });
      flushRender();
    },
    queue() {
      queueUpdate();
      flushRender();
    },
    phase: () => state.updateQueue.phase,
    blockers: () => updateBlockers().map((row) => row.session.name),
    attentionKinds: () => [...document.querySelectorAll('#attention-list .attention-kind')].map((el) => el.textContent),
    attentionButtons(kind) {
      for (const el of document.querySelectorAll('#attention-list .attention-item')) {
        if (el.querySelector('.attention-kind')?.textContent !== kind) continue;
        return [...el.querySelectorAll('.attention-actions .qi-btn')].map((button) => button.textContent);
      }
      return [];
    },
    dismissItem(kind) {
      for (const el of document.querySelectorAll('#attention-list .attention-item')) {
        if (el.querySelector('.attention-kind')?.textContent !== kind) continue;
        const dismiss = [...el.querySelectorAll('.attention-actions .qi-btn')]
          .find((button) => button.textContent === 'DISMISS');
        if (!dismiss) throw new Error(`No DISMISS on ${kind}`);
        dismiss.click();
        flushRender();
        return true;
      }
      throw new Error(`No attention item ${kind}`);
    },
    installButtonText: () => $('#settings-install-update').textContent,
    topButtonText: () => $('#btn-update-ready').textContent,
    setInstallResult(result) {
      state.testInstallUpdateResult = result;
    },
    addSession: async (opts) => addFakeSession(opts),
    setSession(id, patch = {}) {
      const session = testSession(id);
      if (patch.alive !== undefined) session.lifecycle.alive = patch.alive;
      if (patch.turnState !== undefined) session.turn.state = patch.turnState;
      invalidate('update', 'attention', 'badges');
      flushRender();
    },
    turnState: (id) => ({ ...testSession(id).turn }),
    markUserInput(id) {
      apply({ type: 'user-input', sessionId: id, data: 'x\r' });
      flushRender();
    },
    flushRender,
  };

  window.chromuxTestSignals = {
    addFakeSession,
    feedPtyChunk(id, chunk) {
      handlePtyData(id, chunk);
      flushRender();
    },
    emitSignal(id, event, detail = null) {
      apply({ type: 'turn-signal', sessionId: id, signal: event, detail });
      flushRender();
    },
    typeInput(id, data = 'x') {
      apply({ type: 'user-input', sessionId: id, data });
      flushRender();
    },
    focus(id) {
      activateSession(id);
      flushRender();
    },
    dismiss(id) {
      apply({ type: 'attention-dismissed', sessionId: id });
      flushRender();
    },
    exit(id, exitCode = 0) {
      apply({ type: 'session-exited', sessionId: id, exitCode });
      flushRender();
    },
    turnState: (id) => ({ ...testSession(id).turn }),
    activeId: () => state.activeId,
    written: (id) => (testSession(id)._written || []).join(''),
    attentionItems: () => [...document.querySelectorAll('#attention-list .attention-item')].map((el) => ({
      kind: el.querySelector('.attention-kind')?.textContent || '',
      name: el.querySelector('.attention-name')?.textContent || '',
    })),
    dismissItem(kind, name) {
      for (const el of document.querySelectorAll('#attention-list .attention-item')) {
        if (el.querySelector('.attention-kind')?.textContent !== kind) continue;
        if (name && el.querySelector('.attention-name')?.textContent !== name) continue;
        const buttons = [...el.querySelectorAll('.attention-actions .qi-btn')];
        const dismiss = buttons.find((b) => b.textContent === 'DISMISS');
        if (!dismiss) throw new Error(`No DISMISS on ${kind}`);
        dismiss.click();
        flushRender();
        return true;
      }
      throw new Error(`No attention item ${kind}`);
    },
    events: () => state.events.map((e) => ({ ...e })),
    flushRender,
  };

  window.chromuxTestPreviews = {
    addSession: async (opts) => addFakeSession(opts),
    scan(line) {
      return scanLineForPreviews(stripTerminalControlsForPreview(line)).map((hit) => ({ ...hit }));
    },
    typeInput(id, data) {
      apply({ type: 'user-input', sessionId: id, data });
      flushRender();
    },
    feed(id, chunk) {
      handlePtyData(id, chunk);
      flushRender();
    },
    queueUrls: (id) => testSession(id).browser.queue.map((item) => item.url),
    queueCount: (id) => testSession(id).browser.queue.length,
    currentUrl: (id) => testSession(id).browser.currentUrl,
    openQueued(id, url) {
      const session = testSession(id);
      const buttons = [...session.els.queueList.querySelectorAll('.qi-btn.open')];
      const button = buttons.find((candidate) => candidate.dataset.queueOpenUrl === url);
      if (!button) throw new Error(`No queued OPEN for ${url}`);
      button.click();
      flushRender();
    },
    flushRender,
  };

  window.chromuxTestCaptures = {
    captureRecords: () => [...state.captures.values()].map((rec) => ({ ...rec })),
    beginFakeCapture({ sessionId, url = null } = {}) {
      state.counter += 1;
      const captureId = 'c' + state.counter;
      apply({ type: 'capture-created', captureId, sessionId, url });
      apply({
        type: 'capture-written',
        captureId,
        payloadPath: `/tmp/chromux-test/${captureId}/payload.yaml`,
        screenshotPath: null,
        targetSessionId: null,
      });
      state.ui.captureModal = { captureId, pngBase64: null, payloadBase: {} };
      flushRender();
      return captureId;
    },
    beginFakeDelivery(captureId, { targetSessionId = null } = {}) {
      const deliveryId = 'd-test-' + captureId;
      apply({ type: 'capture-delivering', captureId, deliveryId, targetSessionId });
      flushRender();
      return deliveryId;
    },
    closeDelivery(deliveryId, exitCode, error = null) {
      handleDeliverClose({ deliveryId, exitCode, error });
      flushRender();
    },
    acknowledge(captureId) {
      apply({ type: 'capture-acknowledged', captureId });
      flushRender();
    },
    closeCaptureModal() {
      state.ui.captureModal = null;
      flushRender();
    },
    captureModalId: () => (state.ui.captureModal ? state.ui.captureModal.captureId : null),
    sentGauge: () => $('#g-captures').textContent,
    setCurrentUrl(id, url) {
      testSession(id).browser.currentUrl = url;
      invalidate('captureChips');
      flushRender();
    },
    captureChip(id) {
      const chip = testSession(id).els.captureChip;
      return { hidden: chip.classList.contains('hidden'), text: chip.textContent };
    },
    flushRender,
  };

  window.chromuxTestShortcuts = {
    addSession: async (opts) => addFakeSession(opts),
    activateIndex(index) {
      handleShortcutActivateSessionIndex({ index });
      flushRender();
    },
    focusNextQueuedPreview(now) {
      const result = focusNextQueuedPreview(now);
      flushRender();
      return result;
    },
    // The guarded IPC path (modal/editable checks), unlike focusNextQueuedPreview
    // above which calls straight past the guard.
    shortcutFocusNextQueueItem() {
      const result = handleShortcutFocusNextQueueItem();
      flushRender();
      return result;
    },
    activeId: () => state.activeId,
    queueCount: (id) => testSession(id).browser.queue.length,
    queuePanelHidden: (id) => testSession(id).els.queuePanel.classList.contains('hidden'),
    focusedOpenUrl: () => document.activeElement?.dataset?.queueOpenUrl || null,
    clickFocused() {
      if (!document.activeElement) throw new Error('Nothing focused');
      document.activeElement.click();
      flushRender();
    },
    currentUrl: (id) => testSession(id).browser.currentUrl,
    flushRender,
  };

  window.chromuxTestBrowser = {
    addSession({ name = 'browser-test', agent = 'codex', cwd = '/tmp', url = null, queue = [] } = {}) {
      state.counter += 1;
      const session = newSessionShape({ id: 's' + state.counter, name, cwd, agent });
      const viewEls = buildSessionView(session);
      const tabEls = buildSessionTab(session);
      let fitCount = 0;
      session.term.term = { focus() {}, dispose() {} };
      session.term.fit = () => { fitCount += 1; };
      session._fitCount = () => fitCount;
      session.els = { ...viewEls, ...tabEls };
      state.sessions.set(session.id, session);
      apply({ type: 'session-created', sessionId: session.id, name, cwd, agent });
      session.browser.queue = queue.map((item) => ({
        url: item.url,
        source: item.source || 'TEST',
        ts: Number.isFinite(item.ts) ? item.ts : Date.now(),
      })).filter((item) => item.url);
      if (url) {
        session.browser.currentUrl = url;
        session.els.urlBar.value = url;
      }
      renderQueue(session);
      activateSession(session.id);
      flushRender();
      return session.id;
    },
    collapse(id) {
      setBrowserCollapsed(testSession(id), true);
      flushRender();
    },
    restore(id) {
      setBrowserCollapsed(testSession(id), false);
      flushRender();
    },
    focus(id) {
      activateSession(id);
      flushRender();
    },
    narrow(id, browserPx = 240) {
      const session = testSession(id);
      session.browser.expandedGridTemplate = `minmax(320px, 1fr) 6px ${browserPx}px`;
      applyBrowserLayout(session);
      flushRender();
    },
    scrollCaptureIntoView(id) {
      testSession(id).els.captureBtn.scrollIntoView({ block: 'nearest', inline: 'end' });
      flushRender();
    },
    state(id) {
      const session = testSession(id);
      const toolbar = session.els.browserToolbar;
      const toolbarRect = toolbar.getBoundingClientRect();
      const captureRect = session.els.captureBtn.getBoundingClientRect();
      return {
        active: state.activeId === id,
        collapsed: session.browser.collapsed,
        grid: session.els.view.style.gridTemplateColumns,
        webCollapsed: session.els.webPane.classList.contains('collapsed'),
        webHostHidden: getComputedStyle(session.els.webHost).display === 'none',
        dividerDisabled: session.els.divider.classList.contains('disabled'),
        collapseText: session.els.collapseBtn.textContent,
        collapseTitle: session.els.collapseBtn.title,
        currentUrl: session.browser.currentUrl,
        urlBar: session.els.urlBar.value,
        queueCount: session.browser.queue.length,
        queuePanelHidden: session.els.queuePanel.classList.contains('hidden'),
        fitCount: session._fitCount(),
        toolbarOverflow: toolbar.scrollWidth > toolbar.clientWidth,
        captureReachable: captureRect.right <= toolbarRect.right + 1 && captureRect.left >= toolbarRect.left - 1,
      };
    },
    flushRender,
  };

  window.chromuxTestAgentCommand = {
    build: (agent, resumeId = null) => agentCommand(agent, resumeId),
    env: () => ({ ...state.env }),
  };
}

function fakeSessionEls() {
  const queuePanel = document.createElement('div');
  queuePanel.className = 'queue-panel hidden';
  const queueList = document.createElement('div');
  queuePanel.appendChild(queueList);
  const queueBtn = document.createElement('button');
  const queueBadge = document.createElement('span');
  const webHost = document.createElement('div');
  const placeholder = document.createElement('div');
  webHost.appendChild(placeholder);
  document.body.appendChild(queuePanel);
  return {
    queuePanel,
    queueList,
    queueBtn,
    queueBadge,
    webHost,
    placeholder,
    pickBtn: document.createElement('button'),
    captureBtn: document.createElement('button'),
    consoleChip: document.createElement('span'),
    tabBadge: document.createElement('span'),
    tab: document.createElement('button'),
    dot: document.createElement('span'),
    view: document.createElement('section'),
    urlBar: document.createElement('input'),
    captureChip: document.createElement('span'),
  };
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.key === 't') {
    e.preventDefault();
    openNewSessionModal();
  }
  if (e.metaKey && e.key === 'd') {
    e.preventDefault();
    openDetectModal();
  }
  if (e.metaKey && /^[1-9]$/.test(e.key) && !modalOpen() && !editableFocused()) {
    e.preventDefault();
    handleShortcutActivateSessionIndex({ index: Number(e.key) - 1 });
  }
  if (e.key === 'Escape') {
    closeSessionContextMenu();
    $('#modal-settings').classList.add('hidden');
    $('#modal-new').classList.add('hidden');
    $('#modal-detect').classList.add('hidden');
    $('#drawer-log').classList.add('hidden');
  }
});

document.addEventListener('click', closeSessionContextMenu);
window.addEventListener('blur', closeSessionContextMenu);

// boot
(async () => {
  state.env = await window.chromux.getEnv();
  state.restoreSessions = state.env.restoreSessions || null;
  window.chromux.onUpdateStatus((status) => renderUpdateStatus(status));
  $('#storage-path').textContent = state.env.capturesDir.replace(state.env.home, '~');
  $('.sb-ver').textContent = `chromux ${state.env.version || '0.6.0'} — prototype`;
  await autoRestoreWorkspace().catch((err) => {
    renderRestoreWarning([{ name: 'restore failed', cwd: err.message, agent: 'chromux' }]);
  });
  await checkUpdates(false).catch(() => {});
  updateBadges();
  renderAttentionQueue();
})();
