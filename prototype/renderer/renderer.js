// Chromux v1 — renderer. Sessions (xterm ↔ pty), 1:1 paired browser panes,
// preview detection, review queue, element picker, capture → claude -p.
'use strict';

/* global Terminal, FitAddon, SerializeAddon */

const $ = (sel) => document.querySelector(sel);

const THEME_STORAGE_KEY = 'chromux.theme';
const THEME_MODE_STORAGE_KEY = 'chromux.themeMode';
const TAB_ACTIVITY_STORAGE_KEY = 'chromux.tabActivityIndicators';
const RAIL_MODE_STORAGE_KEY = 'chromux.railMode';
const THREAD_PREVIEW_SIZE_STORAGE_KEY = 'chromux.threadPreviewSize';
const THEME_IDS = new Set(['blueprint', 'retro-os', 'streak', 'liquid-glass']);
const THEME_MODE_IDS = new Set(['light', 'dark']);
const THEME_LABELS = {
  blueprint: 'Blueprint',
  'retro-os': 'Retro-OS',
  streak: 'Streak',
  'liquid-glass': 'Liquid Glass',
};
const RAIL_MODES = new Set(['threads', 'git']);
const THREAD_PREVIEW_SIZES = new Set(['compact', 'comfortable', 'large']);
const RESTORE_ATTENTION_TYPES = new Set([
  'permission', 'authentication', 'input', 'rateLimited', 'toolFailed', 'delivery', 'completed',
]);
const MAX_RESTORE_ATTENTION_RECORDS = 20;

function storedTheme() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_IDS.has(value) ? value : 'liquid-glass';
  } catch { return 'liquid-glass'; }
}

function storedThemeMode() {
  try {
    const value = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (THEME_MODE_IDS.has(value)) return value;
    // Preserve the original Blueprint appearance for users upgrading from the
    // single-mode theme picker. New installs still begin with Liquid Glass Light.
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'blueprint' ? 'dark' : 'light';
  } catch { return 'light'; }
}

function storedTabActivityIndicators() {
  try {
    return window.localStorage.getItem(TAB_ACTIVITY_STORAGE_KEY) !== 'false';
  } catch { return true; }
}

function storedRailMode() {
  try {
    const value = window.localStorage.getItem(RAIL_MODE_STORAGE_KEY);
    const migrated = RAIL_MODES.has(value) ? value : 'threads';
    if (value !== migrated) window.localStorage.setItem(RAIL_MODE_STORAGE_KEY, migrated);
    return migrated;
  } catch { return 'threads'; }
}

function storedThreadPreviewSize() {
  try {
    const value = window.localStorage.getItem(THREAD_PREVIEW_SIZE_STORAGE_KEY);
    return THREAD_PREVIEW_SIZES.has(value) ? value : 'comfortable';
  } catch { return 'comfortable'; }
}

const state = {
  sessions: new Map(), // id -> session
  activeId: null,
  counter: 0,
  env: null,
  captures: new Map(), // captureId -> CaptureRecord
  deliveryIndex: new Map(), // deliveryId -> captureId
  favorites: [], // global v1 { url, title, createdAt }
  favoritesReady: null,
  projects: [],
  projectConfig: null,
  events: [], // ring buffer of applied events (diagnostics), max EVENT_RING_MAX
  ui: {
    theme: storedTheme(),
    themeMode: storedThemeMode(),
    windowButtonPosition: null,
    tabActivityIndicators: storedTabActivityIndicators(),
    railMode: storedRailMode(),
    threadPreviewSize: storedThreadPreviewSize(),
    gitRoots: new Map(), // exact cwd -> { value: string|null|undefined, promise }
    gitDiffs: new Map(), // repository root -> { value: summary|null|undefined, promise }
    railExpanded: new Map(),
    threadPreview: null,
    reducedMotionOverride: null,
    captureModal: null, // { captureId, pngBase64, payloadBase } while composing/delivering
    dirty: new Set(),
    rafScheduled: false,
    lastQueueShortcutFocus: null,
    hoverTabSessionId: null,
    diagnosticSessionId: null,
  },
  lastCwd: null,
  contextMenu: null,
  grokContextAction: null,
  updateStatus: null,
  detect: null, // last external-terminal scan
  detectQuery: '',
  restoreSessions: null,
  restoreWarningRows: [],
  restoreInferredRows: [],
  restoreWarningDismissed: false,
  resumeRetryWarning: null,
  lifecyclePrompt: null,
  testInstallUpdateResult: null,
  testUpdateInstallTrace: null,
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
  composerDraftBytes: 64 * 1024,
  restoreAttentionDetailBytes: 4096,
};

function normalizeFavoriteUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    parsed.hash = '';
    return parsed.href;
  } catch { return null; }
}

function favoriteForUrl(url) {
  const normalized = normalizeFavoriteUrl(url);
  return normalized ? state.favorites.find((item) => item.url === normalized) || null : null;
}

function favoriteTitle(session, url) {
  let title = '';
  try {
    title = session && session.browser && session.browser.webview
      ? String(session.browser.webview.getTitle ? session.browser.webview.getTitle() : '').trim()
      : '';
  } catch { title = ''; }
  return (title || String(url)).slice(0, 200);
}

async function setFavorite(url, title, shouldFavorite) {
  const normalized = normalizeFavoriteUrl(url);
  if (!normalized) return false;
  const existing = favoriteForUrl(normalized);
  let next = state.favorites.slice();
  if (shouldFavorite && !existing) {
    next.push({ url: normalized, title: String(title || normalized).trim().slice(0, 200) || normalized, createdAt: new Date().toISOString() });
  } else if (!shouldFavorite && existing) {
    next = next.filter((item) => item.url !== normalized);
  } else {
    return Boolean(existing);
  }
  state.favorites = await window.chromux.favoritesReplace(next);
  renderAllFavorites();
  return Boolean(favoriteForUrl(normalized));
}

function toggleFavorite(session, url, title) {
  return setFavorite(url, title || favoriteTitle(session, url), !favoriteForUrl(url));
}

function renderAllFavorites() {
  for (const session of state.sessions.values()) {
    if (!session.els) continue;
    renderFavoriteToolbar(session);
    renderFavoritesPicker(session);
    if (session.els.queueList) renderQueue(session);
  }
}

function renderFavoriteToolbar(session) {
  const button = session.els && session.els.favoriteBtn;
  if (!button) return;
  const url = session.browser.currentUrl || session.els.urlBar.value;
  const active = Boolean(favoriteForUrl(url));
  button.classList.toggle('armed', active);
  button.textContent = active ? '★' : '☆';
  button.title = active ? 'Remove current page from favorites' : 'Add current page to favorites';
  button.disabled = !normalizeFavoriteUrl(url);
}

function renderFavoritesPicker(session) {
  const host = session.els && session.els.favoritesList;
  if (!host) return;
  host.innerHTML = '';
  if (!state.favorites.length) {
    const empty = document.createElement('div');
    empty.className = 'queue-empty';
    empty.textContent = 'No favorites yet. Pin the current page or a queued preview.';
    host.appendChild(empty);
  }
  for (const favorite of state.favorites) {
    const row = document.createElement('div'); row.className = 'favorite-item';
    const main = document.createElement('button'); main.className = 'favorite-open';
    const title = document.createElement('span'); title.className = 'favorite-title'; title.textContent = favorite.title;
    const url = document.createElement('span'); url.className = 'qi-url'; url.textContent = favorite.url;
    main.append(title, url);
    main.onclick = () => { openInPane(state.sessions.get(state.activeId) || session, favorite.url); };
    const remove = document.createElement('button'); remove.className = 'qi-btn'; remove.textContent = 'UNPIN';
    remove.onclick = () => setFavorite(favorite.url, favorite.title, false);
    row.append(main, remove); host.appendChild(row);
  }
  if (session.els.favoritesBadge) session.els.favoritesBadge.textContent = String(state.favorites.length);
}

// ───────────────────────────────────────────────────────────────────────────
// Terminal theme (matches the flight-deck palette)
// ───────────────────────────────────────────────────────────────────────────

const TERM_THEMES = {
  'blueprint-dark': {
    background: '#061b38', foreground: '#dceeff', cursor: '#7fd8ff', cursorAccent: '#061b38',
    selectionBackground: 'rgba(127,216,255,0.28)', black: '#082346', brightBlack: '#527ca7',
    red: '#ff9d86', brightRed: '#ffc0af', green: '#8af0bd', brightGreen: '#b7ffd9',
    yellow: '#ffd88f', brightYellow: '#ffe8bd', blue: '#7fd8ff', brightBlue: '#b8eaff',
    magenta: '#c6adff', brightMagenta: '#e0d2ff', cyan: '#8fe7f5', brightCyan: '#c6f6ff',
    white: '#dceeff', brightWhite: '#ffffff',
  },
  'blueprint-light': {
    background: '#f4f9ff', foreground: '#173b62', cursor: '#006d9c', cursorAccent: '#f4f9ff',
    selectionBackground: 'rgba(0,109,156,0.22)', black: '#173b62', brightBlack: '#6684a3',
    red: '#a33a2c', brightRed: '#d45747', green: '#13764d', brightGreen: '#239b68',
    yellow: '#8a5b00', brightYellow: '#b77c0e', blue: '#006d9c', brightBlue: '#218fc0',
    magenta: '#674fa3', brightMagenta: '#8b70c7', cyan: '#08758a', brightCyan: '#2699ad',
    white: '#dbe9f6', brightWhite: '#ffffff',
  },
  'retro-os-light': {
    background: '#ffffff', foreground: '#141414', cursor: '#30309a', cursorAccent: '#ffffff',
    selectionBackground: 'rgba(48,48,154,0.24)', black: '#141414', brightBlack: '#666666',
    red: '#9b1c1c', brightRed: '#d6393b', green: '#1f7a34', brightGreen: '#37b24d',
    yellow: '#a05a00', brightYellow: '#e8940a', blue: '#30309a', brightBlue: '#5656c7',
    magenta: '#7d2c85', brightMagenta: '#a94eb3', cyan: '#0b6a7d', brightCyan: '#18a5c0',
    white: '#d0d0d0', brightWhite: '#ffffff',
  },
  'retro-os-dark': {
    background: '#101214', foreground: '#eeeeee', cursor: '#9c9cff', cursorAccent: '#101214',
    selectionBackground: 'rgba(156,156,255,0.26)', black: '#101214', brightBlack: '#777b80',
    red: '#ff8585', brightRed: '#ffaaaa', green: '#79d990', brightGreen: '#a4edb4',
    yellow: '#e8b45a', brightYellow: '#f5d28f', blue: '#9c9cff', brightBlue: '#c0c0ff',
    magenta: '#d58bdc', brightMagenta: '#ebb4ef', cyan: '#72ccd9', brightCyan: '#a4e5ed',
    white: '#d6d6d6', brightWhite: '#ffffff',
  },
  'streak-dark': {
    background: '#172033', foreground: '#f7fbff', cursor: '#58cc02', cursorAccent: '#172033',
    selectionBackground: 'rgba(88,204,2,0.30)', black: '#172033', brightBlack: '#62708a',
    red: '#ff5d5d', brightRed: '#ff8b8b', green: '#58cc02', brightGreen: '#8ee83f',
    yellow: '#ffc800', brightYellow: '#ffe45c', blue: '#1cb0f6', brightBlue: '#70d2ff',
    magenta: '#ce82ff', brightMagenta: '#e1b3ff', cyan: '#49e5c2', brightCyan: '#94f3de',
    white: '#dfe8f5', brightWhite: '#ffffff',
  },
  'streak-light': {
    background: '#f7fbff', foreground: '#293244', cursor: '#3f9b00', cursorAccent: '#f7fbff',
    selectionBackground: 'rgba(88,204,2,0.24)', black: '#293244', brightBlack: '#748096',
    red: '#c83c3c', brightRed: '#e85c5c', green: '#3f9b00', brightGreen: '#58cc02',
    yellow: '#9a6900', brightYellow: '#cc9100', blue: '#087eae', brightBlue: '#1cb0f6',
    magenta: '#8d4eb4', brightMagenta: '#b16bda', cyan: '#087f6b', brightCyan: '#20ad94',
    white: '#dce5ee', brightWhite: '#ffffff',
  },
  'liquid-glass-dark': {
    background: '#111827', foreground: '#e7edf7', cursor: '#23b7ec', cursorAccent: '#111827',
    selectionBackground: 'rgba(15,159,214,0.30)', black: '#111827', brightBlack: '#56647a',
    red: '#ef6a5c', brightRed: '#ff958a', green: '#35c98c', brightGreen: '#72e0b3',
    yellow: '#e3a02d', brightYellow: '#f3c86f', blue: '#23b7ec', brightBlue: '#71d8ff',
    magenta: '#9587f4', brightMagenta: '#c0b7ff', cyan: '#52d7e8', brightCyan: '#94eef8',
    white: '#dbe5f2', brightWhite: '#ffffff',
  },
  'liquid-glass-light': {
    background: '#f7faff', foreground: '#172231', cursor: '#0f86b3', cursorAccent: '#f7faff',
    selectionBackground: 'rgba(15,159,214,0.22)', black: '#172231', brightBlack: '#637188',
    red: '#b83c31', brightRed: '#df5a4d', green: '#137c55', brightGreen: '#26a874',
    yellow: '#8a5c08', brightYellow: '#bd8215', blue: '#0f78a0', brightBlue: '#199dcc',
    magenta: '#6656b8', brightMagenta: '#8979dc', cyan: '#0d7886', brightCyan: '#28a2b1',
    white: '#dbe5f2', brightWhite: '#ffffff',
  },
};

function terminalThemeFor(theme = state.ui.theme, mode = state.ui.themeMode) {
  return TERM_THEMES[`${theme}-${mode}`] || TERM_THEMES['liquid-glass-light'];
}

function syncSessionTerminalTheme(session, theme = state.ui.theme, mode = state.ui.themeMode) {
  try {
    const terminal = session && session.term && session.term.term;
    const rows = terminal && Number(terminal.rows);
    if (!terminal || !terminal.options || typeof terminal.refresh !== 'function'
      || !Number.isInteger(rows) || rows < 1) return false;
    terminal.options.theme = { ...terminalThemeFor(theme, mode) };
    terminal.refresh(0, rows - 1);
    return true;
  } catch {
    // A terminal may be mocked, mid-initialization, or already disposed.
    return false;
  }
}

