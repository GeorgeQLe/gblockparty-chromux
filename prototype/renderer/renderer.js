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
    hoverTabSessionId: null,
  },
  lastCwd: null,
  contextMenu: null,
  updateStatus: null,
  detect: null, // last external-terminal scan
  detectQuery: '',
  restoreSessions: null,
  restoreWarningRows: [],
  restoreWarningDismissed: false,
  resumeRetryWarning: null,
  lifecyclePrompt: null,
  testInstallUpdateResult: null,
  updateQueue: {
    phase: 'idle',
    error: null,
    output: '',
    lastAttemptAt: null,
  },
  shortcutDebug: {
    source: null,
    webContentsId: null,
    type: null,
    latestKey: null,
    modifiers: { meta: false, shift: false, alt: false, control: false },
    lastEventAt: 0,
  },
};

const BOUNDS = {
  consoleTail: 50,
  consoleMsgChars: 500,
  outerHtmlChars: 8000,
  reloadThrottleMs: 3000,
  shortcutDebugStaleMs: 1500,
  resumeStartupExitMs: 15000,
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
const PREVIEW_SUPPRESS_MAX = 40;
const PREVIEW_SUPPRESS_LINE_TTL = 3;
const QUEUE_REASON_BY_SOURCE = {
  TERM: 'detected in agent output',
  FILE: 'local HTML path exists',
  POPUP: 'opened by page popup',
  RESTORE: 'restored from previous session',
};

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

function looksLikeFileMatchLine(line) {
  return /^\s*(?:[./~]|[\w@+.-][\w@+./ -]*\.[A-Za-z0-9_-]{1,12}:)\S*:\d+(?::\d+)?:/.test(line)
    || /^\s*(?:[./~]?[\w@+.-]+\/)+[\w@+.-]+:\d+(?::\d+)?:/.test(line);
}

function looksLikeDiffOrPatchLine(line) {
  return /^\s*(?:diff --git|index [0-9a-f]+\.\.|@@\s|[+-]{3}\s)/.test(line)
    || /^\s*[+-]\s*(?:['"`[{(<]|\w|\$|\/\/|#|[*])/.test(line);
}

function looksLikeQuotedPreviewExample(line) {
  return /['"`]https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(line)
    || /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])[^'"`\s]*['"`]/i.test(line)
    || /['"`](?:file:\/\/)?\/[^'"`]*\.html?['"`]/i.test(line);
}

function looksLikeCodePreviewExample(line) {
  const codeSignals = [
    /\b(?:q\.feed|feedPtyChunk|expect|assert|it|test|describe)\s*\(/,
    /\b(?:const|let|var)\s+[\w$]+\s*=/,
    /\b(?:return|throw)\s+/,
    /\b(?:url|href|src|currentUrl|detectedText)\s*[:=]/i,
    /=>\s*/,
    /[{}[\];]\s*$/,
  ];
  return codeSignals.some((re) => re.test(line));
}

function looksLikeDocumentationPreviewExample(line) {
  return /^\s*\|.*\|\s*$/.test(line)
    || /^\s*(?:[-*]|\d+\.)\s+/.test(line)
    || /^\s*#{1,6}\s+/.test(line)
    || /\b(?:release notes?|expected|actual|markdown|history)\b/i.test(line);
}

function shouldRoutePreviewLine(line, hits) {
  if (!Array.isArray(hits) || hits.length === 0) return false;
  const text = String(line || '').trim();
  if (!text) return false;

  if (looksLikeFileMatchLine(text)) return false;
  if (looksLikeDiffOrPatchLine(text)) return false;
  if (looksLikeQuotedPreviewExample(text)) return false;
  if (looksLikeCodePreviewExample(text)) return false;
  if (looksLikeDocumentationPreviewExample(text)) return false;

  return true;
}

function queueReasonForSource(source) {
  return QUEUE_REASON_BY_SOURCE[source] || QUEUE_REASON_BY_SOURCE.TERM;
}

function normalizeQueueItem(item, fallbackSource = 'RESTORE') {
  if (!item || typeof item !== 'object' || typeof item.url !== 'string' || !item.url) return null;
  const hasReason = typeof item.reason === 'string' && item.reason.trim();
  const source = hasReason && typeof item.source === 'string' && item.source
    ? item.source
    : fallbackSource;
  return {
    url: item.url,
    source,
    reason: hasReason ? item.reason.trim() : queueReasonForSource(source),
    detectedText: typeof item.detectedText === 'string' && item.detectedText ? item.detectedText : null,
    ts: Number.isFinite(item.ts) ? item.ts : Date.now(),
  };
}

function queueItemForPreview(url, source, detail = {}) {
  return normalizeQueueItem({
    url,
    source,
    reason: detail.reason || queueReasonForSource(source),
    detectedText: detail.detectedText || null,
    ts: Date.now(),
  }, source);
}

function queueDetailText(item) {
  if (!item) return '';
  return item.reason ? `${item.reason}: ${item.url}` : item.url;
}

function submittedInputText(raw) {
  return stripTerminalControlsForPreview(raw).replace(/\s+/g, ' ').trim();
}

function trackTypedPreviewSuppressions(session, data) {
  if (!session || !data) return;
  const t = session.term;
  for (const ch of String(data)) {
    if (ch === '\r' || ch === '\n') {
      const submitted = submittedInputText(t.typedInputBuf);
      t.typedInputBuf = '';
      if (!submitted) continue;
      const hits = scanLineForPreviews(submitted);
      for (const hit of hits) {
        t.previewSuppress.push({
          url: hit.url,
          source: hit.source,
          submittedText: submitted,
          remainingLines: PREVIEW_SUPPRESS_LINE_TTL,
          ts: Date.now(),
        });
      }
      if (t.previewSuppress.length > PREVIEW_SUPPRESS_MAX) {
        t.previewSuppress.splice(0, t.previewSuppress.length - PREVIEW_SUPPRESS_MAX);
      }
    } else if (ch === '\b' || ch === '\x7f') {
      t.typedInputBuf = t.typedInputBuf.slice(0, -1);
    } else {
      t.typedInputBuf += ch;
      if (t.typedInputBuf.length > 4096) t.typedInputBuf = t.typedInputBuf.slice(-4096);
    }
  }
}

function consumeTypedPreviewSuppression(session, hit, line) {
  if (!session || !hit) return false;
  const suppress = session.term.previewSuppress;
  if (!Array.isArray(suppress) || suppress.length === 0) return false;
  const lineText = submittedInputText(line);
  const index = suppress.findIndex((item) => item.url === hit.url
    && item.source === hit.source
    && lineText.includes(item.submittedText));
  if (index === -1) return false;
  suppress.splice(index, 1);
  return true;
}

function ageTypedPreviewSuppressions(session) {
  if (!session || !Array.isArray(session.term.previewSuppress)) return;
  session.term.previewSuppress = session.term.previewSuppress
    .map((item) => ({ ...item, remainingLines: item.remainingLines - 1 }))
    .filter((item) => item.remainingLines > 0);
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
    const hits = scanLineForPreviews(line);
    if (!shouldRoutePreviewLine(line, hits)) {
      ageTypedPreviewSuppressions(session);
      continue;
    }
    for (const hit of hits) {
      if (consumeTypedPreviewSuppression(session, hit, line)) continue;
      if (hit.source === 'FILE') {
        // Soft-wrapped terminal lines can split a long path into a shorter,
        // still-plausible one — only route paths that exist on disk.
        const p = decodeURIComponent(hit.url.replace(/^file:\/\//, ''));
        window.chromux.fileExists(p).then((ok) => {
          if (ok) routePreview(session, hit.url, hit.source, { detectedText: line });
        });
      } else {
        routePreview(session, hit.url, hit.source, { detectedText: line });
      }
    }
    ageTypedPreviewSuppressions(session);
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
      if (session) {
        const item = queueItemForPreview(event.url, event.source || 'TERM', {
          reason: event.reason,
          detectedText: event.detectedText,
        });
        if (item) session.browser.queue.push(item);
      }
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
  if (areas.includes('shortcutDebug')) scheduleShortcutFocusContextReport();
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
  if (dirty.has('tabs')) renderTabs();
  if (dirty.has('badges')) updateBadges();
  if (dirty.has('captureChips')) renderCaptureChips();
  if (dirty.has('shortcutDebug')) renderShortcutDebug();
}

// ───────────────────────────────────────────────────────────────────────────
// Session shape — explicit state domains. Identity is flat and immutable;
// lifecycle, turn, browser-pane, and terminal state live in their own domains.
// ───────────────────────────────────────────────────────────────────────────

function newSessionShape({ id, name, cwd, agent }) {
  return {
    id, name, cwd, agent,
    lifecycle: { alive: true, exitCode: null, exitedAt: null, resumeLaunch: null },
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
      guestEditableFocused: false,
      collapsed: false,
      expandedGridTemplate: 'minmax(320px, 46%) 6px minmax(360px, 1fr)',
    },
    term: {
      term: null,
      fitAddon: null,
      fit: () => {},
      lineBuf: '',
      signalBuf: '',
      titleBuf: '',
      title: '',
      typedInputBuf: '',
      previewSuppress: [],
    },
    els: null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Review queue — never hot-swap the pane. Auto-fill only an empty pane;
// refresh only when the pane's own URL is re-emitted; everything else queues.
// ───────────────────────────────────────────────────────────────────────────

function routePreview(session, url, source, detail = {}) {
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
  if (!b.currentUrl && !b.webview) {
    openInPane(session, url); // empty pane: auto-fill is not attention-stealing
    return;
  }
  if (b.queue.some((q) => q.url === url)) return;
  apply({
    type: 'preview-queued',
    sessionId: session.id,
    url,
    source,
    reason: detail.reason,
    detectedText: detail.detectedText,
  });
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
    const main = document.createElement('span');
    main.className = 'qi-main';
    const reason = document.createElement('span');
    reason.className = 'qi-reason';
    reason.textContent = item.reason || queueReasonForSource(item.source);
    const u = document.createElement('span');
    u.className = 'qi-url';
    u.textContent = item.url;
    main.title = queueDetailText(item);
    u.title = item.url;
    main.append(reason, u);
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
    row.append(src, main, open, dismiss);
    host.appendChild(row);
  }
  session.els.queueBadge.textContent = String(queue.length);
  session.els.queueBadge.classList.toggle('zero', queue.length === 0);
  session.els.queueBtn.classList.toggle('attention', queue.length > 0);
  invalidate('attention', 'badges', 'shortcutDebug');
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
// Shortcut diagnostics — display-only telemetry for app/window/webview key
// events. Raw typed characters are intentionally never recorded or rendered.
// ───────────────────────────────────────────────────────────────────────────

const SHORTCUT_DEBUG_MODIFIER_KEYS = new Set(['⌘', '⇧', '⌥', '⌃']);
let shortcutDebugClearTimer = null;
let shortcutFocusContextReportTimer = null;

function normalizeShortcutDebugKey(raw) {
  const key = String(raw || '');
  if (!key) return null;
  if (/^[1-9]$/.test(key)) return key;
  const lower = key.toLowerCase();
  if (['j', 'b', 't', 'd', 'q'].includes(lower)) return lower.toUpperCase();
  if (lower === 'escape' || lower === 'esc') return 'Esc';
  if (lower === 'arrowup') return '↑';
  if (lower === 'arrowdown') return '↓';
  if (lower === 'arrowleft') return '←';
  if (lower === 'arrowright') return '→';
  if (key === '↑' || key === '↓' || key === '←' || key === '→') return key;
  if (lower === 'meta' || lower === 'command' || key === '⌘') return '⌘';
  if (lower === 'shift' || key === '⇧') return '⇧';
  if (lower === 'alt' || lower === 'option' || key === '⌥') return '⌥';
  if (lower === 'control' || lower === 'ctrl' || key === '⌃') return '⌃';
  return null;
}

function shortcutDebugInputFromDomEvent(e, source = 'renderer') {
  return {
    source,
    type: e.type === 'keyup' ? 'keyUp' : 'keyDown',
    key: normalizeShortcutDebugKey(e.key),
    modifiers: {
      meta: Boolean(e.metaKey),
      shift: Boolean(e.shiftKey),
      alt: Boolean(e.altKey),
      control: Boolean(e.ctrlKey),
    },
    repeat: Boolean(e.repeat),
    ts: Date.now(),
  };
}

function scheduleShortcutDebugClear() {
  if (shortcutDebugClearTimer) clearTimeout(shortcutDebugClearTimer);
  shortcutDebugClearTimer = setTimeout(() => {
    if (Date.now() - state.shortcutDebug.lastEventAt < BOUNDS.shortcutDebugStaleMs) {
      scheduleShortcutDebugClear();
      return;
    }
    state.shortcutDebug.latestKey = null;
    state.shortcutDebug.modifiers = { meta: false, shift: false, alt: false, control: false };
    invalidate('shortcutDebug');
  }, BOUNDS.shortcutDebugStaleMs + 20);
}

function noteShortcutDebugInput(payload = {}) {
  const key = normalizeShortcutDebugKey(payload.key);
  const modifiers = {
    meta: Boolean(payload.modifiers && payload.modifiers.meta),
    shift: Boolean(payload.modifiers && payload.modifiers.shift),
    alt: Boolean(payload.modifiers && payload.modifiers.alt),
    control: Boolean(payload.modifiers && payload.modifiers.control),
  };
  if (payload.type === 'keyDown') {
    if (key === '⌘') modifiers.meta = true;
    if (key === '⇧') modifiers.shift = true;
    if (key === '⌥') modifiers.alt = true;
    if (key === '⌃') modifiers.control = true;
  } else if (payload.type === 'keyUp') {
    if (key === '⌘') modifiers.meta = false;
    if (key === '⇧') modifiers.shift = false;
    if (key === '⌥') modifiers.alt = false;
    if (key === '⌃') modifiers.control = false;
  }

  state.shortcutDebug.source = payload.source || 'host';
  state.shortcutDebug.webContentsId = Number.isFinite(payload.webContentsId) ? payload.webContentsId : null;
  state.shortcutDebug.type = payload.type || 'unknown';
  state.shortcutDebug.modifiers = modifiers;
  if (key && !SHORTCUT_DEBUG_MODIFIER_KEYS.has(key)) state.shortcutDebug.latestKey = key;
  else if (payload.type === 'keyDown') state.shortcutDebug.latestKey = null;
  state.shortcutDebug.lastEventAt = Number.isFinite(payload.ts) ? payload.ts : Date.now();
  scheduleShortcutDebugClear();
  invalidate('shortcutDebug');
}

function shortcutDebugChord() {
  const stale = !state.shortcutDebug.lastEventAt
    || Date.now() - state.shortcutDebug.lastEventAt > BOUNDS.shortcutDebugStaleMs;
  return {
    key: stale ? null : state.shortcutDebug.latestKey,
    modifiers: stale
      ? { meta: false, shift: false, alt: false, control: false }
      : { ...state.shortcutDebug.modifiers },
  };
}

function shortcutContextKind(context) {
  if (window.chromux && typeof window.chromux.shortcutContextKind === 'function') {
    return window.chromux.shortcutContextKind(context);
  }
  if (context.modalOpen) return 'modal';
  if (context.hostEditable) return 'hostEditable';
  if (context.guestEditable) return 'guestEditable';
  if (context.terminal) return 'terminal';
  return 'appSurface';
}

function shortcutContextDisabledReason(context) {
  if (window.chromux && typeof window.chromux.shortcutContextDisabledReason === 'function') {
    return window.chromux.shortcutContextDisabledReason(context);
  }
  if (context.focusKind === 'modal') return 'modal open';
  if (context.focusKind === 'hostEditable') return 'host editable';
  if (context.focusKind === 'guestEditable') return 'guest editable';
  return null;
}

function shortcutFocusKindLabel(kind) {
  if (kind === 'terminal') return 'terminal';
  if (kind === 'hostEditable') return 'host editable';
  if (kind === 'guestEditable') return 'guest editable';
  if (kind === 'modal') return 'modal';
  return 'app surface';
}

function shortcutFocusContext() {
  const activeSession = state.sessions.get(state.activeId) || null;
  let queueCount = 0;
  for (const session of state.sessions.values()) queueCount += session.browser.queue.length;
  const modal = modalOpen();
  const terminal = terminalFocused();
  const hostEditable = hostEditableFocused();
  const guestEditable = guestEditableFocused();
  const focusKind = shortcutContextKind({
    modalOpen: modal,
    terminal,
    hostEditable,
    guestEditable,
  });
  return {
    focusKind,
    modalOpen: modal,
    terminal,
    hostEditable,
    guestEditable,
    activeSessionId: activeSession ? activeSession.id : null,
    activeSessionName: activeSession ? activeSession.name : null,
    sessionCount: state.sessions.size,
    queueCount,
    browserCollapsed: activeSession ? Boolean(activeSession.browser.collapsed) : null,
  };
}

function guardedShortcutDisabledReason(context) {
  return shortcutContextDisabledReason(context);
}

function reportShortcutFocusContext() {
  if (!window.chromux || typeof window.chromux.reportShortcutFocusContext !== 'function') return;
  const context = shortcutFocusContext();
  window.chromux.reportShortcutFocusContext({ focusKind: context.focusKind });
  for (const session of state.sessions.values()) {
    const id = Number(session.browser.webContentsId);
    if (!Number.isFinite(id) || id <= 0) continue;
    window.chromux.reportShortcutFocusContext({
      webContentsId: id,
      focusKind: session.browser.guestEditableFocused ? 'guestEditable' : 'appSurface',
    });
  }
}

function scheduleShortcutFocusContextReport() {
  if (shortcutFocusContextReportTimer) return;
  shortcutFocusContextReportTimer = setTimeout(() => {
    shortcutFocusContextReportTimer = null;
    reportShortcutFocusContext();
  }, 0);
}

function shortcutMatchesChord(shortcut, chord) {
  if (!chord.key || shortcut.key !== chord.key) return false;
  const required = shortcut.modifiers || {};
  return Boolean(required.meta) === Boolean(chord.modifiers.meta)
    && Boolean(required.shift) === Boolean(chord.modifiers.shift)
    && Boolean(required.alt) === Boolean(chord.modifiers.alt)
    && Boolean(required.control) === Boolean(chord.modifiers.control);
}

function computeShortcutCatalog() {
  const context = shortcutFocusContext();
  const chord = shortcutDebugChord();
  const sessions = orderedSessions();
  const guardReason = guardedShortcutDisabledReason(context);
  const activeSession = context.activeSessionId ? state.sessions.get(context.activeSessionId) : null;
  const definitions = [];

  for (let i = 0; i < 9; i += 1) {
    definitions.push({
      id: `session-${i + 1}`,
      label: `⌘${i + 1}`,
      key: String(i + 1),
      modifiers: { meta: true },
      kind: 'guarded',
      index: i,
      order: i,
    });
  }
  definitions.push(
    { id: 'queue-next', label: '⌘J', key: 'J', modifiers: { meta: true }, kind: 'guarded', order: 20 },
    { id: 'browser-toggle', label: '⌘⇧B', key: 'B', modifiers: { meta: true, shift: true }, kind: 'guarded', order: 21 },
    { id: 'quit', label: '⌘Q', key: 'Q', modifiers: { meta: true }, kind: 'global', order: 30 },
    { id: 'new-session', label: '⌘T', key: 'T', modifiers: { meta: true }, kind: 'document', order: 31 },
    { id: 'detect', label: '⌘D', key: 'D', modifiers: { meta: true }, kind: 'document', order: 32 },
    { id: 'escape', label: 'Esc', key: 'Esc', modifiers: {}, kind: 'document', order: 33 },
  );

  return definitions.map((shortcut) => {
    let disabledReason = null;
    let description = '';

    if (shortcut.id.startsWith('session-')) {
      const target = sessions[shortcut.index];
      disabledReason = guardReason || (target ? null : `no session ${shortcut.index + 1}`);
      description = target ? `activate ${target.name}` : 'session slot empty';
    } else if (shortcut.id === 'queue-next') {
      disabledReason = guardReason || (context.queueCount > 0 ? null : 'queue empty');
      description = context.queueCount > 0 ? `${context.queueCount} queued` : 'queue empty';
    } else if (shortcut.id === 'browser-toggle') {
      disabledReason = guardReason || (activeSession ? null : 'no active session');
      description = activeSession
        ? (activeSession.browser.collapsed ? 'restore browser' : 'collapse browser')
        : 'no active session';
    } else if (shortcut.id === 'quit') {
      disabledReason = guardReason;
      description = 'guarded quit';
    } else if (shortcut.id === 'new-session') {
      disabledReason = guardReason;
      description = 'new session';
    } else if (shortcut.id === 'detect') {
      disabledReason = guardReason;
      description = 'detect terminals';
    } else if (shortcut.id === 'escape') {
      description = context.modalOpen || state.contextMenu || !$('#drawer-log').classList.contains('hidden')
        ? 'close overlay'
        : 'close overlay';
    }

    return {
      id: shortcut.id,
      label: shortcut.label,
      key: shortcut.key,
      modifiers: { ...shortcut.modifiers },
      kind: shortcut.kind,
      description,
      available: !disabledReason,
      matchedByCurrentChord: shortcutMatchesChord(shortcut, chord),
      disabledReason,
      order: shortcut.order,
    };
  }).sort((a, b) => {
    const rank = (item) => (item.matchedByCurrentChord ? 0 : (item.available ? 1 : 2));
    return rank(a) - rank(b) || a.order - b.order;
  });
}

function shortcutDebugSourceLabel(source) {
  if (source === 'webview') return 'webview';
  if (source === 'renderer') return 'renderer doc';
  if (source === 'host') return 'host window';
  return 'no key events';
}

function appendShortcutChip(host, text, className = '') {
  const chip = document.createElement('span');
  chip.className = `sd-chip ${className}`.trim();
  chip.textContent = text;
  chip.title = text;
  host.appendChild(chip);
}

function renderShortcutDebug() {
  const root = $('#shortcut-debug');
  if (!root) return;
  const chord = shortcutDebugChord();
  const context = shortcutFocusContext();

  const keys = $('#shortcut-debug-keys');
  keys.innerHTML = '';
  const mods = [
    ['meta', '⌘'],
    ['shift', '⇧'],
    ['alt', '⌥'],
    ['control', '⌃'],
  ];
  for (const [name, label] of mods) {
    const el = document.createElement('span');
    el.className = `kbd-key${chord.modifiers[name] ? ' on' : ''}`;
    el.textContent = label;
    keys.appendChild(el);
  }
  const latest = document.createElement('span');
  latest.className = `kbd-key latest${chord.key ? ' active' : ''}`;
  latest.textContent = chord.key || '·';
  latest.title = chord.key ? 'Latest shortcut key' : 'No current shortcut key';
  keys.appendChild(latest);

  const source = $('#shortcut-debug-source');
  source.innerHTML = '';
  appendShortcutChip(source, `src ${shortcutDebugSourceLabel(state.shortcutDebug.source)}`, state.shortcutDebug.source ? 'hot' : '');

  const contextHost = $('#shortcut-debug-context');
  contextHost.innerHTML = '';
  appendShortcutChip(contextHost, context.modalOpen ? 'modal open' : 'no modal', context.modalOpen ? 'warn' : '');
  appendShortcutChip(
    contextHost,
    shortcutFocusKindLabel(context.focusKind),
    guardedShortcutDisabledReason(context) ? 'warn' : (context.focusKind === 'terminal' ? 'ok' : ''),
  );
  appendShortcutChip(contextHost, context.activeSessionId ? 'active session' : 'no active', context.activeSessionId ? 'ok' : 'warn');
  appendShortcutChip(contextHost, context.queueCount > 0 ? `queue ${context.queueCount}` : 'queue empty', context.queueCount > 0 ? 'ok' : '');
  appendShortcutChip(
    contextHost,
    context.browserCollapsed === null ? 'browser none' : (context.browserCollapsed ? 'browser collapsed' : 'browser restored'),
    context.browserCollapsed ? 'warn' : '',
  );

  const catalog = $('#shortcut-debug-catalog');
  catalog.innerHTML = '';
  for (const shortcut of computeShortcutCatalog()) {
    const chip = document.createElement('span');
    chip.className = `shortcut-chip${shortcut.matchedByCurrentChord ? ' matched' : ''}${shortcut.available ? '' : ' disabled'}`;
    const label = document.createElement('span');
    label.textContent = shortcut.label;
    chip.appendChild(label);
    if (shortcut.disabledReason) {
      const reason = document.createElement('span');
      reason.className = 'reason';
      reason.textContent = shortcut.disabledReason;
      chip.appendChild(reason);
    }
    chip.title = `${shortcut.label}: ${shortcut.disabledReason || shortcut.description}`;
    catalog.appendChild(chip);
  }
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
    wv.dataset.sessionId = session.id;
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
      b.guestEditableFocused = false;
      b.currentUrl = e.url;
      session.els.urlBar.value = e.url;
      invalidate('captureChips', 'shortcutDebug');
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
      invalidate('shortcutDebug');
    });
    wv.addEventListener('blur', () => {
      b.guestEditableFocused = false;
      invalidate('shortcutDebug');
    });
    wv.addEventListener('ipc-message', (e) => {
      if (e.channel === 'chromux-pick') onElementPicked(session, e.args[0] || {});
      else if (e.channel === 'chromux-pick-cancel') setPicking(session, false);
      else if (e.channel === 'chromux-focused-editable') {
        b.guestEditableFocused = Boolean((e.args[0] || {}).editable);
        invalidate('shortcutDebug');
      }
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
  invalidate('shortcutDebug');
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
  invalidate('shortcutDebug');
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

function resumeIdForRow(row) {
  const id = row && row.resume && typeof row.resume.id === 'string' ? row.resume.id : null;
  return id && /^[0-9a-f-]+$/i.test(id) ? id : null;
}

function resumeLaunchForRow(row, { name = null, command = null, source = 'detect', autoRestored = false } = {}) {
  const resumeId = resumeIdForRow(row);
  const resumeCommand = command || (row ? (row.command || resumeCommandFor(row)) : null);
  if (!row || !row.agent || !resumeId || !resumeCommand) return null;
  return {
    agent: row.agent,
    resumeId,
    command: resumeCommand,
    launchedAt: Date.now(),
    source,
    sourceName: row.name || row.tty || name || null,
    sessionName: name || row.name || row.tty || null,
    cwd: row.cwd || null,
    autoRestored: Boolean(autoRestored),
    failedAt: null,
    retriedAt: null,
  };
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

function sessionTabLabel(session) {
  return (session.term && session.term.title) || session.name;
}

function sessionTabTooltip(session) {
  const label = sessionTabLabel(session);
  const cwd = session.cwd || '~';
  return session.term && session.term.title && session.term.title !== session.name
    ? `${label} — ${cwd}\nLaunch name: ${session.name}`
    : `${label} — ${cwd}`;
}

function updateSessionTabText(session) {
  if (!session || !session.els || !session.els.tab) return;
  const label = sessionTabLabel(session);
  session.els.tab.title = sessionTabTooltip(session);
  if (session.els.tabLabel && session.els.tabLabel.textContent !== label) {
    session.els.tabLabel.textContent = label;
  }
}

function tabMotionAllowed() {
  return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function tabLabelOverflows(session) {
  const wrap = session.els && session.els.tabLabelWrap;
  const label = session.els && session.els.tabLabel;
  if (!wrap || !label) return false;
  return label.scrollWidth > wrap.clientWidth + 1;
}

function setTabScrollVars(session, overflow) {
  const tab = session.els && session.els.tab;
  const wrap = session.els && session.els.tabLabelWrap;
  const label = session.els && session.els.tabLabel;
  if (!tab || !wrap || !label || !overflow) {
    if (tab) {
      tab.style.removeProperty('--tab-scroll-distance');
      tab.style.removeProperty('--tab-marquee-duration');
      tab.style.removeProperty('--tab-hover-scroll-duration');
    }
    return;
  }
  const distance = Math.max(0, label.scrollWidth - wrap.clientWidth);
  const duration = Math.max(3, Math.min(12, distance / 16 + 2));
  tab.style.setProperty('--tab-scroll-distance', `-${Math.ceil(distance)}px`);
  tab.style.setProperty('--tab-marquee-duration', `${duration.toFixed(1)}s`);
  tab.style.setProperty('--tab-hover-scroll-duration', `${Math.max(2.5, Math.min(7, duration * 0.75)).toFixed(1)}s`);
}

function updateTabOverflowState() {
  const motionAllowed = tabMotionAllowed();
  const overflowById = new Map();
  for (const session of state.sessions.values()) {
    if (!session.els || !session.els.tab) continue;
    session.els.tab.classList.remove('marquee', 'paused', 'hover-scroll');
    const overflow = tabLabelOverflows(session);
    overflowById.set(session.id, overflow);
    session.els.tab.classList.toggle('truncated', overflow);
    setTabScrollVars(session, overflow);
  }

  const hovered = state.ui.hoverTabSessionId
    && state.ui.hoverTabSessionId !== state.activeId
    && overflowById.get(state.ui.hoverTabSessionId)
    ? state.ui.hoverTabSessionId
    : null;
  if (!hovered && state.ui.hoverTabSessionId) state.ui.hoverTabSessionId = null;

  for (const session of state.sessions.values()) {
    if (!session.els || !session.els.tab) continue;
    const active = session.id === state.activeId;
    const overflow = overflowById.get(session.id);
    const hoverScroll = motionAllowed && session.id === hovered;
    const activeMarquee = motionAllowed && active && overflow;
    session.els.tab.classList.toggle('marquee', activeMarquee);
    session.els.tab.classList.toggle('paused', activeMarquee && Boolean(hovered));
    session.els.tab.classList.toggle('hover-scroll', hoverScroll);
  }
}

function buildSessionTab(session) {
  const tab = document.createElement('button');
  tab.className = 'session-tab';
  tab.title = sessionTabTooltip(session);
  const dot = document.createElement('span'); dot.className = 'tab-dot live';
  const labelWrap = document.createElement('span'); labelWrap.className = 'tab-label-wrap';
  const label = document.createElement('span'); label.className = 'tab-label'; label.textContent = sessionTabLabel(session);
  labelWrap.appendChild(label);
  const badge = document.createElement('span'); badge.className = 'tab-badge zero'; badge.textContent = '0';
  const x = document.createElement('button'); x.className = 'tab-x'; x.textContent = '✕'; x.title = 'Close session';
  x.onclick = (e) => { e.stopPropagation(); closeSession(session.id); };
  tab.append(dot, labelWrap, badge, x);
  tab.onclick = () => activateSession(session.id);
  tab.oncontextmenu = (e) => {
    e.preventDefault();
    activateSession(session.id);
    openSessionContextMenu(session, e.clientX, e.clientY);
  };
  tab.addEventListener('mouseenter', () => {
    if (session.id === state.activeId) return;
    state.ui.hoverTabSessionId = session.id;
    renderTabs();
  });
  tab.addEventListener('mouseleave', () => {
    if (state.ui.hoverTabSessionId !== session.id) return;
    state.ui.hoverTabSessionId = null;
    renderTabs();
  });
  $('#tab-list').appendChild(tab);
  return { tab, dot, tabLabelWrap: labelWrap, tabLabel: label, tabBadge: badge };
}

function renderTabs() {
  for (const s of state.sessions.values()) {
    if (!s.els || !s.els.tab) continue;
    s.els.tab.classList.toggle('active', s.id === state.activeId);
    updateSessionTabText(s);
  }
  updateTabOverflowState();
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

async function createSession({ name, cwd, agent, initialUrl = null, initialQueue = [], command = undefined, resumeLaunch = null }) {
  state.counter += 1;
  const id = 's' + state.counter;
  const session = newSessionShape({ id, name, cwd, agent });
  if (resumeLaunch) {
    session.lifecycle.resumeLaunch = {
      ...resumeLaunch,
      launchedAt: Number.isFinite(resumeLaunch.launchedAt) ? resumeLaunch.launchedAt : Date.now(),
      sessionName: resumeLaunch.sessionName || name,
      cwd: resumeLaunch.cwd || cwd || null,
    };
  }

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
    ? initialQueue.map((item) => normalizeQueueItem(item, 'RESTORE')).filter(Boolean)
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
  invalidate('shortcutDebug');
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
  invalidate('shortcutDebug');
}

function setUpdateQueuePhase(phase, patch = {}) {
  if (!UPDATE_QUEUE_PHASES.has(phase)) return;
  apply({ type: 'update-queue-phase', phase, patch });
}

function updateAvailable() {
  return Boolean(state.updateStatus && state.updateStatus.updateAvailable);
}

function hasManagedInstallSource() {
  return Boolean(
    state.updateStatus
    && state.updateStatus.managedInstall
    && state.updateStatus.managedInstall.available
  );
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
    statusEl.textContent = hasManagedInstallSource()
      ? `Update blocked by ${blockers.length} live session${blockers.length === 1 ? '' : 's'}. You can install anyway after Chromux saves a restore snapshot and restarts through the managed local source.`
      : `Update queued, but ${blockers.length} live session${blockers.length === 1 ? '' : 's'} block installation and no managed install source is available. Use the release URL to update manually.`;
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
    install.textContent = hasManagedInstallSource() ? 'INSTALL ANYWAY' : 'FOCUS BLOCKER';
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
      source: item.source || 'RESTORE',
      reason: item.reason || queueReasonForSource(item.source || 'RESTORE'),
      detectedText: item.detectedText || null,
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

async function installUpdate({ forceBlockers = false } = {}) {
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
  const allowBlockedInstall = forceBlockers && hasManagedInstallSource();
  if (blockers.length > 0 && !allowBlockedInstall) {
    focusFirstUpdateBlocker();
    return;
  }
  if (blockers.length === 0) setUpdateQueuePhase('ready');
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
  invalidate('shortcutDebug');
  checkUpdates(false).catch(() => {});
}

function applyTerminalTitleUpdates(session, data) {
  const res = window.chromuxSignals.extractTerminalTitles(session.term.titleBuf, data);
  session.term.titleBuf = res.buf;
  if (res.titles.length === 0) return;
  const latest = res.titles[res.titles.length - 1].title;
  if (!latest || latest === session.term.title) return;
  session.term.title = latest;
  invalidate('tabs');
}

// pty event routing — Chromux OSC signals are extracted (chunk-boundary safe)
// before anything reaches the terminal or the preview detector. A signal whose
// session id does not match the PTY it arrived on is dropped and recorded as
// signal-rejected (guards `claude -p` children and pasted logs).
function handlePtyData(id, data) {
  const s = state.sessions.get(id);
  if (!s) return;
  applyTerminalTitleUpdates(s, data);
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

function isQuickCodexResumeExit(session, now = Date.now()) {
  const resume = session && session.lifecycle && session.lifecycle.resumeLaunch;
  if (!resume || resume.agent !== 'codex' || !resume.command || !resume.resumeId) return false;
  if (resume.failedAt) return false;
  const launchedAt = Number.isFinite(resume.launchedAt) ? resume.launchedAt : 0;
  return launchedAt > 0 && now - launchedAt <= BOUNDS.resumeStartupExitMs;
}

function showResumeRetryWarning(session, exitCode, now = Date.now()) {
  const resume = session.lifecycle.resumeLaunch;
  resume.failedAt = now;
  state.resumeRetryWarning = {
    sessionId: session.id,
    sessionName: session.name,
    cwd: session.cwd || resume.cwd || null,
    agent: resume.agent,
    resumeId: resume.resumeId,
    command: resume.command,
    exitCode: Number.isFinite(exitCode) ? exitCode : null,
    source: resume.source || null,
    autoRestored: Boolean(resume.autoRestored),
    failedAt: now,
  };
  renderWorkspaceWarning();
}

function handlePtyExit({ id, exitCode }) {
  const s = state.sessions.get(id);
  if (!s) return;
  apply({ type: 'session-exited', sessionId: id, exitCode });
  s.els.dot.classList.remove('live');
  s.els.dot.classList.add('dead');
  s.term.term.write(`\r\n\x1b[38;5;210m── session exited (${exitCode}) ──\x1b[0m\r\n`);
  if (isQuickCodexResumeExit(s)) showResumeRetryWarning(s, exitCode);
}

window.chromux.onPtyExit(handlePtyExit);

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
  const command = resolved.command || undefined;
  const session = await createSession({
    name,
    cwd: resolved.cwd || (state.env ? state.env.home : '~'),
    agent: resolved.agent || '',
    initialUrl: resolved.currentUrl || null,
    initialQueue: resolved.queue || [],
    command,
    resumeLaunch: resumeLaunchForRow(resolved, {
      name,
      command,
      source: 'restore-row',
      autoRestored: false,
    }),
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
  await createSession({
    name,
    cwd: row.cwd || (state.env ? state.env.home : '~'),
    agent: row.agent,
    command,
    resumeLaunch: mode === 'resume'
      ? resumeLaunchForRow(row, { name, command, source: 'detect', autoRestored: false })
      : null,
  });
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
  invalidate('shortcutDebug');
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

function sendResumeRetryCommand(warning = state.resumeRetryWarning) {
  if (!warning || !warning.command || !warning.sessionId) return false;
  const session = state.sessions.get(warning.sessionId);
  if (!session) return false;
  const data = `${warning.command}\r`;
  if (Array.isArray(session._ptyInputs)) session._ptyInputs.push(data);
  window.chromux.ptyInput(session.id, data);
  if (session.lifecycle && session.lifecycle.resumeLaunch) {
    const now = Date.now();
    session.lifecycle.resumeLaunch.launchedAt = now;
    session.lifecycle.resumeLaunch.retriedAt = now;
    session.lifecycle.resumeLaunch.failedAt = null;
  }
  state.resumeRetryWarning = null;
  renderWorkspaceWarning();
  return true;
}

function renderWorkspaceWarning() {
  const host = $('#restore-warning');
  if (!host) return;
  host.innerHTML = '';

  const retry = state.resumeRetryWarning;
  if (retry) {
    const main = document.createElement('div');
    main.className = 'rw-main';
    const title = document.createElement('div');
    title.className = 'rw-title';
    title.textContent = 'Codex resume exited quickly';
    const detail = document.createElement('div');
    detail.className = 'rw-detail';
    const name = retry.sessionName || retry.resumeId || 'session';
    detail.textContent = `${name} did not stay open after loading the saved conversation. Retry: ${retry.command}`;
    detail.title = detail.textContent;
    main.append(title, detail);

    const actions = document.createElement('div');
    actions.className = 'rw-actions';
    const retryButton = document.createElement('button');
    retryButton.className = 'rw-action rw-primary';
    retryButton.textContent = 'RETRY RESUME';
    retryButton.title = retry.command;
    retryButton.onclick = () => { sendResumeRetryCommand(); };
    const dismiss = document.createElement('button');
    dismiss.className = 'rw-action rw-dismiss';
    dismiss.textContent = 'DISMISS';
    dismiss.onclick = () => {
      state.resumeRetryWarning = null;
      renderWorkspaceWarning();
    };
    actions.append(retryButton, dismiss);
    host.append(main, actions);
    host.classList.remove('hidden');
    return;
  }

  const rows = Array.isArray(state.restoreWarningRows) ? state.restoreWarningRows : [];
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
  dismiss.className = 'rw-action rw-dismiss';
  dismiss.textContent = 'DISMISS';
  dismiss.onclick = () => {
    state.restoreWarningDismissed = true;
    host.classList.add('hidden');
  };
  host.append(main, dismiss);
  host.classList.remove('hidden');
}

function renderRestoreWarning(unresolved) {
  state.restoreWarningRows = Array.isArray(unresolved) ? unresolved : [];
  renderWorkspaceWarning();
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
      const command = row.command || undefined;
      const session = await createSession({
        name,
        cwd: row.cwd || (state.env ? state.env.home : '~'),
        agent: row.agent || '',
        initialUrl: row.currentUrl || null,
        initialQueue: row.queue || [],
        command,
        resumeLaunch: resumeLaunchForRow(row, {
          name,
          command,
          source: 'auto-restore',
          autoRestored: true,
        }),
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
  invalidate('shortcutDebug');
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
    invalidate('shortcutDebug');
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
$('#settings-install-update').onclick = () => installUpdate({
  forceBlockers: state.updateQueue.phase === 'waiting' && hasManagedInstallSource(),
}).catch(showUpdateInstallError);

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

window.chromux.onShortcutDebugInput(noteShortcutDebugInput);
window.chromux.onShortcutActivateSessionIndex(handleShortcutActivateSessionIndex);
window.chromux.onShortcutFocusNextQueueItem(handleShortcutFocusNextQueueItem);
window.chromux.onShortcutToggleBrowser(handleShortcutToggleBrowser);
window.chromux.onShortcutOpenNewSession(handleShortcutOpenNewSession);
window.chromux.onShortcutOpenDetectModal(handleShortcutOpenDetectModal);

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

function terminalFocused() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return false;
  if (el.classList && el.classList.contains('xterm-helper-textarea')) return true;
  if (el.closest && el.closest('.term-host')) return true;
  return false;
}

function hostEditableFocused() {
  const el = document.activeElement;
  if (el) {
    if (el.closest('.hidden')) return false;
    if (terminalFocused()) return false;
    if (el.isContentEditable || (el.closest && el.closest('[contenteditable="true"]'))) return true;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
  }
  return false;
}

function guestEditableFocused() {
  const el = document.activeElement;
  const session = state.sessions.get(state.activeId);
  const webview = session && session.browser.webview;
  return Boolean(webview && el === webview && session.browser.guestEditableFocused);
}

function editableFocused() {
  return hostEditableFocused() || guestEditableFocused();
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
  if (!Number.isInteger(index) || modalOpen() || editableFocused()) return null;
  const session = orderedSessions()[index];
  if (!session) return null;
  activateSessionByIndex(index);
  return { index, sessionId: session.id };
}

function handleShortcutFocusNextQueueItem(now = Date.now()) {
  if (modalOpen() || editableFocused()) return null;
  return focusNextQueuedPreview(now);
}

function handleShortcutToggleBrowser() {
  if (modalOpen() || editableFocused()) return null;
  const session = state.sessions.get(state.activeId);
  if (!session) return null;
  setBrowserCollapsed(session, !session.browser.collapsed);
  return { sessionId: session.id, collapsed: session.browser.collapsed };
}

function handleShortcutOpenNewSession() {
  if (guardedShortcutDisabledReason(shortcutFocusContext())) return null;
  openNewSessionModal();
  return { opened: true };
}

function handleShortcutOpenDetectModal() {
  if (guardedShortcutDisabledReason(shortcutFocusContext())) return null;
  openDetectModal();
  return { opened: true };
}

function shortcutInputFromDomEvent(e) {
  return {
    type: e.type === 'keyup' ? 'keyUp' : 'keyDown',
    key: e.key,
    code: e.code,
    meta: Boolean(e.metaKey),
    shift: Boolean(e.shiftKey),
    alt: Boolean(e.altKey),
    control: Boolean(e.ctrlKey),
  };
}

function chromuxShortcutActionFromInput(input) {
  if (window.chromux && typeof window.chromux.shortcutAction === 'function') {
    return window.chromux.shortcutAction(input);
  }
  if (!input.meta || input.alt || input.control || input.type !== 'keyDown') return null;
  const key = String(input.key || '').toUpperCase();
  if (/^[1-9]$/.test(key) && !input.shift) return { id: 'session-index', index: Number(key) - 1 };
  if (key === 'T' && !input.shift) return { id: 'new-session' };
  if (key === 'D' && !input.shift) return { id: 'detect' };
  if (key === 'J' && !input.shift) return { id: 'queue-focus' };
  if (key === 'B' && input.shift) return { id: 'browser-toggle' };
  return null;
}

function handleRendererShortcutKeydown(e) {
  const input = shortcutInputFromDomEvent(e);
  const action = chromuxShortcutActionFromInput(input);
  if (!action) return;
  if (guardedShortcutDisabledReason(shortcutFocusContext())) return;

  let result = null;
  if (action.id === 'session-index') result = handleShortcutActivateSessionIndex({ index: action.index });
  else if (action.id === 'queue-focus') result = handleShortcutFocusNextQueueItem();
  else if (action.id === 'browser-toggle') result = handleShortcutToggleBrowser();
  else if (action.id === 'new-session') result = handleShortcutOpenNewSession();
  else if (action.id === 'detect') result = handleShortcutOpenDetectModal();
  else return;

  if (result !== null) {
    noteShortcutDebugInput(shortcutDebugInputFromDomEvent(e, 'renderer'));
    e.preventDefault();
  }
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

  const addFakeSession = ({ name = 'test-session', agent = 'codex', cwd = '/tmp', alive = true, turnState = 'unknown', queue = [], resumeLaunch = null } = {}) => {
    state.counter += 1;
    const session = newSessionShape({ id: 's' + state.counter, name, cwd, agent });
    session.lifecycle.alive = alive;
    if (resumeLaunch) {
      session.lifecycle.resumeLaunch = {
        ...resumeLaunch,
        agent: resumeLaunch.agent || agent,
        launchedAt: Number.isFinite(resumeLaunch.launchedAt) ? resumeLaunch.launchedAt : Date.now(),
      };
    }
    session.turn.state = turnState;
    session.browser.queue = Array.isArray(queue)
      ? queue.map((item) => normalizeQueueItem(item, 'RESTORE')).filter(Boolean)
      : [];
    const written = [];
    session._written = written;
    session._ptyInputs = [];
    session.term.term = { write: (d) => written.push(d), focus() {}, dispose() {} };
    session.els = fakeSessionEls();
    state.sessions.set(session.id, session);
    if (!state.activeId) state.activeId = session.id;
    apply({ type: 'session-created', sessionId: session.id, name, cwd, agent });
    renderQueue(session);
    flushRender();
    return session.id;
  };

  const addRenderableTestSession = ({ name = 'tab-test', agent = 'codex', cwd = '/tmp' } = {}) => {
    state.counter += 1;
    const session = newSessionShape({ id: 's' + state.counter, name, cwd, agent });
    const viewEls = buildSessionView(session);
    const tabEls = buildSessionTab(session);
    const written = [];
    session._written = written;
    session.term.term = { write: (d) => written.push(d), focus() {}, dispose() {} };
    session.term.fit = () => {};
    session.els = { ...viewEls, ...tabEls };
    state.sessions.set(session.id, session);
    apply({ type: 'session-created', sessionId: session.id, name, cwd, agent });
    renderQueue(session);
    activateSession(session.id);
    flushRender();
    return session.id;
  };

  window.chromuxTestTabs = {
    addSession: addRenderableTestSession,
    feed(id, chunk) {
      handlePtyData(id, chunk);
      flushRender();
    },
    focus(id) {
      activateSession(id);
      flushRender();
    },
    forceTabWidth(id, px) {
      const tab = testSession(id).els.tab;
      tab.style.flex = `0 0 ${px}px`;
      tab.style.width = `${px}px`;
      tab.style.minWidth = `${px}px`;
      tab.style.maxWidth = `${px}px`;
      renderTabs();
      flushRender();
    },
    hover(id) {
      testSession(id).els.tab.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      flushRender();
    },
    unhover(id) {
      testSession(id).els.tab.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      flushRender();
    },
    label: (id) => testSession(id).els.tabLabel.textContent,
    terminalTitle: (id) => testSession(id).term.title,
    tooltip: (id) => testSession(id).els.tab.title,
    written: (id) => (testSession(id)._written || []).join(''),
    state(id) {
      const session = testSession(id);
      const tab = session.els.tab;
      const wrap = session.els.tabLabelWrap;
      const label = session.els.tabLabel;
      return {
        active: tab.classList.contains('active'),
        truncated: tab.classList.contains('truncated'),
        marquee: tab.classList.contains('marquee'),
        paused: tab.classList.contains('paused'),
        hoverScroll: tab.classList.contains('hover-scroll'),
        label: label.textContent,
        title: tab.title,
        wrapWidth: wrap.clientWidth,
        labelWidth: label.scrollWidth,
      };
    },
    flushRender,
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
    clickAttentionPrimary(kind) {
      for (const el of document.querySelectorAll('#attention-list .attention-item')) {
        if (el.querySelector('.attention-kind')?.textContent !== kind) continue;
        const primary = el.querySelector('.attention-actions .qi-btn.open');
        if (!primary) throw new Error(`No primary action on ${kind}`);
        primary.click();
        flushRender();
        return true;
      }
      throw new Error(`No attention item ${kind}`);
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
    statusText: () => $('#settings-update-status').textContent,
    topButtonText: () => $('#btn-update-ready').textContent,
    activeName: () => state.sessions.get(state.activeId)?.name || null,
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

  window.chromuxTestResumeRetry = {
    addSession({
      name = 'resume-test',
      agent = 'codex',
      cwd = '/tmp',
      resumeId = '11111111-2222-3333-4444-555555555555',
      command = null,
      launchedAt = Date.now(),
      source = 'detect',
      autoRestored = false,
    } = {}) {
      return addFakeSession({
        name,
        agent,
        cwd,
        resumeLaunch: resumeId ? {
          agent,
          resumeId,
          command: command || agentCommand(agent, resumeId),
          launchedAt,
          source,
          sourceName: name,
          sessionName: name,
          cwd,
          autoRestored,
          failedAt: null,
          retriedAt: null,
        } : null,
      });
    },
    addPlainSession(opts = {}) {
      return addFakeSession({ name: 'plain-test', agent: 'codex', cwd: '/tmp', ...opts });
    },
    exit(id, exitCode = 1) {
      handlePtyExit({ id, exitCode });
      flushRender();
    },
    warning() {
      const host = $('#restore-warning');
      const retry = host.querySelector('.rw-primary');
      return {
        hidden: host.classList.contains('hidden'),
        title: host.querySelector('.rw-title')?.textContent || '',
        detail: host.querySelector('.rw-detail')?.textContent || '',
        buttons: [...host.querySelectorAll('button')].map((button) => button.textContent),
        retryTitle: retry ? retry.title : '',
      };
    },
    clickRetry() {
      const button = $('#restore-warning .rw-primary');
      if (!button) throw new Error('No RETRY RESUME button');
      button.click();
      flushRender();
    },
    clickDismiss() {
      const button = [...document.querySelectorAll('#restore-warning button')]
        .find((candidate) => candidate.textContent === 'DISMISS');
      if (!button) throw new Error('No DISMISS button');
      button.click();
      flushRender();
    },
    ptyInputs: (id) => (testSession(id)._ptyInputs || []).join(''),
    startupWindowMs: () => BOUNDS.resumeStartupExitMs,
    clear() {
      state.resumeRetryWarning = null;
      state.restoreWarningRows = [];
      state.restoreWarningDismissed = false;
      renderWorkspaceWarning();
      flushRender();
    },
  };

  window.chromuxTestPreviews = {
    addSession: async (opts) => addFakeSession(opts),
    scan(line) {
      return scanLineForPreviews(stripTerminalControlsForPreview(line)).map((hit) => ({ ...hit }));
    },
    routableScan(line) {
      const clean = stripTerminalControlsForPreview(line);
      const hits = scanLineForPreviews(clean);
      return shouldRoutePreviewLine(clean, hits) ? hits.map((hit) => ({ ...hit })) : [];
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
    queueItems: (id) => testSession(id).browser.queue.map((item) => ({ ...item })),
    queueRows: (id) => [...testSession(id).els.queueList.querySelectorAll('.queue-item')].map((el) => ({
      source: el.querySelector('.qi-src')?.textContent || '',
      reason: el.querySelector('.qi-reason')?.textContent || '',
      url: el.querySelector('.qi-url')?.textContent || '',
    })),
    queueCount: (id) => testSession(id).browser.queue.length,
    currentUrl: (id) => testSession(id).browser.currentUrl,
    focus(id) {
      activateSession(id);
      flushRender();
    },
    attentionItems: () => [...document.querySelectorAll('#attention-list .attention-item')].map((el) => ({
      kind: el.querySelector('.attention-kind')?.textContent || '',
      name: el.querySelector('.attention-name')?.textContent || '',
      detail: el.querySelector('.attention-detail')?.textContent || '',
    })),
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

  let hotkeyTestFocusEl = null;
  const removeHotkeyTestFocusEl = () => {
    if (hotkeyTestFocusEl && hotkeyTestFocusEl.parentElement) hotkeyTestFocusEl.remove();
    hotkeyTestFocusEl = null;
  };
  const focusSyntheticTerminalTextarea = () => {
    removeHotkeyTestFocusEl();
    const host = document.createElement('div');
    host.className = 'term-host';
    const xterm = document.createElement('div');
    xterm.className = 'xterm';
    const textarea = document.createElement('textarea');
    textarea.className = 'xterm-helper-textarea';
    xterm.appendChild(textarea);
    host.appendChild(xterm);
    document.body.appendChild(host);
    hotkeyTestFocusEl = host;
    textarea.focus();
    invalidate('shortcutDebug');
    flushRender();
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
    shortcutFocusNextQueueItem(now) {
      const result = handleShortcutFocusNextQueueItem(now);
      flushRender();
      return result;
    },
    shortcutToggleBrowser() {
      const result = handleShortcutToggleBrowser();
      flushRender();
      return result;
    },
    focusTerminalTextarea: focusSyntheticTerminalTextarea,
    focusHostEditable() {
      removeHotkeyTestFocusEl();
      const input = document.createElement('input');
      document.body.appendChild(input);
      hotkeyTestFocusEl = input;
      input.focus();
      invalidate('shortcutDebug');
      flushRender();
    },
    clearFocus() {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      removeHotkeyTestFocusEl();
      invalidate('shortcutDebug');
      flushRender();
    },
    activeId: () => state.activeId,
    queueCount: (id) => testSession(id).browser.queue.length,
    queuePanelHidden: (id) => testSession(id).els.queuePanel.classList.contains('hidden'),
    browserCollapsed: (id) => testSession(id).browser.collapsed,
    focusedOpenUrl: () => document.activeElement?.dataset?.queueOpenUrl || null,
    clickFocused() {
      if (!document.activeElement) throw new Error('Nothing focused');
      document.activeElement.click();
      flushRender();
    },
    currentUrl: (id) => testSession(id).browser.currentUrl,
    context: () => ({ ...shortcutFocusContext() }),
    flushRender,
  };

  const hotkeyCatalogSnapshot = () => computeShortcutCatalog().map((shortcut) => ({
    id: shortcut.id,
    label: shortcut.label,
    available: shortcut.available,
    matchedByCurrentChord: shortcut.matchedByCurrentChord,
    disabledReason: shortcut.disabledReason,
    description: shortcut.description,
  }));

  window.chromuxTestHotkeys = {
    addSession: async (opts) => addFakeSession(opts),
    focus(id) {
      activateSession(id);
      flushRender();
    },
    setQueue(id, queue = []) {
      const session = testSession(id);
      session.browser.queue = queue.map((item) => normalizeQueueItem(item, 'RESTORE')).filter(Boolean);
      renderQueue(session);
      flushRender();
    },
    clearQueues() {
      for (const session of state.sessions.values()) {
        session.browser.queue = [];
        if (session.els) renderQueue(session);
      }
      flushRender();
    },
    setCollapsed(id, collapsed) {
      testSession(id).browser.collapsed = Boolean(collapsed);
      invalidate('shortcutDebug');
      flushRender();
    },
    openModal() {
      $('#modal-settings').classList.remove('hidden');
      invalidate('shortcutDebug');
      flushRender();
    },
    closeModals() {
      for (const el of document.querySelectorAll('.overlay')) el.classList.add('hidden');
      state.ui.captureModal = null;
      invalidate('shortcutDebug');
      flushRender();
    },
    focusHostEditable() {
      removeHotkeyTestFocusEl();
      const input = document.createElement('input');
      document.body.appendChild(input);
      hotkeyTestFocusEl = input;
      input.focus();
      invalidate('shortcutDebug');
      flushRender();
    },
    focusTerminalTextarea: focusSyntheticTerminalTextarea,
    focusGuestEditable(id) {
      removeHotkeyTestFocusEl();
      const session = testSession(id);
      const webview = document.createElement('div');
      webview.tabIndex = 0;
      document.body.appendChild(webview);
      hotkeyTestFocusEl = webview;
      session.browser.webview = webview;
      session.browser.guestEditableFocused = true;
      activateSession(session.id);
      webview.focus();
      invalidate('shortcutDebug');
      flushRender();
    },
    clearFocus() {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      for (const session of state.sessions.values()) {
        if (session.browser.webview === hotkeyTestFocusEl) {
          session.browser.webview = null;
          session.browser.guestEditableFocused = false;
        }
      }
      removeHotkeyTestFocusEl();
      invalidate('shortcutDebug');
      flushRender();
    },
    note(payload) {
      noteShortcutDebugInput(payload);
      flushRender();
    },
    shortcutNewSession() {
      const result = handleShortcutOpenNewSession();
      flushRender();
      return result;
    },
    shortcutDetect() {
      const result = handleShortcutOpenDetectModal();
      flushRender();
      return result;
    },
    newModalOpen: () => !$('#modal-new').classList.contains('hidden'),
    detectModalOpen: () => !$('#modal-detect').classList.contains('hidden'),
    catalog() {
      renderShortcutDebug();
      return hotkeyCatalogSnapshot();
    },
    context() {
      return { ...shortcutFocusContext() };
    },
    debug() {
      renderShortcutDebug();
      return {
        source: state.shortcutDebug.source,
        latestKey: shortcutDebugChord().key,
        modifiers: { ...shortcutDebugChord().modifiers },
        context: { ...shortcutFocusContext() },
        catalog: hotkeyCatalogSnapshot(),
        text: $('#shortcut-debug') ? $('#shortcut-debug').textContent : '',
      };
    },
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
      session.browser.queue = queue.map((item) => normalizeQueueItem(item, 'RESTORE')).filter(Boolean);
      if (url) {
        session.browser.currentUrl = url;
        session.els.urlBar.value = url;
      }
      renderQueue(session);
      activateSession(session.id);
      flushRender();
      return session.id;
    },
    open(id, url) {
      openInPane(testSession(id), url);
      flushRender();
      return true;
    },
    webview(id) {
      return testSession(id).browser.webview;
    },
    guestEditableFocused(id) {
      return Boolean(testSession(id).browser.guestEditableFocused);
    },
    collapse(id) {
      setBrowserCollapsed(testSession(id), true);
      flushRender();
    },
    restore(id) {
      setBrowserCollapsed(testSession(id), false);
      flushRender();
    },
    shortcutToggle() {
      const result = handleShortcutToggleBrowser();
      flushRender();
      return result;
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
  const webPane = document.createElement('div');
  const divider = document.createElement('div');
  const browserToolbar = document.createElement('div');
  const collapseBtn = document.createElement('button');
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
    webPane,
    divider,
    browserToolbar,
    collapseBtn,
    urlBar: document.createElement('input'),
    captureChip: document.createElement('span'),
  };
}

document.addEventListener('keydown', (e) => {
  handleRendererShortcutKeydown(e);
  if (e.key === 'Escape') {
    noteShortcutDebugInput(shortcutDebugInputFromDomEvent(e, 'renderer'));
    closeSessionContextMenu();
    $('#modal-settings').classList.add('hidden');
    $('#modal-new').classList.add('hidden');
    $('#modal-detect').classList.add('hidden');
    $('#drawer-log').classList.add('hidden');
    invalidate('shortcutDebug');
  }
});

document.addEventListener('click', () => {
  closeSessionContextMenu();
  invalidate('shortcutDebug');
});
document.addEventListener('focusin', () => invalidate('shortcutDebug'));
document.addEventListener('focusout', () => setTimeout(() => invalidate('shortcutDebug'), 0));
window.addEventListener('blur', () => {
  closeSessionContextMenu();
  invalidate('shortcutDebug');
});

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
  renderShortcutDebug();
  reportShortcutFocusContext();
})();