function renderThemeControls() {
  const current = $('#settings-theme-current');
  if (current) current.textContent = (THEME_LABELS[state.ui.theme] || THEME_LABELS.blueprint).toUpperCase();
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    const active = button.dataset.themeOption === state.ui.theme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('button[data-theme-mode]').forEach((button) => {
    const active = button.dataset.themeMode === state.ui.themeMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderTabActivityControls() {
  const toggle = $('#settings-tab-activity-indicators');
  if (toggle) toggle.checked = state.ui.tabActivityIndicators;
}

function renderPreventSleepStatus(status = state.env && state.env.preventSleep) {
  const snapshot = status || { available: false, enabled: false, running: false, error: null };
  if (state.env) state.env.preventSleep = snapshot;
  const toggle = $('#settings-prevent-sleep');
  const label = $('#settings-prevent-sleep-status');
  if (toggle) {
    toggle.checked = Boolean(snapshot.enabled);
    toggle.disabled = !snapshot.available;
  }
  if (!label) return snapshot;
  label.className = 'settings-preference-status';
  if (snapshot.error) {
    label.classList.add('fail');
    label.textContent = snapshot.error;
  } else if (snapshot.running) {
    label.classList.add('running');
    label.textContent = snapshot.pid ? `ACTIVE · PID ${snapshot.pid}` : 'ACTIVE';
  } else if (!snapshot.available) {
    label.textContent = 'MACOS ONLY';
  } else {
    label.textContent = 'OFF';
  }
  return snapshot;
}

async function changePreventSleep(enabled) {
  const toggle = $('#settings-prevent-sleep');
  if (toggle) toggle.disabled = true;
  try {
    const status = await window.chromux.setPreventSleep(Boolean(enabled));
    renderPreventSleepStatus(status);
    return status;
  } catch (error) {
    return renderPreventSleepStatus({
      available: true, enabled: false, running: false, pid: null, error: error.message,
    });
  } finally {
    if (toggle) toggle.disabled = !Boolean(state.env && state.env.preventSleep && state.env.preventSleep.available);
  }
}

function applyTabActivityIndicators(enabled, { persist = true } = {}) {
  state.ui.tabActivityIndicators = Boolean(enabled);
  if (persist) {
    try { window.localStorage.setItem(TAB_ACTIVITY_STORAGE_KEY, String(state.ui.tabActivityIndicators)); } catch { /* unavailable */ }
  }
  renderTabActivityControls();
  invalidate('tabs', 'attention', ...(state.env && state.env.devMode ? ['diagnostics'] : []));
  return state.ui.tabActivityIndicators;
}

function syncWindowButtonPosition() {
  const titlebar = $('#titlebar');
  if (!titlebar || typeof window.chromux?.setWindowButtonPosition !== 'function') return null;
  const rect = titlebar.getBoundingClientRect();
  const position = {
    x: 14,
    y: 14 + Math.round(rect.top + (rect.height - 44) / 2),
  };
  state.ui.windowButtonPosition = position;
  window.chromux.setWindowButtonPosition(position);
  return position;
}

function applyTheme(theme, { persist = true } = {}) {
  const next = THEME_IDS.has(theme) ? theme : 'liquid-glass';
  state.ui.theme = next;
  document.body.dataset.theme = next;
  document.body.dataset.themeMode = state.ui.themeMode;
  document.documentElement.style.colorScheme = state.ui.themeMode;
  if (persist) {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* unavailable */ }
  }
  for (const session of state.sessions.values()) {
    syncSessionTerminalTheme(session, next, state.ui.themeMode);
  }
  if (state.ui.threadPreview) refreshThreadPreview();
  renderThemeControls();
  syncWindowButtonPosition();
  return next;
}

function applyThemeMode(mode, { persist = true } = {}) {
  const next = THEME_MODE_IDS.has(mode) ? mode : 'light';
  state.ui.themeMode = next;
  document.body.dataset.themeMode = next;
  document.documentElement.style.colorScheme = next;
  if (persist) {
    try { window.localStorage.setItem(THEME_MODE_STORAGE_KEY, next); } catch { /* unavailable */ }
  }
  for (const session of state.sessions.values()) {
    syncSessionTerminalTheme(session, state.ui.theme, next);
  }
  if (state.ui.threadPreview) refreshThreadPreview();
  renderThemeControls();
  return next;
}

function applyThreadPreviewSize(size, { persist = true } = {}) {
  const next = THREAD_PREVIEW_SIZES.has(size) ? size : 'comfortable';
  state.ui.threadPreviewSize = next;
  document.body.dataset.threadPreviewSize = next;
  const select = $('#settings-thread-preview-size');
  if (select) select.value = next;
  if (persist) {
    try { window.localStorage.setItem(THREAD_PREVIEW_SIZE_STORAGE_KEY, next); } catch { /* unavailable */ }
  }
  if (state.ui.threadPreview) requestAnimationFrame(() => {
    positionThreadPreview();
    scaleThreadPreviewTerminal();
  });
  return next;
}

applyTheme(state.ui.theme, { persist: false });
applyTabActivityIndicators(state.ui.tabActivityIndicators, { persist: false });
applyThreadPreviewSize(state.ui.threadPreviewSize, { persist: false });

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

function previousCodePointIndex(text, index) {
  if (index <= 0) return 0;
  const prior = text.charCodeAt(index - 1);
  return prior >= 0xDC00 && prior <= 0xDFFF && index > 1 ? index - 2 : index - 1;
}

function nextCodePointIndex(text, index) {
  if (index >= text.length) return text.length;
  const current = text.charCodeAt(index);
  return current >= 0xD800 && current <= 0xDBFF && index + 1 < text.length ? index + 2 : index + 1;
}

function previousWordIndex(text, index) {
  let cursor = index;
  while (cursor > 0 && /\s/u.test(text.slice(previousCodePointIndex(text, cursor), cursor))) cursor = previousCodePointIndex(text, cursor);
  while (cursor > 0 && !/\s/u.test(text.slice(previousCodePointIndex(text, cursor), cursor))) cursor = previousCodePointIndex(text, cursor);
  return cursor;
}

function nextWordIndex(text, index) {
  let cursor = index;
  while (cursor < text.length && !/\s/u.test(text.slice(cursor, nextCodePointIndex(text, cursor)))) cursor = nextCodePointIndex(text, cursor);
  while (cursor < text.length && /\s/u.test(text.slice(cursor, nextCodePointIndex(text, cursor)))) cursor = nextCodePointIndex(text, cursor);
  return cursor;
}

function insertPendingTerminalText(termState, value) {
  const before = termState.typedInputBuf.slice(0, termState.typedInputCursor);
  const after = termState.typedInputBuf.slice(termState.typedInputCursor);
  const inserted = truncateUtf8(String(value || ''), Math.max(0, BOUNDS.composerDraftBytes - utf8ByteLength(before + after)));
  termState.typedInputBuf = before + inserted + after;
  termState.typedInputCursor = before.length + inserted.length;
}

function updatePendingTerminalInput(termState, data) {
  const raw = String(data || '');
  let index = 0;
  termState.typedInputCursor = Math.min(termState.typedInputBuf.length, Math.max(0, Number(termState.typedInputCursor) || 0));
  while (index < raw.length) {
    const rest = raw.slice(index);
    const wordMove = rest.match(/^\x1b([bf])/);
    if (wordMove) {
      termState.typedInputCursor = wordMove[1] === 'b'
        ? previousWordIndex(termState.typedInputBuf, termState.typedInputCursor)
        : nextWordIndex(termState.typedInputBuf, termState.typedInputCursor);
      index += wordMove[0].length;
      continue;
    }
    const csi = rest.match(/^\x1b\[([0-9;?]*)([A-Za-z~])/);
    if (csi) {
      const sequence = csi[0];
      const params = csi[1];
      const final = csi[2];
      const wordModified = /(?:^|;)(?:3|5)(?:;|$)/.test(params);
      if (final === 'D') termState.typedInputCursor = wordModified
        ? previousWordIndex(termState.typedInputBuf, termState.typedInputCursor)
        : previousCodePointIndex(termState.typedInputBuf, termState.typedInputCursor);
      else if (final === 'C') termState.typedInputCursor = wordModified
        ? nextWordIndex(termState.typedInputBuf, termState.typedInputCursor)
        : nextCodePointIndex(termState.typedInputBuf, termState.typedInputCursor);
      else if (final === 'H' || (final === '~' && (params === '1' || params === '7'))) termState.typedInputCursor = 0;
      else if (final === 'F' || (final === '~' && (params === '4' || params === '8'))) termState.typedInputCursor = termState.typedInputBuf.length;
      else if (final === '~' && params === '3') {
        const next = nextCodePointIndex(termState.typedInputBuf, termState.typedInputCursor);
        termState.typedInputBuf = termState.typedInputBuf.slice(0, termState.typedInputCursor) + termState.typedInputBuf.slice(next);
      }
      // Bracketed-paste wrappers and vertical movement do not alter the editable line.
      index += sequence.length;
      continue;
    }
    const printable = rest.match(/^[^\x00-\x1f\x7f\x1b]+/);
    if (printable) {
      insertPendingTerminalText(termState, printable[0]);
      index += printable[0].length;
      continue;
    }
    const character = String.fromCodePoint(raw.codePointAt(index));
    index += character.length;
    if (character === '\r' || character === '\n' || character === '\x03') {
      termState.typedInputBuf = '';
      termState.typedInputCursor = 0;
    } else if (character === '\x01') termState.typedInputCursor = 0;
    else if (character === '\x05') termState.typedInputCursor = termState.typedInputBuf.length;
    else if (character === '\x15') {
      termState.typedInputBuf = termState.typedInputBuf.slice(termState.typedInputCursor);
      termState.typedInputCursor = 0;
    } else if (character === '\x0b') termState.typedInputBuf = termState.typedInputBuf.slice(0, termState.typedInputCursor);
    else if (character === '\x17') {
      const before = termState.typedInputBuf.slice(0, termState.typedInputCursor);
      const start = previousWordIndex(before, before.length);
      termState.typedInputBuf = before.slice(0, start) + termState.typedInputBuf.slice(termState.typedInputCursor);
      termState.typedInputCursor = start;
    } else if (character === '\b' || character === '\x7f') {
      const previous = previousCodePointIndex(termState.typedInputBuf, termState.typedInputCursor);
      termState.typedInputBuf = termState.typedInputBuf.slice(0, previous) + termState.typedInputBuf.slice(termState.typedInputCursor);
      termState.typedInputCursor = previous;
    } else if (character === '\t' || character >= ' ') insertPendingTerminalText(termState, character);
  }
}

function trackTypedPreviewSuppressions(session, data) {
  if (!session || !data) return;
  const t = session.term;
  const submitted = /[\r\n]/.test(String(data)) ? submittedInputText(lineBufferAfterInput(t.typedInputBuf, String(data).split(/[\r\n]/, 1)[0])) : '';
  updatePendingTerminalInput(t, data);
  if (submitted) {
    const hits = scanLineForPreviews(submitted);
    for (const hit of hits) {
      t.previewSuppress.push({ url: hit.url, source: hit.source, submittedText: submitted, remainingLines: PREVIEW_SUPPRESS_LINE_TTL, ts: Date.now() });
    }
    if (t.previewSuppress.length > PREVIEW_SUPPRESS_MAX) t.previewSuppress.splice(0, t.previewSuppress.length - PREVIEW_SUPPRESS_MAX);
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
// Terminal links — click a URL or .html path in the terminal
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

function activateTerminalLink(session, url, event) {
  event.preventDefault();
  openInPane(session, url);
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
              activateTerminalLink(session, url, event);
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
  let tabStateChanged = false;
  switch (event.type) {
    case 'turn-signal':
      if (session) {
        tabStateChanged = window.chromuxAttention.applyTurnSignal(
          session.turn, event.signal, event.detail, Date.now(), event.envelope || null,
        );
        if (tabStateChanged && session.id === state.activeId && session.turn.state === 'completed') {
          session.turn.attentionSeenAt = Math.max(session.turn.attentionSeenAt || 0, session.turn.since || 0);
          window.chromuxAttention.consumeCompletedTurn(session.turn, Date.now());
        }
      }
      break;
    case 'user-input':
      // Only state-changing input is worth ring space — raw typing is noise.
      recorded = true;
      if (session) trackTypedPreviewSuppressions(session, event.data);
      if (session && window.chromuxAttention.applyUserInputTurnTransition(session, event.data, Date.now())) {
        tabStateChanged = true;
        recordEvent({ type: 'user-input', sessionId: session.id, turnState: session.turn.state });
      }
      break;
    case 'session-exited':
      if (session) {
        tabStateChanged = session.lifecycle.alive;
        session.lifecycle.alive = false;
        session.lifecycle.exitCode = Number.isFinite(event.exitCode) ? event.exitCode : null;
        session.lifecycle.exitedAt = Date.now();
      }
      break;
    case 'session-focused':
      state.activeId = event.sessionId;
      if (session && event.consumeRestoredCompletion !== false) {
        session.restoredAttentionRecords = session.restoredAttentionRecords
          .filter((record) => record.type !== 'completed');
      }
      if (session && session.turn.state === 'completed') {
        session.turn.attentionSeenAt = Math.max(session.turn.attentionSeenAt || 0, session.turn.since || 0);
        tabStateChanged = window.chromuxAttention.consumeCompletedTurn(session.turn, Date.now());
      }
      break;
    case 'session-adopted':
      if (session && ADOPTABLE_AGENTS.has(event.agent) && session.agent !== event.agent) {
        session.agent = event.agent;
        updateSessionAgentChrome(session);
        invalidate('tabs', 'shortcutDebug');
      }
      break;
    case 'attention-dismissed':
      if (session && session.turn.state === 'completed') {
        tabStateChanged = window.chromuxAttention.consumeCompletedTurn(session.turn, Date.now());
      } else if (session) {
        session.turn.acknowledged = true;
      }
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
  invalidate('attention', 'update', 'badges', 'captureChips',
    ...(state.env && state.env.devMode ? ['diagnostics'] : []), ...(tabStateChanged ? ['tabs'] : []));
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
  if (dirty.has('diagnostics')) renderDeveloperDiagnostics();
}

// ───────────────────────────────────────────────────────────────────────────
// Session shape — explicit state domains. Identity is flat and immutable;
// lifecycle, turn, browser-pane, and terminal state live in their own domains.
// ───────────────────────────────────────────────────────────────────────────

function newSessionShape({ id, name, cwd, agent }) {
  const capabilities = {
    claude: { turnStarted: 'native', inputRequired: 'native', permissionRequired: 'native', authenticationRequired: 'native', rateLimited: 'native', toolFailed: 'native', turnCompleted: 'native' },
    codex: { turnStarted: 'inferred', inputRequired: 'unavailable', permissionRequired: 'unavailable', authenticationRequired: 'unavailable', rateLimited: 'unavailable', toolFailed: 'unavailable', turnCompleted: 'native' },
    grok: { turnStarted: 'native', inputRequired: 'native', permissionRequired: 'native', authenticationRequired: 'native', rateLimited: 'native', toolFailed: 'native', turnCompleted: 'native' },
    '': { turnStarted: 'unavailable', inputRequired: 'unavailable', permissionRequired: 'unavailable', authenticationRequired: 'unavailable', rateLimited: 'unavailable', toolFailed: 'unavailable', turnCompleted: 'unavailable' },
  }[agent];
  return {
    id, name, cwd, agent, resumeId: null,
    restoredAttentionRecords: [], // historical snapshot records; separate from live turn/capture state
    capabilities,
    lifecycle: { alive: true, exitCode: null, exitedAt: null, resumeLaunch: null },
    turn: {
      state: 'unknown', // 'unknown' | 'working' | 'idle' | 'needsInput' | 'completed'
      instrumented: false, // true once a deterministic signal has arrived
      detail: null,
      since: 0,
      acknowledged: false, // explicit DISMISS for actionable non-completion states
      attentionSeenAt: 0, // retained for diagnostic history across completion consumption
      token: null, protocol: null, authoritative: false, hasV2: false, inputAt: 0, reason: null,
      source: null, confidence: null, turnId: null, eventId: null,
      eventIds: [], sequence: -1, stopped: false, authoritativeAt: 0,
    },
    browser: {
      webview: null, webContentsId: null, currentUrl: null, lastReload: 0,
      partitionId: globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      queue: [], consoleBuf: [], consoleTotal: 0, picking: false,
      guestEditableFocused: false,
      // Terminal-first: new sessions start with the paired browser shut.
      // Detected previews queue until the user opens one (QUEUE OPEN, link click, URL bar).
      collapsed: true,
      expandedGridTemplate: 'minmax(320px, 46%) 6px minmax(360px, 1fr)',
    },
    term: {
      term: null,
      fitAddon: null,
      serializer: null,
      fit: () => {},
      viewportY: null,
      fitting: false,
      scrollToBottom: null,
      lineBuf: '',
      signalBuf: '',
      titleBuf: '',
      title: '',
      typedInputBuf: '',
      typedInputCursor: 0,
      previewSuppress: [],
    },
    composer: {
      open: false,
      draft: '',
      history: [],
      historyLoaded: false,
      drawerOpen: false,
      query: '',
      recallIndex: -1,
      scratchDraft: null,
      expanded: false,
      expandedViewportY: null,
      pendingInputChoice: null,
    },
    els: null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Review queue — approval-gated. Detected previews always queue; never auto-
// open the pane. Refresh only when the pane's own (already open) URL is
// re-emitted. User opens via QUEUE OPEN, terminal link click, or URL bar.
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
    const pin = document.createElement('button');
    pin.className = 'qi-btn pin';
    pin.textContent = favoriteForUrl(item.url) ? 'UNPIN' : 'PIN';
    pin.dataset.queuePinUrl = item.url;
    pin.onclick = () => toggleFavorite(session, item.url, item.url);
    const dismiss = document.createElement('button');
    dismiss.className = 'qi-btn';
    dismiss.textContent = 'DISMISS';
    dismiss.onclick = () => {
      apply({ type: 'preview-dismissed', sessionId: session.id, url: item.url });
      renderQueue(session);
    };
    row.append(src, main, pin, open, dismiss);
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

function shortcutDebugDetailsActive(modifiers = {}) {
  return Boolean(modifiers.meta || modifiers.control);
}

function sanitizeShortcutDebugModifiers(modifiers = {}, key = null, type = 'unknown') {
  const normalized = {
    meta: Boolean(modifiers.meta),
    shift: Boolean(modifiers.shift),
    alt: Boolean(modifiers.alt),
    control: Boolean(modifiers.control),
  };
  const primaryModifierKeyDown = type === 'keyDown' && (key === '⌘' || key === '⌃');
  normalized.shift = normalized.shift && (shortcutDebugDetailsActive(normalized) || primaryModifierKeyDown);
  return normalized;
}

function normalizeShortcutDebugKey(raw, modifiers = {}) {
  const key = String(raw || '');
  if (!key) return null;
  const lower = key.toLowerCase();
  if (lower === 'meta' || lower === 'command' || key === '⌘') return '⌘';
  if (lower === 'shift' || key === '⇧') return shortcutDebugDetailsActive(modifiers) ? '⇧' : null;
  if (lower === 'alt' || lower === 'option' || key === '⌥') return '⌥';
  if (lower === 'control' || lower === 'ctrl' || key === '⌃') return '⌃';
  if (!shortcutDebugDetailsActive(modifiers)) return null;
  if (/^[1-9]$/.test(key)) return key;
  if (['j', 'b', 't', 'd', 'q', 'c', 'v'].includes(lower)) return lower.toUpperCase();
  if (lower === 'enter') return 'Enter';
  if (lower === 'escape' || lower === 'esc') return 'Esc';
  if (lower === 'arrowup') return '↑';
  if (lower === 'arrowdown') return '↓';
  if (lower === 'arrowleft') return '←';
  if (lower === 'arrowright') return '→';
  if (key === '↑' || key === '↓' || key === '←' || key === '→') return key;
  return null;
}

function shortcutDebugInputFromDomEvent(e, source = 'renderer') {
  const type = e.type === 'keyup' ? 'keyUp' : 'keyDown';
  const modifiers = {
    meta: Boolean(e.metaKey),
    shift: Boolean(e.shiftKey),
    alt: Boolean(e.altKey),
    control: Boolean(e.ctrlKey),
  };
  const key = normalizeShortcutDebugKey(e.key, modifiers);
  return {
    source,
    type,
    key,
    modifiers: sanitizeShortcutDebugModifiers(modifiers, key, type),
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
  let modifiers = {
    meta: Boolean(payload.modifiers && payload.modifiers.meta),
    shift: Boolean(payload.modifiers && payload.modifiers.shift),
    alt: Boolean(payload.modifiers && payload.modifiers.alt),
    control: Boolean(payload.modifiers && payload.modifiers.control),
  };
  const key = normalizeShortcutDebugKey(payload.key, modifiers);
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
  modifiers = sanitizeShortcutDebugModifiers(modifiers, key, payload.type || 'unknown');

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
  const modifiers = stale
    ? { meta: false, shift: false, alt: false, control: false }
    : { ...state.shortcutDebug.modifiers };
  const detailsActive = shortcutDebugDetailsActive(modifiers);
  return {
    key: stale || !detailsActive ? null : state.shortcutDebug.latestKey,
    modifiers,
    detailsActive,
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
    { id: 'composer-open', label: '⌘⇧Enter', key: 'Enter', modifiers: { meta: true, shift: true }, kind: 'guarded', order: 22 },
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
        ? (activeSession.browser.collapsed ? 'open browser' : 'shut browser')
        : 'no active session';
    } else if (shortcut.id === 'composer-open') {
      disabledReason = guardReason || (activeSession ? null : 'no active session');
      description = activeSession ? 'open composer' : 'no active session';
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
  root.classList.toggle('details-active', chord.detailsActive);
  root.classList.toggle('details-inactive', !chord.detailsActive);

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
  // Explicit open always restores a shut browser so the approved URL is visible.
  if (b.collapsed) setBrowserCollapsed(session, false);
  b.currentUrl = url;
  b.lastReload = Date.now();
  session.els.urlBar.value = url;
  renderFavoriteToolbar(session);
  invalidate('captureChips');
  if (!b.webview) {
    const wv = document.createElement('webview');
    // Each paired browser is an explicit target with isolated cookies/storage.
    // This prevents two sessions from inheriting a shared "current browser".
    wv.setAttribute('partition', `persist:chromux-${session.browser.partitionId}`);
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
      renderFavoriteToolbar(session);
      invalidate('captureChips', 'shortcutDebug');
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
      if (e.isMainFrame) {
        b.currentUrl = e.url;
        session.els.urlBar.value = e.url;
        renderFavoriteToolbar(session);
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

function renderBrowserRailToggle(button, collapsed) {
  const label = document.createElement('span');
  label.className = 'browser-rail-label';
  label.textContent = collapsed ? 'BROWSER' : 'COLLAPSE';

  if (!collapsed) {
    button.replaceChildren(label);
    return;
  }

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.classList.add('panel-open-icon');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.5');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.innerHTML = '<rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.25"></rect><path d="M6 2.5v11"></path><path d="m10.5 5-3 3 3 3"></path>';
  button.replaceChildren(icon, label);
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
  renderBrowserRailToggle(session.els.collapseBtn, collapsed);
  session.els.collapseBtn.title = collapsed
    ? 'Open paired browser (⌘⇧B)'
    : 'Shut paired browser (⌘⇧B)';
  session.els.collapseBtn.setAttribute('aria-label', session.els.collapseBtn.title);
  refitTerminal(session);
}

function setBrowserCollapsed(session, collapsed) {
  const next = Boolean(collapsed);
  if (session.browser.collapsed === next) return;
  if (next) session.browser.expandedGridTemplate = session.els.view.style.gridTemplateColumns || session.browser.expandedGridTemplate;
  session.browser.collapsed = next;
  if (next) session.els.queuePanel.classList.add('hidden');
  if (next && session.els.favoritesPanel) session.els.favoritesPanel.classList.add('hidden');
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

const AGENT_LABELS = { claude: 'CLAUDE CODE', codex: 'CODEX', grok: 'GROK BUILD', '': 'SHELL' };
const ADOPTABLE_AGENTS = new Set(['claude', 'codex', 'grok']);
const AGENT_ORDER = ['claude', 'codex', 'grok', ''];
const SHELL_ADOPTION_SCAN_MS = 2500;

// POSIX single-quoting: close the quote, emit an escaped ', reopen. Safe for
// any byte the filesystem allows (spaces, quotes, backslashes).
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// Launch command for an agent CLI. Claude sessions get `--settings` pointing
// at the Chromux hooks file (merges with, never replaces, the user's own
// settings) so deterministic turn signals flow back over the PTY. Codex gets
// a notify config path. Grok Build installs hooks into ~/.grok/hooks at app
// start (no launch flag), so the command is bare `grok` / `grok --resume`.
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
  if (agent === 'grok') {
    return resumeId ? `grok --resume ${shellQuote(resumeId)}` : 'grok';
  }
  return null;
}

function simpleShellTokens(line) {
  const src = String(line || '').trim();
  if (!src) return null;
  const tokens = [];
  let i = 0;
  const meta = new Set(['|', '&', ';', '<', '>', '(', ')', '{', '}']);
  while (i < src.length) {
    while (/\s/.test(src[i] || '')) i += 1;
    if (i >= src.length) break;
    const start = i;
    let text = '';
    while (i < src.length && !/\s/.test(src[i])) {
      const ch = src[i];
      if (ch === "'") {
        i += 1;
        while (i < src.length && src[i] !== "'") {
          text += src[i];
          i += 1;
        }
        if (i >= src.length) return null;
        i += 1;
      } else if (ch === '"') {
        i += 1;
        while (i < src.length && src[i] !== '"') {
          if (src[i] === '\\') {
            if (i + 1 >= src.length) return null;
            text += src[i + 1];
            i += 2;
          } else {
            if (src[i] === '`' || (src[i] === '$' && src[i + 1] === '(')) return null;
            text += src[i];
            i += 1;
          }
        }
        if (i >= src.length) return null;
        i += 1;
      } else if (ch === '\\') {
        if (i + 1 >= src.length) return null;
        text += src[i + 1];
        i += 2;
      } else {
        if (ch === '`' || (ch === '$' && src[i + 1] === '(') || meta.has(ch)) return null;
        text += ch;
        i += 1;
      }
    }
    tokens.push({ text, raw: src.slice(start, i), start, end: i });
  }
  return tokens.length ? { line: src, tokens } : null;
}

function claudeHasSettingsArg(tokens) {
  return tokens.slice(1).some((token) => token.text === '--settings' || token.text.startsWith('--settings='));
}

function codexHasNotifyConfigArg(tokens) {
  for (let i = 1; i < tokens.length; i += 1) {
    const text = tokens[i].text;
    if (text === '-c' || text === '--config') {
      if (/\bnotify\b/.test(tokens[i + 1] ? tokens[i + 1].text : '')) return true;
    } else if ((text.startsWith('-c') && text.length > 2) || text.startsWith('--config=')) {
      if (/\bnotify\b/.test(text)) return true;
    }
  }
  return false;
}

function rewriteShellLaunchLine(line) {
  const parsed = simpleShellTokens(line);
  if (!parsed) return null;
  const commandToken = parsed.tokens[0];
  const agent = commandToken.text;
  if (!ADOPTABLE_AGENTS.has(agent)) return null;
  if (commandToken.raw !== agent) return null;
  if (agent === 'claude' && claudeHasSettingsArg(parsed.tokens)) return null;
  if (agent === 'codex' && codexHasNotifyConfigArg(parsed.tokens)) return null;
  const base = agentCommand(agent);
  if (!base) return null;
  const args = parsed.line.slice(commandToken.end).trim();
  return {
    agent,
    original: parsed.line,
    command: args ? `${base} ${args}` : base,
  };
}

function lineBufferAfterInput(base, input) {
  let buf = String(base || '');
  for (const ch of String(input || '')) {
    if (ch === '\x15' || ch === '\x03') buf = '';
    else if (ch === '\b' || ch === '\x7f') buf = buf.slice(0, -1);
    else if (ch === '\t' || ch >= ' ') buf += ch;
  }
  return truncateComposerDraft(buf);
}

function submittedShellLineForInput(session, data) {
  if (!session || !data) return null;
  const raw = String(data);
  const endings = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] === '\r' || raw[i] === '\n') endings.push(i);
  }
  if (endings.length !== 1) return null;
  const index = endings[0];
  if (raw.slice(index + 1).length > 0) return null;
  return lineBufferAfterInput(session.term.typedInputBuf, raw.slice(0, index));
}

function rewriteShellLaunchInput(session, data) {
  if (!session || session.agent !== '') return null;
  const submitted = submittedShellLineForInput(session, data);
  if (submitted === null) return null;
  const rewrite = rewriteShellLaunchLine(submitted);
  if (!rewrite) return null;
  return {
    ...rewrite,
    data: `\x15${rewrite.command}\r`,
  };
}

function resumeIdForRow(row) {
  const id = row && typeof row.resumeId === 'string'
    ? row.resumeId
    : (row && row.resume && typeof row.resume.id === 'string' ? row.resume.id : null);
  return id && /^[0-9a-f][0-9a-f-]{15,127}$/i.test(id) ? id : null;
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

function sessionAgentHeaderText(agent) {
  return agent ? agent.toUpperCase() : 'SHELL';
}

function updateSessionAgentChrome(session) {
  if (!session || !session.els) return;
  if (session.els.termLabel) {
    session.els.termLabel.innerHTML = `TERMINAL <span class="lit">· ${sessionAgentHeaderText(session.agent)}</span>`;
  }
}

function otherAgents(agent) {
  return AGENT_ORDER.filter((name) => name && name !== (agent || ''));
}

function otherAgent(agent) {
  // Prefer the first alternate agent for single-slot call sites.
  return otherAgents(agent)[0] || 'claude';
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

function closeGrokContextAdvisory() {
  $('#modal-grok-advisory').classList.add('hidden');
  $('#grok-context-enable').checked = false;
  $('#grok-context-confirm').disabled = true;
  state.grokContextAction = null;
}

function openGrokContextAdvisory(session, mode = 'other') {
  state.grokContextAction = { sessionId: session.id, mode };
  $('#grok-context-enable').checked = false;
  $('#grok-context-confirm').disabled = true;
  $('#grok-advisory-target').textContent = mode === 'same'
    ? `Duplicate ${session.name} as a Grok Build session · ${session.cwd}`
    : `Open ${session.name} in Grok Build · ${session.cwd}`;
  $('#modal-grok-advisory').classList.remove('hidden');
  $('#grok-context-enable').focus();
}

function openSessionContextMenu(session, x, y) {
  closeSessionContextMenu();

  const menu = document.createElement('div');
  menu.className = 'session-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const addItem = (label, detail, action, danger = false, warning = false) => {
    const item = document.createElement('button');
    item.className = 'session-menu-item' + (danger ? ' danger' : '') + (warning ? ' warning' : '');
    const text = document.createElement('span');
    text.className = 'smi-label';
    if (warning) {
      const icon = document.createElement('span');
      icon.className = 'smi-warning-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '⚠';
      text.append(icon, document.createTextNode(label));
    } else {
      text.textContent = label;
    }
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

  const duplicatesGrok = session.agent === 'grok';
  addItem('Duplicate session', agentLabel(session.agent), () => {
    if (duplicatesGrok) openGrokContextAdvisory(session, 'same');
    else duplicateSession(session, session.agent, 'same').catch(() => {});
  }, false, duplicatesGrok);
  for (const crossAgent of otherAgents(session.agent)) {
    addItem(`Open in ${agentLabel(crossAgent)}`, session.cwd, () => {
      if (crossAgent === 'grok') openGrokContextAdvisory(session, 'other');
      else duplicateSession(session, crossAgent, 'other').catch(() => {});
    }, false, crossAgent === 'grok');
  }
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
  termLabel.innerHTML = `TERMINAL <span class="lit">· ${sessionAgentHeaderText(session.agent)}</span>`;
  const termCwd = document.createElement('span');
  termCwd.className = 'term-head-cwd';
  termCwd.textContent = session.cwd;
  const composeBtn = document.createElement('button');
  composeBtn.type = 'button'; composeBtn.className = 'head-btn compose-toggle'; composeBtn.textContent = 'COMPOSE';
  composeBtn.title = 'Open multiline composer (⌘⇧Enter)'; composeBtn.setAttribute('aria-label', 'Open multiline composer');
  termHead.append(termLabel, termCwd, composeBtn);
  const termHost = document.createElement('div');
  termHost.className = 'term-host';
  const scrollToBottom = document.createElement('button');
  scrollToBottom.type = 'button';
  scrollToBottom.className = 'term-scroll-bottom hidden';
  scrollToBottom.textContent = '↓ SKIP TO BOTTOM';
  scrollToBottom.title = 'Skip to latest terminal output';
  scrollToBottom.setAttribute('aria-label', 'Skip to latest terminal output');
  termHost.appendChild(scrollToBottom);
  const composer = document.createElement('section');
  composer.className = 'terminal-composer hidden'; composer.setAttribute('aria-label', 'Multiline terminal composer');
  const composerToolbar = document.createElement('div'); composerToolbar.className = 'composer-toolbar';
  const composerLabel = document.createElement('span'); composerLabel.className = 'microlabel'; composerLabel.textContent = 'PROMPT COMPOSER';
  const composerStatus = document.createElement('span'); composerStatus.className = 'composer-status'; composerStatus.textContent = '⌘⇧ENTER SENDS · ENTER NEWLINE';
  const historyBtn = document.createElement('button'); historyBtn.type = 'button'; historyBtn.className = 'head-btn'; historyBtn.textContent = 'HISTORY';
  const expandComposerBtn = document.createElement('button'); expandComposerBtn.type = 'button'; expandComposerBtn.className = 'head-btn'; expandComposerBtn.textContent = 'EXPAND';
  expandComposerBtn.setAttribute('aria-label', 'Expand prompt composer'); expandComposerBtn.setAttribute('aria-pressed', 'false');
  const closeComposerBtn = document.createElement('button'); closeComposerBtn.type = 'button'; closeComposerBtn.className = 'head-btn'; closeComposerBtn.textContent = 'CLOSE';
  composerToolbar.append(composerLabel, composerStatus, historyBtn, expandComposerBtn, closeComposerBtn);
  const composerInputChoice = document.createElement('div');
  composerInputChoice.className = 'composer-input-choice hidden'; composerInputChoice.setAttribute('role', 'alertdialog');
  composerInputChoice.setAttribute('aria-modal', 'true'); composerInputChoice.setAttribute('aria-labelledby', `composer-input-choice-${session.id}`);
  const composerInputChoiceLabel = document.createElement('span'); composerInputChoiceLabel.id = `composer-input-choice-${session.id}`;
  composerInputChoiceLabel.textContent = 'Terminal input and a composer draft both exist. Choose how to continue.';
  const composerInputChoiceActions = document.createElement('div'); composerInputChoiceActions.className = 'composer-input-choice-actions';
  for (const [action, label] of [['append', 'APPEND'], ['replace', 'REPLACE'], ['copy', 'COPY'], ['dismiss', 'DISMISS']]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'head-btn'; button.dataset.composerInputAction = action; button.textContent = label;
    composerInputChoiceActions.appendChild(button);
  }
  composerInputChoice.append(composerInputChoiceLabel, composerInputChoiceActions);
  const composerTextarea = document.createElement('textarea');
  composerTextarea.className = 'composer-textarea'; composerTextarea.rows = 3; composerTextarea.spellcheck = true;
  composerTextarea.placeholder = 'Write a multiline prompt…'; composerTextarea.setAttribute('aria-label', 'Prompt text');
  const composerActions = document.createElement('div'); composerActions.className = 'composer-actions';
  const composerCount = document.createElement('span'); composerCount.className = 'composer-count';
  const submitComposerBtn = document.createElement('button');
  submitComposerBtn.type = 'button'; submitComposerBtn.className = 'btn btn-amber composer-submit'; submitComposerBtn.textContent = 'SUBMIT ⌘⇧↵';
  composerActions.append(composerCount, submitComposerBtn);
  const historyDrawer = document.createElement('div'); historyDrawer.className = 'composer-history hidden';
  const historyControls = document.createElement('div'); historyControls.className = 'composer-history-controls';
  const historySearch = document.createElement('input');
  historySearch.type = 'search'; historySearch.placeholder = 'Search project history'; historySearch.spellcheck = false;
  historySearch.setAttribute('aria-label', 'Search project prompt history');
  const clearHistoryBtn = document.createElement('button');
  clearHistoryBtn.type = 'button'; clearHistoryBtn.className = 'head-btn danger'; clearHistoryBtn.textContent = 'CLEAR PROJECT HISTORY';
  historyControls.append(historySearch, clearHistoryBtn);
  const historyList = document.createElement('div'); historyList.className = 'composer-history-list';
  historyDrawer.append(historyControls, historyList);
  composer.append(composerToolbar, composerInputChoice, composerTextarea, composerActions, historyDrawer);
  termPane.append(termHead, termHost, composer);

  // divider
  const divider = document.createElement('div');
  divider.className = 'divider';

  // browser pane
  const webPane = document.createElement('div');
  webPane.className = 'pane web-pane';
  const browserContent = document.createElement('div');
  browserContent.className = 'browser-content';
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
  collapseBtn.className = 'head-btn browser-rail-toggle collapse-btn';
  collapseBtn.title = 'Open paired browser (⌘⇧B)';
  collapseBtn.setAttribute('aria-label', 'Open paired browser (⌘⇧B)');
  renderBrowserRailToggle(collapseBtn, true);
  const urlBar = document.createElement('input');
  urlBar.className = 'url-bar'; urlBar.type = 'text'; urlBar.spellcheck = false;
  urlBar.placeholder = 'awaiting preview — or type a URL and hit ⏎';
  const favoriteBtn = document.createElement('button');
  favoriteBtn.className = 'nav-btn favorite-btn'; favoriteBtn.textContent = '☆';
  favoriteBtn.title = 'Add current page to favorites'; favoriteBtn.disabled = true;

  const favoritesBtn = document.createElement('button');
  favoritesBtn.className = 'head-btn';
  const favoritesBadge = document.createElement('span'); favoritesBadge.className = 'q-badge';
  favoritesBadge.textContent = String(state.favorites.length);
  favoritesBtn.append(document.createTextNode('FAVORITES '), favoritesBadge);

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

  browserToolbar.append(back, reload, urlBar, favoriteBtn, consoleChip, captureChip, queueBtn, favoritesBtn, pickBtn, captureBtn);
  webHead.append(webLabel, browserToolbar);

  const queuePanel = document.createElement('div');
  queuePanel.className = 'queue-panel hidden';
  const queueHead = document.createElement('div');
  queueHead.className = 'queue-head';
  queueHead.innerHTML = '<span class="microlabel">REVIEW QUEUE — NEW PREVIEWS WAIT HERE</span>';
  const queueList = document.createElement('div');
  queuePanel.append(queueHead, queueList);

  const favoritesPanel = document.createElement('div');
  favoritesPanel.className = 'favorites-panel hidden';
  const favoritesHead = document.createElement('div'); favoritesHead.className = 'queue-head';
  favoritesHead.innerHTML = '<span class="microlabel">GLOBAL FAVORITES</span>';
  const favoritesList = document.createElement('div');
  favoritesPanel.append(favoritesHead, favoritesList);

  const webHost = document.createElement('div');
  webHost.className = 'web-host';
  const placeholder = document.createElement('div');
  placeholder.className = 'web-placeholder';
  placeholder.innerHTML = `
    <div class="wp-radar"></div>
    <div class="wp-title">AWAITING PREVIEW</div>
    <div class="wp-sub">Chromux watches this session's terminal for <em>localhost</em> dev-server URLs
    and local <em>.html</em> paths. Detected previews always land in the badged <em>QUEUE</em> —
    nothing opens until you approve it.<br/>Open via queue <em>OPEN</em>, click a
    terminal link, or type a URL here and hit ⏎. Opening a URL also restores a shut browser.</div>`;
  const refreshFlash = document.createElement('div');
  refreshFlash.className = 'refresh-flash';
  refreshFlash.textContent = 'AUTO-REFRESHED';
  webHost.append(placeholder, refreshFlash);

  const browserRail = document.createElement('div');
  browserRail.className = 'browser-rail';
  browserRail.appendChild(collapseBtn);
  browserContent.append(webHead, queuePanel, favoritesPanel, webHost);
  webPane.append(browserContent, browserRail);
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
  queueBtn.onclick = () => {
    favoritesPanel.classList.add('hidden');
    queuePanel.classList.toggle('hidden');
  };
  favoritesBtn.onclick = () => {
    queuePanel.classList.add('hidden');
    favoritesPanel.classList.toggle('hidden');
  };
  favoriteBtn.onclick = () => toggleFavorite(session, session.browser.currentUrl || urlBar.value);
  composeBtn.onclick = () => openComposer(session);
  closeComposerBtn.onclick = () => closeComposer(session);
  historyBtn.onclick = () => toggleComposerHistory(session);
  expandComposerBtn.onclick = () => toggleComposerExpanded(session);
  composerInputChoiceActions.onclick = (event) => {
    const action = event.target && event.target.dataset && event.target.dataset.composerInputAction;
    if (action) resolveComposerInputChoice(session, action);
  };
  submitComposerBtn.onclick = () => submitComposer(session);
  composerTextarea.addEventListener('input', () => updateComposerDraftFromInput(session));
  composer.addEventListener('keydown', (event) => handleComposerKeydown(session, event));
  historySearch.addEventListener('input', () => { session.composer.query = historySearch.value; renderComposerHistory(session); });
  clearHistoryBtn.onclick = () => clearComposerHistory(session);
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
    view, termPane, termLabel, termHost, scrollToBottom, composeBtn, composer, composerTextarea, composerStatus, composerCount,
    submitComposerBtn, historyBtn, expandComposerBtn, closeComposerBtn, composerInputChoice, composerInputChoiceActions,
    historyDrawer, historySearch, historyList, clearHistoryBtn,
    urlBar, favoriteBtn, favoritesBtn, favoritesBadge, favoritesPanel, favoritesList, queueBtn, queueBadge, queuePanel, queueList,
    consoleChip, captureChip, pickBtn, captureBtn, webHost, placeholder, refreshFlash,
    divider, webPane, browserContent, browserRail, browserToolbar, collapseBtn,
  };
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value || '')).byteLength;
}

function utf8WithinLimit(value) {
  return typeof value === 'string' && utf8ByteLength(value) <= BOUNDS.composerDraftBytes;
}

function truncateUtf8(value, maxBytes) {
  const text = String(value || '');
  if (utf8ByteLength(text) <= maxBytes) return text;
  let bytes = 0;
  let result = '';
  const encoder = new TextEncoder();
  for (const character of text) {
    const size = encoder.encode(character).byteLength;
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

function truncateComposerDraft(value) {
  return truncateUtf8(value, BOUNDS.composerDraftBytes);
}

function autosizeComposer(session) {
  const textarea = session.els && session.els.composerTextarea;
  const pane = session.els && session.els.termHost && session.els.termHost.parentElement;
  if (!textarea || !pane) return;
  if (session.composer.expanded) {
    textarea.style.height = 'auto';
    textarea.style.overflowY = 'auto';
    return;
  }
  textarea.style.height = 'auto';
  const computed = getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 18;
  const chrome = (Number.parseFloat(computed.paddingTop) || 0) + (Number.parseFloat(computed.paddingBottom) || 0)
    + (Number.parseFloat(computed.borderTopWidth) || 0) + (Number.parseFloat(computed.borderBottomWidth) || 0);
  const minimum = (lineHeight * 3) + chrome;
  const maximum = Math.max(minimum, Math.floor(pane.clientHeight * 0.4));
  const height = Math.min(maximum, Math.max(minimum, textarea.scrollHeight));
  textarea.style.height = `${height}px`;
  textarea.style.overflowY = textarea.scrollHeight > maximum ? 'auto' : 'hidden';
}

function resetComposerRecall(session) {
  session.composer.recallIndex = -1;
  session.composer.scratchDraft = null;
}

function setComposerDraft(session, value, { resetRecall = true } = {}) {
  const draft = truncateComposerDraft(value);
  session.composer.draft = draft;
  if (session.els && session.els.composerTextarea && session.els.composerTextarea.value !== draft) {
    session.els.composerTextarea.value = draft;
  }
  if (resetRecall) resetComposerRecall(session);
  renderComposer(session);
}

function updateComposerDraftFromInput(session) {
  const textarea = session.els.composerTextarea;
  const next = truncateComposerDraft(textarea.value);
  if (textarea.value !== next) textarea.value = next;
  session.composer.draft = next;
  resetComposerRecall(session);
  renderComposer(session);
}

function renderComposer(session) {
  if (!session.els || !session.els.composer) return;
  const { composer } = session;
  const alive = Boolean(session.lifecycle.alive);
  session.els.composer.classList.toggle('hidden', !composer.open);
  session.els.termPane.classList.toggle('composer-expanded', composer.open && composer.expanded);
  session.els.composeBtn.classList.toggle('active', composer.open);
  session.els.composeBtn.classList.toggle('has-draft', Boolean(composer.draft));
  session.els.composeBtn.textContent = 'COMPOSE';
  session.els.composerTextarea.value = composer.draft;
  session.els.composerCount.textContent = `${utf8ByteLength(composer.draft).toLocaleString()} / ${BOUNDS.composerDraftBytes.toLocaleString()} BYTES`;
  session.els.submitComposerBtn.disabled = !alive || !composer.draft.trim();
  const appendOverflows = Boolean(composer.pendingInputChoice)
    && utf8ByteLength(`${composer.draft}\n${composer.pendingInputChoice}`) > BOUNDS.composerDraftBytes;
  session.els.composerStatus.textContent = !alive
    ? 'SESSION EXITED · DRAFT PRESERVED'
    : (appendOverflows ? 'APPEND EXCEEDS 64 KIB · CHOOSE REPLACE, COPY, OR DISMISS' : '⌘⇧ENTER SENDS · ENTER NEWLINE');
  session.els.historyBtn.classList.toggle('active', composer.drawerOpen);
  session.els.historyDrawer.classList.toggle('hidden', !composer.drawerOpen);
  session.els.expandComposerBtn.textContent = composer.expanded ? 'COLLAPSE' : 'EXPAND';
  session.els.expandComposerBtn.setAttribute('aria-label', composer.expanded ? 'Collapse prompt composer' : 'Expand prompt composer');
  session.els.expandComposerBtn.setAttribute('aria-pressed', String(composer.expanded));
  session.els.composerInputChoice.classList.toggle('hidden', !composer.pendingInputChoice);
  const appendChoice = session.els.composerInputChoiceActions.querySelector('[data-composer-input-action="append"]');
  appendChoice.disabled = appendOverflows;
  appendChoice.title = appendOverflows ? 'Combined text exceeds the 64 KiB composer limit' : '';
  autosizeComposer(session);
}

async function loadComposerHistory(session, { force = false } = {}) {
  if (session.composer.historyLoaded && !force) return session.composer.history;
  try {
    const entries = await window.chromux.promptHistoryRead(session.cwd);
    session.composer.history = Array.isArray(entries) ? entries : [];
  } catch {
    session.composer.history = [];
  }
  session.composer.historyLoaded = true;
  renderComposerHistory(session);
  return session.composer.history;
}

function clearPendingTerminalLine(session) {
  if (!session.lifecycle.alive || !session.term.typedInputBuf) return false;
  handleTerminalInput(session, '\x15\x0b');
  return true;
}

async function resolveComposerInputChoice(session, action) {
  const pending = session && session.composer.pendingInputChoice;
  if (!pending) return false;
  if (action === 'append') {
    if (utf8ByteLength(`${session.composer.draft}\n${pending}`) > BOUNDS.composerDraftBytes) return false;
    setComposerDraft(session, `${session.composer.draft}\n${pending}`);
    clearPendingTerminalLine(session);
  } else if (action === 'replace') {
    setComposerDraft(session, pending);
    clearPendingTerminalLine(session);
  } else if (action === 'copy') {
    if (!utf8WithinLimit(pending) || !await window.chromux.clipboardWriteText(pending)) return false;
  } else if (action !== 'dismiss') return false;
  session.composer.pendingInputChoice = null;
  renderComposer(session);
  requestAnimationFrame(() => {
    session.els.composerTextarea.focus();
    session.els.composerTextarea.setSelectionRange(session.composer.draft.length, session.composer.draft.length);
    reportShortcutFocusContext();
  });
  return true;
}

function toggleComposerExpanded(session) {
  if (!session || !session.composer.open) return false;
  const restoringViewport = session.composer.expanded ? session.composer.expandedViewportY : null;
  if (!session.composer.expanded) {
    rememberTerminalViewport(session);
    session.composer.expandedViewportY = session.term.viewportY;
  }
  session.composer.expanded = !session.composer.expanded;
  renderComposer(session);
  requestAnimationFrame(() => {
    session.term.fit();
    if (Number.isFinite(restoringViewport)) {
      const buffer = session.term.term.buffer && session.term.term.buffer.active;
      if (buffer && buffer.type === 'normal') {
        const target = Math.min(buffer.baseY, Math.max(0, restoringViewport));
        if (target !== buffer.viewportY) session.term.term.scrollLines(target - buffer.viewportY);
        session.term.viewportY = buffer.viewportY;
      }
      session.composer.expandedViewportY = null;
    }
    autosizeComposer(session);
    session.els.composerTextarea.focus();
  });
  return session.composer.expanded;
}

function openComposer(session) {
  if (!session || !session.els) return null;
  if (session.composer.open) return { sessionId: session.id, open: true };
  const pending = session.lifecycle.alive ? session.term.typedInputBuf : '';
  session.composer.open = true;
  if (pending && !session.composer.draft) {
    setComposerDraft(session, pending);
    clearPendingTerminalLine(session);
  } else if (pending && session.composer.draft) {
    session.composer.pendingInputChoice = pending;
  }
  renderComposer(session);
  loadComposerHistory(session).catch(() => {});
  requestAnimationFrame(() => {
    session.term.fit();
    autosizeComposer(session);
    if (session.composer.pendingInputChoice) {
      session.els.composerInputChoiceActions.querySelector('button')?.focus();
    } else {
      session.els.composerTextarea.focus();
      session.els.composerTextarea.setSelectionRange(session.composer.draft.length, session.composer.draft.length);
    }
    reportShortcutFocusContext();
  });
  invalidate('shortcutDebug');
  return { sessionId: session.id, open: true };
}

function closeComposer(session) {
  if (!session || !session.els || !session.composer.open) return null;
  const restoringViewport = session.composer.expanded ? session.composer.expandedViewportY : null;
  session.composer.open = false;
  session.composer.drawerOpen = false;
  session.composer.expanded = false;
  session.composer.pendingInputChoice = null;
  renderComposer(session);
  requestAnimationFrame(() => {
    session.term.fit();
    if (Number.isFinite(restoringViewport)) {
      const buffer = session.term.term.buffer && session.term.term.buffer.active;
      if (buffer && buffer.type === 'normal') {
        const target = Math.min(buffer.baseY, Math.max(0, restoringViewport));
        if (target !== buffer.viewportY) session.term.term.scrollLines(target - buffer.viewportY);
        session.term.viewportY = buffer.viewportY;
      }
    }
    session.composer.expandedViewportY = null;
    session.term.term.focus(); reportShortcutFocusContext();
  });
  invalidate('shortcutDebug');
  return { sessionId: session.id, open: false };
}

function composerEntryMeta(entry) {
  const timestamp = new Date(entry.submittedAt);
  const time = Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString() : '';
  return [time, agentLabel(entry.agent === 'shell' ? '' : entry.agent), entry.sessionName].filter(Boolean).join(' · ');
}

function renderComposerHistory(session) {
  const list = session.els && session.els.historyList;
  if (!list) return;
  list.innerHTML = '';
  const query = session.composer.query.trim().toLocaleLowerCase();
  const entries = session.composer.history.filter((entry) => !query || entry.text.toLocaleLowerCase().includes(query));
  if (!entries.length) {
    const empty = document.createElement('div'); empty.className = 'composer-history-empty';
    empty.textContent = query ? 'No matching prompts.' : 'No prompts saved for this project.';
    list.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('div'); row.className = 'composer-history-row';
    const reuse = document.createElement('button'); reuse.type = 'button'; reuse.className = 'composer-history-reuse';
    const preview = document.createElement('span'); preview.className = 'composer-history-preview';
    preview.textContent = entry.text.replace(/\s+/g, ' ').trim().slice(0, 240);
    const meta = document.createElement('span'); meta.className = 'composer-history-meta'; meta.textContent = composerEntryMeta(entry);
    reuse.append(preview, meta);
    reuse.onclick = () => {
      setComposerDraft(session, entry.text);
      session.composer.drawerOpen = false;
      renderComposer(session);
      session.els.composerTextarea.focus();
    };
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'head-btn danger'; remove.textContent = 'DELETE';
    remove.onclick = async () => {
      try { session.composer.history = await window.chromux.promptHistoryDelete(session.cwd, entry.id); } catch { return; }
      renderComposerHistory(session);
    };
    row.append(reuse, remove); list.appendChild(row);
  }
}

async function toggleComposerHistory(session) {
  session.composer.drawerOpen = !session.composer.drawerOpen;
  renderComposer(session);
  if (session.composer.drawerOpen) {
    await loadComposerHistory(session, { force: true });
    session.els.historySearch.focus();
  } else {
    session.els.composerTextarea.focus();
  }
}

async function clearComposerHistory(session) {
  if (!window.confirm('Clear prompt history for this project? This cannot be undone.')) return;
  try { session.composer.history = await window.chromux.promptHistoryClear(session.cwd); } catch { return; }
  renderComposerHistory(session);
  session.els.historySearch.focus();
}

function recallComposerHistory(session, direction) {
  const entries = session.composer.history;
  if (!entries.length) return;
  if (direction < 0) {
    if (session.composer.recallIndex < 0) session.composer.scratchDraft = session.composer.draft;
    session.composer.recallIndex = Math.min(entries.length - 1, session.composer.recallIndex + 1);
    setComposerDraft(session, entries[session.composer.recallIndex].text, { resetRecall: false });
  } else if (session.composer.recallIndex >= 0) {
    session.composer.recallIndex -= 1;
    const value = session.composer.recallIndex < 0
      ? (session.composer.scratchDraft || '')
      : entries[session.composer.recallIndex].text;
    setComposerDraft(session, value, { resetRecall: false });
    if (session.composer.recallIndex < 0) session.composer.scratchDraft = null;
  }
  session.els.composerTextarea.setSelectionRange(session.composer.draft.length, session.composer.draft.length);
}

async function submitComposer(session) {
  const text = session.composer.draft.replace(/\r\n?/g, '\n');
  if (!session.lifecycle.alive || !text.trim() || !utf8WithinLimit(text)) return false;
  if (!session.agent && text.includes('\n') && !window.confirm('Submit this multiline prompt to the shell? Each line may be interpreted as shell input.')) return false;
  session.term.term.paste(text);
  session.term.term.input('\r', true);
  setComposerDraft(session, '');
  session.els.composerTextarea.focus();
  try {
    session.composer.history = await window.chromux.promptHistoryAppend(session.cwd, {
      text,
      agent: session.agent || 'shell',
      sessionName: session.name,
      submittedAt: new Date().toISOString(),
    });
    session.composer.historyLoaded = true;
    renderComposerHistory(session);
  } catch { /* PTY submission succeeded; persistence failure is non-fatal */ }
  return true;
}

function handleComposerKeydown(session, event) {
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation(); closeComposer(session); return;
  }
  if (event.key === 'Enter' && event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey) {
    event.preventDefault(); event.stopPropagation(); submitComposer(session); return;
  }
  if (event.target === session.els.composerTextarea && event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault(); event.stopPropagation();
    loadComposerHistory(session, { force: session.composer.recallIndex < 0 })
      .then(() => recallComposerHistory(session, event.key === 'ArrowUp' ? -1 : 1));
  }
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

function sessionDisplayLabel(session) {
  const rawTitle = session.term && session.term.title;
  if (!rawTitle) return session.name;
  const normalized = rawTitle.replace(/^[\u2800-\u28ff](?:\s+|$)/u, '').trim();
  return normalized || session.name;
}

function sessionTabTooltip(session) {
  const label = sessionDisplayLabel(session);
  const cwd = session.cwd || '~';
  const base = label !== session.name
    ? `${label} — ${cwd}\nLaunch name: ${session.name}`
    : `${label} — ${cwd}`;
  return `${base}\n${sessionTabIndicator(session).status}`;
}

function sessionTabIndicator(session) {
  return window.chromuxAttention.projectSessionStatus(session, state.ui.tabActivityIndicators);
}

function updateSessionTabIndicator(session) {
  const indicator = sessionTabIndicator(session);
  session.els.dot.className = `tab-dot ${indicator.kind}`;
  session.els.dot.setAttribute('aria-hidden', 'true');
  session.els.tab.setAttribute('aria-label', `${sessionDisplayLabel(session)}. ${indicator.status}. ${session.cwd || '~'}`);
}

function updateSessionTabText(session) {
  if (!session || !session.els || !session.els.tab) return;
  const label = sessionDisplayLabel(session);
  session.els.tab.title = sessionTabTooltip(session);
  updateSessionTabIndicator(session);
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
  dot.setAttribute('aria-hidden', 'true');
  const labelWrap = document.createElement('span'); labelWrap.className = 'tab-label-wrap';
  const label = document.createElement('span'); label.className = 'tab-label'; label.textContent = sessionDisplayLabel(session);
  labelWrap.appendChild(label);
  const badge = document.createElement('span'); badge.className = 'tab-badge zero'; badge.textContent = '0';
  const x = document.createElement('button'); x.className = 'tab-x'; x.textContent = '✕'; x.title = 'Close session';
  x.onclick = (e) => { e.stopPropagation(); closeSession(session.id); };
  tab.append(dot, labelWrap, badge, x);
  tab.onclick = () => activateSession(session.id);
  tab.oncontextmenu = (e) => {
    e.preventDefault();
    if (session.id !== state.activeId) activateSession(session.id);
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
  $('#tab-list').insertBefore(tab, $('#tab-actions'));
  return { tab, dot, tabLabelWrap: labelWrap, tabLabel: label, tabBadge: badge };
}

function sessionSearchText(session) {
  return [sessionDisplayLabel(session), session.name, session.agent, session.cwd]
    .filter(Boolean)
    .join('\n')
    .toLocaleLowerCase();
}

function positionSessionSearch() {
  const panel = $('#session-search-panel');
  const workspace = $('#workspace');
  const button = $('#btn-search-sessions');
  if (!panel || panel.classList.contains('hidden') || !workspace || !button) return;
  const workspaceRect = workspace.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const margin = 8;
  const width = panel.getBoundingClientRect().width;
  panel.style.left = `${Math.max(margin, workspaceRect.right - width - margin)}px`;
  panel.style.top = `${buttonRect.bottom + 6}px`;
}

function closeSessionSearch({ restoreFocus = false } = {}) {
  const panel = $('#session-search-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  panel.classList.add('hidden');
  $('#btn-search-sessions').setAttribute('aria-expanded', 'false');
  if (restoreFocus) $('#btn-search-sessions').focus();
}

function renderSessionSearch() {
  const results = $('#session-search-results');
  if (!results) return;
  const query = $('#session-search-input').value.trim().toLocaleLowerCase();
  const matches = [...state.sessions.values()].filter((session) => sessionSearchText(session).includes(query));
  results.innerHTML = '';
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'session-search-empty';
    empty.textContent = state.sessions.size ? 'No matching sessions.' : 'No sessions open.';
    results.appendChild(empty);
    return;
  }
  for (const session of matches) {
    const row = document.createElement('button');
    row.className = 'session-search-result';
    row.type = 'button';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(session.id === state.activeId));
    row.dataset.sessionId = session.id;
    const title = document.createElement('span');
    title.className = 'session-search-result-title';
    title.textContent = sessionDisplayLabel(session);
    const meta = document.createElement('span');
    meta.className = 'session-search-result-meta';
    meta.textContent = [session.agent, session.cwd].filter(Boolean).join(' · ');
    row.append(title, meta);
    row.onclick = () => {
      activateSession(session.id);
      closeSessionSearch();
    };
    results.appendChild(row);
  }
}

function openSessionSearch() {
  const panel = $('#session-search-panel');
  const input = $('#session-search-input');
  panel.classList.remove('hidden');
  $('#btn-search-sessions').setAttribute('aria-expanded', 'true');
  input.value = '';
  renderSessionSearch();
  positionSessionSearch();
  input.focus();
}

function toggleSessionSearch() {
  if ($('#session-search-panel').classList.contains('hidden')) openSessionSearch();
  else closeSessionSearch({ restoreFocus: true });
}

function renderTabs() {
  for (const s of state.sessions.values()) {
    if (!s.els || !s.els.tab) continue;
    s.els.tab.classList.toggle('active', s.id === state.activeId);
    updateSessionTabText(s);
  }
  updateTabOverflowState();
  if (!$('#session-search-panel').classList.contains('hidden')) renderSessionSearch();
}

function diagnosticText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160);
}

function relativeAge(timestamp) {
  const age = Math.max(0, Date.now() - Number(timestamp || 0));
  if (age < 1000) return 'now';
  if (age < 60000) return `${Math.floor(age / 1000)}s`;
  if (age < 3600000) return `${Math.floor(age / 60000)}m`;
  return `${Math.floor(age / 3600000)}h`;
}

function diagnosticCell(label, value, mismatch = false) {
  const cell = document.createElement('div');
  cell.className = `diagnostic-cell${mismatch ? ' mismatch' : ''}`;
  const key = document.createElement('span'); key.textContent = label;
  const val = document.createElement('b'); val.textContent = diagnosticText(value);
  cell.append(key, val);
  return cell;
}

function diagnosticGroup(label, cells) {
  const group = document.createElement('section'); group.className = 'diagnostic-group';
  const title = document.createElement('h3'); title.textContent = label;
  group.append(title, ...cells);
  return group;
}

function actualTabIndicator(session) {
  if (!session.els || !session.els.dot) return 'missing';
  return ['dead', 'action', 'working', 'completed', 'idle', 'live']
    .find((kind) => session.els.dot.classList.contains(kind)) || 'unknown';
}

function renderDeveloperDiagnostics() {
  const root = $('#developer-diagnostics');
  if (!root) return;
  const enabled = Boolean(state.env && state.env.devMode);
  root.classList.toggle('hidden', !enabled);
  document.body.classList.toggle('developer-mode', enabled);
  if (!enabled) return;

  const sessions = orderedSessions();
  let inspected = state.ui.diagnosticSessionId && state.sessions.get(state.ui.diagnosticSessionId);
  if (!inspected) inspected = state.sessions.get(state.activeId) || sessions[0] || null;
  state.ui.diagnosticSessionId = inspected ? inspected.id : null;
  const selector = $('#diagnostic-session');
  selector.innerHTML = '';
  for (const session of sessions) {
    const option = document.createElement('option');
    option.value = session.id;
    option.textContent = `${sessionDisplayLabel(session)}${session.lifecycle.alive ? '' : ' (exited)'}`;
    option.selected = Boolean(inspected && inspected.id === session.id);
    selector.appendChild(option);
  }
  selector.disabled = sessions.length === 0;
  const groups = $('#diagnostic-groups'); groups.innerHTML = '';
  const events = $('#diagnostic-events'); events.innerHTML = '';
  if (!inspected) {
    groups.appendChild(diagnosticGroup('EXPECTED', [diagnosticCell('SESSION', 'No open sessions')]));
    return;
  }

  const projection = window.chromuxAttention.projectAttentionDiagnostic({
    session: inspected, sessions, activeId: state.activeId, captures: state.captures.values(),
    updateQueue: state.updateQueue, updateStatus: state.updateStatus,
    activityIndicators: state.ui.tabActivityIndicators,
  });
  const railMode = RAIL_MODES.has(state.ui.railMode) ? state.ui.railMode : 'threads';
  const attentionMounted = railMode === 'threads';
  const actualKinds = attentionMounted
    ? [...document.querySelectorAll(`#thread-list .attention-item[data-session-id="${CSS.escape(inspected.id)}"] .attention-kind`)]
      .map((element) => element.textContent)
    : [];
  const expectedItems = [
    ...window.chromuxAttention.projectAttentionItems({
      sessions, activeId: state.activeId, captures: state.captures.values(),
      updateQueue: state.updateQueue, updateStatus: state.updateStatus,
    }).filter((item) => item.sessionId === inspected.id),
    ...(inspected.id !== state.activeId && inspected.lifecycle.alive ? restoredAttentionItems(inspected) : []),
  ].sort((a, b) => (a.priority - b.priority) || (a.createdAt - b.createdAt) || a.id.localeCompare(b.id));
  const expectedKinds = expectedItems.map((item) => item.kind);
  const indicator = actualTabIndicator(inspected);
  const expectedIndicator = projection.expectedTabIndicator;
  const tab = inspected.els && inspected.els.tab;
  const expectedStatus = sessionTabIndicator(inspected).status;
  groups.append(
    diagnosticGroup('EXPECTED', [
      diagnosticCell('OUTCOME', expectedItems[0] ? expectedItems[0].kind : `SUPPRESS ${projection.suppression}`),
      diagnosticCell('TAB', expectedIndicator),
      diagnosticCell('UPDATE SAFE', `${projection.safety.safe ? 'YES' : 'NO'} · ${projection.safety.reason}`),
    ]),
    diagnosticGroup('TRACKED', [
      diagnosticCell('AGENT', inspected.agent || 'shell'),
      diagnosticCell('LIFECYCLE', inspected.lifecycle.alive ? 'alive' : `exit ${inspected.lifecycle.exitCode ?? '?'}`),
      diagnosticCell('TURN', inspected.turn.state),
      diagnosticCell('ACK', inspected.turn.acknowledged ? 'yes' : 'no'),
      diagnosticCell('PROTOCOL', inspected.turn.protocol),
      diagnosticCell('SOURCE', inspected.turn.source),
      diagnosticCell('CONFIDENCE', inspected.turn.confidence),
      diagnosticCell('SEQUENCE', inspected.turn.sequence),
      diagnosticCell('AGE', relativeAge(inspected.turn.since)),
    ]),
    diagnosticGroup('THREAD ATTENTION', [
      diagnosticCell('RAIL MODE', railMode.toUpperCase()),
      diagnosticCell('EXPECTED', expectedKinds.join(' → ') || 'none'),
      diagnosticCell('ACTUAL', attentionMounted
        ? (actualKinds.join(' → ') || 'none')
        : `NOT MOUNTED · ${railMode.toUpperCase()}`,
      attentionMounted && expectedKinds.join('|') !== actualKinds.join('|')),
      diagnosticCell('BROWSER QUEUE', projection.queueCount),
      diagnosticCell('HEAD', projection.queueHead),
      diagnosticCell('UPDATE PHASE', projection.updatePhase),
    ]),
    diagnosticGroup('TAB', [
      diagnosticCell('EXPECTED', expectedIndicator),
      diagnosticCell('DOM CLASS', indicator, indicator !== expectedIndicator),
      diagnosticCell('FOCUS', inspected.id === state.activeId ? 'active' : 'background'),
      diagnosticCell('PREFERENCE', state.ui.tabActivityIndicators ? 'on' : 'off'),
      diagnosticCell('ARIA', tab && tab.getAttribute('aria-label')),
      diagnosticCell('TOOLTIP', tab && tab.title),
      diagnosticCell('STATUS', expectedStatus),
    ]),
  );

  const recent = state.events.filter((event) => event.sessionId === inspected.id).slice(-20).reverse();
  if (recent.length === 0) events.appendChild(diagnosticCell('EVENTS', 'none'));
  for (const event of recent) {
    const chip = document.createElement('div'); chip.className = 'diagnostic-event';
    const type = document.createElement('b'); type.textContent = diagnosticText(event.type);
    const result = event.signal || event.turnState || event.state || event.phase || event.exitCode;
    const detail = document.createElement('span');
    detail.textContent = [result, event.source].filter((value) => value !== null && value !== undefined && value !== '').map(diagnosticText).join(' · ') || 'applied';
    const age = document.createElement('time'); age.textContent = relativeAge(event.ts);
    chip.append(type, detail, age); events.appendChild(chip);
  }
}

function attentionItems() {
  reconcileUpdateQueue();
  const sessions = orderedSessions();
  const projected = window.chromuxAttention.projectAttentionItems({
    sessions,
    activeId: state.activeId,
    captures: state.captures.values(),
    updateQueue: state.updateQueue,
    updateStatus: state.updateStatus,
  });
  for (const session of sessions) {
    if (session.id === state.activeId || !session.lifecycle.alive) continue;
    projected.push(...restoredAttentionItems(session));
  }
  const sessionOrder = new Map(sessions.map((session, index) => [session.id, index]));
  projected.sort((a, b) => (a.priority - b.priority)
    || (a.createdAt - b.createdAt)
    || ((sessionOrder.get(a.sessionId) ?? Number.MAX_SAFE_INTEGER)
      - (sessionOrder.get(b.sessionId) ?? Number.MAX_SAFE_INTEGER))
    || a.id.localeCompare(b.id));
  return projected.map((item) => ({
    session: item.sessionId
      ? state.sessions.get(item.sessionId)
      : { name: 'Chromux Update', cwd: '' },
    item,
  })).filter((row) => row.session);
}

const RESTORED_ATTENTION_PRESENTATION = {
  permission: ['PERMISSION', 'permission', 5],
  authentication: ['AUTH REQUIRED', 'authentication', 6],
  input: ['INPUT NEEDED', 'input', 10],
  rateLimited: ['RATE LIMITED', 'rateLimited', 12],
  toolFailed: ['TOOL FAILED', 'toolFailed', 14],
  delivery: ['DELIVERY FAIL', 'exited', 20],
  completed: ['COMPLETED', 'completed', 50],
};

function restoredAttentionItems(session) {
  return (session.restoredAttentionRecords || []).map((record) => {
    const [kind, cls, priority] = RESTORED_ATTENTION_PRESENTATION[record.type];
    return {
      id: `restored:${session.id}:${record.id}`,
      recordId: record.id,
      type: record.type,
      kind,
      scope: 'session',
      sessionId: session.id,
      captureId: null,
      detail: record.detail ? `Before restart · ${record.detail}` : 'Before restart',
      cls,
      priority,
      createdAt: record.occurredAt,
      acknowledged: false,
      primaryAction: record.type === 'completed' ? 'VIEW' : 'FOCUS',
      historical: true,
    };
  });
}

function attentionAction(item) {
  if (item.scope === 'global') {
    if (item.type === 'updateReady' || item.type === 'updateFailed') {
      const blockers = updateBlockers();
      if (item.type === 'updateFailed' && blockers.length > 0) return openSettings;
      if (!hasManagedInstallSource()) return openSettings;
      return () => installUpdate().catch(showUpdateInstallError);
    }
    if (item.type === 'updateWaiting') {
      if (!hasManagedInstallSource()) return openSettings;
      return () => installUpdate({ forceBlockers: true }).catch(showUpdateInstallError);
    }
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
  if (item.historical) {
    const session = state.sessions.get(item.sessionId);
    if (session) {
      session.restoredAttentionRecords = session.restoredAttentionRecords
        .filter((record) => record.id !== item.recordId);
      invalidate('attention', 'badges');
    }
  } else if (item.type === 'delivery' && item.captureId) {
    apply({ type: 'capture-acknowledged', captureId: item.captureId });
  } else if (item.type === 'input' || item.type === 'completed') {
    apply({ type: 'attention-dismissed', sessionId: item.sessionId });
  }
}

function attentionItemDismissible(item) {
  if (item.scope === 'global') return item.type !== 'updateRunning';
  if (item.historical) return true;
  return ['delivery', 'input', 'completed'].includes(item.type);
}

function appendAttentionActions(host, item) {
  const action = attentionAction(item);
  const primary = document.createElement('button');
  primary.className = 'qi-btn open';
  primary.textContent = item.primaryAction || 'VIEW';
  primary.setAttribute('aria-label', `${primary.textContent}: ${item.kind}`);
  primary.onclick = (event) => {
    event.stopPropagation();
    action();
  };
  host.appendChild(primary);
  if (!attentionItemDismissible(item)) return;
  const dismiss = document.createElement('button');
  dismiss.className = 'qi-btn';
  dismiss.textContent = 'DISMISS';
  dismiss.setAttribute('aria-label', `Dismiss: ${item.kind}`);
  dismiss.onclick = (event) => {
    event.stopPropagation();
    dismissAttentionItem(item);
  };
  host.appendChild(dismiss);
}

function appendUpdateAttentionRow(host, rowData) {
  if (!rowData) return;
  const { session, item } = rowData;
  const row = document.createElement('section');
  row.className = `attention-item attention-system-row ${item.cls || ''}`;
  row.dataset.attentionScope = 'system';
  row.setAttribute('aria-label', `Chromux Update. ${item.kind}. ${item.detail}`);
  const top = document.createElement('div'); top.className = 'attention-top';
  const kind = document.createElement('span'); kind.className = 'attention-kind'; kind.textContent = item.kind;
  const name = document.createElement('span'); name.className = 'attention-name'; name.textContent = sessionDisplayLabel(session);
  top.append(kind, name);
  const detail = document.createElement('div'); detail.className = 'attention-detail'; detail.textContent = item.detail; detail.title = item.detail;
  const actions = document.createElement('div'); actions.className = 'attention-actions';
  appendAttentionActions(actions, item);
  row.append(top, detail, actions);
  host.appendChild(row);
}

function attentionSessionRows(items) {
  const grouped = new Map();
  for (const row of items) {
    if (!row.item.sessionId) continue;
    if (!grouped.has(row.item.sessionId)) grouped.set(row.item.sessionId, { session: row.session, items: [] });
    grouped.get(row.item.sessionId).items.push(row.item);
  }
  return [...grouped.values()];
}

function syncThreadSessionRowPresentation(row, session) {
  if (!row || !session) return;
  const status = sessionRailStatus(session);
  const label = sessionDisplayLabel(session);
  const attentionSummary = row.dataset.attentionSummary || '';
  row.title = `${label} — ${status.label}${attentionSummary ? ` — ${attentionSummary}` : ''}\n${session.cwd || '~'}`;
  row.setAttribute('aria-label', `${label}. ${status.label}.${attentionSummary ? ` Needs attention: ${attentionSummary}.` : ''} ${session.cwd || '~'}`);
  const icon = row.querySelector('.rail-status');
  if (icon) {
    icon.className = `rail-status ${status.kind}`;
    icon.textContent = status.icon;
    icon.title = status.label;
    icon.setAttribute('aria-label', status.label);
  }
  const name = row.querySelector('.rail-session-name');
  if (name && name.textContent !== label) name.textContent = label;
}

function syncThreadPreviewPresentation(session) {
  const preview = state.ui.threadPreview;
  if (!preview || !session || preview.sessionId !== session.id) return;
  const label = sessionDisplayLabel(session);
  const title = preview.popover.querySelector('.thread-preview-title');
  const status = preview.popover.querySelector('.thread-preview-status');
  const cwd = preview.popover.querySelector('.thread-preview-cwd');
  if (title) title.textContent = label;
  preview.popover.setAttribute('aria-label', `Preview ${label}. Click to open session.`);
  if (status) status.textContent = `${agentLabel(session.agent)} · ${sessionRailStatus(session).label}`;
  if (cwd) { cwd.title = session.cwd || '~'; cwd.textContent = session.cwd || '~'; }
}

function syncThreadSessionPresentation(session) {
  if (!session) return;
  document.querySelectorAll(`#thread-list .rail-session-row[data-session-id="${CSS.escape(session.id)}"]`)
    .forEach((row) => syncThreadSessionRowPresentation(row, session));
  syncThreadPreviewPresentation(session);
}

function appendThreadSessionRow(host, session, { attention = null } = {}) {
  const row = document.createElement('button');
  row.className = 'rail-session-row';
  row.type = 'button';
  row.dataset.sessionId = session.id;
  if (session.id === state.activeId) row.setAttribute('aria-current', 'true');
  else {
    row.setAttribute('aria-expanded', String(state.ui.threadPreview?.sessionId === session.id));
    row.setAttribute('aria-controls', 'thread-terminal-preview');
  }
  const attentionSummary = attention
    ? `${attention.items[0].kind}${attention.items.length > 1 ? ` and ${attention.items.length - 1} more` : ''}`
    : null;
  row.dataset.attentionSummary = attentionSummary || '';
  const icon = document.createElement('span');
  icon.className = 'rail-status';
  const name = document.createElement('span');
  name.className = attention ? 'rail-session-name attention-name' : 'rail-session-name';
  row.append(icon, name);
  if (attention) {
    const reason = document.createElement('span'); reason.className = 'attention-row-reason'; reason.textContent = attention.items[0].kind;
    row.appendChild(reason);
    if (attention.items.length > 1) {
      const more = document.createElement('span'); more.className = 'attention-row-more'; more.textContent = `+${attention.items.length - 1}`;
      more.setAttribute('aria-label', `${attention.items.length - 1} additional attention item${attention.items.length === 2 ? '' : 's'}`);
      row.appendChild(more);
    }
  }
  row.onclick = () => {
    if (session.id === state.activeId) {
      dismissThreadPreview();
      animateThreadSessionConfirmation(row, session);
    } else openThreadPreview(session, row);
  };
  syncThreadSessionRowPresentation(row, session);
  host.appendChild(row);
  return row;
}

function appendNeedsAttentionGroup(host, sessionRows) {
  if (sessionRows.length === 0) return;
  const details = document.createElement('details');
  details.className = 'rail-group attention-thread-group';
  details.dataset.groupKey = 'attention:needs';
  details.open = true;
  details.addEventListener('toggle', () => {
    if (!details.open) details.open = true;
  });
  const summary = document.createElement('summary'); summary.title = 'Sessions with outstanding work';
  const label = document.createElement('span'); label.className = 'rail-group-label'; label.textContent = 'NEEDS ATTENTION';
  const count = document.createElement('span'); count.className = 'rail-group-count'; count.textContent = String(sessionRows.length);
  summary.append(label, count);
  const rows = document.createElement('div'); rows.className = 'rail-group-rows';
  for (const attention of sessionRows) {
    const card = document.createElement('div');
    card.className = `attention-item attention-thread ${attention.items[0].cls || ''}`;
    card.dataset.sessionId = attention.session.id;
    appendThreadSessionRow(card, attention.session, { attention });
    const reasons = document.createElement('div'); reasons.className = 'attention-reasons';
    for (const item of attention.items) {
      const reason = document.createElement('div'); reason.className = 'attention-reason'; reason.dataset.attentionKind = item.kind;
      const copy = document.createElement('div'); copy.className = 'attention-reason-copy';
      const kind = document.createElement('span'); kind.className = 'attention-kind'; kind.textContent = item.kind;
      const detail = document.createElement('span'); detail.className = 'attention-detail'; detail.textContent = item.detail || attention.session.cwd; detail.title = detail.textContent;
      copy.append(kind, detail);
      const actions = document.createElement('div'); actions.className = 'attention-actions'; appendAttentionActions(actions, item);
      reason.append(copy, actions); reasons.appendChild(reason);
    }
    card.appendChild(reasons); rows.appendChild(card);
  }
  details.append(summary, rows); host.appendChild(details);
}

function renderAttentionQueue() {
  const host = $('#thread-list');
  if (!host) return;
  host.innerHTML = '';
  const items = attentionItems();
  renderRailNavigation(items.length);
  if (state.ui.railMode === 'git') {
    renderGitDiffRail(host);
    return;
  }
  const update = items.find((row) => row.item.scope === 'global') || null;
  const attentive = attentionSessionRows(items);
  appendUpdateAttentionRow(host, update);
  appendNeedsAttentionGroup(host, attentive);
  renderGroupedSessionRail(host, 'threads', new Set(attentive.map((row) => row.session.id)));
}

function renderRailNavigation(attentionCount) {
  const mode = RAIL_MODES.has(state.ui.railMode) ? state.ui.railMode : 'threads';
  const heading = $('#rail-heading');
  if (heading) heading.textContent = mode === 'git' ? 'GIT CHANGES' : mode.toUpperCase();
  const count = $('#rail-thread-count');
  if (count) {
    count.textContent = String(attentionCount);
    count.classList.toggle('zero', attentionCount === 0);
    count.setAttribute('aria-label', `${attentionCount} attention item${attentionCount === 1 ? '' : 's'}`);
  }
  document.querySelectorAll('[data-rail-mode]').forEach((button) => {
    const selected = button.dataset.railMode === mode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function selectRailMode(mode, { persist = true } = {}) {
  if (!RAIL_MODES.has(mode)) return state.ui.railMode;
  if (mode !== 'threads') dismissThreadPreview();
  state.ui.railMode = mode;
  if (persist) {
    try { window.localStorage.setItem(RAIL_MODE_STORAGE_KEY, mode); } catch { /* unavailable */ }
  }
  invalidate('attention', ...(state.env && state.env.devMode ? ['diagnostics'] : []));
  return mode;
}

function directoryBasename(directory) {
  const clean = String(directory || '~').replace(/\/+$/, '');
  return clean.split('/').filter(Boolean).pop() || clean || '/';
}

function sessionRailStatus(session) {
  return window.chromuxAttention.projectSessionStatus(session, state.ui.tabActivityIndicators);
}

function ensureGitRoot(cwd) {
  if (state.ui.gitRoots.has(cwd)) return state.ui.gitRoots.get(cwd);
  const entry = { value: undefined, promise: null };
  entry.promise = Promise.resolve(window.chromux.gitRoot(cwd))
    .then((root) => { entry.value = typeof root === 'string' && root ? root : null; })
    .catch(() => { entry.value = null; })
    .finally(() => invalidate('attention'));
  state.ui.gitRoots.set(cwd, entry);
  return entry;
}

function loadGitDiff(root, { force = false } = {}) {
  const current = state.ui.gitDiffs.get(root);
  if (current && !force) return current;
  if (current && current.pending) return current;
  const entry = { value: force && current ? current.value : undefined, promise: null, pending: true };
  entry.promise = Promise.resolve(window.chromux.gitDiffSummary(root))
    .then((summary) => { entry.value = summary && Array.isArray(summary.files) ? summary : null; })
    .catch(() => { entry.value = null; })
    .finally(() => { entry.pending = false; invalidate('attention'); });
  state.ui.gitDiffs.set(root, entry);
  return entry;
}

function gitFileStatus(file) {
  if (file.index === '?' && file.worktree === '?') return { code: '?', label: 'Untracked', kind: 'untracked' };
  if (file.index === 'U' || file.worktree === 'U' || (file.index === 'A' && file.worktree === 'A')) {
    return { code: '!', label: 'Conflict', kind: 'conflict' };
  }
  const code = file.worktree !== ' ' ? file.worktree : file.index;
  const labels = { A: 'Added', C: 'Copied', D: 'Deleted', M: 'Modified', R: 'Renamed', T: 'Type changed' };
  return { code, label: labels[code] || 'Changed', kind: code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified' };
}

function renderGitDiffRail(host) {
  const live = orderedSessions().filter((session) => session.lifecycle && session.lifecycle.alive);
  const roots = new Map();
  let pending = false;
  for (const session of live) {
    const entry = ensureGitRoot(session.cwd || '~');
    if (entry.value === undefined) pending = true;
    else if (entry.value) roots.set(entry.value, entry.value);
  }
  if (roots.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'attention-empty';
    empty.textContent = pending ? 'Resolving Git repositories…' : 'No Git repositories in live sessions.';
    host.appendChild(empty);
    return;
  }
  for (const root of [...roots.keys()].sort((a, b) => a.localeCompare(b))) {
    const entry = loadGitDiff(root);
    const details = document.createElement('details');
    details.className = 'rail-group git-diff-group';
    details.dataset.groupKey = `git:${root}`;
    details.open = state.ui.railExpanded.get(`git:${root}`) !== false;
    details.addEventListener('toggle', () => state.ui.railExpanded.set(`git:${root}`, details.open));
    const summary = document.createElement('summary');
    summary.title = root;
    const label = document.createElement('span'); label.className = 'rail-group-label'; label.textContent = directoryBasename(root);
    const count = document.createElement('span'); count.className = 'rail-group-count';
    count.textContent = entry.value === undefined ? '…' : String(entry.value?.totals?.files || 0);
    summary.append(label, count);
    const rows = document.createElement('div'); rows.className = 'rail-group-rows';
    if (entry.value === undefined) {
      const message = document.createElement('div'); message.className = 'git-diff-empty'; message.textContent = 'Scanning changes…'; rows.appendChild(message);
    } else if (!entry.value) {
      const message = document.createElement('div'); message.className = 'git-diff-empty error'; message.textContent = 'Could not read Git changes.'; rows.appendChild(message);
    } else if (entry.value.files.length === 0) {
      const message = document.createElement('div'); message.className = 'git-diff-empty clean'; message.textContent = 'Working tree clean'; rows.appendChild(message);
    } else {
      const totals = document.createElement('div');
      totals.className = 'git-diff-totals';
      totals.textContent = `${entry.value.totals.staged} staged · ${entry.value.totals.unstaged} unstaged`;
      rows.appendChild(totals);
      for (const file of entry.value.files) {
        const status = gitFileStatus(file);
        const row = document.createElement('div');
        row.className = 'git-diff-row';
        row.title = file.originalPath ? `${file.originalPath} → ${file.path}` : file.path;
        row.setAttribute('aria-label', `${status.label}: ${file.path}`);
        const badge = document.createElement('span'); badge.className = `git-diff-status ${status.kind}`; badge.textContent = status.code; badge.title = status.label;
        const name = document.createElement('span'); name.className = 'git-diff-path'; name.textContent = file.path;
        const staged = document.createElement('span'); staged.className = 'git-diff-stage'; staged.textContent = ![' ', '?'].includes(file.index) ? 'S' : '';
        staged.title = staged.textContent ? 'Has staged changes' : '';
        row.append(badge, name, staged);
        rows.appendChild(row);
      }
    }
    details.append(summary, rows);
    host.appendChild(details);
  }
}

function groupedRailSessions(mode, excludedSessionIds = new Set()) {
  const live = orderedSessions().filter((session) => session.lifecycle && session.lifecycle.alive
    && !excludedSessionIds.has(session.id));
  const groups = new Map();
  const add = (key, label, title, session, order = 0) => {
    if (!groups.has(key)) groups.set(key, { key, label, title, sessions: [], order });
    groups.get(key).sessions.push(session);
  };
  for (const session of live) {
    const cwd = session.cwd || '~';
    if (mode === 'threads') {
      add(`cwd:${cwd}`, directoryBasename(cwd), cwd, session);
      continue;
    }
    const entry = ensureGitRoot(cwd);
    if (entry.value === undefined) add('git:pending', 'Resolving repositories…', 'Resolving Git repository roots', session, 1);
    else if (entry.value === null) add('git:none', 'Not a Git repository', 'Sessions outside a Git repository', session, 2);
    else add(`git:${entry.value}`, directoryBasename(entry.value), entry.value, session, 0);
  }
  return [...groups.values()].sort((a, b) => (a.order - b.order)
    || (a.key === 'git:none' ? 1 : b.key === 'git:none' ? -1 : a.label.localeCompare(b.label)));
}

function renderGroupedSessionRail(host, mode, excludedSessionIds = new Set()) {
  const groups = groupedRailSessions(mode, excludedSessionIds);
  if (groups.length === 0) {
    if (host.childElementCount > 0) {
      syncThreadPreviewAnchor();
      return;
    }
    const empty = document.createElement('div');
    empty.className = 'attention-empty';
    empty.textContent = 'No threads yet. Start or detect a session to see it here.';
    host.appendChild(empty);
    return;
  }
  for (const group of groups) {
    const details = document.createElement('details');
    details.className = 'rail-group';
    details.dataset.groupKey = group.key;
    details.open = state.ui.railExpanded.get(`${mode}:${group.key}`) !== false;
    details.addEventListener('toggle', () => {
      state.ui.railExpanded.set(`${mode}:${group.key}`, details.open);
      if (!details.open && state.ui.threadPreview
        && details.querySelector(`[data-session-id="${CSS.escape(state.ui.threadPreview.sessionId)}"]`)) {
        dismissThreadPreview();
      }
      requestAnimationFrame(syncThreadPreviewAnchor);
    });
    const summary = document.createElement('summary');
    summary.title = group.title;
    const label = document.createElement('span'); label.className = 'rail-group-label'; label.textContent = group.label;
    const count = document.createElement('span'); count.className = 'rail-group-count'; count.textContent = String(group.sessions.length);
    summary.append(label, count);
    const rows = document.createElement('div'); rows.className = 'rail-group-rows';
    for (const session of group.sessions) {
      appendThreadSessionRow(rows, session);
    }
    details.append(summary, rows);
    host.appendChild(details);
  }
  syncThreadPreviewAnchor();
}

const THREAD_PREVIEW_SCROLLBACK = 300;

function prefersReducedMotion() {
  if (typeof state.ui.reducedMotionOverride === 'boolean') return state.ui.reducedMotionOverride;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animateThreadSessionConfirmation(row, session) {
  const pane = session?.els?.termPane || session?.els?.view?.querySelector('.term-pane');
  if (!row || !pane) return;
  const rowClass = prefersReducedMotion() ? 'thread-row-confirm-static' : 'thread-row-confirm';
  const paneClass = prefersReducedMotion() ? 'thread-pane-confirm-static' : 'thread-pane-confirm';
  row.classList.remove('thread-row-confirm', 'thread-row-confirm-static');
  pane.classList.remove('thread-pane-confirm', 'thread-pane-confirm-static');
  void row.offsetWidth;
  void pane.offsetWidth;
  row.classList.add(rowClass);
  requestAnimationFrame(() => pane.classList.add(paneClass));
  if (session._threadCueTimer) clearTimeout(session._threadCueTimer);
  session._threadCueTimer = setTimeout(() => {
    row.classList.remove(rowClass);
    pane.classList.remove(paneClass);
    session._threadCueTimer = null;
  }, prefersReducedMotion() ? 240 : 650);
}

function positionThreadPreview() {
  const preview = state.ui.threadPreview;
  if (!preview || !preview.popover.isConnected || !preview.anchor.isConnected) return;
  const anchorRect = preview.anchor.getBoundingClientRect();
  const popoverRect = preview.popover.getBoundingClientRect();
  const gap = 10;
  const margin = 10;
  const maxLeft = Math.max(margin, window.innerWidth - popoverRect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - popoverRect.height - margin);
  preview.popover.style.left = `${Math.max(margin, Math.min(anchorRect.right + gap, maxLeft))}px`;
  preview.popover.style.top = `${Math.max(margin, Math.min(anchorRect.top + (anchorRect.height - popoverRect.height) / 2, maxTop))}px`;
}

function scaleThreadPreviewTerminal() {
  const preview = state.ui.threadPreview;
  if (!preview) return;
  const screen = preview.terminalHost.querySelector('.xterm-screen');
  if (!screen) return;
  const screenRect = screen.getBoundingClientRect();
  const unscaledWidth = screenRect.width / (preview.scale || 1);
  const unscaledHeight = screenRect.height / (preview.scale || 1);
  const scale = Math.min(1,
    preview.terminalHost.clientWidth / Math.max(1, unscaledWidth),
    preview.terminalHost.clientHeight / Math.max(1, unscaledHeight));
  preview.scale = scale;
  preview.terminalHost.style.transform = `scale(${scale})`;
}

function refreshThreadPreview() {
  const preview = state.ui.threadPreview;
  if (!preview || preview.refreshFrame) return;
  preview.refreshFrame = requestAnimationFrame(() => {
    preview.refreshFrame = null;
    const session = state.sessions.get(preview.sessionId);
    if (!session || !session.lifecycle.alive || !session.term.term || !session.term.serializer) {
      dismissThreadPreview();
      return;
    }
    let serialized = '';
    try { serialized = session.term.serializer.serialize({ scrollback: THREAD_PREVIEW_SCROLLBACK }); } catch { return; }
    const source = session.term.term;
    const mirror = preview.terminal;
    mirror.reset();
    mirror.resize(Math.max(2, source.cols || 80), Math.max(1, source.rows || 24));
    mirror.options.theme = terminalThemeFor();
    mirror.write(serialized, () => {
      if (state.ui.threadPreview !== preview) return;
      mirror.scrollToBottom();
      scaleThreadPreviewTerminal();
      preview.refreshCount += 1;
    });
  });
}

function syncThreadPreviewAnchor() {
  const preview = state.ui.threadPreview;
  if (!preview) return;
  if (state.ui.railMode !== 'threads') {
    dismissThreadPreview();
    return;
  }
  const anchor = document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(preview.sessionId)}"]`);
  if (!anchor || !anchor.offsetParent || anchor.getClientRects().length === 0) {
    dismissThreadPreview();
    return;
  }
  if (preview.anchor !== anchor) {
    preview.resizeObserver?.disconnect();
    preview.resizeObserver?.observe(anchor);
    preview.resizeObserver?.observe(preview.popover);
  }
  preview.anchor = anchor;
  const session = state.sessions.get(preview.sessionId);
  syncThreadPreviewPresentation(session);
  anchor.setAttribute('aria-expanded', 'true');
  anchor.setAttribute('aria-controls', 'thread-terminal-preview');
  positionThreadPreview();
}

function dismissThreadPreview({ restoreFocus = false } = {}) {
  const preview = state.ui.threadPreview;
  if (!preview) return false;
  state.ui.threadPreview = null;
  if (preview.refreshFrame) cancelAnimationFrame(preview.refreshFrame);
  preview.writeDisposable?.dispose();
  preview.resizeObserver?.disconnect();
  window.removeEventListener('resize', preview.reposition);
  $('#thread-list')?.removeEventListener('scroll', preview.reposition);
  document.removeEventListener('pointerdown', preview.outsidePointer, true);
  preview.terminal.dispose();
  preview.popover.remove();
  if (preview.anchor?.isConnected) {
    preview.anchor.setAttribute('aria-expanded', 'false');
    if (restoreFocus) preview.anchor.focus();
  }
  return true;
}

function activateThreadPreview() {
  const preview = state.ui.threadPreview;
  if (!preview) return;
  const sessionId = preview.sessionId;
  dismissThreadPreview();
  activateSession(sessionId);
}

function openThreadPreview(session, anchor) {
  dismissThreadPreview();
  if (!session?.term?.term || typeof session.term.term.loadAddon !== 'function') {
    activateSession(session.id);
    return;
  }
  if (!session.term.serializer) {
    session.term.serializer = new SerializeAddon.SerializeAddon();
    session.term.term.loadAddon(session.term.serializer);
  }
  const popover = document.createElement('section');
  popover.id = 'thread-terminal-preview';
  popover.className = 'thread-terminal-preview';
  popover.tabIndex = 0;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', `Preview ${sessionDisplayLabel(session)}. Click to open session.`);
  const header = document.createElement('header'); header.className = 'thread-preview-header';
  const title = document.createElement('strong'); title.className = 'thread-preview-title'; title.textContent = sessionDisplayLabel(session);
  const status = document.createElement('span'); status.className = 'thread-preview-status'; status.textContent = `${agentLabel(session.agent)} · ${sessionRailStatus(session).label}`;
  const cwd = document.createElement('span'); cwd.className = 'thread-preview-cwd'; cwd.title = session.cwd || '~'; cwd.textContent = session.cwd || '~';
  header.append(title, status, cwd);
  const terminalViewport = document.createElement('div'); terminalViewport.className = 'thread-preview-viewport';
  const terminalHost = document.createElement('div'); terminalHost.className = 'thread-preview-terminal'; terminalHost.setAttribute('aria-hidden', 'true'); terminalViewport.appendChild(terminalHost);
  const footer = document.createElement('footer'); footer.className = 'thread-preview-footer';
  footer.innerHTML = '<span>CLICK TO OPEN SESSION</span><span>ESC TO CLOSE</span>';
  popover.append(header, terminalViewport, footer);
  document.body.appendChild(popover);
  const terminal = new Terminal({
    cols: Math.max(2, session.term.term.cols || 80), rows: Math.max(1, session.term.term.rows || 24),
    fontFamily: '"SF Mono", Menlo, monospace', fontSize: 11, lineHeight: 1.15,
    cursorBlink: false, disableStdin: true, scrollback: THREAD_PREVIEW_SCROLLBACK, theme: terminalThemeFor(),
  });
  terminal.open(terminalHost);
  const preview = {
    sessionId: session.id, anchor, popover, terminal, terminalViewport, terminalHost,
    refreshFrame: null, refreshCount: 0, scale: 1, writeDisposable: null, resizeObserver: null,
    reposition: () => positionThreadPreview(), outsidePointer: null,
  };
  state.ui.threadPreview = preview;
  preview.writeDisposable = session.term.term.onWriteParsed(refreshThreadPreview);
  preview.resizeObserver = new ResizeObserver(() => { positionThreadPreview(); scaleThreadPreviewTerminal(); });
  preview.resizeObserver.observe(anchor);
  preview.resizeObserver.observe(popover);
  preview.outsidePointer = (event) => {
    if (!popover.contains(event.target) && !preview.anchor.contains(event.target)) dismissThreadPreview();
  };
  window.addEventListener('resize', preview.reposition);
  $('#thread-list')?.addEventListener('scroll', preview.reposition, { passive: true });
  document.addEventListener('pointerdown', preview.outsidePointer, true);
  popover.addEventListener('click', activateThreadPreview);
  popover.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateThreadPreview(); }
    else if (event.key === 'Escape') { event.preventDefault(); dismissThreadPreview({ restoreFocus: true }); }
  });
  anchor.setAttribute('aria-expanded', 'true');
  positionThreadPreview();
  refreshThreadPreview();
  popover.focus({ preventScroll: true });
}

function writePtyInput(session, data) {
  if (!session || !data) return;
  if (Array.isArray(session._ptyInputs)) session._ptyInputs.push(data);
  window.chromux.ptyInput(session.id, data);
}

function adoptSessionAgent(session, agent, source = 'unknown', detail = {}) {
  if (!session || !ADOPTABLE_AGENTS.has(agent)) return false;
  if (session.agent && session.agent !== agent) return false;
  if (session.agent === agent) return false;
  apply({
    type: 'session-adopted',
    sessionId: session.id,
    agent,
    source,
    command: detail.command || null,
  });
  return true;
}

function handleTerminalInput(session, data) {
  if (!session) return null;
  const rewrite = rewriteShellLaunchInput(session, data);
  const outgoing = rewrite ? rewrite.data : data;
  if (rewrite) adoptSessionAgent(session, rewrite.agent, 'rewrite', { command: rewrite.command });
  apply({ type: 'user-input', sessionId: session.id, data: outgoing });
  writePtyInput(session, outgoing);
  return rewrite;
}

const TERMINAL_SCROLL_ANIMATION_MS = 220;

function rememberTerminalViewport(session) {
  const termState = session && session.term;
  const buffer = termState && termState.term && termState.term.buffer && termState.term.buffer.active;
  if (!termState || termState.fitting || !buffer || buffer.type !== 'normal') return;
  termState.viewportY = buffer.viewportY;
}

function fitTerminalPreservingViewport(session, fit) {
  const termState = session && session.term;
  const term = termState && termState.term;
  if (!term || typeof fit !== 'function' || session.composer.expanded) return;
  const before = term.buffer && term.buffer.active;
  const preservingNormal = Boolean(before && before.type === 'normal');
  const targetY = preservingNormal && Number.isFinite(termState.viewportY)
    ? termState.viewportY
    : (preservingNormal ? before.viewportY : null);
  const followingBottom = Boolean(preservingNormal && before.viewportY === before.baseY);

  termState.fitting = true;
  try {
    fit();
    const after = term.buffer && term.buffer.active;
    if (!preservingNormal || !after || after.type !== 'normal') return;
    const desiredY = followingBottom
      ? after.baseY
      : Math.min(after.baseY, Math.max(0, targetY));
    const delta = desiredY - after.viewportY;
    if (delta) term.scrollLines(delta);
    termState.viewportY = after.viewportY;
  } finally {
    termState.fitting = false;
    rememberTerminalViewport(session);
  }
}

function terminalCanScrollBack(term) {
  const buffer = term && term.buffer && term.buffer.active;
  return Boolean(buffer && buffer.type === 'normal' && buffer.baseY > 0);
}

function terminalScrollState(session) {
  const term = session && session.term && session.term.term;
  const buffer = term && term.buffer && term.buffer.active;
  const rows = Math.max(0, Number(term && term.rows) || 0);
  const behind = buffer ? Math.max(0, buffer.baseY - buffer.viewportY) : 0;
  return {
    baseY: buffer ? buffer.baseY : 0,
    viewportY: buffer ? buffer.viewportY : 0,
    rows,
    behind,
    alternate: Boolean(buffer && buffer.type !== 'normal'),
    visible: Boolean(
      session
      && session.term.scrollToBottom
      && !session.term.scrollToBottom.animationFrame
      && terminalCanScrollBack(term)
      && rows > 0
      && behind >= rows
    ),
  };
}

function renderTerminalScrollToBottom(session) {
  const control = session && session.els && session.els.scrollToBottom;
  if (!control) return;
  control.classList.toggle('hidden', !terminalScrollState(session).visible);
}

function cancelTerminalScrollAnimation(session, { render = true } = {}) {
  const tracker = session && session.term && session.term.scrollToBottom;
  if (!tracker || !tracker.animationFrame) return false;
  cancelAnimationFrame(tracker.animationFrame);
  tracker.animationFrame = null;
  tracker.animationStartedAt = 0;
  if (render) renderTerminalScrollToBottom(session);
  return true;
}

function finishTerminalScrollToBottom(session) {
  const term = session && session.term && session.term.term;
  const tracker = session && session.term && session.term.scrollToBottom;
  if (!term || !tracker || tracker.disposed) return;
  tracker.animationFrame = null;
  tracker.animationStartedAt = 0;
  term.scrollToBottom();
  renderTerminalScrollToBottom(session);
  if (state.activeId === session.id) term.focus();
}

function animateTerminalScrollToBottom(session) {
  const term = session && session.term && session.term.term;
  const tracker = session && session.term && session.term.scrollToBottom;
  if (!term || !tracker || tracker.disposed) return;
  cancelTerminalScrollAnimation(session, { render: false });
  const control = session.els && session.els.scrollToBottom;
  if (control) control.classList.add('hidden');

  if (tracker.reducedMotion()) {
    finishTerminalScrollToBottom(session);
    return;
  }

  const startY = term.buffer.active.viewportY;
  tracker.animationStartedAt = performance.now();
  const step = (now) => {
    if (tracker.disposed || !tracker.animationFrame) return;
    if (!terminalCanScrollBack(term)) {
      finishTerminalScrollToBottom(session);
      return;
    }
    const progress = Math.min(1, Math.max(0, (now - tracker.animationStartedAt) / TERMINAL_SCROLL_ANIMATION_MS));
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentY = term.buffer.active.viewportY;
    const targetY = term.buffer.active.baseY;
    const desiredY = Math.round(startY + (targetY - startY) * eased);
    const delta = desiredY - currentY;
    if (delta) term.scrollLines(delta);
    if (progress >= 1) {
      finishTerminalScrollToBottom(session);
      return;
    }
    tracker.animationFrame = requestAnimationFrame(step);
  };
  tracker.animationFrame = requestAnimationFrame(step);
}

function installTerminalScrollToBottom(session, { reducedMotion = null } = {}) {
  const term = session.term.term;
  const host = session.els.termHost;
  const control = session.els.scrollToBottom;
  const disposables = [];
  const tracker = {
    animationFrame: null,
    animationStartedAt: 0,
    disposed: false,
    reducedMotion: typeof reducedMotion === 'function'
      ? reducedMotion
      : () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    dispose() {
      if (tracker.disposed) return;
      tracker.disposed = true;
      cancelTerminalScrollAnimation(session, { render: false });
      for (const disposable of disposables) disposable.dispose();
      host.removeEventListener('wheel', cancelFromUser, true);
      host.removeEventListener('pointerdown', cancelFromUser, true);
      control.removeEventListener('click', activate);
      control.classList.add('hidden');
    },
  };
  const update = () => {
    rememberTerminalViewport(session);
    renderTerminalScrollToBottom(session);
  };
  const cancelFromUser = () => cancelTerminalScrollAnimation(session);
  const activate = () => animateTerminalScrollToBottom(session);

  session.term.scrollToBottom = tracker;
  disposables.push(term.onScroll(update));
  disposables.push(term.onWriteParsed(update));
  disposables.push(term.onResize(update));
  host.addEventListener('wheel', cancelFromUser, true);
  host.addEventListener('pointerdown', cancelFromUser, true);
  control.addEventListener('click', activate);
  update();
  return tracker;
}

async function createSession({ name, cwd, agent, initialUrl = null, initialQueue = [], initialAttentionRecords = [], command = undefined, resumeLaunch = null, composerDraft = '' }) {
  state.counter += 1;
  const id = 's' + state.counter;
  const session = newSessionShape({ id, name, cwd, agent });
  session.composer.draft = utf8WithinLimit(composerDraft) ? String(composerDraft || '') : '';
  if (resumeLaunch) {
    session.lifecycle.resumeLaunch = {
      ...resumeLaunch,
      launchedAt: Number.isFinite(resumeLaunch.launchedAt) ? resumeLaunch.launchedAt : Date.now(),
      sessionName: resumeLaunch.sessionName || name,
      cwd: resumeLaunch.cwd || cwd || null,
    };
    session.resumeId = resumeLaunch.resumeId || null;
  }

  const viewEls = buildSessionView(session);
  const tabEls = buildSessionTab(session);
  session.els = { ...viewEls, ...tabEls };
  renderComposer(session);
  applyBrowserLayout(session);

  const term = new Terminal({
    fontFamily: '"SF Mono", Menlo, monospace',
    fontSize: 12.5,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 8000,
    macOptionIsMeta: true,
    theme: terminalThemeFor(),
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(viewEls.termHost);
  session.term.term = term;
  session.term.fitAddon = fitAddon;
  session.term.fit = () => {
    try {
      fitTerminalPreservingViewport(session, () => {
        fitAddon.fit();
        window.chromux.ptyResize(id, term.cols, term.rows);
      });
    } catch { /* hidden */ }
  };
  session.term.fit();
  registerTerminalLinks(session);
  installTerminalScrollToBottom(session);

  term.onData((data) => handleTerminalInput(session, data));
  new ResizeObserver(() => session.term.fit()).observe(viewEls.termHost);

  state.sessions.set(id, session);
  apply({ type: 'session-created', sessionId: id, name, cwd, agent });
  const ptyInfo = await window.chromux.ptyCreate({
    id, cwd,
    command: command !== undefined ? command : agentCommand(agent),
    cols: term.cols, rows: term.rows,
  });
  if (ptyInfo && ptyInfo.signalToken) session.turn.token = ptyInfo.signalToken;

  session.browser.queue = Array.isArray(initialQueue)
    ? initialQueue.map((item) => normalizeQueueItem(item, 'RESTORE')).filter(Boolean)
    : [];
  renderQueue(session);
  if (initialUrl) openInPane(session, initialUrl);
  activateSession(id, { consumeRestoredCompletion: false });
  session.restoredAttentionRecords = Array.isArray(initialAttentionRecords)
    ? initialAttentionRecords.filter((record) => record && RESTORE_ATTENTION_TYPES.has(record.type))
      .slice(0, MAX_RESTORE_ATTENTION_RECORDS).map((record) => ({ ...record }))
    : [];
  invalidate('attention', 'badges');
  renderTabs();
  state.lastCwd = cwd;
  return session;
}

function revealFocusedSessionTab(id) {
  const session = state.sessions.get(id);
  const tabList = $('#tab-list');
  const tabActions = $('#tab-actions');
  if (!session?.els?.tab || !tabList || !tabActions) return;

  const tabRect = session.els.tab.getBoundingClientRect();
  const listRect = tabList.getBoundingClientRect();
  const actionsRect = tabActions.getBoundingClientRect();
  const listStyle = getComputedStyle(tabList);
  const tabGap = parseFloat(listStyle.columnGap || listStyle.gap) || 0;
  const visibleRight = Math.min(listRect.right, actionsRect.left - tabGap);

  if (tabRect.left < listRect.left) {
    tabList.scrollLeft += tabRect.left - listRect.left;
  } else if (tabRect.right > visibleRight) {
    tabList.scrollLeft += tabRect.right - visibleRight;
  }
}

function activateSession(id, { consumeRestoredCompletion = true } = {}) {
  dismissThreadPreview();
  if (!state.ui.diagnosticSessionId || !state.sessions.has(state.ui.diagnosticSessionId)) state.ui.diagnosticSessionId = id;
  apply({ type: 'session-focused', sessionId: id, consumeRestoredCompletion });
  for (const s of state.sessions.values()) {
    const active = s.id === id;
    s.els.view.classList.toggle('offstage', !active);
    s.els.tab.classList.toggle('active', active);
    if (active) {
      requestAnimationFrame(() => {
        s.term.fit();
        if (s.composer.open) s.els.composerTextarea.focus();
        else s.term.term.focus();
      });
    }
  }
  $('#empty-state').classList.toggle('hidden', state.sessions.size > 0);
  renderTabs();
  revealFocusedSessionTab(id);
  invalidate('shortcutDebug', ...(state.env && state.env.devMode ? ['diagnostics'] : []));
}

function closeSession(id) {
  const s = state.sessions.get(id);
  if (!s) return;
  if (state.ui.threadPreview?.sessionId === id) dismissThreadPreview();
  if (s._threadCueTimer) clearTimeout(s._threadCueTimer);
  window.chromux.ptyKill(id);
  if (s.term.scrollToBottom) s.term.scrollToBottom.dispose();
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
  if (state.ui.diagnosticSessionId === id) {
    state.ui.diagnosticSessionId = state.sessions.has(state.activeId)
      ? state.activeId : (state.sessions.keys().next().value || null);
  }
  $('#empty-state').classList.toggle('hidden', state.sessions.size > 0);
  renderTabs();
  invalidate('shortcutDebug', ...(state.env && state.env.devMode ? ['diagnostics'] : []));
}

function setUpdateQueuePhase(phase, patch = {}) {
  if (!UPDATE_QUEUE_PHASES.has(phase)) return;
  if (state.testUpdateInstallTrace) state.testUpdateInstallTrace.phases.push(phase);
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

// Safety derives from turn state alone: exited/idle/needsInput/completed are
// safe; working/unknown block. Completion consumption changes completed to
// idle, and both states remain update-safe.
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

async function dismissUpdateQueue() {
  if (!(await showLifecyclePrompt('update-dismiss'))) return;
  apply({ type: 'update-queue-dismissed' });
}

function focusFirstUpdateBlocker() {
  const blocker = updateBlockers()[0];
  if (blocker) activateSession(blocker.session.id);
}

function canInstallIdleWorkspaceImmediately() {
  if (state.updateQueue.phase !== 'idle') return false;
  if (!hasManagedInstallSource() || state.sessions.size !== 0) return false;
  // Project attention before queueUpdate() can introduce an UPDATE READY item.
  // Any existing user-visible work keeps the normal staged install flow.
  return attentionItems().length === 0;
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

function snapshotAttentionRecordsBySession(sessions) {
  const bySession = new Map(sessions.map((session) => [session.id,
    new Map((session.restoredAttentionRecords || []).map((record) => [record.id, { ...record }]))]));
  const visible = window.chromuxAttention.projectAttentionItems({
    sessions,
    activeId: state.activeId,
    captures: state.captures.values(),
    updateQueue: state.updateQueue,
    updateStatus: state.updateStatus,
  });
  for (const item of visible) {
    if (item.scope !== 'session' || item.type === 'queue' || !RESTORE_ATTENTION_TYPES.has(item.type)) continue;
    const occurredAt = Number.isFinite(item.createdAt) && item.createdAt > 0 ? item.createdAt : Date.now();
    const suffix = item.captureId ? `:${item.captureId}` : ':turn';
    const id = `attention:${item.type}:${Math.trunc(occurredAt)}${suffix}`;
    bySession.get(item.sessionId)?.set(id, {
      id,
      type: item.type,
      detail: truncateUtf8(item.detail || '', BOUNDS.restoreAttentionDetailBytes),
      occurredAt,
    });
  }
  return new Map([...bySession].map(([sessionId, records]) => [sessionId,
    [...records.values()].sort((a, b) => a.occurredAt - b.occurredAt).slice(-MAX_RESTORE_ATTENTION_RECORDS)]));
}

function snapshotOpenSessions() {
  const sessions = orderedSessions();
  const attentionBySession = snapshotAttentionRecordsBySession(sessions);
  return sessions.map((session) => ({
    name: session.name,
    cwd: session.cwd,
    agent: session.agent || '',
    resumeId: session.resumeId || null,
    alive: Boolean(session.lifecycle.alive),
    currentUrl: session.browser.currentUrl || null,
    queue: session.browser.queue.map((item) => ({
      url: item.url,
      source: item.source || 'RESTORE',
      reason: item.reason || queueReasonForSource(item.source || 'RESTORE'),
      detectedText: item.detectedText || null,
      ts: item.ts || Date.now(),
    })),
    ...(attentionBySession.get(session.id)?.length
      ? { attentionRecords: attentionBySession.get(session.id) }
      : {}),
    ...(session.composer.draft ? { composerDraft: session.composer.draft } : {}),
    savedAt: new Date().toISOString(),
  }));
}

function liveSessions() {
  return orderedSessions().filter((session) => session.lifecycle.alive);
}

function showLifecyclePrompt(reason) {
  const live = liveSessions();
  const isDevModeRestart = reason === 'dev-mode-restart';
  const alwaysConfirm = reason === 'app-quit' || (isDevModeRestart && state.sessions.size > 0);
  const isUpdateInstall = reason === 'update-install';
  const isUpdateDismiss = reason === 'update-dismiss';
  if (live.length === 0 && !isUpdateInstall && !isUpdateDismiss && !alwaysConfirm) return Promise.resolve(true);
  if (state.lifecyclePrompt) return state.lifecyclePrompt.promise;

  const isQuit = reason === 'app-quit';
  $('#lifecycle-title').textContent = isDevModeRestart
    ? 'RESTART FOR DEVELOPER MODE?'
    : (isUpdateInstall
    ? 'EXECUTE CHROMUX UPDATE?'
    : (isUpdateDismiss ? 'DISMISS QUEUED UPDATE?'
      : (isQuit ? 'QUIT CHROMUX?' : 'CLOSE CHROMUX WITH LIVE SESSIONS')));
  $('#lifecycle-copy').textContent = isDevModeRestart
    ? 'Chromux will save the open workspace, restart with the selected Developer Mode setting, and reopen resumable sessions.'
    : (isUpdateInstall
    ? 'Continuing will stop live PTYs, save a workspace snapshot, install the update, and reopen the sessions after restart using Claude/Codex resume where possible.'
    : (isUpdateDismiss
      ? 'This removes the pinned Chromux Update row from Threads without installing it. The available update remains visible in Settings and can be queued again later.'
    : (live.length === 0
      ? 'Chromux will close after you confirm.'
      : 'Continuing will stop live PTYs and save a workspace snapshot. When Chromux opens again, it will reopen the sessions using Claude/Codex resume where possible.')));
  const host = $('#lifecycle-list');
  host.innerHTML = '';
  for (const session of isUpdateDismiss ? [] : (isDevModeRestart ? orderedSessions() : live)) {
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
  $('#lifecycle-confirm').textContent = isDevModeRestart
    ? 'SAVE & RESTART'
    : (isUpdateInstall
    ? 'EXECUTE UPDATE'
    : (isUpdateDismiss ? 'DISMISS UPDATE' : (isQuit ? 'QUIT' : 'SAVE & CLOSE')));

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
  const installIdleWorkspaceImmediately = canInstallIdleWorkspaceImmediately();
  if (state.updateQueue.phase === 'idle' && !installIdleWorkspaceImmediately) {
    queueUpdate();
    return;
  }
  const blockers = updateBlockers();
  const allowBlockedInstall = forceBlockers && hasManagedInstallSource();
  if (blockers.length > 0 && !allowBlockedInstall) {
    focusFirstUpdateBlocker();
    return;
  }
  if (blockers.length === 0 && !installIdleWorkspaceImmediately) setUpdateQueuePhase('ready');
  if (!installIdleWorkspaceImmediately) {
    if (state.testUpdateInstallTrace) state.testUpdateInstallTrace.lifecyclePrompts += 1;
    if (!(await showLifecyclePrompt('update-install'))) return;
    if (state.testUpdateInstallTrace) state.testUpdateInstallTrace.restoreSnapshots += 1;
    if (!state.testInstallUpdateResult) {
      await window.chromux.saveRestoreSnapshot({
        reason: 'update-install',
        sessions: snapshotOpenSessions(),
      });
    }
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
  const toggle = $('#settings-developer-mode');
  if (toggle) toggle.checked = Boolean(state.env && state.env.devMode);
  renderPreventSleepStatus();
  $('#modal-settings').classList.remove('hidden');
  invalidate('shortcutDebug');
  checkUpdates(false).catch(() => {});
}

async function changeDeveloperMode(enabled) {
  const toggle = $('#settings-developer-mode');
  const current = Boolean(state.env && state.env.devMode);
  if (Boolean(enabled) === current) return false;
  if (!(await showLifecyclePrompt('dev-mode-restart'))) {
    if (toggle) toggle.checked = current;
    return false;
  }
  const payload = { enabled: Boolean(enabled), sessions: snapshotOpenSessions() };
  if (state.testDevModeRestart) {
    state.testDevModeRestart.calls.push(payload);
    return true;
  }
  await window.chromux.restartWithDevMode(payload);
  return true;
}

function formatResourceWait(ms) {
  const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function resourceOwnerName(owner) {
  return owner && owner.displayName ? owner.displayName : 'Unknown agent';
}

function renderResourceState(snapshot) {
  const resources = Array.isArray(snapshot && snapshot.resources) ? snapshot.resources : [];
  const leases = Array.isArray(snapshot && snapshot.leases) ? snapshot.leases : [];
  const queued = new Set(resources.flatMap((resource) => (resource.queue || []).map((request) => request.id))).size;
  $('#resource-active-count').textContent = String(leases.length);
  $('#resource-queue-count').textContent = String(queued);
  const simulator = resources.find((resource) => resource.kind === 'ios-simulator');
  const capacity = simulator && simulator.capacity;
  $('#resource-simulator-capacity').textContent = capacity
    ? `${String(capacity.mode || 'auto').toUpperCase()} · ${capacity.booted}/${capacity.hardLimit}`
    : 'AUTO · NO XCODE';
  if (capacity) $('#resource-capacity-select').value = String(capacity.mode || 'auto');
  $('#resource-updated').textContent = `UPDATED ${new Date(snapshot.now || Date.now()).toLocaleTimeString()}`;
  const host = $('#resource-list');
  host.innerHTML = '';
  for (const resource of resources) {
    const row = document.createElement('section');
    row.className = `resource-card${resource.lease ? ' leased' : ''}`;
    const head = document.createElement('div');
    head.className = 'resource-card-head';
    const title = document.createElement('strong');
    title.textContent = resource.label || resource.id;
    const status = document.createElement('span');
    status.className = `resource-status ${resource.lease ? 'busy' : 'free'}`;
    status.textContent = resource.lease ? 'LEASED' : (resource.exclusive === false ? 'TARGET' : 'AVAILABLE');
    head.append(title, status);
    const idLine = document.createElement('code');
    idLine.textContent = resource.id;
    row.append(head, idLine);
    if (resource.lease) {
      const lease = document.createElement('div');
      lease.className = 'resource-owner';
      lease.textContent = `${resourceOwnerName(resource.lease.owner)} · expires ${new Date(resource.lease.expiresAt).toLocaleTimeString()}${resource.lease.operationPid ? ` · PID ${resource.lease.operationPid}` : ''}`;
      const force = document.createElement('button');
      force.className = 'qi-btn danger';
      force.textContent = 'FORCE RELEASE';
      force.onclick = async () => {
        if (!window.confirm(`Force release ${resource.id}? The operation may still be running.`)) return;
        await window.chromux.resourcesForceRelease(resource.lease.id);
        await refreshResources();
      };
      row.append(lease, force);
    }
    for (const request of resource.queue || []) {
      const queue = document.createElement('div');
      queue.className = 'resource-queue-row';
      const copy = document.createElement('span');
      copy.textContent = `${resourceOwnerName(request.owner)} · waiting ${formatResourceWait(request.waitMs)}`;
      const cancel = document.createElement('button');
      cancel.className = 'qi-btn';
      cancel.textContent = 'CANCEL';
      cancel.onclick = async () => { await window.chromux.resourcesCancel(request.id); await refreshResources(); };
      queue.append(copy, cancel);
      row.append(queue);
    }
    host.appendChild(row);
  }
  if (!resources.length) {
    const empty = document.createElement('div');
    empty.className = 'attention-empty';
    empty.textContent = 'No resources have registered yet.';
    host.appendChild(empty);
  }
}

async function refreshResources() {
  try {
    const snapshot = await window.chromux.resourcesList();
    $('#resource-error').classList.add('hidden');
    renderResourceState(snapshot);
  } catch (error) {
    $('#resource-error').textContent = `Resource broker unavailable: ${error.message}`;
    $('#resource-error').classList.remove('hidden');
  }
}

function openResources() {
  $('#modal-resources').classList.remove('hidden');
  invalidate('shortcutDebug');
  refreshResources().catch(() => {});
}

function applyTerminalTitleUpdates(session, data) {
  const res = window.chromuxSignals.extractTerminalTitles(session.term.titleBuf, data);
  session.term.titleBuf = res.buf;
  if (res.titles.length === 0) return;
  const latest = res.titles[res.titles.length - 1].title;
  if (!latest || latest === session.term.title) return;
  session.term.title = latest;
  syncThreadSessionPresentation(session);
  invalidate('tabs', ...(state.env && state.env.devMode ? ['diagnostics'] : []));
}

function renderedTerminalCursorContext(term) {
  const buffer = term && term.buffer && term.buffer.active;
  if (!buffer || typeof buffer.getLine !== 'function') return null;
  const cursorRow = buffer.baseY + buffer.cursorY;
  const cursorLine = buffer.getLine(cursorRow)?.translateToString(true) || '';
  const nearbyLines = [];
  for (let row = Math.max(0, cursorRow - 3); row <= Math.min(buffer.length - 1, cursorRow + 3); row += 1) {
    nearbyLines.push(buffer.getLine(row)?.translateToString(true) || '');
  }
  return { cursorLine, nearbyLines };
}

function recoverCodexCompletionFromRenderedTerminal(session, expectedInputAt) {
  if (!session || session.turn.inputAt !== expectedInputAt) return false;
  const rendered = renderedTerminalCursorContext(session && session.term && session.term.term);
  if (!rendered || !window.chromuxAttention.applyCodexRenderedCompletionFallback(session, rendered, Date.now())) return false;
  if (session.id === state.activeId) {
    session.turn.attentionSeenAt = Math.max(session.turn.attentionSeenAt || 0, session.turn.since || 0);
    window.chromuxAttention.consumeCompletedTurn(session.turn, Date.now());
  }
  recordEvent({
    type: 'turn-recovered', sessionId: session.id, turnState: session.turn.state,
    source: 'codex:terminal-idle', confidence: 'low',
  });
  invalidate('update', 'attention', 'badges', 'tabs');
  return true;
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
    const env = sig.envelope;
    const validV2 = !env || (
      env.sessionId === id
      && env.token === s.turn.token
      && env.agent === s.agent
      && typeof env.event === 'string' && env.event.length <= 64
      && (env.reason === null || env.reason === undefined || (typeof env.reason === 'string' && env.reason.length <= 80))
      && (env.message === null || env.message === undefined || (typeof env.message === 'string' && env.message.length <= 1024))
      && typeof env.turnId === 'string' && env.turnId.length > 0 && env.turnId.length <= 128
      && typeof env.eventId === 'string' && env.eventId.length > 0 && env.eventId.length <= 128
      && Number.isSafeInteger(env.sequence) && env.sequence >= 0
      && Number.isFinite(env.timestamp) && env.timestamp > 0
      && typeof env.source === 'string' && env.source.length <= 64
      && ['high', 'medium', 'low'].includes(env.confidence)
      && typeof env.stopped === 'boolean'
      && (env.resumeId === null || env.resumeId === undefined
        || (typeof env.resumeId === 'string' && /^[0-9a-f][0-9a-f-]{15,127}$/i.test(env.resumeId)))
    );
    if (sig.malformed || sig.sessionId !== id || !validV2) {
      apply({
        type: 'signal-rejected',
        sessionId: id,
        signal: sig.malformed ? null : sig.event,
        claimedSessionId: sig.sessionId || null,
      });
    } else if (env && env.event === 'unknown-notification') {
      if (env.resumeId) s.resumeId = env.resumeId;
      apply({ type: 'signal-unknown', sessionId: id, source: env.source, eventId: env.eventId });
    } else {
      if (env && env.resumeId) s.resumeId = env.resumeId;
      apply({ type: 'turn-signal', sessionId: id, signal: sig.event, detail: sig.detail, envelope: env });
    }
  }
  if (res.clean) {
    const recoveryInputAt = s.turn.inputAt;
    s.term.term.write(res.clean, () => recoverCodexCompletionFromRenderedTerminal(s, recoveryInputAt));
    feedDetector(s, res.clean);
  }
  if (s.agent === '' && s.lifecycle.alive) scanPtyAgentDescendants(false).catch(() => {});
}

window.chromux.onPtyData(({ id, data }) => handlePtyData(id, data));

let ptyAgentScanInFlight = false;
let lastPtyAgentScanAt = 0;

function adoptPtyAgentRows(rows = []) {
  let adopted = 0;
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row && row.id;
    const agent = row && row.agent;
    if (!id || seen.has(id) || !ADOPTABLE_AGENTS.has(agent)) continue;
    seen.add(id);
    const session = state.sessions.get(id);
    if (!session || session.agent !== '' || !session.lifecycle.alive) continue;
    if (adoptSessionAgent(session, agent, 'process-scan', { command: row.command || null })) adopted += 1;
  }
  if (adopted > 0) invalidate('tabs', 'attention', 'update', 'badges', 'shortcutDebug');
  return adopted;
}

async function scanPtyAgentDescendants(force = false) {
  if (!window.chromux || typeof window.chromux.detectPtyAgents !== 'function') return 0;
  const hasShellSessions = orderedSessions().some((session) => session.agent === '' && session.lifecycle.alive);
  if (!hasShellSessions) return 0;
  const now = Date.now();
  if (!force && now - lastPtyAgentScanAt < SHELL_ADOPTION_SCAN_MS) return 0;
  if (ptyAgentScanInFlight) return 0;
  ptyAgentScanInFlight = true;
  lastPtyAgentScanAt = now;
  try {
    const result = await window.chromux.detectPtyAgents();
    return adoptPtyAgentRows(result && result.rows);
  } catch {
    return 0;
  } finally {
    ptyAgentScanInFlight = false;
  }
}

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
  s.term.term.write(`\r\n\x1b[38;5;210m── session exited (${exitCode}) ──\x1b[0m\r\n`);
  renderComposer(s);
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
// Detect — adopt open terminal tabs and their claude/codex/grok sessions into
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
    composerDraft: resolved.composerDraft || '',
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
      `${rows.length} TERMINAL TAB${rows.length === 1 ? '' : 'S'} — ${agents} AGENT SESSION${agents === 1 ? '' : 'S'} (CLAUDE/CODEX/GROK), ${rows.length - agents} SHELL`
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
  writePtyInput(session, data);
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
  const inferred = Array.isArray(state.restoreInferredRows) ? state.restoreInferredRows : [];
  if ((rows.length === 0 && inferred.length === 0) || state.restoreWarningDismissed) {
    host.classList.add('hidden');
    return;
  }
  const main = document.createElement('div');
  main.className = 'rw-main';
  const title = document.createElement('div');
  title.className = 'rw-title';
  title.textContent = rows.length > 0
    ? 'Some saved sessions reopened fresh'
    : 'Some saved sessions used best-effort matches';
  const detail = document.createElement('div');
  detail.className = 'rw-detail';
  const unresolvedNames = rows.map((row) => `${row.name || row.agent} (${row.cwd || '~'})`);
  const inferredNames = inferred.map((row) => `${row.name || row.agent} (${row.cwd || '~'})`);
  const messages = [];
  if (rows.length > 0) {
    messages.push(`Chromux could not match ${rows.length} saved conversation${rows.length === 1 ? '' : 's'}: ${unresolvedNames.join('; ')}`);
  }
  if (inferred.length > 0) {
    messages.push(`Chromux inferred distinct recent conversations for ${inferred.length} legacy tab${inferred.length === 1 ? '' : 's'}: ${inferredNames.join('; ')}`);
  }
  detail.textContent = messages.join(' ');
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

function renderRestoreWarning(unresolved, inferred = []) {
  state.restoreWarningRows = Array.isArray(unresolved) ? unresolved : [];
  state.restoreInferredRows = Array.isArray(inferred) ? inferred : [];
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
        initialAttentionRecords: row.attentionRecords || [],
        composerDraft: row.composerDraft || '',
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
  renderRestoreWarning(res.unresolved || [], res.inferred || []);
}

// ───────────────────────────────────────────────────────────────────────────
// Modals, drawer, chrome wiring
// ───────────────────────────────────────────────────────────────────────────

function openNewSessionModal() {
  $('#ns-name').value = `session-${state.counter + 1}`;
  $('#ns-cwd').value = state.lastCwd || (state.env ? state.env.home : '');
  $('#ns-grok-enable').checked = false;
  renderAgentDataWarning();
  $('#modal-new').classList.remove('hidden');
  renderSavedProjects();
  refreshProjectConfig().catch(() => {});
  invalidate('shortcutDebug');
  $('#ns-name').focus();
  $('#ns-name').select();
}

$('#btn-new-session').onclick = () => {
  closeSessionSearch();
  openNewSessionModal();
};
$('#btn-search-sessions').onclick = toggleSessionSearch;
$('#session-search-input').addEventListener('input', renderSessionSearch);
$('#session-search-input').addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    const first = $('#session-search-results .session-search-result');
    if (first) {
      event.preventDefault();
      first.focus();
    }
  } else if (event.key === 'Enter') {
    const first = $('#session-search-results .session-search-result');
    if (first) {
      event.preventDefault();
      first.click();
    }
  }
});
$('#session-search-results').addEventListener('keydown', (event) => {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  const rows = [...document.querySelectorAll('#session-search-results .session-search-result')];
  const index = rows.indexOf(event.target);
  if (index < 0) return;
  event.preventDefault();
  const next = event.key === 'ArrowDown'
    ? rows[Math.min(rows.length - 1, index + 1)]
    : (index === 0 ? $('#session-search-input') : rows[index - 1]);
  if (next) next.focus();
});
$('#btn-first-session').onclick = openNewSessionModal;
document.querySelectorAll('[data-rail-mode]').forEach((button) => {
  button.addEventListener('click', () => selectRailMode(button.dataset.railMode));
});
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
$('#btn-resources').onclick = openResources;
$('#resources-refresh').onclick = () => refreshResources().catch(() => {});
$('#resource-capacity-select').onchange = async (event) => {
  await window.chromux.resourcesSetCapacity(event.target.value);
  await refreshResources();
};
$('#settings-theme-grid').addEventListener('click', (event) => {
  const option = event.target.closest('[data-theme-option]');
  if (option) applyTheme(option.dataset.themeOption);
});
$('#settings-theme-mode').addEventListener('click', (event) => {
  const option = event.target.closest('button[data-theme-mode]');
  if (option) applyThemeMode(option.dataset.themeMode);
});
$('#settings-tab-activity-indicators').addEventListener('change', (event) => {
  applyTabActivityIndicators(event.target.checked);
});
$('#settings-thread-preview-size').addEventListener('change', (event) => {
  applyThreadPreviewSize(event.target.value);
});
$('#settings-prevent-sleep').addEventListener('change', (event) => {
  changePreventSleep(event.target.checked);
});
$('#settings-developer-mode').addEventListener('change', (event) => {
  changeDeveloperMode(event.target.checked).catch(() => {
    event.target.checked = Boolean(state.env && state.env.devMode);
  });
});
$('#diagnostic-session').addEventListener('change', (event) => {
  if (state.sessions.has(event.target.value)) state.ui.diagnosticSessionId = event.target.value;
  invalidate('diagnostics');
});
$('#btn-update-ready').onclick = () => {
  if (updateAvailable() && state.updateQueue.phase === 'idle') installUpdate().catch(showUpdateInstallError);
  else openSettings();
};

$('#ns-browse').onclick = async () => {
  const dir = await window.chromux.pickDirectory();
  if (dir) { $('#ns-cwd').value = dir; await refreshProjectConfig(); }
};

async function refreshProjectConfig() {
  let cwd = $('#ns-cwd').value.trim();
  if (cwd.startsWith('~')) cwd = (state.env ? state.env.home : '') + cwd.slice(1);
  const config = await window.chromux.projectConfig(cwd);
  state.projectConfig = config;
  const select = $('#ns-start-script'); select.innerHTML = '';
  for (const script of config.scripts || []) {
    const option = document.createElement('option'); option.value = script; option.textContent = `${config.runner} run ${script}`; select.appendChild(option);
  }
  select.disabled = !config.valid;
  $('#ns-save-project').disabled = !config.valid;
  $('#ns-start-project').disabled = !config.valid;
  $('#ns-project-status').textContent = config.valid ? `${config.scripts.length} SCRIPTS · ${config.runner}` : config.reason;
}

function renderSavedProjects() {
  const host = $('#ns-project-list'); host.innerHTML = '';
  if (!state.projects.length) { const empty = document.createElement('div'); empty.className = 'queue-empty'; empty.textContent = 'No saved projects.'; host.appendChild(empty); }
  for (const project of state.projects) {
    const row = document.createElement('div'); row.className = 'saved-project-row';
    const use = document.createElement('button'); use.className = 'saved-project-use'; use.textContent = `${project.name} · ${project.startCommand}`;
    use.onclick = async () => { $('#ns-name').value = project.name; $('#ns-cwd').value = project.cwd; await refreshProjectConfig(); $('#ns-start-script').value = project.script; };
    const remove = document.createElement('button'); remove.className = 'qi-btn'; remove.textContent = 'REMOVE';
    remove.onclick = async () => { state.projects = await window.chromux.projectsReplace(state.projects.filter((item) => !(item.cwd === project.cwd && item.script === project.script))); renderSavedProjects(); };
    row.append(use, remove); host.appendChild(row);
  }
}

async function saveCurrentProject() {
  const config = state.projectConfig; const script = $('#ns-start-script').value;
  if (!config || !config.valid || !config.scripts.includes(script)) return null;
  const name = $('#ns-name').value.trim() || config.cwd.split('/').pop();
  state.projects = await window.chromux.projectsReplace([...state.projects, { name, cwd: config.cwd, script }]);
  renderSavedProjects();
  return state.projects.find((item) => item.cwd === config.cwd && item.script === script) || null;
}

$('#ns-cwd').addEventListener('change', () => refreshProjectConfig().catch(() => {}));
$('#ns-save-project').onclick = () => saveCurrentProject();
$('#ns-start-project').onclick = async () => {
  const project = await saveCurrentProject();
  if (!project) return;
  $('#modal-new').classList.add('hidden');
  await createSession({ name: project.name, cwd: project.cwd, agent: '', command: project.startCommand });
};

$('#ns-agent').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  for (const b of $('#ns-agent').children) b.classList.toggle('on', b === btn);
  renderAgentDataWarning();
});

function renderAgentDataWarning() {
  const selected = $('#ns-agent .on');
  const grokSelected = Boolean(selected && selected.dataset.agent === 'grok');
  $('#grok-data-warning').classList.toggle('hidden', !grokSelected);
  if (!grokSelected) $('#ns-grok-enable').checked = false;
  $('#ns-create').disabled = grokSelected && !$('#ns-grok-enable').checked;
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('.agent-data-warning [data-security-resource]');
  if (link) window.chromux.openSecurityResource(link.dataset.securityResource).catch(() => {});
});

$('#ns-grok-enable').addEventListener('change', renderAgentDataWarning);
$('#grok-context-enable').addEventListener('change', (e) => {
  $('#grok-context-confirm').disabled = !e.target.checked;
});
$('#grok-context-confirm').onclick = () => {
  if (!$('#grok-context-enable').checked || !state.grokContextAction) return;
  const source = state.sessions.get(state.grokContextAction.sessionId);
  const mode = state.grokContextAction.mode;
  closeGrokContextAdvisory();
  if (source) duplicateSession(source, 'grok', mode).catch(() => {});
};

$('#ns-create').onclick = async () => {
  const name = $('#ns-name').value.trim() || `session-${state.counter + 1}`;
  let cwd = $('#ns-cwd').value.trim() || (state.env ? state.env.home : '~');
  if (cwd.startsWith('~')) cwd = (state.env ? state.env.home : '') + cwd.slice(1);
  const agent = $('#ns-agent .on').dataset.agent;
  if (agent === 'grok' && !$('#ns-grok-enable').checked) return;
  $('#modal-new').classList.add('hidden');
  await createSession({ name, cwd, agent });
};

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $('#' + btn.dataset.close).classList.add('hidden');
    // Closing the modal drops only the compose context — the capture record
    // survives, so in-flight deliveries still resolve and stay attributable.
    if (btn.dataset.close === 'modal-capture') state.ui.captureModal = null;
    if (btn.dataset.close === 'modal-grok-advisory') closeGrokContextAdvisory();
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
window.chromux.onShortcutOpenComposer(handleShortcutOpenComposer);

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

function handleShortcutOpenComposer() {
  if (guardedShortcutDisabledReason(shortcutFocusContext())) return null;
  const session = state.sessions.get(state.activeId);
  return session ? openComposer(session) : null;
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
  if (String(input.key || '').toLowerCase() === 'enter' && input.shift) return { id: 'composer-open' };
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
  else if (action.id === 'composer-open') result = handleShortcutOpenComposer();
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

  const addFakeSession = ({ name = 'test-session', agent = 'codex', cwd = '/tmp', alive = true, turnState = 'unknown', queue = [], attentionRecords = [], resumeLaunch = null } = {}) => {
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
    if (turnState !== 'unknown') session.turn.since = Date.now();
    session.browser.queue = Array.isArray(queue)
      ? queue.map((item) => normalizeQueueItem(item, 'RESTORE')).filter(Boolean)
      : [];
    session.restoredAttentionRecords = Array.isArray(attentionRecords)
      ? attentionRecords.filter((record) => record && RESTORE_ATTENTION_TYPES.has(record.type))
        .slice(0, MAX_RESTORE_ATTENTION_RECORDS).map((record) => ({ ...record }))
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

  const addRenderableTestSession = ({ name = 'tab-test', agent = 'codex', cwd = '/tmp', turnState = 'unknown', alive = true, realTerminal = false, cols = 64, rows = 16, composerDraft = '' } = {}) => {
    state.counter += 1;
    const session = newSessionShape({ id: 's' + state.counter, name, cwd, agent });
    session.turn.state = turnState;
    if (turnState !== 'unknown') session.turn.since = Date.now();
    session.lifecycle.alive = alive;
    session.composer.draft = utf8WithinLimit(composerDraft) ? composerDraft : '';
    const viewEls = buildSessionView(session);
    const tabEls = buildSessionTab(session);
    const written = [];
    session.els = { ...viewEls, ...tabEls };
    renderComposer(session);
    applyBrowserLayout(session);
    session._written = written;
    session._ptyInputs = [];
    if (realTerminal) {
      const term = new Terminal({ cols, rows, scrollback: 600, fontFamily: 'monospace', fontSize: 12, lineHeight: 1, theme: terminalThemeFor() });
      term.open(viewEls.termHost);
      term.resize(cols, rows);
      term.onData((data) => handleTerminalInput(session, data));
      session.term.term = term;
    } else {
      session.term.term = { write: (d) => written.push(d), focus() {}, dispose() {} };
    }
    session.term.fit = () => {};
    state.sessions.set(session.id, session);
    apply({ type: 'session-created', sessionId: session.id, name, cwd, agent });
    renderQueue(session);
    activateSession(session.id);
    flushRender();
    return session.id;
  };

  window.chromuxTestComposer = {
    addSession(options = {}) {
      const id = addRenderableTestSession({ ...options, realTerminal: true });
      const session = testSession(id);
      const fitAddon = new FitAddon.FitAddon();
      session.term.term.loadAddon(fitAddon);
      session.term.fitAddon = fitAddon;
      session.term.fit = () => fitTerminalPreservingViewport(session, () => fitAddon.fit());
      session.term.fit();
      new ResizeObserver(() => session.term.fit()).observe(session.els.termHost);
      return id;
    },
    focus(id) { activateSession(id); flushRender(); },
    open(id) { openComposer(testSession(id)); },
    clickOpen(id) { testSession(id).els.composeBtn.click(); },
    keyboardOpen(id) {
      activateSession(id);
      testSession(id).term.term.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    },
    close(id) { closeComposer(testSession(id)); },
    toggleExpand(id) { return toggleComposerExpanded(testSession(id)); },
    resolveConflict(id, action) { return resolveComposerInputChoice(testSession(id), action); },
    pendingInput: (id) => testSession(id).term.typedInputBuf,
    escape(id) {
      const textarea = testSession(id).els.composerTextarea;
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    },
    setDraft(id, value) {
      const session = testSession(id);
      session.els.composerTextarea.value = String(value);
      session.els.composerTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    },
    draft: (id) => testSession(id).composer.draft,
    async submit(id) { return submitComposer(testSession(id)); },
    submitShortcut(id) {
      const textarea = testSession(id).els.composerTextarea;
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    },
    enter(id) {
      const textarea = testSession(id).els.composerTextarea;
      textarea.setRangeText('\n', textarea.selectionStart, textarea.selectionEnd, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    },
    nativeInput(id, data) { testSession(id).term.term.input(String(data), true); },
    async write(id, data) {
      const term = testSession(id).term.term;
      return new Promise((resolve) => term.write(String(data), resolve));
    },
    ptyInputs: (id) => (testSession(id)._ptyInputs || []).slice(),
    clearPtyInputs(id) { testSession(id)._ptyInputs = []; },
    scrollLines(id, count) { testSession(id).term.term.scrollLines(count); rememberTerminalViewport(testSession(id)); },
    setBrowserCollapsed(id, collapsed) { setBrowserCollapsed(testSession(id), collapsed); },
    async history(id) { return loadComposerHistory(testSession(id), { force: true }); },
    async toggleHistory(id) { return toggleComposerHistory(testSession(id)); },
    search(id, query) {
      const input = testSession(id).els.historySearch; input.value = query;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    historyPreviews: (id) => [...testSession(id).els.historyList.querySelectorAll('.composer-history-preview')].map((el) => el.textContent),
    reuse(id, index = 0) { testSession(id).els.historyList.querySelectorAll('.composer-history-reuse')[index]?.click(); },
    async deleteHistory(id, index = 0) {
      const session = testSession(id);
      const query = session.composer.query.trim().toLocaleLowerCase();
      const entry = session.composer.history.filter((item) => !query || item.text.toLocaleLowerCase().includes(query))[index];
      if (!entry) return;
      session.composer.history = await window.chromux.promptHistoryDelete(session.cwd, entry.id);
      renderComposerHistory(session);
    },
    async clearHistory(id) { await clearComposerHistory(testSession(id)); },
    recall(id, key) {
      const textarea = testSession(id).els.composerTextarea;
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));
    },
    exit(id, exitCode = 0) { handlePtyExit({ id, exitCode }); flushRender(); },
    snapshot: () => snapshotOpenSessions().map((row) => ({ ...row })),
    state(id) {
      const session = testSession(id); const textarea = session.els.composerTextarea;
      const paneRect = session.els.termHost.parentElement.getBoundingClientRect();
      const helper = session.els.termHost.querySelector('.xterm-helper-textarea');
      const composerRect = session.els.composer.getBoundingClientRect();
      return {
        open: session.composer.open,
        expanded: session.composer.expanded,
        conflictOpen: Boolean(session.composer.pendingInputChoice) && !session.els.composerInputChoice.classList.contains('hidden'),
        drawerOpen: session.composer.drawerOpen,
        focused: document.activeElement === textarea,
        terminalFocused: terminalFocused(),
        submitDisabled: session.els.submitComposerBtn.disabled,
        hasDraftIndicator: session.els.composeBtn.classList.contains('has-draft'),
        textareaHeight: textarea.getBoundingClientRect().height,
        composerHeight: composerRect.height,
        paneHeight: paneRect.height,
        termHostVisible: getComputedStyle(session.els.termHost).display !== 'none',
        expandLabel: session.els.expandComposerBtn.textContent,
        toolbarActions: [...session.els.composer.querySelectorAll('.composer-toolbar button')].map((button) => button.textContent),
        helperCount: session.els.termHost.querySelectorAll('.xterm-helper-textarea').length,
        helperInlineStyle: helper?.getAttribute('style') || '',
        helperBackground: helper ? getComputedStyle(helper).backgroundColor : '',
        helperInsideComposer: Boolean(helper && helper.closest('.terminal-composer')),
        viewportY: session.term.term.buffer.active.viewportY,
        baseY: session.term.term.buffer.active.baseY,
      };
    },
  };

  window.chromuxTestTabs = {
    addSession: addRenderableTestSession,
    feed(id, chunk) {
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
    exit(id, exitCode = 0) {
      apply({ type: 'session-exited', sessionId: id, exitCode });
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
    attentionKinds: () => [...document.querySelectorAll('#thread-list .attention-kind')].map((el) => el.textContent),
    activityPreference: () => state.ui.tabActivityIndicators,
    activityPreferenceStored: () => {
      try { return window.localStorage.getItem(TAB_ACTIVITY_STORAGE_KEY); } catch { return null; }
    },
    activityToggleState: () => $('#settings-tab-activity-indicators').checked,
    setActivityPreference(enabled) {
      const toggle = $('#settings-tab-activity-indicators');
      toggle.checked = Boolean(enabled);
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      flushRender();
    },
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
        indicator: ['dead', 'action', 'working', 'completed', 'idle', 'live'].find((kind) => session.els.dot.classList.contains(kind)) || 'unknown',
        indicatorCount: tab.querySelectorAll('.tab-dot').length,
        label: label.textContent,
        title: tab.title,
        ariaLabel: tab.getAttribute('aria-label') || '',
        wrapWidth: wrap.clientWidth,
        labelWidth: label.scrollWidth,
      };
    },
    flushRender,
  };

  window.chromuxTestRail = {
    addSession: addRenderableTestSession,
    addTerminalSession: (options = {}) => addRenderableTestSession({ ...options, realTerminal: true }),
    focus(id) { activateSession(id); flushRender(); },
    emit(id, event, detail = null) { apply({ type: 'turn-signal', sessionId: id, signal: event, detail }); flushRender(); },
    exit(id, exitCode = 0) { apply({ type: 'session-exited', sessionId: id, exitCode }); flushRender(); },
    title(id, value) { handlePtyData(id, `\x1b]0;${value}\x07`); flushRender(); },
    mode: () => state.ui.railMode,
    storedMode: () => {
      try { return window.localStorage.getItem(RAIL_MODE_STORAGE_KEY); } catch { return null; }
    },
    migrateMode(value) {
      if (value === null) window.localStorage.removeItem(RAIL_MODE_STORAGE_KEY);
      else window.localStorage.setItem(RAIL_MODE_STORAGE_KEY, value);
      const mode = storedRailMode();
      return { mode, stored: window.localStorage.getItem(RAIL_MODE_STORAGE_KEY) };
    },
    select(mode) {
      const button = document.querySelector(`[data-rail-mode="${mode}"]`);
      if (!button) throw new Error(`Unknown rail mode: ${mode}`);
      button.click(); flushRender(); return state.ui.railMode;
    },
    heading: () => $('#rail-heading')?.textContent || '',
    attentionCount: () => Number($('#rail-thread-count')?.textContent || 0),
    attentionCards: () => [...document.querySelectorAll('.attention-thread')].map((card) => ({
      id: card.dataset.sessionId,
      reasons: [...card.querySelectorAll('.attention-reason')].map((reason) => ({
        kind: reason.querySelector('.attention-kind')?.textContent || '',
        detail: reason.querySelector('.attention-detail')?.textContent || '',
        actions: [...reason.querySelectorAll('.attention-actions .qi-btn')].map((button) => button.textContent),
      })),
    })),
    attentionGeometry() {
      const rows = document.querySelector('.attention-thread-group > .rail-group-rows');
      const cards = [...(rows?.querySelectorAll(':scope > .attention-thread') || [])];
      const rowsRect = rows?.getBoundingClientRect();
      const rects = cards.map((card) => card.getBoundingClientRect());
      return {
        cards: rects.map((rect) => ({ top: rect.top, bottom: rect.bottom })),
        gaps: rects.slice(1).map((rect, index) => rect.top - rects[index].bottom),
        firstInset: rowsRect && rects[0] ? rects[0].top - rowsRect.top : 0,
        lastInset: rowsRect && rects.length ? rowsRect.bottom - rects[rects.length - 1].bottom : 0,
      };
    },
    clickAttentionAction(id, kind, label) {
      const card = document.querySelector(`.attention-thread[data-session-id="${CSS.escape(id)}"]`);
      const reason = [...(card?.querySelectorAll('.attention-reason') || [])]
        .find((candidate) => candidate.querySelector('.attention-kind')?.textContent === kind);
      const button = [...(reason?.querySelectorAll('.attention-actions .qi-btn') || [])]
        .find((candidate) => candidate.textContent === label);
      if (!button) throw new Error(`Missing ${label} action for ${kind} on ${id}`);
      button.click(); flushRender(); return state.activeId;
    },
    queue(id, url, reason = 'detected in agent output') {
      apply({ type: 'preview-queued', sessionId: id, url, source: 'TERM', reason });
      renderQueue(testSession(id)); flushRender();
    },
    nav: () => [...document.querySelectorAll('[data-rail-mode]')].map((button) => ({
      mode: button.dataset.railMode,
      label: button.getAttribute('aria-label'),
      title: button.title,
      pressed: button.getAttribute('aria-pressed'),
    })),
    groups: () => [...document.querySelectorAll('#thread-list .rail-group')].map((group) => ({
      key: group.dataset.groupKey,
      label: group.querySelector('.rail-group-label')?.textContent || '',
      title: group.querySelector('summary')?.title || '',
      count: Number(group.querySelector('.rail-group-count')?.textContent || 0),
      open: group.open,
      rows: [...group.querySelectorAll('.rail-session-row')].map((row) => ({
        id: row.dataset.sessionId,
        name: row.querySelector('.rail-session-name')?.textContent || '',
        status: row.querySelector('.rail-status')?.getAttribute('aria-label') || '',
        statusCount: row.querySelectorAll('.rail-status').length,
        animationName: getComputedStyle(row.querySelector('.rail-status')).animationName,
        title: row.title,
        ariaLabel: row.getAttribute('aria-label') || '',
      })),
    })),
    clickRow(id) {
      const row = document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(id)}"]`);
      if (!row) throw new Error(`Missing rail row: ${id}`);
      row.click(); flushRender(); return state.activeId;
    },
    write(id, data) {
      const term = testSession(id).term.term;
      return new Promise((resolve) => term.write(String(data), resolve));
    },
    preview() {
      const preview = state.ui.threadPreview;
      if (!preview) return null;
      const buffer = preview.terminal.buffer.active;
      const lines = [];
      let coloredCells = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        const line = buffer.getLine(index);
        lines.push(line?.translateToString(true) || '');
        if (line) {
          for (let column = 0; column < line.length; column += 1) {
            const cell = line.getCell(column);
            if (cell && (!cell.isFgDefault() || !cell.isBgDefault())) coloredCells += 1;
          }
        }
      }
      const rect = preview.popover.getBoundingClientRect();
      const source = testSession(preview.sessionId).term.term;
      const surfaceBackgrounds = [
        preview.popover,
        preview.popover.querySelector('.thread-preview-header'),
        preview.terminalViewport,
        preview.popover.querySelector('.thread-preview-footer'),
      ].map((element) => getComputedStyle(element).backgroundColor);
      const headerTitleRect = preview.popover.querySelector('.thread-preview-title').getBoundingClientRect();
      const screenRect = preview.terminalHost.querySelector('.xterm-screen').getBoundingClientRect();
      const footerLabelRect = preview.popover.querySelector('.thread-preview-footer span').getBoundingClientRect();
      const viewportRect = preview.terminalViewport.getBoundingClientRect();
      return {
        sessionId: preview.sessionId,
        text: lines.join('\n'),
        html: preview.terminalHost.innerHTML,
        focused: document.activeElement === preview.popover,
        role: preview.popover.getAttribute('role'),
        ariaLabel: preview.popover.getAttribute('aria-label'),
        title: preview.popover.querySelector('.thread-preview-title')?.textContent || '',
        footer: preview.popover.querySelector('.thread-preview-footer')?.textContent || '',
        cwdTitle: preview.popover.querySelector('.thread-preview-cwd')?.title || '',
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        cols: preview.terminal.cols, rows: preview.terminal.rows,
        sourceCols: source.cols, sourceRows: source.rows,
        bufferLength: buffer.length,
        refreshCount: preview.refreshCount,
        coloredCells,
        surfaceBackgrounds,
        padding: {
          headerLeft: headerTitleRect.left - rect.left,
          terminalLeft: screenRect.left - rect.left,
          footerLeft: footerLabelRect.left - rect.left,
          terminalTop: screenRect.top - viewportRect.top,
          terminalRight: rect.right - screenRect.right,
          terminalBottom: viewportRect.bottom - screenRect.bottom,
        },
      };
    },
    sourceState(id) {
      const session = testSession(id);
      const term = session.term.term;
      return {
        viewportY: term.buffer?.active?.viewportY ?? null,
        baseY: term.buffer?.active?.baseY ?? null,
        focused: document.activeElement === session.els.termHost.querySelector('.xterm-helper-textarea'),
      };
    },
    sourceScroll(id, amount) { testSession(id).term.term.scrollLines(amount); },
    rowState(id) {
      const row = document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(id)}"]`);
      if (!row) return null;
      return {
        ariaCurrent: row.getAttribute('aria-current'), ariaExpanded: row.getAttribute('aria-expanded'),
        ariaControls: row.getAttribute('aria-controls'), focused: document.activeElement === row,
        confirm: row.classList.contains('thread-row-confirm'), staticConfirm: row.classList.contains('thread-row-confirm-static'),
      };
    },
    previewClick() { state.ui.threadPreview?.popover.click(); flushRender(); },
    previewKey(key) {
      state.ui.threadPreview?.popover.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      flushRender();
    },
    outsideClick() { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); flushRender(); },
    collapseAnchor(id) {
      const row = document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(id)}"]`);
      const details = row?.closest('details');
      if (details) details.open = false;
    },
    close(id) { closeSession(id); flushRender(); },
    setReducedMotion(value) { state.ui.reducedMotionOverride = value; },
    setPreviewSize(value) { applyThreadPreviewSize(value); },
    previewSize: () => ({
      value: state.ui.threadPreviewSize,
      stored: window.localStorage.getItem(THREAD_PREVIEW_SIZE_STORAGE_KEY),
      control: $('#settings-thread-preview-size')?.value || '',
    }),
    cue(id) {
      const session = testSession(id);
      const pane = session.els.view.querySelector('.term-pane');
      return {
        pane: pane.classList.contains('thread-pane-confirm'),
        staticPane: pane.classList.contains('thread-pane-confirm-static'),
        ptyInput: session._ptyInputs.join(''),
      };
    },
    activeId: () => state.activeId,
    turnState: (id) => ({ ...testSession(id).turn }),
    attentionKinds: () => [...document.querySelectorAll('#thread-list .attention-kind')].map((el) => el.textContent),
    resolveGitRoot: (cwd) => window.chromux.gitRoot(cwd),
    gitCacheSize: () => state.ui.gitRoots.size,
    async waitForGit() {
      await Promise.all([...state.ui.gitRoots.values()].map((entry) => entry.promise));
      flushRender();
      await Promise.all([...state.ui.gitDiffs.values()].map((entry) => entry.promise));
      flushRender();
    },
    gitDiffs: () => [...document.querySelectorAll('#thread-list .git-diff-group')].map((group) => ({
      title: group.querySelector('summary')?.title || '',
      count: Number(group.querySelector('.rail-group-count')?.textContent || 0),
      totals: group.querySelector('.git-diff-totals')?.textContent || '',
      clean: Boolean(group.querySelector('.git-diff-empty.clean')),
      files: [...group.querySelectorAll('.git-diff-row')].map((row) => ({
        path: row.querySelector('.git-diff-path')?.textContent || '',
        status: row.querySelector('.git-diff-status')?.title || '',
        staged: row.querySelector('.git-diff-stage')?.textContent === 'S',
      })),
    })),
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
    attentionKinds: () => [...document.querySelectorAll('#thread-list .attention-kind')].map((el) => el.textContent),
    attentionButtons(kind) {
      for (const el of document.querySelectorAll('#thread-list .attention-item')) {
        if (el.querySelector('.attention-kind')?.textContent !== kind) continue;
        return [...el.querySelectorAll('.attention-actions .qi-btn')].map((button) => button.textContent);
      }
      return [];
    },
    clickAttentionPrimary(kind) {
      for (const el of document.querySelectorAll('#thread-list .attention-item')) {
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
      for (const el of document.querySelectorAll('#thread-list .attention-item')) {
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
    resetInstallTrace() {
      state.testUpdateInstallTrace = {
        lifecyclePrompts: 0,
        restoreSnapshots: 0,
        phases: [state.updateQueue.phase],
      };
    },
    installTrace: () => ({
      ...(state.testUpdateInstallTrace || {}),
      phases: [...(state.testUpdateInstallTrace?.phases || [])],
    }),
    addSession: async (opts) => addFakeSession(opts),
    setSession(id, patch = {}) {
      const session = testSession(id);
      if (patch.alive !== undefined) session.lifecycle.alive = patch.alive;
      if (patch.turnState !== undefined) {
        session.turn.state = patch.turnState;
        session.turn.since = Math.max(Date.now(), (session.turn.since || 0) + 1,
          patch.turnState === 'completed' ? (session.turn.attentionSeenAt || 0) + 1 : 0);
        session.turn.acknowledged = false;
      }
      invalidate('update', 'attention', 'badges');
      flushRender();
    },
    turnState: (id) => ({ ...testSession(id).turn }),
    resumeId: (id) => testSession(id).resumeId,
    snapshot: () => snapshotOpenSessions().map((row) => ({ ...row })),
    capabilities: (id) => ({ ...testSession(id).capabilities }),
    setSignalToken(id, token) { testSession(id).turn.token = token; },
    markUserInput(id) {
      apply({ type: 'user-input', sessionId: id, data: 'x\r' });
      flushRender();
    },
    flushRender,
  };

  window.chromuxTestSignals = {
    addFakeSession,
    addTerminalSession: (options = {}) => addRenderableTestSession({ ...options, realTerminal: true }),
    setSignalToken(id, token) { testSession(id).turn.token = token; },
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
    resumeId: (id) => testSession(id).resumeId,
    snapshot: () => snapshotOpenSessions().map((row) => ({ ...row })),
    activeId: () => state.activeId,
    written: (id) => (testSession(id)._written || []).join(''),
    attentionItems: () => [...document.querySelectorAll('#thread-list .attention-reason, #thread-list .attention-system-row')].map((el) => ({
      kind: el.querySelector('.attention-kind')?.textContent || '',
      name: el.closest('.attention-item')?.querySelector('.attention-name')?.textContent || '',
      detail: el.querySelector('.attention-detail')?.textContent || '',
      actions: [...el.querySelectorAll('.attention-actions .qi-btn')].map((button) => button.textContent),
    })),
    dismissItem(kind, name) {
      for (const el of document.querySelectorAll('#thread-list .attention-item')) {
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
    showRestoreWarning(unresolved = [], inferred = []) {
      state.restoreWarningDismissed = false;
      renderRestoreWarning(unresolved, inferred);
      flushRender();
    },
    clear() {
      state.resumeRetryWarning = null;
      state.restoreWarningRows = [];
      state.restoreInferredRows = [];
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
    attentionItems: () => [...document.querySelectorAll('#thread-list .attention-item')].map((el) => ({
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
    noteDom(event) {
      noteShortcutDebugInput(shortcutDebugInputFromDomEvent(event, 'renderer'));
      flushRender();
    },
    domInput(event) {
      return shortcutDebugInputFromDomEvent(event, 'renderer');
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
      const chord = shortcutDebugChord();
      return {
        source: state.shortcutDebug.source,
        latestKey: chord.key,
        modifiers: { ...chord.modifiers },
        detailsActive: chord.detailsActive,
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
      applyBrowserLayout(session);
      state.sessions.set(session.id, session);
      apply({ type: 'session-created', sessionId: session.id, name, cwd, agent });
      session.browser.queue = queue.map((item) => normalizeQueueItem(item, 'RESTORE')).filter(Boolean);
      if (url) {
        session.browser.currentUrl = url;
        session.els.urlBar.value = url;
      }
      renderFavoriteToolbar(session);
      renderFavoritesPicker(session);
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
    clickTerminalLink(id, url) {
      let prevented = false;
      activateTerminalLink(testSession(id), url, { preventDefault() { prevented = true; } });
      flushRender();
      return prevented;
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
      const session = testSession(id);
      session.els.browserToolbar.scrollLeft = session.els.browserToolbar.scrollWidth;
      flushRender();
    },
    state(id) {
      const session = testSession(id);
      const toolbar = session.els.browserToolbar;
      const toolbarStyle = getComputedStyle(toolbar);
      const toolbarRect = toolbar.getBoundingClientRect();
      const captureRect = session.els.captureBtn.getBoundingClientRect();
      const webPaneRect = session.els.webPane.getBoundingClientRect();
      const railRect = session.els.browserRail.getBoundingClientRect();
      const toggleRect = session.els.collapseBtn.getBoundingClientRect();
      const toggleContentRects = [...session.els.collapseBtn.children]
        .map((child) => child.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const toggleContentTop = toggleContentRects.length
        ? Math.min(...toggleContentRects.map((rect) => rect.top))
        : toggleRect.top;
      const toggleContentBottom = toggleContentRects.length
        ? Math.max(...toggleContentRects.map((rect) => rect.bottom))
        : toggleRect.bottom;
      const openIcon = session.els.collapseBtn.querySelector('.panel-open-icon');
      return {
        active: state.activeId === id,
        collapsed: session.browser.collapsed,
        grid: session.els.view.style.gridTemplateColumns,
        webCollapsed: session.els.webPane.classList.contains('collapsed'),
        webHostHidden: getComputedStyle(session.els.webHost).display === 'none',
        dividerDisabled: session.els.divider.classList.contains('disabled'),
        collapseText: session.els.collapseBtn.textContent,
        collapseTitle: session.els.collapseBtn.title,
        collapseAriaLabel: session.els.collapseBtn.getAttribute('aria-label'),
        railWidth: Math.round(railRect.width),
        railBounds: { top: railRect.top, bottom: railRect.bottom, height: railRect.height },
        toggleBounds: { top: toggleRect.top, bottom: toggleRect.bottom, height: toggleRect.height },
        toggleSpansRail: Math.abs(toggleRect.top - railRect.top) <= 1
          && Math.abs(toggleRect.bottom - railRect.bottom) <= 1,
        toggleContentCenterDelta: Math.abs(
          ((toggleContentTop + toggleContentBottom) / 2) - ((railRect.top + railRect.bottom) / 2)
        ),
        railAtFarRight: Math.abs(railRect.right - webPaneRect.right) <= 1,
        railAfterContent: session.els.webPane.firstElementChild === session.els.browserContent
          && session.els.browserContent.nextElementSibling === session.els.browserRail,
        toggleInToolbar: toolbar.contains(session.els.collapseBtn),
        openIconPresent: Boolean(openIcon),
        openIconAriaHidden: Boolean(openIcon && openIcon.getAttribute('aria-hidden') === 'true'),
        currentUrl: session.browser.currentUrl,
        urlBar: session.els.urlBar.value,
        queueCount: session.browser.queue.length,
        queuePanelHidden: session.els.queuePanel.classList.contains('hidden'),
        fitCount: session._fitCount(),
        toolbarOverflow: toolbar.scrollWidth > toolbar.clientWidth,
        toolbarScrollbarWidth: toolbarStyle.getPropertyValue('scrollbar-width'),
        toolbarLastControl: toolbar.lastElementChild ? toolbar.lastElementChild.textContent : '',
        captureReachable: captureRect.right <= toolbarRect.right + 1 && captureRect.left >= toolbarRect.left - 1,
      };
    },
    flushRender,
  };

  window.chromuxTestFavorites = {
    ready: () => state.favoritesReady || Promise.resolve(),
    urls: () => state.favorites.map((item) => item.url),
    addSession(opts = {}) {
      return window.chromuxTestBrowser.addSession(opts);
    },
    focus(id) { window.chromuxTestBrowser.focus(id); },
    collapse(id) { window.chromuxTestBrowser.collapse(id); },
    state(id) { return window.chromuxTestBrowser.state(id); },
    toolbar(id) {
      const button = testSession(id).els.favoriteBtn;
      return { active: button.classList.contains('armed'), disabled: button.disabled, text: button.textContent };
    },
    async toolbarToggle(id) {
      testSession(id).els.favoriteBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      flushRender();
    },
    async queueToggle(id, url) {
      const button = [...testSession(id).els.queueList.querySelectorAll('.qi-btn.pin')]
        .find((candidate) => candidate.dataset.queuePinUrl === url);
      if (!button) throw new Error(`No queued PIN for ${url}`);
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      flushRender();
    },
    pickerUrls(id) {
      return [...testSession(id).els.favoritesList.querySelectorAll('.qi-url')].map((el) => el.textContent);
    },
    openFavorite(url) {
      const session = testSession(state.activeId);
      const rows = [...session.els.favoritesList.querySelectorAll('.favorite-item')];
      const row = rows.find((candidate) => candidate.querySelector('.qi-url')?.textContent === url);
      if (!row) throw new Error(`No favorite for ${url}`);
      row.querySelector('.favorite-open').click();
      flushRender();
    },
    readPersisted: () => window.chromux.favoritesRead(),
    replaceRaw: (records) => window.chromux.favoritesReplace(records),
  };

  window.chromuxTestProjects = {
    ready: async () => { await state.favoritesReady; return state.projects; },
    config: (cwd) => window.chromux.projectConfig(cwd),
    replace: async (records) => { state.projects = await window.chromux.projectsReplace(records); renderSavedProjects(); return state.projects; },
    records: () => state.projects.map((item) => ({ ...item })),
    open: async () => { openNewSessionModal(); await refreshProjectConfig(); },
    selectScript: (script) => { $('#ns-start-script').value = script; },
    setCwd: async (cwd) => { $('#ns-cwd').value = cwd; await refreshProjectConfig(); },
    setName: (name) => { $('#ns-name').value = name; },
    start: async () => { $('#ns-start-project').click(); await new Promise((resolve) => setTimeout(resolve, 150)); },
    startEnabled: () => !$('#ns-start-project').disabled,
    sessionState: () => {
      const session = state.sessions.get(state.activeId);
      return session ? { name: session.name, cwd: session.cwd, queue: session.browser.queue.slice(), currentUrl: session.browser.currentUrl, collapsed: session.browser.collapsed } : null;
    },
  };

  window.chromuxTestAgentCommand = {
    build: (agent, resumeId = null) => agentCommand(agent, resumeId),
    env: () => ({ ...state.env }),
  };

  window.chromuxTestGrokWarning = {
    open: openNewSessionModal,
    select(agent) {
      const btn = [...$('#ns-agent').children].find((candidate) => candidate.dataset.agent === agent);
      if (!btn) throw new Error(`Unknown agent: ${agent}`);
      btn.click();
    },
    visible: () => !$('#grok-data-warning').classList.contains('hidden'),
    launchEnabled: () => !$('#ns-create').disabled,
    acknowledgeNewSession(value = true) {
      $('#ns-grok-enable').checked = value;
      $('#ns-grok-enable').dispatchEvent(new Event('change', { bubbles: true }));
    },
    text: () => $('#grok-data-warning').textContent.replace(/\s+/g, ' ').trim(),
    resources: () => [...$('#grok-data-warning').querySelectorAll('[data-security-resource]')]
      .map((button) => button.dataset.securityResource),
    async openContextMenu(agent = 'codex') {
      const sessionId = addFakeSession({ name: 'grok-context-source', cwd: '/tmp/grok-context-source', agent });
      openSessionContextMenu(testSession(sessionId), 40, 40);
    },
    contextGrokLabel: () => [...document.querySelectorAll('.session-menu-item')]
      .find((item) => item.textContent.toUpperCase().includes('OPEN IN GROK BUILD'))?.querySelector('.smi-label')?.textContent || '',
    openContextAdvisory() {
      const item = [...document.querySelectorAll('.session-menu-item')]
        .find((candidate) => candidate.textContent.toUpperCase().includes('OPEN IN GROK BUILD'));
      if (!item) throw new Error('Missing Grok Build context-menu action');
      item.click();
    },
    contextAdvisoryVisible: () => !$('#modal-grok-advisory').classList.contains('hidden'),
    contextText: () => $('#grok-context-warning').textContent.replace(/\s+/g, ' ').trim(),
    contextConfirmEnabled: () => !$('#grok-context-confirm').disabled,
    acknowledgeContext(value = true) {
      $('#grok-context-enable').checked = value;
      $('#grok-context-enable').dispatchEvent(new Event('change', { bubbles: true }));
    },
    confirmContext() { $('#grok-context-confirm').click(); },
    sessionAgents: () => [...state.sessions.values()].map((session) => session.agent),
  };

  window.chromuxTestTerminalScroll = {
    addSession({ name = 'terminal-scroll-test', cols = 60, rows = 12, scrollback = 240, reducedMotion = false } = {}) {
      state.counter += 1;
      const session = newSessionShape({ id: 's' + state.counter, name, cwd: '/tmp', agent: 'codex' });
      const viewEls = buildSessionView(session);
      const tabEls = buildSessionTab(session);
      session.els = { ...viewEls, ...tabEls };
      applyBrowserLayout(session);
      const term = new Terminal({
        cols,
        rows,
        scrollback,
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1,
        theme: terminalThemeFor(),
      });
      term.open(viewEls.termHost);
      term.resize(cols, rows);
      session.term.term = term;
      session._fitCalls = 0;
      session._fitViewportMoves = 0;
      session.term.fit = () => fitTerminalPreservingViewport(session, () => {
        session._fitCalls += 1;
        const before = term.buffer.active.viewportY;
        term.scrollToBottom();
        if (term.buffer.active.viewportY !== before) session._fitViewportMoves += 1;
      });
      session._reducedMotion = Boolean(reducedMotion);
      session._scrollEvents = 0;
      session._scrollEventDisposable = term.onScroll(() => { session._scrollEvents += 1; });
      installTerminalScrollToBottom(session, { reducedMotion: () => session._reducedMotion });
      state.sessions.set(session.id, session);
      apply({ type: 'session-created', sessionId: session.id, name, cwd: session.cwd, agent: session.agent });
      activateSession(session.id);
      flushRender();
      return session.id;
    },
    addGeometrySession({ name = 'terminal-geometry-test', scrollback = 240 } = {}) {
      state.counter += 1;
      const session = newSessionShape({ id: 's' + state.counter, name, cwd: '/tmp', agent: 'codex' });
      const viewEls = buildSessionView(session);
      const tabEls = buildSessionTab(session);
      session.els = { ...viewEls, ...tabEls };
      applyBrowserLayout(session);
      const term = new Terminal({
        cols: 60,
        rows: 12,
        scrollback,
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1,
        theme: terminalThemeFor(),
      });
      const fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      term.open(viewEls.termHost);
      session.term.term = term;
      session.term.fitAddon = fitAddon;
      session._fitCalls = 0;
      session._fitViewportMoves = 0;
      session.term.fit = () => fitTerminalPreservingViewport(session, () => {
        session._fitCalls += 1;
        const before = term.buffer.active.viewportY;
        fitAddon.fit();
        if (term.buffer.active.viewportY !== before) session._fitViewportMoves += 1;
      });
      session._reducedMotion = true;
      session._scrollEvents = 0;
      session._scrollEventDisposable = term.onScroll(() => { session._scrollEvents += 1; });
      installTerminalScrollToBottom(session, { reducedMotion: () => true });
      state.sessions.set(session.id, session);
      apply({ type: 'session-created', sessionId: session.id, name, cwd: session.cwd, agent: session.agent });
      activateSession(session.id);
      flushRender();
      session.term.fit();
      return session.id;
    },
    write(id, data) {
      return new Promise((resolve) => testSession(id).term.term.write(String(data), resolve));
    },
    writeLines(id, count, prefix = 'scrollback line') {
      const data = Array.from({ length: count }, (_, index) => `${prefix} ${index}\r\n`).join('');
      return new Promise((resolve) => testSession(id).term.term.write(data, resolve));
    },
    scrollLines(id, amount) { testSession(id).term.term.scrollLines(amount); },
    scrollToBottom(id) { testSession(id).term.term.scrollToBottom(); },
    resize(id, cols, rows) { testSession(id).term.term.resize(cols, rows); },
    setHostHeight(id, height) {
      const session = testSession(id);
      session.els.termHost.style.flex = 'none';
      session.els.termHost.style.height = `${Math.max(1, Number(height) || 1)}px`;
      session.term.fit();
    },
    refit(id) { testSession(id).term.fit(); },
    setViewWidth(id, width = null) {
      const view = testSession(id).els.view;
      if (width === null) {
        view.style.inset = '';
        view.style.width = '';
      } else {
        view.style.inset = '0 auto 0 0';
        view.style.width = `${Math.max(320, Number(width) || 320)}px`;
      }
    },
    setBrowserCollapsed(id, collapsed) { setBrowserCollapsed(testSession(id), Boolean(collapsed)); },
    setReducedMotion(id, reduced) { testSession(id)._reducedMotion = Boolean(reduced); },
    setAlternate(id, active) {
      const sequence = active ? '\x1b[?1049h' : '\x1b[?1049l';
      return new Promise((resolve) => testSession(id).term.term.write(sequence, resolve));
    },
    click(id) { testSession(id).els.scrollToBottom.click(); },
    wheel(id) {
      testSession(id).els.termHost.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -1 }));
    },
    pointer(id) {
      testSession(id).els.termHost.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    },
    focus(id) { activateSession(id); flushRender(); },
    state(id) {
      const session = testSession(id);
      const control = session.els.scrollToBottom;
      const hostRect = session.els.termHost.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      const controlStyle = getComputedStyle(control);
      const xterm = session.els.termHost.querySelector('.xterm');
      const screen = session.els.termHost.querySelector('.xterm-screen');
      const xtermRect = xterm ? xterm.getBoundingClientRect() : null;
      const screenRect = screen ? screen.getBoundingClientRect() : null;
      return {
        ...terminalScrollState(session),
        hidden: control.classList.contains('hidden'),
        animating: Boolean(session.term.scrollToBottom.animationFrame),
        fitCalls: session._fitCalls,
        fitViewportMoves: session._fitViewportMoves,
        scrollEvents: session._scrollEvents,
        focused: document.activeElement === session.els.termHost.querySelector('.xterm-helper-textarea'),
        label: control.textContent,
        title: control.title,
        ariaLabel: control.getAttribute('aria-label'),
        bottomInset: hostRect.bottom - controlRect.bottom,
        centerOffset: ((controlRect.left + controlRect.right) / 2) - ((hostRect.left + hostRect.right) / 2),
        color: controlStyle.color,
        background: controlStyle.backgroundColor,
        hostHeight: hostRect.height,
        xtermTopInset: xtermRect ? xtermRect.top - hostRect.top : null,
        xtermBottomInset: xtermRect ? hostRect.bottom - xtermRect.bottom : null,
        screenTopInset: screenRect ? screenRect.top - hostRect.top : null,
        screenBottomInset: screenRect ? hostRect.bottom - screenRect.bottom : null,
        screenHeight: screenRect ? screenRect.height : null,
        theme: document.body.dataset.theme,
        mode: document.body.dataset.themeMode,
      };
    },
    dispose(id) {
      const session = testSession(id);
      session._scrollEventDisposable.dispose();
      session.term.scrollToBottom.dispose();
      session.term.term.dispose();
      session.els.view.remove();
      session.els.tab.remove();
      state.sessions.delete(id);
      if (state.activeId === id) state.activeId = state.sessions.keys().next().value || null;
      flushRender();
    },
  };

  window.chromuxTestThemes = {
    ids: () => [...THEME_IDS],
    modes: () => [...THEME_MODE_IDS],
    current: () => state.ui.theme,
    currentMode: () => state.ui.themeMode,
    stored: () => {
      try { return window.localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
    },
    storedMode: () => {
      try { return window.localStorage.getItem(THEME_MODE_STORAGE_KEY); } catch { return null; }
    },
    modeFromStorage: () => storedThemeMode(),
    select(theme) {
      const button = document.querySelector(`[data-theme-option="${theme}"]`);
      if (!button) throw new Error(`Unknown theme: ${theme}`);
      button.click();
      return state.ui.theme;
    },
    selectedCards: () => [...document.querySelectorAll('[data-theme-option][aria-pressed="true"]')]
      .map((button) => button.dataset.themeOption),
    selectMode(mode) {
      const button = document.querySelector(`button[data-theme-mode="${mode}"]`);
      if (!button) throw new Error(`Unknown theme mode: ${mode}`);
      button.click();
      return state.ui.themeMode;
    },
    selectedModes: () => [...document.querySelectorAll('button[data-theme-mode][aria-pressed="true"]')]
      .map((button) => button.dataset.themeMode),
    bodyTheme: () => document.body.dataset.theme,
    bodyMode: () => document.body.dataset.themeMode,
    windowButtonPosition: () => state.ui.windowButtonPosition && { ...state.ui.windowButtonPosition },
    async addContextMenuSession() {
      const session = await createSession({
        name: 'context-menu-test',
        cwd: '/tmp/chromux-context-menu',
        agent: 'codex',
      });
      return session.id;
    },
    sessionTab: (id) => testSession(id).els.tab,
    addTerminalSession({
      rows = 24,
      content = '',
      inputBuffer = '',
      focused = false,
      turnState = 'unknown',
      complete = true,
      disposed = false,
    } = {}) {
      state.counter += 1;
      const session = newSessionShape({ id: 's' + state.counter, name: 'theme-test', cwd: '/tmp', agent: 'codex' });
      const assignments = [];
      const refreshes = [];
      const options = {};
      Object.defineProperty(options, 'theme', {
        configurable: true,
        get: () => assignments.at(-1),
        set(value) {
          if (disposed) throw new Error('disposed terminal');
          assignments.push(value);
        },
      });
      session.term.typedInputBuf = inputBuffer;
      session.turn.state = turnState;
      session.term.term = complete ? {
        options,
        rows,
        refresh(start, end) {
          if (disposed) throw new Error('disposed terminal');
          refreshes.push([start, end]);
        },
      } : { options };
      session._themeTest = { assignments, refreshes, content, focused };
      state.sessions.set(session.id, session);
      return session.id;
    },
    terminalSession(id) {
      const session = testSession(id);
      const test = session._themeTest;
      return {
        assignments: test.assignments.map((palette) => ({ ...palette })),
        distinctAssignments: new Set(test.assignments).size,
        refreshes: test.refreshes.map((range) => [...range]),
        rows: Number(session.term.term.rows) || 0,
        content: test.content,
        inputBuffer: session.term.typedInputBuf,
        focused: test.focused,
        turnState: session.turn.state,
      };
    },
    clearTerminalEvents() {
      for (const session of state.sessions.values()) {
        if (!session._themeTest) continue;
        session._themeTest.assignments.length = 0;
        session._themeTest.refreshes.length = 0;
      }
    },
    reset() {
      try {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
        window.localStorage.removeItem(THEME_MODE_STORAGE_KEY);
      } catch { /* unavailable */ }
      applyThemeMode('light', { persist: false });
      return applyTheme('liquid-glass', { persist: false });
    },
  };

  window.chromuxTestShellAdoption = {
    addShellSession(opts = {}) {
      return addFakeSession({ name: 'shell-test', agent: '', cwd: '/tmp', ...opts });
    },
    type(id, data) {
      const rewrite = handleTerminalInput(testSession(id), data);
      flushRender();
      return rewrite ? { ...rewrite } : null;
    },
    adoptRows(rows) {
      const adopted = adoptPtyAgentRows(rows);
      flushRender();
      return adopted;
    },
    scan(force = true) {
      return scanPtyAgentDescendants(force).then((count) => {
        flushRender();
        return count;
      });
    },
    rewrite(line) {
      const rewrite = rewriteShellLaunchLine(line);
      return rewrite ? { ...rewrite } : null;
    },
    agent: (id) => testSession(id).agent,
    header: (id) => testSession(id).els.termLabel.innerHTML,
    ptyInputs: (id) => (testSession(id)._ptyInputs || []).join(''),
    snapshot: () => snapshotOpenSessions(),
    turnState: (id) => ({ ...testSession(id).turn }),
    events: () => state.events.map((event) => ({ ...event })),
  };

  window.chromuxTestDiagnostics = {
    addSession: addRenderableTestSession,
    focus(id) { activateSession(id); flushRender(); },
    select(id) {
      const selector = $('#diagnostic-session');
      selector.value = id;
      selector.dispatchEvent(new Event('change', { bubbles: true }));
      flushRender();
    },
    selected: () => state.ui.diagnosticSessionId,
    close(id) { closeSession(id); flushRender(); },
    exit(id, exitCode = 0) { apply({ type: 'session-exited', sessionId: id, exitCode }); flushRender(); },
    emit(id, event, detail = null) { apply({ type: 'turn-signal', sessionId: id, signal: event, detail }); flushRender(); },
    queue(id, url) { apply({ type: 'preview-queued', sessionId: id, url, source: 'TERM' }); renderQueue(testSession(id)); flushRender(); },
    selectRail(mode) { selectRailMode(mode); flushRender(); },
    setUpdatePhase(phase) { setUpdateQueuePhase(phase); flushRender(); },
    injectAttentionKind(id, kind) {
      const node = document.querySelector(`#thread-list .attention-item[data-session-id="${CSS.escape(id)}"] .attention-kind`);
      if (!node) throw new Error(`Missing attention row: ${id}`);
      node.textContent = kind;
      invalidate('diagnostics');
      flushRender();
    },
    injectTabIndicator(id, kind) { testSession(id).els.dot.className = `tab-dot ${kind}`; invalidate('diagnostics'); flushRender(); },
    visible: () => !$('#developer-diagnostics').classList.contains('hidden'),
    groupText: () => $('#diagnostic-groups').textContent,
    mismatches: () => document.querySelectorAll('#diagnostic-groups .mismatch').length,
    events: () => [...document.querySelectorAll('#diagnostic-events .diagnostic-event')].map((node) => node.textContent),
    selectorLabels: () => [...$('#diagnostic-session').options].map((option) => option.textContent),
    enableRestartMock() { state.testDevModeRestart = { calls: [] }; },
    restartCalls: () => state.testDevModeRestart ? state.testDevModeRestart.calls.map((call) => ({ ...call })) : [],
    toggleDevMode(enabled) {
      const toggle = $('#settings-developer-mode'); toggle.checked = Boolean(enabled);
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    },
    flushRender,
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
  const termLabel = document.createElement('span');
  const placeholder = document.createElement('div');
  webHost.appendChild(placeholder);
  document.body.appendChild(queuePanel);
  return {
    termLabel,
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
    $('#modal-resources').classList.add('hidden');
    $('#modal-new').classList.add('hidden');
    $('#modal-detect').classList.add('hidden');
    $('#drawer-log').classList.add('hidden');
    closeSessionSearch({ restoreFocus: true });
    invalidate('shortcutDebug');
  }
});

document.addEventListener('click', (event) => {
  closeSessionContextMenu();
  if (!event.target.closest('#session-search-panel') && !event.target.closest('#tab-actions')) closeSessionSearch();
  invalidate('shortcutDebug');
});
document.addEventListener('focusin', () => invalidate('shortcutDebug'));
document.addEventListener('focusout', () => setTimeout(() => invalidate('shortcutDebug'), 0));
window.addEventListener('blur', () => {
  closeSessionContextMenu();
  closeSessionSearch();
  invalidate('shortcutDebug');
});
window.addEventListener('resize', positionSessionSearch);

setInterval(() => {
  scanPtyAgentDescendants(false).catch(() => {});
}, SHELL_ADOPTION_SCAN_MS);

setInterval(() => {
  if (!$('#modal-resources').classList.contains('hidden')) refreshResources().catch(() => {});
}, 2000);

setInterval(() => {
  if (state.env && state.env.devMode) invalidate('diagnostics');
}, 1000);

setInterval(() => {
  if (state.ui.railMode !== 'git') return;
  for (const root of state.ui.gitDiffs.keys()) loadGitDiff(root, { force: true });
}, 2000);

// boot
(async () => {
  state.favoritesReady = window.chromux.favoritesRead().then((favorites) => {
    state.favorites = Array.isArray(favorites) ? favorites : [];
    renderAllFavorites();
  }).catch(() => { state.favorites = []; });
  await state.favoritesReady;
  state.projects = await window.chromux.projectsRead().catch(() => []);
  state.env = await window.chromux.getEnv();
  state.restoreSessions = state.env.restoreSessions || null;
  window.chromux.onUpdateStatus((status) => renderUpdateStatus(status));
  window.chromux.onPreventSleepStatus((status) => renderPreventSleepStatus(status));
  $('#storage-path').textContent = state.env.capturesDir.replace(state.env.home, '~');
  $('.sb-ver').textContent = `chromux ${state.env.version || '0.6.0'} — prototype`;
  $('#settings-developer-mode').checked = Boolean(state.env.devMode);
  renderPreventSleepStatus();
  renderDeveloperDiagnostics();
  await autoRestoreWorkspace().catch((err) => {
    renderRestoreWarning([{ name: 'restore failed', cwd: err.message, agent: 'chromux' }]);
  });
  await checkUpdates(false).catch(() => {});
  updateBadges();
  renderAttentionQueue();
  renderShortcutDebug();
  reportShortcutFocusContext();
})();
