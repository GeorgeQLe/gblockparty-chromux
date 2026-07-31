// Chromux v1 — renderer. Sessions (xterm ↔ pty), 1:1 paired browser panes,
// preview detection, review queue, element picker, capture → claude -p.
'use strict';

/* global Terminal, FitAddon, SerializeAddon */

const $ = (sel) => document.querySelector(sel);

const THEME_STORAGE_KEY = 'chromux.theme';
const THEME_MODE_STORAGE_KEY = 'chromux.themeMode';
const TAB_ACTIVITY_STORAGE_KEY = 'chromux.tabActivityIndicators';
const RAIL_MODE_STORAGE_KEY = 'chromux.railMode';
const THREAD_SORT_STORAGE_KEY = 'chromux.threadSort';
const THREAD_PREVIEW_SIZE_STORAGE_KEY = 'chromux.threadPreviewSize';
const TAB_GROUPS_STORAGE_KEY = 'chromux.sessionTabGroups';
const BROWSER_FULLSCREEN_BEHAVIOR_STORAGE_KEY = 'chromux.browserFullscreenBehavior';
const BROWSER_CHROMUX_TOP_INSET_PROPERTY = '--browser-chromux-top-inset';
const COMPOSER_NEW_SESSION_TARGET = '__new_session__';
const THEME_IDS = new Set(['blueprint', 'retro-os', 'streak', 'liquid-glass']);
const THEME_MODE_IDS = new Set(['light', 'dark']);
const THEME_LABELS = {
  blueprint: 'Blueprint',
  'retro-os': 'Retro-OS',
  streak: 'Streak',
  'liquid-glass': 'Liquid Glass',
};
const RAIL_MODES = new Set(['threads', 'git']);
const GIT_FILTERS = new Set(['action', 'stale', 'all']);
const THREAD_SORT_MODES = new Set(['recent', 'az']);
const THREAD_PREVIEW_SIZES = new Set(['compact', 'comfortable', 'large']);
const BROWSER_FULLSCREEN_BEHAVIORS = new Set(['workspace', 'cycle', 'chromux']);
const BROWSER_LAYOUT_MODES = new Set(['paired', 'terminal', 'browserWorkspace', 'browserChromux']);
const RESTORE_ATTENTION_TYPES = new Set([
  'permission', 'authentication', 'input', 'rateLimited', 'toolFailed', 'delivery', 'completed',
]);
const MAX_RESTORE_ATTENTION_RECORDS = 20;
const MAX_CUSTOM_TAB_GROUPS = 100;
const CUSTOM_TAB_GROUP_ID_RE = /^group-[a-z0-9-]{1,64}$/;
const GIT_SESSION_PURPOSE = 'git-worktree';
const GIT_REVIEW_PROMPT = 'Review the current Git status for this worktree. Summarize the branch, staged, unstaged, untracked, conflicted, ahead/behind, and stale state. Recommend the safest next actions, but do not mutate Git or submit anything until I approve.';
const GIT_COMPOSER_INSERTS = Object.freeze([
  ['review', 'REVIEW STATUS', GIT_REVIEW_PROMPT],
  ['conflicts', 'RESOLVE CONFLICTS', 'Inspect the current merge or rebase conflicts in this worktree. Explain each conflict and propose a safe resolution plan. Preserve user-owned changes and do not resolve, stage, or commit until I approve.'],
  ['commit', 'PREPARE COMMIT', 'Review the current worktree changes and prepare a commit plan: intended scope, files, validation, and a concise commit message. Do not stage or commit until I approve.'],
  ['sync', 'SYNC / PUBLISH', 'Review the branch, upstream, ahead/behind, and remote state. Propose the safest non-force sync or publish sequence, including validation and rollback considerations. Do not fetch, pull, push, or publish until I approve.'],
  ['github', 'REVIEW ISSUE / PR', 'Review the relevant GitHub issue or pull request for this worktree. Summarize requirements, checks, review feedback, and the safest next implementation step. Do not change GitHub state until I approve.'],
  ['stale', 'AUDIT STALE STATE', 'Audit stale worktrees and stashes associated with this repository. Identify what is safe to retain, archive, or remove, with evidence. Do not delete or mutate anything until I approve.'],
  ['vercel', 'PREPARE VERCEL', 'Prepare this repository for its saved Vercel deployment mapping. Verify the current worktree, branch, validation, and deployment prerequisites without deploying. Leave the reviewed VERCEL · READY action as the only shipping step.'],
]);

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

function storedThreadSort() {
  try {
    const value = window.localStorage.getItem(THREAD_SORT_STORAGE_KEY);
    const normalized = THREAD_SORT_MODES.has(value) ? value : 'recent';
    if (value !== normalized) window.localStorage.setItem(THREAD_SORT_STORAGE_KEY, normalized);
    return normalized;
  } catch { return 'recent'; }
}

function storedThreadPreviewSize() {
  try {
    const value = window.localStorage.getItem(THREAD_PREVIEW_SIZE_STORAGE_KEY);
    return THREAD_PREVIEW_SIZES.has(value) ? value : 'comfortable';
  } catch { return 'comfortable'; }
}

function storedBrowserFullscreenBehavior() {
  try {
    const value = window.localStorage.getItem(BROWSER_FULLSCREEN_BEHAVIOR_STORAGE_KEY);
    return BROWSER_FULLSCREEN_BEHAVIORS.has(value) ? value : 'chromux';
  } catch { return 'chromux'; }
}

function sanitizeCustomTabGroupName(value) {
  const name = String(value || '').trim();
  return name.length >= 1 && name.length <= 80 ? name : null;
}

function sanitizeCustomTabGroupId(value) {
  const id = String(value || '');
  return CUSTOM_TAB_GROUP_ID_RE.test(id) ? id : null;
}

function storedTabGroups() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TAB_GROUPS_STORAGE_KEY) || 'null');
    if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.enabled !== 'boolean' || !Array.isArray(parsed.groups)) {
      return { enabled: false, groups: [] };
    }
    const names = new Set();
    const ids = new Set();
    const groups = [];
    if (parsed.groups.length > MAX_CUSTOM_TAB_GROUPS) return { enabled: false, groups: [] };
    for (const row of parsed.groups) {
      const id = sanitizeCustomTabGroupId(row && row.id);
      const name = sanitizeCustomTabGroupName(row && row.name);
      const folded = name && name.toLocaleLowerCase();
      if (!id || !name || ids.has(id) || names.has(folded)) return { enabled: false, groups: [] };
      ids.add(id);
      names.add(folded);
      groups.push({ id, name });
    }
    return { enabled: parsed.enabled, groups };
  } catch {
    return { enabled: false, groups: [] };
  }
}

const storedTabGroupState = storedTabGroups();

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
  scaffolderConfig: null,
  windowsSetup: null,
  events: [], // ring buffer of applied events (diagnostics), max EVENT_RING_MAX
  ui: {
    theme: storedTheme(),
    themeMode: storedThemeMode(),
    windowButtonPosition: null,
    tabActivityIndicators: storedTabActivityIndicators(),
    railMode: storedRailMode(),
    threadSort: storedThreadSort(),
    threadPreviewSize: storedThreadPreviewSize(),
    browserFullscreenBehavior: storedBrowserFullscreenBehavior(),
    tabGroupsEnabled: storedTabGroupState.enabled,
    customTabGroups: storedTabGroupState.groups,
    focusedTabGroupId: null,
    lastActiveSessionByGroup: new Map(),
    gitRoots: new Map(), // exact cwd -> { value: string|null|undefined, promise }
    gitDiffs: new Map(), // repository root -> { value: summary|null|undefined, promise }
    gitInventory: null,
    gitInventoryPromise: null,
    gitInventoryError: null,
    gitFilter: 'action',
    gitSearch: '',
    inboxTriage: new Map(),
    inboxQueueIndex: 0,
    railExpanded: new Map(),
    threadPreview: null,
    threadPreviewOpenTimer: null,
    reducedMotionOverride: null,
    captureModal: null, // { captureId, pngBase64, payloadBase } while composing/delivering
    captureApproval: null,
    recording: null,
    captureMedia: null, // renderer E2E dependency seam; null in production
    dirty: new Set(),
    rafScheduled: false,
    lastQueueShortcutFocus: null,
    hoverTabSessionId: null,
    diagnosticSessionId: null,
    launcherMode: 'open',
    projectCreationPending: false,
    vercel: {
      sessionId: null,
      generation: 0,
      busy: false,
      capability: null,
      discovery: null,
      profiles: [],
      projects: [],
      project: null,
      profileId: '',
      review: null,
      jobs: [],
      job: null,
    },
    windowsSetupStage: 'system',
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
  pendingQueueNavigation: null, // runtime-only { sessionId, tabId, url }
  resumeRetryWarning: null,
  codexUpdate: {
    phase: 'checking',
    status: null,
    queue: [],
    nextSequence: 0,
    progress: '',
    checkPromise: null,
    releasePromise: null,
    failOpenWarning: null,
  },
  lifecyclePrompt: null,
  testInstallUpdateResult: null,
  testUpdateInstallTrace: null,
  testCodexLaunchExecutor: null,
  testRestoreFailureNames: null,
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
  visibleTextBytes: 24 * 1024,
  reloadThrottleMs: 3000,
  shortcutDebugStaleMs: 1500,
  resumeStartupExitMs: 15000,
  composerDraftBytes: 64 * 1024,
  composerContextReferenceBytes: 2048,
  stagedBrowserContexts: 5,
  restoreAttentionDetailBytes: 4096,
  browserQueueItems: 50,
  previewTurnCandidates: 24,
  previewFallbackMs: 1500,
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
    main.onclick = () => { openOrFocusBrowserTab(state.sessions.get(state.activeId) || session, favorite.url, favorite.title); };
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
    white: '#173b62', brightWhite: '#173b62',
  },
  'retro-os-light': {
    background: '#ffffff', foreground: '#141414', cursor: '#30309a', cursorAccent: '#ffffff',
    selectionBackground: 'rgba(48,48,154,0.24)', black: '#141414', brightBlack: '#666666',
    red: '#9b1c1c', brightRed: '#d6393b', green: '#1f7a34', brightGreen: '#37b24d',
    yellow: '#a05a00', brightYellow: '#e8940a', blue: '#30309a', brightBlue: '#5656c7',
    magenta: '#7d2c85', brightMagenta: '#a94eb3', cyan: '#0b6a7d', brightCyan: '#18a5c0',
    white: '#141414', brightWhite: '#141414',
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
    white: '#293244', brightWhite: '#293244',
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
    white: '#172231', brightWhite: '#172231',
  },
};

const TERMINAL_MINIMUM_CONTRAST_RATIO = 4.5;

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

function setCustomTabGroupError(message = '') {
  const error = $('#custom-tab-group-error');
  if (!error) return;
  error.textContent = message;
  error.classList.toggle('hidden', !message);
}

function renderCustomTabGroups() {
  const toggle = $('#settings-tab-groups');
  if (toggle) toggle.checked = state.ui.tabGroupsEnabled;
  const host = $('#custom-tab-groups');
  if (!host) return;
  host.innerHTML = '';
  for (const group of state.ui.customTabGroups) {
    const row = document.createElement('div');
    row.className = 'custom-tab-group-row';
    row.dataset.groupId = group.id;
    const name = document.createElement('span');
    name.className = 'custom-tab-group-label';
    name.textContent = group.name;
    const count = document.createElement('span');
    count.className = 'custom-tab-group-count';
    const memberCount = orderedSessions().filter((session) => session.customTabGroupId === group.id).length;
    count.textContent = `${memberCount} SESSION${memberCount === 1 ? '' : 'S'}`;
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'qi-btn';
    rename.textContent = 'RENAME';
    rename.onclick = () => {
      const next = window.prompt('Rename custom group', group.name);
      if (next === null) return;
      const result = renameCustomTabGroup(group.id, next);
      setCustomTabGroupError(result.error || '');
    };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'qi-btn';
    remove.textContent = 'DELETE';
    remove.onclick = () => deleteCustomTabGroup(group.id);
    row.append(name, count, rename, remove);
    host.appendChild(row);
  }
  if (!state.ui.customTabGroups.length) {
    const empty = document.createElement('div');
    empty.className = 'custom-tab-groups-empty';
    empty.textContent = 'No custom groups yet.';
    host.appendChild(empty);
  }
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
    label.textContent = 'UNAVAILABLE';
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
    x: Math.round(rect.left + 14),
    y: 14 + Math.round(rect.top + (rect.height - 44) / 2),
  };
  state.ui.windowButtonPosition = position;
  window.chromux.setWindowButtonPosition(position);
  return position;
}

function syncBrowserChromuxTopInset() {
  const app = $('#app');
  if (!app) return null;
  const measuredTop = Number(app.getBoundingClientRect().top);
  const top = Number.isFinite(measuredTop) ? Math.max(0, measuredTop) : 0;
  document.documentElement.style.setProperty(BROWSER_CHROMUX_TOP_INSET_PROPERTY, `${top}px`);
  return top;
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
  syncBrowserChromuxTopInset();
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
  syncBrowserChromuxTopInset();
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
  const preview = state.ui.threadPreview;
  if (preview) requestAnimationFrame(() => {
    if (state.ui.threadPreview !== preview) return;
    positionThreadPreview();
    scaleThreadPreviewTerminal();
  });
  return next;
}

applyTheme(state.ui.theme, { persist: false });
applyTabActivityIndicators(state.ui.tabActivityIndicators, { persist: false });
applyThreadPreviewSize(state.ui.threadPreviewSize, { persist: false });
applyBrowserFullscreenBehavior(state.ui.browserFullscreenBehavior, { persist: false });

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
const PREVIEW_PROBE_RETRY_DELAYS_MS = [0, 250, 750, 1500];
const SERVER_READY_POLL_MS = 500;
const SERVER_READY_DEADLINE_MS = 15000;

function isProbeableLoopbackUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return ['http:', 'https:'].includes(parsed.protocol)
      && !parsed.username
      && !parsed.password
      && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''));
  } catch {
    return false;
  }
}

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
    visibility: item.visibility === 'browser' ? 'browser' : 'attention',
    ts: Number.isFinite(item.ts) ? item.ts : Date.now(),
    liveness: isProbeableLoopbackUrl(item.url) ? 'checking' : null,
    probeGeneration: 0,
  };
}

function queueItemForPreview(url, source, detail = {}) {
  return normalizeQueueItem({
    url,
    source,
    reason: detail.reason || queueReasonForSource(source),
    detectedText: detail.detectedText || null,
    visibility: detail.visibility,
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

const OSC_COLOR_REPLY_SIGNATURE_LIMIT = 24;
const OSC_COLOR_REPLY_CONTENT_LIMIT = 256;

function recordOscColorReplySignature(termState, content) {
  if (!termState || typeof content !== 'string'
    || !/^(?:10|11|12);[^\x00-\x1f\x7f]{1,252}$/u.test(content)) return;
  const signatures = Array.isArray(termState.oscColorReplySignatures)
    ? termState.oscColorReplySignatures : [];
  const existing = signatures.indexOf(content);
  if (existing >= 0) signatures.splice(existing, 1);
  signatures.push(content);
  if (signatures.length > OSC_COLOR_REPLY_SIGNATURE_LIMIT) {
    signatures.splice(0, signatures.length - OSC_COLOR_REPLY_SIGNATURE_LIMIT);
  }
  termState.oscColorReplySignatures = signatures;
}

function sanitizeTerminalUserInput(termState, data) {
  const raw = String(data || '');
  let inOsc = Boolean(termState && termState.oscInputActive);
  let escapePending = Boolean(termState && termState.oscInputEscapePending);
  let introducerPending = Boolean(termState && termState.oscInputIntroducerPending);
  let oscContent = termState && typeof termState.oscInputContent === 'string'
    ? termState.oscInputContent : '';
  let sanitized = '';

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (inOsc) {
      if (character === '\x07' || character === '\x9c') {
        recordOscColorReplySignature(termState, oscContent);
        inOsc = false;
        escapePending = false;
        oscContent = '';
        continue;
      }
      if (escapePending) {
        if (character === '\\') {
          recordOscColorReplySignature(termState, oscContent);
          inOsc = false;
          escapePending = false;
          oscContent = '';
          continue;
        }
        escapePending = false;
      }
      if (character === '\x1b') {
        escapePending = true;
        continue;
      }
      if (oscContent.length < OSC_COLOR_REPLY_CONTENT_LIMIT) oscContent += character;
      continue;
    }
    if (introducerPending) {
      introducerPending = false;
      if (character === ']') {
        inOsc = true;
        escapePending = false;
        oscContent = '';
        continue;
      }
      sanitized += '\x1b';
    }
    if (character === '\x9d') {
      inOsc = true;
      escapePending = false;
      oscContent = '';
      continue;
    }
    if (character === '\x1b') {
      if (raw[index + 1] === ']') {
        inOsc = true;
        escapePending = false;
        oscContent = '';
        index += 1;
      } else if (index + 1 >= raw.length) {
        introducerPending = true;
      } else {
        sanitized += character;
      }
      continue;
    }
    sanitized += character;
  }

  if (termState) {
    termState.oscInputActive = inOsc;
    termState.oscInputEscapePending = escapePending;
    termState.oscInputIntroducerPending = introducerPending;
    termState.oscInputContent = oscContent;
  }
  return sanitized;
}

function removeCorrelatedOscColorReplyResidue(termState, value) {
  let text = String(value || '');
  let matched = false;
  const signatures = Array.isArray(termState && termState.oscColorReplySignatures)
    ? [...termState.oscColorReplySignatures].sort((left, right) => right.length - left.length)
    : [];
  const variants = [...new Set(signatures.flatMap((signature) => signature ? [
    `]${signature}\\`,
    `]${signature}`,
    `${signature}\\`,
    signature,
  ] : []))].sort((left, right) => right.length - left.length);
  for (const variant of variants) {
    if (!text.includes(variant)) continue;
    matched = true;
    text = text.split(variant).join('');
  }
  return { text, matched };
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
    } else if (character >= ' ') insertPendingTerminalText(termState, character);
  }
}

function recordCodexCompletionIntent(session) {
  const termState = session && session.term;
  if (!termState || session.agent !== 'codex') return false;
  const cursor = Math.min(termState.typedInputBuf.length, Math.max(0, Number(termState.typedInputCursor) || 0));
  const prefix = termState.typedInputBuf.slice(0, cursor);
  const token = prefix.match(/\$[A-Za-z0-9:_-]*$/u);
  if (!token || token[0].length < 2) {
    termState.codexCompletionIntent = null;
    return false;
  }
  termState.codexCompletionIntent = {
    shadowPrefix: prefix,
    tokenPrefix: token[0],
  };
  return true;
}

function isCodexCompletionCandidate(intent, value) {
  if (!intent || typeof intent.shadowPrefix !== 'string'
    || typeof intent.tokenPrefix !== 'string' || typeof value !== 'string') return false;
  const beforeToken = intent.shadowPrefix.slice(0, -intent.tokenPrefix.length);
  if (!value.startsWith(beforeToken)) return false;
  const completed = value.slice(beforeToken.length).match(/^\$[A-Za-z0-9:_-]+(?=\s|$)/u);
  return Boolean(completed
    && completed[0].length > intent.tokenPrefix.length
    && completed[0].startsWith(intent.tokenPrefix));
}

const CODEX_PROMPT_GLYPH_RE = /^\s*[›❯](?:\s|$)/u;
const CODEX_PROMPT_PLACEHOLDER_RE = /^(?:ask codex(?: anything)?|type (?:a )?(?:message|prompt)|write a prompt)[.…]*$/iu;
const CODEX_PROMPT_CHROME_RE = /(?:\?\s+for shortcuts|\bcontext(?:\s+(?:100|[1-9]?\d)%)?\s+left\b|^\s*choose an option:)/iu;
const CODEX_FRAME_EDGE_RE = /^\s*[╭╰┌└┏┗╔╚].*[╮╯┐┘┓┛╗╝]\s*$/u;
const CODEX_FRAME_VERTICAL_RE = /^\s*[│┃║]\s?(.*?)(?:\s?[│┃║])?\s*$/u;
const CODEX_NUMERIC_CHOOSER_SELECTED_RE = /^\s*[›❯]\s*([1-9])\.\s+\S/u;
const CODEX_NUMERIC_CHOOSER_OPTION_RE = /^\s*(?:[›❯]\s*)?([1-9])\.\s+\S/u;
const CODEX_NUMERIC_CHOOSER_FOOTER_RE = /\b(?:enter|return)\b.{0,80}\b(?:confirm|submit|select|continue|proceed)\b|\b(?:confirm|submit|select|continue|proceed)\b.{0,80}\b(?:enter|return)\b/iu;
const AGENT_STARTUP_TIMEOUT_MS = 15_000;
const AGENT_STARTUP_BUFFER_ROWS = 1024;
const AGENT_STARTUP_PHASES = new Set(['starting', 'ready', 'stalled', 'revealed']);

function terminalBufferRow(buffer, index, endColumn = null) {
  const line = buffer && typeof buffer.getLine === 'function' ? buffer.getLine(index) : null;
  if (!line || typeof line.translateToString !== 'function') return null;
  return {
    text: line.translateToString(true),
    cursorText: Number.isFinite(endColumn) ? line.translateToString(false, 0, endColumn) : null,
    wrapped: Boolean(line.isWrapped),
  };
}

function codexPromptRowContent(text, { trimEnd = true } = {}) {
  const raw = String(text || '');
  const framed = raw.match(CODEX_FRAME_VERTICAL_RE);
  if (framed) return framed[1].replace(/\s+$/u, '');
  return trimEnd ? raw.replace(/\s+$/u, '') : raw;
}

function hasActiveCodexNumericChooser(session) {
  if (!session || session.agent !== 'codex') return false;
  const term = session.term && session.term.term;
  const buffer = term && term.buffer && term.buffer.active;
  if (!buffer || !Number.isFinite(buffer.viewportY) || !Number.isFinite(buffer.length)) return false;
  const visibleStart = Math.max(0, buffer.viewportY);
  const visibleRows = Number.isFinite(term.rows) ? Math.max(1, term.rows) : 1;
  const visibleEnd = Math.min(buffer.length - 1, visibleStart + visibleRows - 1);
  const rows = [];
  for (let index = visibleStart; index <= visibleEnd; index += 1) {
    const row = terminalBufferRow(buffer, index);
    rows.push({
      index,
      text: row ? codexPromptRowContent(row.text).trim() : '',
    });
  }

  const footerRows = rows.filter((row) => CODEX_NUMERIC_CHOOSER_FOOTER_RE.test(row.text));
  for (let footerIndex = footerRows.length - 1; footerIndex >= 0; footerIndex -= 1) {
    const footer = footerRows[footerIndex];
    const afterFooter = rows.filter((row) => row.index > footer.index && row.text);
    if (afterFooter.some((row) => CODEX_PROMPT_GLYPH_RE.test(row.text))) continue;
    const chooserStart = Math.max(visibleStart, footer.index - 12);
    const chooserRows = rows.filter((row) => row.index >= chooserStart && row.index < footer.index);
    const selectedRows = chooserRows.map((row) => {
      const match = row.text.match(CODEX_NUMERIC_CHOOSER_SELECTED_RE);
      return match ? { ...row, number: match[1] } : null;
    }).filter(Boolean);
    const optionRows = chooserRows.map((row) => {
      const match = row.text.match(CODEX_NUMERIC_CHOOSER_OPTION_RE);
      return match ? { ...row, number: match[1] } : null;
    }).filter(Boolean);
    if (selectedRows.some((selected) => optionRows.some((option) => (
      option.number !== selected.number && Math.abs(option.index - selected.index) <= 5
    )))) return true;
  }
  return false;
}

function readCodexRenderedPrompt(session) {
  const term = session && session.term && session.term.term;
  const buffer = term && term.buffer && term.buffer.active;
  if (!buffer || !Number.isFinite(buffer.baseY) || !Number.isFinite(buffer.cursorY)) {
    return { status: 'unsupported', text: '' };
  }
  const cursorRow = buffer.baseY + buffer.cursorY;
  const scanStart = Math.max(0, cursorRow - 1024);
  const scanEnd = Math.min(buffer.length - 1, cursorRow + 16);
  let promptStart = -1;
  for (let index = cursorRow; index >= scanStart; index -= 1) {
    const row = terminalBufferRow(buffer, index);
    if (!row) break;
    const content = codexPromptRowContent(row.text);
    if (CODEX_PROMPT_GLYPH_RE.test(content)) {
      promptStart = index;
      break;
    }
    if (index < cursorRow && (CODEX_FRAME_EDGE_RE.test(row.text) || CODEX_PROMPT_CHROME_RE.test(content))) break;
  }
  if (promptStart < 0) return { status: 'unsupported', text: '' };

  let promptEnd = cursorRow;
  while (promptEnd + 1 <= scanEnd) {
    const next = terminalBufferRow(buffer, promptEnd + 1);
    if (!next || !next.wrapped) break;
    promptEnd += 1;
  }
  let framed = false;
  let hasChrome = false;
  const chromeRows = [
    ...Array.from({ length: Math.min(3, promptStart - scanStart) }, (_, offset) => promptStart - 1 - offset),
    ...Array.from({ length: Math.max(0, scanEnd - promptEnd) }, (_, offset) => promptEnd + 1 + offset),
  ];
  for (const index of chromeRows) {
    const row = terminalBufferRow(buffer, index);
    if (!row) continue;
    if (CODEX_FRAME_EDGE_RE.test(row.text)) framed = true;
    if (CODEX_PROMPT_CHROME_RE.test(codexPromptRowContent(row.text))) hasChrome = true;
  }
  let value = '';
  for (let index = promptStart; index <= promptEnd; index += 1) {
    const endsAtCursor = index === cursorRow && Number.isFinite(buffer.cursorX);
    const row = terminalBufferRow(buffer, index, endsAtCursor ? buffer.cursorX : null);
    if (!row) return { status: 'ambiguous', text: '' };
    const rowText = endsAtCursor ? row.cursorText : row.text;
    let content = codexPromptRowContent(rowText, { trimEnd: !endsAtCursor });
    if (index === promptStart) content = content.replace(CODEX_PROMPT_GLYPH_RE, '');
    else if (!row.wrapped) content = content.replace(/^ {2}/u, '');
    value += index > promptStart && !row.wrapped ? `\n${content}` : content;
  }
  if (CODEX_PROMPT_PLACEHOLDER_RE.test(value.trim())) value = '';
  if (session.term.promptSnapshotInvalidated && value) return { status: 'ambiguous', text: value };
  if (!utf8WithinLimit(value)) return { status: 'overflow', text: '' };
  if (!framed && !hasChrome) return { status: 'ambiguous', text: value };
  return { status: 'resolved', text: value };
}

function renderedTerminalTail(term, maximumRows = AGENT_STARTUP_BUFFER_ROWS) {
  const buffer = term && term.buffer && term.buffer.active;
  if (!buffer || typeof buffer.getLine !== 'function' || !Number.isFinite(buffer.length)) return [];
  const end = Math.max(0, buffer.length - 1);
  const start = Math.max(0, end - Math.max(1, maximumRows) + 1);
  const lines = [];
  for (let index = start; index <= end; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) || '');
  }
  return lines;
}

function agentStartupPromptReady(session) {
  if (!session || !session.lifecycle.alive || !ADOPTABLE_AGENTS.has(session.agent)) return false;
  if (session.agent === 'codex') return readCodexRenderedPrompt(session).status === 'resolved';
  const term = session.term && session.term.term;
  const rendered = renderedTerminalCursorContext(term);
  if (!rendered) return false;
  const cursorLine = String(rendered.cursorLine || '').trimEnd();
  const lines = renderedTerminalTail(term);
  if (session.agent === 'claude') {
    return /^\s*❯(?:\s+.*)?$/u.test(cursorLine)
      && lines.some((line) => /\bClaude Code\b/iu.test(line));
  }
  if (session.agent === 'grok') {
    return /^\s*(?:>|›|❯)(?:\s+.*)?$/u.test(cursorLine)
      && lines.some((line) => /\bGrok(?:\s+Build)?\b/iu.test(line));
  }
  return false;
}

function resolveCurrentTerminalPrompt(session) {
  const shadow = session && session.term ? session.term.typedInputBuf : '';
  if (!session || !session.lifecycle.alive) {
    return { text: '', source: 'none', confidence: 'none', canClear: false };
  }
  if (session.agent !== 'codex') {
    return { text: shadow, source: 'shadow', confidence: 'fallback', canClear: Boolean(shadow) };
  }
  const rendered = readCodexRenderedPrompt(session);
  const correlated = removeCorrelatedOscColorReplyResidue(session.term, rendered.text);
  const completionProven = rendered.status === 'ambiguous'
    && isCodexCompletionCandidate(session.term.codexCompletionIntent, correlated.text);
  if (rendered.status === 'resolved' || completionProven) {
    const resolvedText = correlated.matched && shadow ? shadow : correlated.text;
    session.term.codexCompletionIntent = null;
    if (correlated.matched && !resolvedText) {
      return {
        text: '',
        source: 'codex-rendered-osc-residue',
        confidence: 'high',
        canClear: false,
      };
    }
    session.term.typedInputBuf = resolvedText;
    session.term.typedInputCursor = resolvedText.length;
    return {
      text: resolvedText,
      source: correlated.matched && shadow
        ? 'shadow-osc-residue'
        : (completionProven ? 'codex-rendered-completion' : 'codex-rendered'),
      confidence: 'high',
      canClear: Boolean(resolvedText),
    };
  }
  session.term.codexCompletionIntent = null;
  return {
    text: shadow,
    source: rendered.status === 'ambiguous' || rendered.status === 'overflow'
      ? `shadow-${rendered.status}` : 'shadow',
    confidence: rendered.status === 'unsupported' ? 'fallback' : 'low',
    canClear: Boolean(shadow) && rendered.status === 'unsupported',
  };
}

function trackTypedPreviewSuppressions(session, data) {
  if (!session || !data) return '';
  const t = session.term;
  const raw = String(data);
  if (/[\r\n]/.test(raw) && session.agent === 'codex') {
    // Capture Codex's canonical rendered editor before Enter invalidates the
    // prompt snapshot. resolveCurrentTerminalPrompt falls back to the bounded
    // keystroke shadow when the rendered prompt is unavailable or ambiguous.
    resolveCurrentTerminalPrompt(session);
  }
  if (/^[1-9]$/.test(raw) && hasActiveCodexNumericChooser(session)) {
    t.codexCompletionIntent = null;
    t.typedInputBuf = '';
    t.typedInputCursor = 0;
    t.promptSnapshotInvalidated = true;
    return '';
  }
  if (raw === '\t') recordCodexCompletionIntent(session);
  else t.codexCompletionIntent = null;
  if (/[\r\n]/.test(raw)) t.promptSnapshotInvalidated = true;
  else if (raw !== '\x15\x0b') t.promptSnapshotInvalidated = false;
  const submitted = /[\r\n]/.test(raw) ? submittedInputText(lineBufferAfterInput(t.typedInputBuf, raw.split(/[\r\n]/, 1)[0])) : '';
  updatePendingTerminalInput(t, data);
  if (submitted) {
    const hits = scanLineForPreviews(submitted);
    for (const hit of hits) {
      t.previewSuppress.push({ url: hit.url, source: hit.source, submittedText: submitted, remainingLines: PREVIEW_SUPPRESS_LINE_TTL, ts: Date.now() });
    }
    if (t.previewSuppress.length > PREVIEW_SUPPRESS_MAX) t.previewSuppress.splice(0, t.previewSuppress.length - PREVIEW_SUPPRESS_MAX);
  }
  return submitted;
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
        const generation = session.turn.generation;
        window.chromux.fileExists(p).then((ok) => {
          if (ok && generation === session.turn.generation) {
            routeTerminalPreviewCandidate(session, hit.url, hit.source, { detectedText: line });
          }
        });
      } else {
        routeTerminalPreviewCandidate(session, hit.url, hit.source, { detectedText: line });
      }
    }
    ageTypedPreviewSuppressions(session);
  }
}

function clearPreviewCandidates(session) {
  if (!session || !session.term) return;
  for (const candidate of session.term.previewCandidates || []) clearTimeout(candidate.timer);
  session.term.previewCandidates = [];
}

function previewTurnIsActive(session) {
  return Boolean(session && session.agent && ['pending', 'working'].includes(session.turn.state));
}

function rememberPreviewCandidate(session, url, source, detail = {}) {
  const candidates = session.term.previewCandidates;
  const existing = candidates.find((candidate) => candidate.url === url);
  if (existing) {
    existing.detectedText = detail.detectedText || existing.detectedText;
    return existing;
  }
  const candidate = {
    url,
    source,
    detectedText: detail.detectedText || null,
    generation: session.turn.generation,
    timer: null,
  };
  candidates.push(candidate);
  while (candidates.length > BOUNDS.previewTurnCandidates) {
    const removed = candidates.shift();
    clearTimeout(removed && removed.timer);
  }
  if (!session.turn.instrumented) {
    candidate.timer = setTimeout(() => {
      if (!state.sessions.has(session.id)
        || !session.term.previewCandidates.includes(candidate)
        || candidate.generation !== session.turn.generation) return;
      session.term.previewCandidates = session.term.previewCandidates.filter((item) => item !== candidate);
      routePreview(session, candidate.url, candidate.source, {
        detectedText: candidate.detectedText,
        visibility: 'browser',
      });
    }, BOUNDS.previewFallbackMs);
  }
  return candidate;
}

function routeTerminalPreviewCandidate(session, url, source, detail = {}) {
  if (previewTurnIsActive(session)) {
    rememberPreviewCandidate(session, url, source, detail);
    return { status: 'candidate' };
  }
  return routePreview(session, url, source, { ...detail, visibility: 'browser' });
}

function promotePreviewCandidates(session) {
  if (!session || !session.term.previewCandidates.length) return [];
  const generation = session.turn.generation;
  const candidates = session.term.previewCandidates.filter((candidate) => candidate.generation === generation);
  clearPreviewCandidates(session);
  return candidates.map((candidate) => routePreview(session, candidate.url, candidate.source, {
    detectedText: candidate.detectedText,
    visibility: 'browser',
  }));
}

// ───────────────────────────────────────────────────────────────────────────
// Terminal links — click a URL or .html path in the terminal
// to open it in the paired browser pane. Detects http(s) URLs plus absolute,
// ~/, and cwd-relative .html paths; paths must exist on disk to become links.
// ───────────────────────────────────────────────────────────────────────────

const LINK_URL_RE = /https?:\/\/[^\s"'<>\[\]{}]+/g;
const LINK_QUOTED_HTML_RE = /(["'`])((?:file:\/\/)?(?:~\/|\/|\.{1,2}\/)?[^"'`\r\n]+\.html?)\1/gi;
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
  openOrFocusBrowserTab(session, url);
}

function activateOsc8TerminalLink(session, text, event) {
  const url = normalizedBrowserUrl(text);
  if (!url || !/^https?:/i.test(url)) return false;
  event.preventDefault();
  openOrFocusBrowserTab(session, url);
  return true;
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
      const candidates = [];
      const overlaps = (a, b) => a.index < b.index + b.text.length && b.index < a.index + a.text.length;
      const push = (index, matchText, kind, resolve) => {
        candidates.push({ index, text: matchText, kind, resolve });
      };
      const resolveFile = (p) => window.chromux.resolveProjectHtml({
        sessionId: session.id,
        launchCwd: session.cwd,
        reference: p,
      });

      let m;
      LINK_URL_RE.lastIndex = 0;
      while ((m = LINK_URL_RE.exec(text)) !== null) {
        const cleaned = normalizePreviewUrl(m[0]);
        push(m.index, cleaned, 'url', () => Promise.resolve(cleaned));
      }
      LINK_QUOTED_HTML_RE.lastIndex = 0;
      while ((m = LINK_QUOTED_HTML_RE.exec(text)) !== null) {
        const p = m[2];
        push(m.index + m[0].indexOf(p), p, 'file', () => resolveFile(p));
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
        try {
          const result = await c.resolve();
          if (typeof result === 'string') c.url = normalizedBrowserUrl(result);
          else if (result && result.ok && result.url) c.url = normalizedBrowserUrl(result.url);
          else if (result && result.status === 'ambiguous') c.explorerQuery = result.query || c.text;
        } catch { c.url = null; }
      })).then(() => {
        // Overlap resolution happens only among candidates that resolved, so a
        // bogus absolute suffix (the "/index.html" inside "alignment/index.html")
        // can't shadow the real relative path. URLs win over file paths (a path
        // inside "http://host/x.html" stays part of the URL), then longer text.
        const resolved = candidates.filter((c) => c.url || c.explorerQuery);
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
          const explorerQuery = c.explorerQuery;
          links.push({
            text: c.text,
            range: {
              start: { x: (c.index % cols) + 1, y: start + Math.floor(c.index / cols) + 1 },
              end: { x: (endIndex % cols) + 1, y: start + Math.floor(endIndex / cols) + 1 },
            },
            decorations: { pointerCursor: true, underline: true },
            activate(event) {
              event.preventDefault();
              if (url) openOrFocusBrowserTab(session, url);
              else openHtmlExplorer(session, { query: explorerQuery });
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
        const previousTurnState = session.turn.state;
        tabStateChanged = window.chromuxAttention.applyTurnSignal(
          session.turn, event.signal, event.detail, Date.now(), event.envelope || null,
        );
        if (session.turn.state !== previousTurnState) session.lastActivityAt = Date.now();
        if ((tabStateChanged && ['needsInput', 'permission', 'authentication', 'rateLimited', 'toolFailed', 'completed']
          .includes(session.turn.state))
          || (session.agent === 'codex' && event.signal === 'turn-end')) {
          promotePreviewCandidates(session);
        }
        if (tabStateChanged && session.id === state.activeId && session.turn.state === 'completed') {
          session.turn.attentionSeenAt = Math.max(session.turn.attentionSeenAt || 0, session.turn.since || 0);
          window.chromuxAttention.consumeCompletedTurn(session.turn, Date.now());
        }
      }
      break;
    case 'user-input':
      // Only state-changing input is worth ring space — raw typing is noise.
      const submittedLine = session ? trackTypedPreviewSuppressions(session, event.data) : '';
      if (!session) return;
      const submitted = /[\r\n]/.test(String(event.data || ''));
      if (submitted) clearPreviewCandidates(session);
      if (submitted) session.lastActivityAt = Date.now();
      const inputTurnChanged = window.chromuxAttention.applyUserInputTurnTransition(
        session,
        event.data,
        Date.now(),
        submittedLine,
      );
      if (!inputTurnChanged) {
        if (submitted) invalidate('attention');
        return;
      }
      recorded = true;
      tabStateChanged = true;
      recordEvent({ type: 'user-input', sessionId: session.id, turnState: session.turn.state });
      break;
    case 'session-exited':
      if (session) {
        clearPreviewCandidates(session);
        tabStateChanged = session.lifecycle.alive;
        session.lifecycle.alive = false;
        session.term.codexCompletionIntent = null;
        session.lifecycle.exitCode = Number.isFinite(event.exitCode) ? event.exitCode : null;
        session.lifecycle.exitedAt = Date.now();
        for (const source of state.sessions.values()) renderComposerContexts(source);
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
        if (tabStateChanged) session.lastActivityAt = Date.now();
      } else if (session) {
        session.turn.acknowledged = true;
      }
      break;
    case 'preview-queued':
      if (session) {
        const item = queueItemForPreview(event.url, event.source || 'TERM', {
          reason: event.reason,
          detectedText: event.detectedText,
          visibility: event.visibility,
        });
        if (item) {
          session.browser.queue.push(item);
          if (session.browser.queue.length > BOUNDS.browserQueueItems) {
            const browserOnly = session.browser.queue.findIndex((candidate) => candidate.visibility === 'browser');
            session.browser.queue.splice(browserOnly >= 0 ? browserOnly : 0, 1);
          }
        }
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
  if (dirty.has('badges')) updateBadges();
  if (dirty.has('tabs') || (dirty.has('badges') && state.ui.tabGroupsEnabled)) renderTabs();
  if (dirty.has('captureChips')) renderCaptureChips();
  if (dirty.has('shortcutDebug')) renderShortcutDebug();
  if (dirty.has('diagnostics')) renderDeveloperDiagnostics();
}

// ───────────────────────────────────────────────────────────────────────────
// Session shape — explicit state domains. Identity is flat and immutable;
// lifecycle, turn, browser-pane, and terminal state live in their own domains.
// ───────────────────────────────────────────────────────────────────────────

function newSessionShape({
  id, name, cwd, agent, runtime = null, distro = null,
  sessionPurpose = null, worktreeIdentity = null, startupLoading = false,
}) {
  const capabilities = {
    claude: { turnStarted: 'native', inputRequired: 'native', permissionRequired: 'native', authenticationRequired: 'native', rateLimited: 'native', toolFailed: 'native', turnCompleted: 'native' },
    codex: { turnStarted: 'inferred', inputRequired: 'unavailable', permissionRequired: 'unavailable', authenticationRequired: 'unavailable', rateLimited: 'unavailable', toolFailed: 'unavailable', turnCompleted: 'native' },
    grok: { turnStarted: 'native', inputRequired: 'native', permissionRequired: 'native', authenticationRequired: 'native', rateLimited: 'native', toolFailed: 'native', turnCompleted: 'native' },
    '': { turnStarted: 'unavailable', inputRequired: 'unavailable', permissionRequired: 'unavailable', authenticationRequired: 'unavailable', rateLimited: 'unavailable', toolFailed: 'unavailable', turnCompleted: 'unavailable' },
  }[agent];
  return {
    id, name, cwd, agent,
    runtime: runtime || (state.env && state.env.runtime ? state.env.runtime.kind : 'host'),
    distro: distro || (state.env && state.env.runtime ? state.env.runtime.selectedDistro : null),
    sessionPurpose: sessionPurpose === GIT_SESSION_PURPOSE ? GIT_SESSION_PURPOSE : null,
    worktreeIdentity: sessionPurpose === GIT_SESSION_PURPOSE && worktreeIdentity
      ? {
        runtime: worktreeIdentity.runtime === 'wsl' ? 'wsl' : 'host',
        distro: worktreeIdentity.runtime === 'wsl' ? (worktreeIdentity.distro || null) : null,
        path: String(worktreeIdentity.path || cwd || ''),
      }
      : null,
    resumeId: null, lastActivityAt: Date.now(),
    customTabGroupId: null,
    restoredAttentionRecords: [], // historical snapshot records; separate from live turn/capture state
    capabilities,
    lifecycle: { alive: true, exitCode: null, exitedAt: null, resumeLaunch: null },
    turn: {
      state: 'unknown', // 'unknown' | 'pending' | 'working' | 'idle' | 'needsInput' | 'completed'
      instrumented: false, // true once a deterministic signal has arrived
      detail: null,
      since: 0,
      acknowledged: false, // explicit DISMISS for actionable non-completion states
      attentionSeenAt: 0, // retained for diagnostic history across completion consumption
      token: null, protocol: null, authoritative: false, hasV2: false, inputAt: 0, reason: null,
      source: null, confidence: null, turnId: null, eventId: null,
      eventIds: [], sequence: -1, stopped: false, authoritativeAt: 0,
      generation: 0, activityObserved: false, completionBlocked: false,
    },
    browser: createBrowserState(),
    term: {
      term: null,
      fitAddon: null,
      resizeObserver: null,
      serializer: null,
      fit: () => {},
      viewportY: null,
      fitting: false,
      scrollToBottom: null,
      lineBuf: '',
      signalBuf: '',
      titleBuf: '',
      synchronizedOutputActive: false,
      synchronizedOutputBuffer: '',
      synchronizedOutputPartial: '',
      synchronizedOutputBytes: 0,
      synchronizedOutputTimer: null,
      title: '',
      typedInputBuf: '',
      typedInputCursor: 0,
      codexCompletionIntent: null,
      oscInputActive: false,
      oscInputEscapePending: false,
      oscInputIntroducerPending: false,
      oscInputContent: '',
      oscColorReplySignatures: [],
      promptSnapshotInvalidated: false,
      previewSuppress: [],
      previewCandidates: [],
      startup: {
        phase: startupLoading && ADOPTABLE_AGENTS.has(agent) ? 'starting' : 'revealed',
        timer: null,
        exited: false,
        exitCode: null,
        revealReason: startupLoading && ADOPTABLE_AGENTS.has(agent) ? null : 'immediate',
        openComposerOnReveal: false,
      },
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
      fullBrowserOpen: false,
      routeTargetId: null,
      selectedAgent: agent || '',
      stagedContexts: [],
      routeBusy: false,
      routeError: '',
      routeStatus: '',
      routeBlockedTargetId: null,
      routeConfirmation: null,
    },
    els: null,
  };
}

function createBrowserState() {
  const browser = {
    tabs: [],
    activeTabId: null,
    tabCounter: 0,
    partitionId: globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    queue: [],
    serverLauncher: null,
    layoutMode: 'terminal',
    expansionReturnLayout: null,
    expandedGridTemplate: 'minmax(320px, 46%) 6px minmax(360px, 1fr)',
  };
  const activePage = () => browser.tabs.find((tab) => tab.id === browser.activeTabId && tab.type === 'page') || null;
  const ensurePage = () => {
    let tab = activePage();
    if (!tab) {
      browser.tabCounter += 1;
      tab = createPageTabState(`page-${browser.tabCounter}`, null, 'New tab');
      browser.tabs.push(tab);
      browser.activeTabId = tab.id;
    }
    return tab;
  };
  for (const key of ['webview', 'webContentsId', 'currentUrl', 'lastReload', 'consoleBuf', 'consoleTotal', 'picking', 'guestEditableFocused']) {
    Object.defineProperty(browser, key, {
      enumerable: false,
      configurable: false,
      get() {
        const tab = activePage();
        if (!tab) return ['consoleBuf'].includes(key) ? [] : (['consoleTotal', 'lastReload'].includes(key) ? 0 : (['picking', 'guestEditableFocused'].includes(key) ? false : null));
        return tab[key];
      },
      set(value) { ensurePage()[key] = value; },
    });
  }
  return browser;
}

function createPageTabState(id, url, title = '') {
  return {
    id,
    type: 'page',
    currentUrl: url || null,
    title: String(title || url || 'New tab').slice(0, 200),
    webview: null,
    webContentsId: null,
    lastReload: 0,
    consoleBuf: [],
    consoleTotal: 0,
    picking: false,
    guestEditableFocused: false,
    failedUrl: null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Review queue — approval-gated. Detected previews always queue; never auto-
// open the pane. Refresh only when the pane's own (already open) URL is
// re-emitted. User opens via QUEUE OPEN, terminal link click, or URL bar.
// ───────────────────────────────────────────────────────────────────────────

function routePreview(session, url, source, detail = {}) {
  const b = session.browser;
  const openTab = pageTabForUrl(session, url);
  if (openTab) {
    const now = Date.now();
    if (now - openTab.lastReload > BOUNDS.reloadThrottleMs && openTab.webview) {
      openTab.lastReload = now;
      try { openTab.webview.reload(); } catch { /* not ready */ }
      flashRefresh(session);
    }
    return { status: 'refreshed', url };
  }
  const queued = b.queue.find((q) => q.url === url);
  if (queued) {
    if (detail.visibility === 'attention' && queued.visibility !== 'attention') {
      queued.visibility = 'attention';
      queued.source = source;
      queued.reason = detail.reason || queueReasonForSource(source);
      queued.detectedText = detail.detectedText || queued.detectedText;
      renderQueue(session);
    }
    return { status: 'alreadyQueued', url };
  }
  apply({
    type: 'preview-queued',
    sessionId: session.id,
    url,
    source,
    reason: detail.reason,
    detectedText: detail.detectedText,
    visibility: detail.visibility,
  });
  renderQueue(session);
  probeQueuedPreview(session, url);
  return { status: 'queued', url };
}

function flashRefresh(session) {
  const el = session.els.refreshFlash;
  if (!el) return;
  el.classList.add('show');
  clearTimeout(session._flashT);
  session._flashT = setTimeout(() => el.classList.remove('show'), 1400);
}

function queuedPreview(session, url) {
  return session.browser.queue.find((item) => item.url === url) || null;
}

function waitForPreviewProbeDelay(delay) {
  return delay > 0 ? new Promise((resolve) => setTimeout(resolve, delay)) : Promise.resolve();
}

async function probeQueuedPreview(session, url, { retry = true } = {}) {
  const item = queuedPreview(session, url);
  if (!item || !isProbeableLoopbackUrl(url)) return 'unsupported';
  item.probeGeneration = (item.probeGeneration || 0) + 1;
  const generation = item.probeGeneration;
  item.liveness = 'checking';
  renderQueue(session);
  const delays = retry ? PREVIEW_PROBE_RETRY_DELAYS_MS : [0];
  for (const delay of delays) {
    await waitForPreviewProbeDelay(delay);
    if (!state.sessions.has(session.id) || queuedPreview(session, url) !== item || item.probeGeneration !== generation) {
      return 'cancelled';
    }
    let result;
    try { result = await window.chromux.previewProbe(url); } catch { result = { status: 'offline' }; }
    if (queuedPreview(session, url) !== item || item.probeGeneration !== generation) return 'cancelled';
    if (result && result.status === 'ready') {
      item.liveness = 'ready';
      renderQueue(session);
      return 'ready';
    }
    if (result && result.status === 'unsupported') {
      item.liveness = null;
      renderQueue(session);
      return 'unsupported';
    }
  }
  item.liveness = 'offline';
  renderQueue(session);
  return 'offline';
}

function queueLoopbackFailure(session, url) {
  if (!isProbeableLoopbackUrl(url)) return;
  let item = queuedPreview(session, url);
  if (!item) {
    apply({
      type: 'preview-queued',
      sessionId: session.id,
      url,
      source: 'TERM',
      reason: 'server connection failed',
      visibility: 'browser',
    });
    item = queuedPreview(session, url);
  }
  if (!item) return;
  item.probeGeneration = (item.probeGeneration || 0) + 1;
  item.liveness = 'offline';
  renderQueue(session);
}

function removeSuccessfulQueuedPreview(session, url) {
  if (!isProbeableLoopbackUrl(url) || !queuedPreview(session, url)) return;
  apply({ type: 'preview-opened', sessionId: session.id, url });
  renderQueue(session);
}

function closeServerLauncher(session) {
  if (!session?.browser?.serverLauncher) return;
  session.browser.serverLauncher = null;
  renderQueue(session);
}

async function openServerLauncher(session, item) {
  session.browser.serverLauncher = {
    url: item.url,
    loading: true,
    config: null,
    selectedScript: null,
    error: null,
    launching: false,
  };
  renderQueue(session);
  let config;
  try { config = await window.chromux.projectConfig(session.cwd); } catch {
    config = { valid: false, reason: 'Project scripts could not be read.' };
  }
  const launcher = session.browser.serverLauncher;
  if (!state.sessions.has(session.id) || !launcher || launcher.url !== item.url) return;
  launcher.loading = false;
  launcher.config = config;
  launcher.selectedScript = config.valid ? (config.recommendedScript || null) : null;
  renderQueue(session);
}

async function pollLaunchedServer(session, url) {
  const deadline = Date.now() + SERVER_READY_DEADLINE_MS;
  while (Date.now() < deadline) {
    if (!state.sessions.has(session.id)) return 'cancelled';
    let result;
    try { result = await window.chromux.previewProbe(url); } catch { result = { status: 'offline' }; }
    const item = queuedPreview(session, url);
    if (!item) return result?.status || 'cancelled';
    if (result?.status === 'ready') {
      item.liveness = 'ready';
      renderQueue(session);
      return 'ready';
    }
    await waitForPreviewProbeDelay(Math.min(SERVER_READY_POLL_MS, Math.max(0, deadline - Date.now())));
  }
  const item = queuedPreview(session, url);
  if (item) {
    item.liveness = 'offline';
    renderQueue(session);
  }
  return 'offline';
}

async function launchServerScript(session, launcher) {
  if (!launcher || launcher.launching || !launcher.selectedScript) return null;
  launcher.launching = true;
  launcher.error = null;
  renderQueue(session);
  let resolved;
  try {
    resolved = await window.chromux.projectScriptResolve(session.cwd, launcher.selectedScript);
  } catch {
    resolved = { valid: false, reason: 'Project script could not be validated.' };
  }
  if (!resolved.valid) {
    launcher.launching = false;
    launcher.error = resolved.reason || 'Project script is unavailable.';
    renderQueue(session);
    return null;
  }
  try {
    const serverSession = await createSession({
      name: `${resolved.projectName || session.name} dev server`,
      cwd: resolved.cwd,
      agent: '',
      command: resolved.command,
      activate: false,
    });
    session.browser.serverLauncher = null;
    const item = queuedPreview(session, launcher.url);
    if (item) item.liveness = 'checking';
    renderQueue(session);
    pollLaunchedServer(session, launcher.url);
    return serverSession;
  } catch (error) {
    launcher.launching = false;
    launcher.error = error?.message || 'Server session could not be created.';
    renderQueue(session);
    return null;
  }
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
    row.className = `queue-item${item.liveness ? ` ${item.liveness}` : ''}`;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `${item.reason || queueReasonForSource(item.source)}. ${item.url}${item.liveness ? `. ${item.liveness === 'ready' ? 'Server ready' : (item.liveness === 'checking' ? 'Checking server' : 'Server offline')}` : ''}`);
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
    if (item.liveness) {
      const status = document.createElement('span');
      status.className = `qi-status ${item.liveness}`;
      status.textContent = item.liveness === 'ready'
        ? 'READY'
        : (item.liveness === 'checking' ? 'CHECKING…' : 'SERVER OFFLINE');
      main.appendChild(status);
    }
    const open = document.createElement('button');
    open.className = 'qi-btn open';
    open.dataset.queueOpenUrl = item.url;
    open.textContent = 'OPEN';
    open.onclick = () => {
      apply({ type: 'preview-opened', sessionId: session.id, url: item.url });
      const tab = openOrFocusBrowserTab(session, item.url, '', { retryExisting: true });
      beginPendingQueueNavigation(session, tab, item.url);
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
    row.append(src, main, pin);
    if (item.liveness === 'offline') {
      const recheck = document.createElement('button');
      recheck.className = 'qi-btn recheck';
      recheck.dataset.queueRecheckUrl = item.url;
      recheck.textContent = 'RECHECK';
      recheck.onclick = () => probeQueuedPreview(session, item.url);
      const start = document.createElement('button');
      start.className = 'qi-btn start-server';
      start.dataset.queueStartUrl = item.url;
      start.textContent = 'START SERVER…';
      start.setAttribute('aria-haspopup', 'dialog');
      start.setAttribute('aria-expanded', String(session.browser.serverLauncher?.url === item.url));
      start.onclick = (event) => {
        event.stopPropagation();
        if (session.browser.serverLauncher?.url === item.url) closeServerLauncher(session);
        else openServerLauncher(session, item);
      };
      row.append(recheck, start);
    }
    row.append(open, dismiss);
    const launcher = session.browser.serverLauncher;
    if (launcher?.url === item.url) {
      const popover = document.createElement('div');
      popover.className = 'server-launcher-popover';
      popover.setAttribute('role', 'dialog');
      popover.setAttribute('aria-label', 'Start project server');
      popover.onclick = (event) => event.stopPropagation();
      const title = document.createElement('div');
      title.className = 'server-launcher-title';
      title.textContent = 'START PROJECT SERVER';
      const copy = document.createElement('div');
      copy.className = 'server-launcher-copy';
      if (launcher.loading) copy.textContent = 'Reading validated package scripts…';
      else if (!launcher.config?.valid) copy.textContent = launcher.config?.reason || 'No supported package scripts were found.';
      else copy.textContent = 'Runs in a visible shell tab. Opening the preview still requires OPEN.';
      popover.append(title, copy);
      if (launcher.config?.valid) {
        const select = document.createElement('select');
        select.className = 'server-launcher-select';
        select.setAttribute('aria-label', 'Project server script');
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Choose a package script…';
        select.appendChild(placeholder);
        for (const script of launcher.config.scripts) {
          const option = document.createElement('option');
          option.value = script;
          option.textContent = script === launcher.config.recommendedScript ? `${script} — recommended` : script;
          select.appendChild(option);
        }
        select.value = launcher.selectedScript || '';
        select.onchange = () => {
          launcher.selectedScript = select.value || null;
          launcher.error = null;
          renderQueue(session);
        };
        const launch = document.createElement('button');
        launch.className = 'qi-btn server-launcher-run';
        launch.textContent = launcher.launching ? 'STARTING…' : 'START';
        launch.disabled = launcher.launching || !launcher.selectedScript;
        launch.onclick = () => launchServerScript(session, launcher);
        popover.append(select, launch);
      }
      if (launcher.error) {
        const error = document.createElement('div');
        error.className = 'server-launcher-error';
        error.textContent = launcher.error;
        popover.appendChild(error);
      }
      row.appendChild(popover);
    }
    host.appendChild(row);
  }
  session.els.queueBadge.textContent = String(queue.length);
  session.els.queueBadge.classList.toggle('zero', queue.length === 0);
  session.els.queueBtn.classList.toggle('attention', queue.length > 0);
  invalidate('attention', 'badges', 'shortcutDebug');
}

function updateBadges() {
  let queued = 0;
  for (const s of state.sessions.values()) {
    if (!s.els || !s.els.tabBadge) continue;
    queued += s.browser.queue.length;
    const attentionCount = s.browser.queue.filter((item) => item.visibility !== 'browser').length;
    s.els.tabBadge.textContent = String(attentionCount);
    s.els.tabBadge.classList.toggle('zero', attentionCount === 0);
  }
  $('#g-queued').textContent = String(queued);
  $('#g-sessions').textContent = String(state.sessions.size);
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
  if (['j', 'b', 'f', 't', 'd', 'q', 'c', 'v'].includes(lower)) return lower.toUpperCase();
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
    browserCollapsed: activeSession ? activeSession.browser.layoutMode === 'terminal' : null,
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
  const tabGroups = state.ui.tabGroupsEnabled ? effectiveTabGroups() : null;
  const guardReason = guardedShortcutDisabledReason(context);
  const activeSession = context.activeSessionId ? state.sessions.get(context.activeSessionId) : null;
  const definitions = [];
  const windowsPrimary = state.env && state.env.primaryModifier === 'control';
  const primaryLabel = windowsPrimary ? 'Ctrl+' : '⌘';
  const primaryModifiers = windowsPrimary ? { control: true } : { meta: true };

  for (let i = 0; i < 9; i += 1) {
    definitions.push({
      id: `session-${i + 1}`,
      label: `${primaryLabel}${i + 1}`,
      key: String(i + 1),
      modifiers: primaryModifiers,
      kind: 'guarded',
      index: i,
      order: i,
    });
  }
  definitions.push(
    { id: 'queue-next', label: `${primaryLabel}J`, key: 'J', modifiers: primaryModifiers, kind: 'guarded', order: 20 },
    { id: 'browser-toggle', label: `${primaryLabel}Shift+B`, key: 'B', modifiers: { ...primaryModifiers, shift: true }, kind: 'guarded', order: 21 },
    { id: 'browser-fullscreen', label: `${primaryLabel}Shift+F`, key: 'F', modifiers: { ...primaryModifiers, shift: true }, kind: 'guarded', order: 22 },
    { id: 'composer-open', label: `${primaryLabel}Shift+Enter`, key: 'Enter', modifiers: { ...primaryModifiers, shift: true }, kind: 'guarded', order: 23 },
    { id: 'quit', label: `${primaryLabel}Q`, key: 'Q', modifiers: primaryModifiers, kind: 'global', order: 30 },
    { id: 'new-session', label: `${primaryLabel}T`, key: 'T', modifiers: primaryModifiers, kind: 'document', order: 31 },
    { id: 'create-project', label: `${primaryLabel}N`, key: 'N', modifiers: primaryModifiers, kind: 'document', order: 32 },
    { id: 'detect', label: `${primaryLabel}D`, key: 'D', modifiers: primaryModifiers, kind: 'document', order: 33 },
    { id: 'escape', label: 'Esc', key: 'Esc', modifiers: {}, kind: 'document', order: 34 },
  );

  return definitions.map((shortcut) => {
    let disabledReason = null;
    let description = '';

    if (shortcut.id.startsWith('session-')) {
      if (tabGroups) {
        const target = tabGroups[shortcut.index];
        disabledReason = guardReason || (target ? null : `no group ${shortcut.index + 1}`);
        description = target ? `target/cycle ${target.name}` : 'group slot empty';
      } else {
        const target = sessions[shortcut.index];
        disabledReason = guardReason || (target ? null : `no session ${shortcut.index + 1}`);
        description = target ? `activate ${target.name}` : 'session slot empty';
      }
    } else if (shortcut.id === 'queue-next') {
      disabledReason = guardReason || (context.queueCount > 0 ? null : 'queue empty');
      description = context.queueCount > 0 ? `${context.queueCount} queued` : 'queue empty';
    } else if (shortcut.id === 'browser-toggle') {
      disabledReason = guardReason || (activeSession ? null : 'no active session');
      description = activeSession
        ? (activeSession.browser.layoutMode === 'terminal' ? 'open browser' : 'shut browser')
        : 'no active session';
    } else if (shortcut.id === 'browser-fullscreen') {
      disabledReason = guardReason || (activeSession ? null : 'no active session');
      description = activeSession
        ? browserLayoutAction(activeSession).title
        : 'no active session';
    } else if (shortcut.id === 'composer-open') {
      disabledReason = guardReason || (activeSession ? null : 'no active session');
      description = activeSession ? 'open composer' : 'no active session';
    } else if (shortcut.id === 'quit') {
      disabledReason = guardReason;
      description = 'guarded quit';
    } else if (shortcut.id === 'new-session') {
      disabledReason = guardReason;
      description = 'open existing project';
    } else if (shortcut.id === 'create-project') {
      disabledReason = guardReason;
      description = 'create project';
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
// Browser pane — page and project-explorer tabs scoped to one terminal session.
// ───────────────────────────────────────────────────────────────────────────

function normalizedBrowserUrl(raw) {
  try {
    const parsed = new URL(String(raw || '').trim());
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch { return null; }
}

function browserTabId(session, prefix) {
  session.browser.tabCounter += 1;
  return `${prefix}-${session.browser.tabCounter}`;
}

function activeBrowserTab(session) {
  return session.browser.tabs.find((tab) => tab.id === session.browser.activeTabId) || null;
}

function activePageTab(session) {
  const tab = activeBrowserTab(session);
  return tab && tab.type === 'page' ? tab : null;
}

function pageTabForUrl(session, url) {
  const normalized = normalizedBrowserUrl(url);
  return normalized
    ? session.browser.tabs.find((tab) => tab.type === 'page' && normalizedBrowserUrl(tab.currentUrl) === normalized) || null
    : null;
}

function updateActiveBrowserControls(session) {
  if (!session.els) return;
  const tab = activePageTab(session);
  session.els.urlBar.value = tab ? (tab.currentUrl || '') : '';
  if (session.els.back) session.els.back.disabled = !tab || !tab.webview;
  if (session.els.reload) session.els.reload.disabled = !tab || !tab.webview;
  session.els.pickBtn.disabled = !tab || !tab.webview;
  session.els.captureBtn.disabled = !tab || !tab.webview;
  renderConsoleChip(session);
  renderFavoriteToolbar(session);
  invalidate('captureChips', 'shortcutDebug');
}

function activateBrowserTab(session, tabId) {
  const tab = session.browser.tabs.find((item) => item.id === tabId);
  if (!tab) return false;
  const previous = activePageTab(session);
  if (previous && previous.picking && previous.id !== tab.id) cancelPicking(session, previous);
  session.browser.activeTabId = tab.id;
  for (const item of session.browser.tabs) {
    if (item.type === 'page' && item.webview) item.webview.classList.toggle('hidden', item.id !== tab.id);
  }
  if (session.els.explorerHost) session.els.explorerHost.classList.toggle('hidden', tab.type !== 'explorer');
  if (session.els.placeholder) session.els.placeholder.classList.toggle('hidden', tab.type === 'explorer' || Boolean(tab.currentUrl));
  if (tab.type === 'explorer') renderHtmlExplorer(session, tab);
  else ensurePageWebview(session, tab);
  renderBrowserTabs(session);
  updateActiveBrowserControls(session);
  return true;
}

function createPageBrowserTab(session, url = null, title = '', { activate = true, lazy = false } = {}) {
  const normalized = url ? normalizedBrowserUrl(url) : null;
  if (url && !normalized) return null;
  const tab = createPageTabState(browserTabId(session, 'page'), normalized, title);
  session.browser.tabs.push(tab);
  if (activate) {
    session.browser.activeTabId = tab.id;
    if (!lazy) activateBrowserTab(session, tab.id);
    else renderBrowserTabs(session);
  } else {
    renderBrowserTabs(session);
  }
  return tab;
}

function beginPendingQueueNavigation(session, tab, url) {
  const normalized = normalizedBrowserUrl(url);
  state.pendingQueueNavigation = session && tab && tab.type === 'page' && normalized
    ? { sessionId: session.id, tabId: tab.id, url: normalized }
    : null;
}

function pendingQueueNavigationMatches(session, tab) {
  const pending = state.pendingQueueNavigation;
  return Boolean(pending && session && tab
    && pending.sessionId === session.id
    && pending.tabId === tab.id);
}

function redirectPendingQueueNavigation(session, tab, url) {
  if (!pendingQueueNavigationMatches(session, tab)) return false;
  const normalized = normalizedBrowserUrl(url);
  if (!normalized) return false;
  state.pendingQueueNavigation.url = normalized;
  return true;
}

function completePendingQueueNavigation(session, tab, loadedUrl) {
  if (!pendingQueueNavigationMatches(session, tab)) return false;
  const normalized = normalizedBrowserUrl(loadedUrl);
  if (!normalized || normalized !== state.pendingQueueNavigation.url) return false;
  state.pendingQueueNavigation = null;
  session.els.queuePanel.classList.add('hidden');
  return true;
}

function failPendingQueueNavigation(session, tab, failedUrl) {
  if (!pendingQueueNavigationMatches(session, tab)) return false;
  const pending = state.pendingQueueNavigation;
  const normalizedFailure = normalizedBrowserUrl(failedUrl);
  if (normalizedFailure && normalizedFailure !== pending.url) return false;
  state.pendingQueueNavigation = null;
  return true;
}

function clearPendingQueueNavigationForTab(session, tabId) {
  const pending = state.pendingQueueNavigation;
  if (!pending || !session || pending.sessionId !== session.id || pending.tabId !== tabId) return false;
  state.pendingQueueNavigation = null;
  return true;
}

function ensurePageWebview(session, tab) {
  if (!tab || tab.type !== 'page' || !tab.currentUrl || tab.webview) return;
  const wv = document.createElement('webview');
  wv.setAttribute('partition', `persist:chromux-${session.browser.partitionId}`);
  wv.setAttribute('preload', window.chromux.webviewPreloadPath);
  wv.setAttribute('src', tab.currentUrl);
  wv.dataset.sessionId = session.id;
  wv.dataset.browserTabId = tab.id;
  tab.webview = wv;
  wv.classList.toggle('hidden', session.browser.activeTabId !== tab.id);

  wv.addEventListener('console-message', (e) => {
    const levels = ['debug', 'info', 'warn', 'error'];
    tab.consoleBuf.push({
      ts: new Date().toISOString(),
      level: levels[e.level] || String(e.level),
      message: String(e.message).slice(0, BOUNDS.consoleMsgChars),
    });
    tab.consoleTotal += 1;
    if (tab.consoleBuf.length > BOUNDS.consoleTail) tab.consoleBuf.shift();
    if (activePageTab(session) === tab) renderConsoleChip(session);
  });
  const navigated = (url) => {
    tab.guestEditableFocused = false;
    tab.failedUrl = null;
    tab.currentUrl = url;
    if (!tab.title || tab.title === 'New tab') tab.title = url;
    if (activePageTab(session) === tab) updateActiveBrowserControls(session);
    renderBrowserTabs(session);
    removeSuccessfulQueuedPreview(session, url);
  };
  wv.addEventListener('did-start-navigation', (e) => {
    if (e.isMainFrame !== false) tab.failedUrl = null;
  });
  wv.addEventListener('did-redirect-navigation', (e) => {
    if (e.isMainFrame !== false) redirectPendingQueueNavigation(session, tab, e.url);
  });
  wv.addEventListener('did-navigate', (e) => navigated(e.url));
  wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) navigated(e.url); });
  wv.addEventListener('did-fail-load', (e) => {
    if (e.isMainFrame === false) return;
    const failedUrl = normalizedBrowserUrl(e.validatedURL || tab.currentUrl);
    failPendingQueueNavigation(session, tab, failedUrl);
    if (e.errorCode === -3) return;
    if (failedUrl) {
      tab.failedUrl = failedUrl;
      queueLoopbackFailure(session, failedUrl);
    }
  });
  wv.addEventListener('did-finish-load', () => {
    const loadedUrl = normalizedBrowserUrl(tab.currentUrl);
    if (loadedUrl && loadedUrl !== tab.failedUrl) removeSuccessfulQueuedPreview(session, loadedUrl);
    if (loadedUrl && loadedUrl !== tab.failedUrl) completePendingQueueNavigation(session, tab, loadedUrl);
  });
  wv.addEventListener('page-title-updated', (e) => {
    tab.title = String(e.title || tab.currentUrl || 'Page').slice(0, 200);
    renderBrowserTabs(session);
  });
  wv.addEventListener('dom-ready', () => {
    try { tab.webContentsId = wv.getWebContentsId(); } catch { /* ok */ }
    try {
      const title = String(wv.getTitle ? wv.getTitle() : '').trim();
      if (title) tab.title = title.slice(0, 200);
    } catch { /* ok */ }
    renderBrowserTabs(session);
    invalidate('shortcutDebug');
  });
  wv.addEventListener('blur', () => {
    tab.guestEditableFocused = false;
    invalidate('shortcutDebug');
  });
  wv.addEventListener('ipc-message', (e) => {
    if (e.channel === 'chromux-pick') onElementPicked(session, e.args[0] || {}, tab);
    else if (e.channel === 'chromux-pick-cancel') setPicking(session, false, tab);
    else if (e.channel === 'chromux-focused-editable') {
      tab.guestEditableFocused = Boolean((e.args[0] || {}).editable);
      invalidate('shortcutDebug');
    }
  });
  session.els.webHost.appendChild(wv);
}

function openInPane(session, url) {
  const normalized = normalizedBrowserUrl(url);
  if (!normalized) return null;
  const b = session.browser;
  if (b.layoutMode === 'terminal') setBrowserCollapsed(session, false);
  let tab = activePageTab(session);
  if (!tab) tab = createPageBrowserTab(session, normalized, normalized, { activate: true });
  else {
    tab.currentUrl = normalized;
    tab.lastReload = Date.now();
    tab.title = normalized;
    const hadWebview = Boolean(tab.webview);
    ensurePageWebview(session, tab);
    if (hadWebview && tab.webview) tab.webview.loadURL(normalized).catch(() => {});
    activateBrowserTab(session, tab.id);
  }
  return tab;
}

function openOrFocusBrowserTab(session, url, title = '', { retryExisting = false } = {}) {
  const normalized = normalizedBrowserUrl(url);
  if (!normalized) return null;
  if (session.browser.layoutMode === 'terminal') setBrowserCollapsed(session, false);
  const existing = pageTabForUrl(session, normalized);
  if (existing) {
    activateBrowserTab(session, existing.id);
    if (retryExisting && existing.webview) existing.webview.loadURL(normalized).catch(() => {});
    return existing;
  }
  return createPageBrowserTab(session, normalized, title || normalized, { activate: true });
}

function closeBrowserTab(session, tabId) {
  const index = session.browser.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return;
  clearPendingQueueNavigationForTab(session, tabId);
  const [tab] = session.browser.tabs.splice(index, 1);
  if (tab.type === 'page' && tab.webview) tab.webview.remove();
  if (session.browser.activeTabId === tabId) {
    const next = session.browser.tabs[Math.min(index, session.browser.tabs.length - 1)] || null;
    session.browser.activeTabId = next ? next.id : null;
  }
  if (session.browser.activeTabId) activateBrowserTab(session, session.browser.activeTabId);
  else {
    if (session.els.explorerHost) session.els.explorerHost.classList.add('hidden');
    session.els.placeholder.classList.remove('hidden');
    renderBrowserTabs(session);
    updateActiveBrowserControls(session);
  }
}

function renderBrowserTabs(session) {
  if (!session.els || !session.els.browserTabs) return;
  const host = session.els.browserTabs;
  host.innerHTML = '';
  for (const tab of session.browser.tabs) {
    const item = document.createElement('button');
    item.className = `browser-tab${tab.id === session.browser.activeTabId ? ' active' : ''}`;
    item.type = 'button';
    item.title = tab.type === 'explorer' ? 'Project HTML explorer' : (tab.currentUrl || tab.title);
    const label = document.createElement('span');
    label.className = 'browser-tab-title';
    label.textContent = tab.type === 'explorer' ? '⌕ Project HTML' : (tab.title || tab.currentUrl || 'New tab');
    const close = document.createElement('span');
    close.className = 'browser-tab-close';
    close.textContent = '×';
    close.setAttribute('role', 'button');
    close.setAttribute('aria-label', `Close ${label.textContent}`);
    close.onclick = (event) => { event.stopPropagation(); closeBrowserTab(session, tab.id); };
    item.append(label, close);
    item.onclick = () => activateBrowserTab(session, tab.id);
    host.appendChild(item);
  }
  const add = document.createElement('button');
  add.className = 'browser-tab-add';
  add.type = 'button';
  add.textContent = '+';
  add.title = 'New browser tab';
  add.onclick = () => {
    if (session.browser.layoutMode === 'terminal') setBrowserCollapsed(session, false);
    const tab = createPageBrowserTab(session, null, 'New tab', { activate: true });
    session.els.placeholder.classList.remove('hidden');
    session.els.urlBar.focus();
    return tab;
  };
  host.appendChild(add);
}

function looksLikeHtmlExplorerEntry(value) {
  const text = String(value || '').trim();
  return /^(?:file:|\/|\.{1,2}\/|~\/)/i.test(text) || /\.html?(?:[?#].*)?$/i.test(text);
}

function htmlExplorerTab(session) {
  return session.browser.tabs.find((tab) => tab.type === 'explorer') || null;
}

function openHtmlExplorer(session, { query = '', path: explorerPath = '' } = {}) {
  if (session.browser.layoutMode === 'terminal') setBrowserCollapsed(session, false);
  let tab = htmlExplorerTab(session);
  if (!tab) {
    tab = {
      id: browserTabId(session, 'explorer'),
      type: 'explorer',
      title: 'Project HTML',
      path: '',
      query: '',
      index: null,
      requestId: 0,
    };
    session.browser.tabs.push(tab);
  }
  if (typeof explorerPath === 'string') tab.path = explorerPath.replace(/^\/+|\/+$/g, '');
  if (typeof query === 'string') tab.query = query.slice(0, 500);
  activateBrowserTab(session, tab.id);
  return tab;
}

async function refreshHtmlExplorer(session, tab = htmlExplorerTab(session)) {
  if (!tab) return;
  tab.index = null;
  await renderHtmlExplorer(session, tab);
}

function htmlExplorerFolderRows(files, currentPath) {
  const prefix = currentPath ? `${currentPath}/` : '';
  const folders = new Set();
  const directFiles = [];
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash >= 0) folders.add(rest.slice(0, slash));
    else directFiles.push(file);
  }
  return {
    folders: [...folders].sort((a, b) => a.localeCompare(b)),
    files: directFiles.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function appendExplorerMessage(host, message, kind = '') {
  const row = document.createElement('div');
  row.className = `html-explorer-message${kind ? ` ${kind}` : ''}`;
  row.textContent = message;
  host.appendChild(row);
}

async function renderHtmlExplorer(session, tab) {
  if (!session.els || activeBrowserTab(session) !== tab) return;
  const host = session.els.explorerHost;
  host.classList.remove('hidden');
  const requestId = ++tab.requestId;
  host.innerHTML = '';
  appendExplorerMessage(host, 'INDEXING PROJECT HTML…');
  if (!tab.index) {
    try {
      tab.index = await window.chromux.projectHtmlIndex({ sessionId: session.id, launchCwd: session.cwd });
    } catch (error) {
      tab.index = { ok: false, error: error?.message || 'Unable to index project HTML.', files: [] };
    }
  }
  if (requestId !== tab.requestId || activeBrowserTab(session) !== tab) return;
  host.innerHTML = '';
  const toolbar = document.createElement('div');
  toolbar.className = 'html-explorer-toolbar';
  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'html-breadcrumb';
  const rootButton = document.createElement('button');
  rootButton.textContent = tab.index.root ? tab.index.root.split('/').filter(Boolean).pop() || '/' : 'project';
  rootButton.title = tab.index.root || '';
  rootButton.onclick = () => { tab.path = ''; tab.query = ''; renderHtmlExplorer(session, tab); };
  breadcrumb.appendChild(rootButton);
  let accumulated = '';
  for (const segment of tab.path.split('/').filter(Boolean)) {
    const slash = document.createElement('span'); slash.textContent = '/';
    const button = document.createElement('button'); button.textContent = segment;
    accumulated = accumulated ? `${accumulated}/${segment}` : segment;
    const target = accumulated;
    button.onclick = () => { tab.path = target; tab.query = ''; renderHtmlExplorer(session, tab); };
    breadcrumb.append(slash, button);
  }
  const filter = document.createElement('input');
  filter.className = 'html-explorer-filter';
  filter.type = 'search';
  filter.placeholder = 'Filter HTML files';
  filter.value = tab.query || '';
  filter.oninput = () => { tab.query = filter.value.slice(0, 500); renderHtmlExplorer(session, tab); };
  const refresh = document.createElement('button');
  refresh.className = 'head-btn'; refresh.textContent = 'REFRESH';
  refresh.onclick = () => refreshHtmlExplorer(session, tab);
  toolbar.append(breadcrumb, filter, refresh);
  host.appendChild(toolbar);
  if (!tab.index.ok) {
    appendExplorerMessage(host, tab.index.error || 'Unable to read this project.', 'error');
    return;
  }
  const files = Array.isArray(tab.index.files) ? tab.index.files : [];
  const query = String(tab.query || '').trim().toLowerCase();
  if (query) {
    const matches = files.filter((file) => file.path.toLowerCase().includes(query));
    if (!matches.length) appendExplorerMessage(host, `No project HTML matches “${tab.query}”.`);
    for (const file of matches) appendHtmlExplorerFile(session, host, file);
    return;
  }
  const rows = htmlExplorerFolderRows(files, tab.path);
  for (const folder of rows.folders) {
    const button = document.createElement('button');
    button.className = 'html-explorer-row folder';
    button.innerHTML = `<span aria-hidden="true">▸</span><span>${escapeHtml(folder)}</span>`;
    button.onclick = () => {
      tab.path = tab.path ? `${tab.path}/${folder}` : folder;
      renderHtmlExplorer(session, tab);
    };
    host.appendChild(button);
  }
  for (const file of rows.files) appendHtmlExplorerFile(session, host, file);
  if (!rows.folders.length && !rows.files.length) appendExplorerMessage(host, files.length ? 'No HTML files in this folder.' : 'No HTML files found in this project.');
}

function appendHtmlExplorerFile(session, host, file) {
  const button = document.createElement('button');
  button.className = 'html-explorer-row file';
  const name = document.createElement('span'); name.className = 'html-file-name'; name.textContent = file.name;
  const relative = document.createElement('span'); relative.className = 'html-file-path'; relative.textContent = file.path;
  button.append(name, relative);
  button.onclick = async () => {
    const result = await window.chromux.resolveProjectHtml({
      sessionId: session.id,
      launchCwd: session.cwd,
      reference: file.path,
    });
    if (result && result.ok && result.url) openOrFocusBrowserTab(session, result.url, file.name);
  };
  host.appendChild(button);
}

async function resolveHtmlEntry(session, value) {
  const result = await window.chromux.resolveProjectHtml({
    sessionId: session.id,
    launchCwd: session.cwd,
    reference: String(value || '').trim(),
  });
  if (result && result.ok && result.url) return openOrFocusBrowserTab(session, result.url, result.path || value);
  openHtmlExplorer(session, { query: result?.query || String(value || '').split('/').pop() || '' });
  return null;
}

function submitBrowserUrlEntry(session, raw) {
  const value = String(raw || '').trim();
  if (!value) return;
  session.els.urlSuggestions.classList.add('hidden');
  if (looksLikeHtmlExplorerEntry(value)) {
    resolveHtmlEntry(session, value);
    return;
  }
  let candidate = value;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;
  openInPane(session, candidate);
}

async function handleBrowserUrlInput(session, raw) {
  const value = String(raw || '').trim();
  const suggestions = session.els.urlSuggestions;
  if (!looksLikeHtmlExplorerEntry(value)) {
    suggestions.classList.add('hidden');
    return;
  }
  const tab = openHtmlExplorer(session, { query: value.split('/').pop() || value });
  session.els.urlBar.value = raw;
  let index;
  try { index = await window.chromux.projectHtmlIndex({ sessionId: session.id, launchCwd: session.cwd }); } catch { index = null; }
  if (!index || !index.ok || activeBrowserTab(session) !== tab) return;
  const needle = value.replace(/^file:/i, '').replace(/^.*\//, '').toLowerCase();
  const matches = index.files.filter((file) => file.path.toLowerCase().includes(needle)).slice(0, 8);
  suggestions.innerHTML = '';
  for (const file of matches) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = file.path;
    button.onmousedown = (event) => event.preventDefault();
    button.onclick = () => resolveHtmlEntry(session, file.path);
    suggestions.appendChild(button);
  }
  suggestions.classList.toggle('hidden', matches.length === 0);
}

function renderConsoleChip(session) {
  const b = activePageTab(session);
  const errors = b ? b.consoleBuf.filter((c) => c.level === 'error').length : 0;
  const chip = session.els.consoleChip;
  const total = b ? b.consoleTotal : 0;
  chip.textContent = errors > 0 ? `⚠ ${errors} err · ${total} logs` : `${total} logs`;
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

function isBrowserExpansionLayout(mode) {
  return mode === 'browserWorkspace' || mode === 'browserChromux';
}

function browserLayoutReturnMode(session) {
  const mode = session.browser.expansionReturnLayout;
  return mode === 'paired' || mode === 'terminal' ? mode : 'terminal';
}

function browserLayoutAction(session) {
  const mode = session.browser.layoutMode;
  const behavior = state.ui.browserFullscreenBehavior;
  if (isBrowserExpansionLayout(mode)) {
    if (behavior === 'cycle' && mode === 'browserChromux') return { mode: 'paired', title: 'Restore paired layout' };
    const returnMode = browserLayoutReturnMode(session);
    return {
      mode: returnMode,
      title: returnMode === 'paired' ? 'Restore paired layout' : 'Restore terminal layout',
    };
  }
  if (behavior === 'cycle' && mode === 'paired') {
    return { mode: 'terminal', title: 'Show full terminal' };
  }
  if (behavior === 'workspace') {
    return { mode: 'browserWorkspace', title: 'Fill paired browser area' };
  }
  return { mode: 'browserChromux', title: 'Fill Chromux with browser' };
}

function syncBrowserChromuxActiveClass() {
  const activeSession = state.sessions.get(state.activeId);
  document.body.classList.toggle(
    'browser-chromux-active',
    activeSession?.browser.layoutMode === 'browserChromux'
  );
}

function renderBrowserFullscreenToggle(button, currentMode, nextMode) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.classList.add('browser-fullscreen-icon');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.5');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  if (nextMode === 'terminal') {
    icon.innerHTML = '<path d="M2 4h4V2M14 4h-4V2M2 12h4v2M14 12h-4v2"></path><path d="M5 8h6"></path>';
  } else if (isBrowserExpansionLayout(currentMode)) {
    icon.innerHTML = '<path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4"></path>';
  } else {
    icon.innerHTML = '<path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"></path>';
  }
  button.replaceChildren(icon);
}

function browserFullscreenShortcutLabel() {
  return state.env && state.env.primaryModifier === 'control' ? 'Ctrl+Shift+F' : '⌘⇧F';
}

function composerOpenShortcutLabel() {
  return state.env && state.env.primaryModifier === 'control' ? 'Ctrl+Shift+Enter' : '⌘⇧Enter';
}

function applyBrowserLayout(session) {
  if (!session.els) return;
  const mode = BROWSER_LAYOUT_MODES.has(session.browser.layoutMode)
    ? session.browser.layoutMode
    : 'terminal';
  const collapsed = mode === 'terminal';
  const expanded = isBrowserExpansionLayout(mode);
  if (mode === 'browserChromux') syncBrowserChromuxTopInset();
  session.els.view.classList.toggle('browser-collapsed', collapsed);
  session.els.view.classList.toggle('browser-workspace', mode === 'browserWorkspace');
  session.els.view.classList.toggle('browser-chromux', mode === 'browserChromux');
  session.els.webPane.classList.toggle('collapsed', collapsed);
  session.els.divider.classList.toggle('disabled', collapsed || expanded);
  session.els.divider.setAttribute('aria-disabled', collapsed || expanded ? 'true' : 'false');
  if (expanded) {
    session.els.view.style.gridTemplateColumns = '0px 0px minmax(0, 1fr)';
  } else if (collapsed) {
    session.els.view.style.gridTemplateColumns = 'minmax(320px, 1fr) 6px 40px';
  } else {
    session.els.view.style.gridTemplateColumns = session.browser.expandedGridTemplate;
  }
  renderBrowserRailToggle(session.els.collapseBtn, collapsed);
  session.els.collapseBtn.title = collapsed
    ? 'Open paired browser (⌘⇧B)'
    : 'Shut paired browser (⌘⇧B)';
  session.els.collapseBtn.setAttribute('aria-label', session.els.collapseBtn.title);
  const action = browserLayoutAction(session);
  renderBrowserFullscreenToggle(session.els.fullscreenBtn, mode, action.mode);
  session.els.fullscreenBtn.title = `${action.title} (${browserFullscreenShortcutLabel()})`;
  session.els.fullscreenBtn.setAttribute('aria-label', session.els.fullscreenBtn.title);
  session.els.fullscreenBtn.setAttribute('aria-pressed', String(expanded));
  session.els.fullscreenBtn.dataset.nextLayout = action.mode;
  session.els.fullBrowserComposerBtn.classList.toggle('hidden', mode !== 'browserChromux');
  renderFullBrowserComposer(session);
  syncBrowserChromuxActiveClass();
  refitTerminal(session);
}

function setBrowserLayoutMode(session, mode, { recordReturn = false } = {}) {
  const next = BROWSER_LAYOUT_MODES.has(mode) ? mode : 'terminal';
  const current = session.browser.layoutMode;
  if (current === next) return false;
  if (next !== 'browserChromux' && session.composer.fullBrowserOpen) closeFullBrowserComposer(session);
  if (current === 'paired' && next !== 'paired') {
    session.browser.expandedGridTemplate = session.els.view.style.gridTemplateColumns
      || session.browser.expandedGridTemplate;
  }
  if (recordReturn && (current === 'paired' || current === 'terminal') && isBrowserExpansionLayout(next)) {
    session.browser.expansionReturnLayout = current;
  } else if (!isBrowserExpansionLayout(next)) {
    session.browser.expansionReturnLayout = null;
  }
  session.browser.layoutMode = next;
  if (next === 'terminal') {
    session.els.queuePanel.classList.add('hidden');
    if (session.els.favoritesPanel) session.els.favoritesPanel.classList.add('hidden');
  }
  applyBrowserLayout(session);
  invalidate('shortcutDebug');
  return true;
}

function setBrowserCollapsed(session, collapsed) {
  const next = Boolean(collapsed);
  if (next) return setBrowserLayoutMode(session, 'terminal');
  if (session.browser.layoutMode === 'terminal') return setBrowserLayoutMode(session, 'paired');
  return false;
}

function advanceBrowserLayout(session) {
  const action = browserLayoutAction(session);
  const recordReturn = isBrowserExpansionLayout(action.mode)
    && (session.browser.layoutMode === 'paired' || session.browser.layoutMode === 'terminal');
  return setBrowserLayoutMode(session, action.mode, { recordReturn });
}

function exitBrowserExpansion(session) {
  if (!isBrowserExpansionLayout(session.browser.layoutMode)) return false;
  return setBrowserLayoutMode(session, browserLayoutReturnMode(session));
}

function applyBrowserFullscreenBehavior(behavior, { persist = true } = {}) {
  const next = BROWSER_FULLSCREEN_BEHAVIORS.has(behavior) ? behavior : 'chromux';
  for (const session of state.sessions.values()) exitBrowserExpansion(session);
  state.ui.browserFullscreenBehavior = next;
  if (persist) {
    try { window.localStorage.setItem(BROWSER_FULLSCREEN_BEHAVIOR_STORAGE_KEY, next); } catch { /* unavailable */ }
  }
  const select = $('#settings-browser-fullscreen-behavior');
  if (select) select.value = next;
  for (const session of state.sessions.values()) applyBrowserLayout(session);
  return next;
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

function setPicking(session, on, targetTab = activePageTab(session)) {
  if (targetTab) targetTab.picking = on;
  session.els.pickBtn.classList.toggle('armed', on);
  session.els.pickBtn.textContent = on ? 'PICKING… ESC' : '⌖ PICK ELEMENT';
}

function cancelPicking(session, targetTab = activePageTab(session)) {
  if (!targetTab) return;
  setPicking(session, false, targetTab);
  if (targetTab.webview) {
    targetTab.webview.executeJavaScript(
      "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"
    ).catch(() => {});
  }
}

async function startPick(session) {
  const tab = activePageTab(session);
  if (!tab || !tab.webview || tab.picking) return;
  setPicking(session, true, tab);
  try {
    await tab.webview.executeJavaScript(PICKER_JS);
  } catch {
    setPicking(session, false, tab);
  }
}

function onElementPicked(session, data, targetTab = activePageTab(session)) {
  setPicking(session, false, targetTab);
  if (!targetTab || activePageTab(session) !== targetTab) return;
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

async function collectBrowserEvidence(session, selection = {}, targetTab = activePageTab(session)) {
  const b = targetTab;
  if (!b || !b.webview) throw new Error('Open a browser page before capturing context.');
  let pngBase64 = null;
  let shotDataUrl = null;
  let dimensions = null;
  try {
    const image = await b.webview.capturePage();
    shotDataUrl = image.toDataURL();
    pngBase64 = shotDataUrl.split(',')[1];
    dimensions = typeof image.getSize === 'function' ? image.getSize() : null;
  } catch { /* evidence remains useful without a screenshot */ }

  let title = selection.pageTitle || null;
  if (!title) {
    try { title = await b.webview.executeJavaScript('document.title'); } catch { title = null; }
  }
  let visibleText = '';
  try {
    visibleText = await b.webview.executeJavaScript(
      "String((document.body && document.body.innerText) || (document.documentElement && document.documentElement.innerText) || '').slice(0, 98304)"
    );
  } catch { visibleText = ''; }
  visibleText = String(visibleText || '');
  const boundedVisibleText = truncateUtf8(visibleText, BOUNDS.visibleTextBytes);
  const outerHTML = typeof selection.outerHTML === 'string' ? selection.outerHTML : null;
  const truncatedHtml = outerHTML !== null && outerHTML.length > BOUNDS.outerHtmlChars;
  return {
    pngBase64,
    shotDataUrl,
    dimensions,
    pageUrl: selection.pageUrl || b.currentUrl,
    title: title || null,
    visibleText: boundedVisibleText,
    visibleTextTruncated: boundedVisibleText !== visibleText,
    selection: selection.selector ? {
      selector: selection.selector,
      outerHTML: truncatedHtml ? outerHTML.slice(0, BOUNDS.outerHtmlChars) : outerHTML,
      truncated: truncatedHtml,
    } : null,
    consoleTotal: b.consoleTotal,
    consoleEntries: b.consoleBuf.slice(-BOUNDS.consoleTail),
  };
}

function capturePayloadBase(session, evidence) {
  return {
    schema_version: 1,
    captured_at: new Date().toISOString(),
    session: {
      id: session.id,
      name: session.name,
      project_path: session.cwd,
    },
    page: {
      url: evidence.pageUrl,
      title: evidence.title,
      visible_text: evidence.visibleText,
      visible_text_truncated: evidence.visibleTextTruncated,
    },
    selection: evidence.selection ? {
      selector: evidence.selection.selector,
      outer_html: evidence.selection.outerHTML,
      truncated: evidence.selection.truncated,
    } : null,
    console: {
      total_captured: evidence.consoleTotal,
      included: evidence.consoleEntries.length,
      truncated: evidence.consoleTotal > evidence.consoleEntries.length,
      entries: evidence.consoleEntries,
    },
    screenshot: evidence.pngBase64
      ? { path: '(assigned on save)', mode: 'visible-viewport' }
      : { path: null, mode: 'unavailable' },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Local MCP capture control. Every screenshot and recording is approved in
// this renderer before main requests either Electron or macOS capture access.
// ───────────────────────────────────────────────────────────────────────────

const CAPTURE_APPROVAL_TIMEOUT_MS = 30_000;
const RECORDING_FRAME_INTERVAL_MS = 10_000;
const RECORDING_MAX_STILLS = 7;

function captureTargetIdForBrowser(session) {
  return `browser:${session.id}`;
}

function browserSessionForCaptureTarget(targetId) {
  if (typeof targetId !== 'string' || !targetId.startsWith('browser:')) return null;
  const session = state.sessions.get(targetId.slice('browser:'.length));
  const tab = session && activePageTab(session);
  return session && tab?.webview && tab.currentUrl ? session : null;
}

function browserCaptureTargets() {
  return [...state.sessions.values()].flatMap((session) => {
    const tab = activePageTab(session);
    if (!tab?.webview || !tab.currentUrl) return [];
    return [{
      targetId: captureTargetIdForBrowser(session),
      kind: 'browser',
      label: `Paired browser — ${session.name}`,
      supportsScreenshot: true,
      supportsRecording: false,
    }];
  });
}

function captureRequesterLabel(requester = {}) {
  const name = String(requester.displayName || 'Local MCP client').trim() || 'Local MCP client';
  const details = [
    requester.sessionId ? `session ${requester.sessionId}` : null,
    Number.isSafeInteger(requester.pid) ? `pid ${requester.pid}` : null,
  ].filter(Boolean);
  return details.length ? `${name} (${details.join(', ')})` : name;
}

function finishCaptureApproval(approved, reason = null) {
  const pending = state.ui.captureApproval;
  if (!pending) return false;
  state.ui.captureApproval = null;
  clearTimeout(pending.timer);
  $('#modal-capture-approval').classList.add('hidden');
  pending.resolve({
    approved: Boolean(approved),
    reason: approved ? null : (reason || 'Capture denied in Chromux.'),
  });
  invalidate('shortcutDebug');
  return true;
}

function requestCaptureApproval({ requester, target, captureType }, timeoutMs = CAPTURE_APPROVAL_TIMEOUT_MS) {
  if (state.ui.captureApproval) {
    return Promise.resolve({ approved: false, reason: 'Another capture approval is already open.' });
  }
  const isRecording = captureType === 'recording';
  $('#capture-approval-type').textContent = isRecording ? 'WINDOW RECORDING' : 'SCREENSHOT';
  $('#capture-approval-requester').textContent = captureRequesterLabel(requester);
  $('#capture-approval-target').textContent = target?.label || 'Chromux window';
  $('#modal-capture-approval').classList.remove('hidden');
  $('#capture-approval-allow').focus();
  invalidate('shortcutDebug');
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      finishCaptureApproval(false, 'Capture approval timed out and was denied.');
    }, timeoutMs);
    state.ui.captureApproval = { resolve, timer, requester, target, captureType };
  });
}

function recordingMimeType(RecorderClass = MediaRecorder) {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((candidate) => RecorderClass.isTypeSupported(candidate)) || '';
}

function recordingCodec(mimeType) {
  const match = String(mimeType || '').match(/codecs=([^;,]+)/i);
  return match ? match[1].trim().toLowerCase() : 'webm';
}

function arrayBufferBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function formatRecordingElapsed(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function updateRecordingHud(recording) {
  if (!recording || state.ui.recording !== recording) return;
  $('#capture-recording-requester').textContent = `REQUESTED BY ${captureRequesterLabel(recording.requester)}`;
  $('#capture-recording-elapsed').textContent = formatRecordingElapsed(Date.now() - recording.startedAtMs);
  $('#capture-recording-audio').textContent = recording.audio === 'available'
    ? 'AUDIO: SYSTEM'
    : 'AUDIO: UNAVAILABLE';
  $('#capture-recording-hud').classList.remove('hidden');
}

async function captureRecordingStill(recording) {
  if (!recording || state.ui.recording !== recording || recording.stills.length >= RECORDING_MAX_STILLS) return;
  const sourceWidth = recording.video.videoWidth || recording.dimensions.width || 1280;
  const sourceHeight = recording.video.videoHeight || recording.dimensions.height || 720;
  if (!sourceWidth || !sourceHeight) return;
  const width = 320;
  const height = Math.max(1, Math.round(width * sourceHeight / sourceWidth));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(recording.video, 0, 0, width, height);
  recording.stills.push({
    elapsedMs: Math.max(0, Date.now() - recording.startedAtMs),
    canvas,
  });
}

function buildRecordingContactSheet(recording) {
  const frames = recording.stills.length ? recording.stills : [{ elapsedMs: 0, canvas: null }];
  const columns = Math.min(3, frames.length);
  const cellWidth = 320;
  const cellImageHeight = 180;
  const labelHeight = 28;
  const rows = Math.ceil(frames.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * cellWidth;
  canvas.height = rows * (cellImageHeight + labelHeight);
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#08101d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.textBaseline = 'middle';
  frames.forEach((frame, index) => {
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * (cellImageHeight + labelHeight);
    if (frame.canvas) {
      context.drawImage(frame.canvas, x, y, cellWidth, cellImageHeight);
    } else {
      context.fillStyle = '#15243a';
      context.fillRect(x, y, cellWidth, cellImageHeight);
      context.fillStyle = '#8aa5c8';
      context.fillText('FRAME UNAVAILABLE', x + 16, y + cellImageHeight / 2);
    }
    context.fillStyle = '#08101d';
    context.fillRect(x, y + cellImageHeight, cellWidth, labelHeight);
    context.fillStyle = '#f2b84b';
    context.fillText(formatRecordingElapsed(frame.elapsedMs), x + 12, y + cellImageHeight + labelHeight / 2);
  });
  return canvas.toDataURL('image/png').split(',')[1] || null;
}

async function stopChromuxRecording(reason = 'user') {
  const recording = state.ui.recording;
  if (!recording) return { stopped: true, alreadyStopped: true };
  if (recording.stopPromise) return recording.stopPromise;
  recording.stopReason = reason;
  recording.stopPromise = (async () => {
    clearTimeout(recording.deadlineTimer);
    clearInterval(recording.hudTimer);
    clearInterval(recording.stillTimer);
    await captureRecordingStill(recording).catch(() => {});
    if (recording.recorder.state !== 'inactive') {
      await new Promise((resolve) => {
        recording.recorder.addEventListener('stop', resolve, { once: true });
        recording.recorder.stop();
      });
    }
    await recording.chunkChain;
    const stoppedAtMs = Date.now();
    const contactSheetBase64 = buildRecordingContactSheet(recording);
    for (const track of recording.stream.getTracks()) track.stop();
    recording.video.pause();
    recording.video.srcObject = null;
    $('#capture-recording-hud').classList.add('hidden');
    state.ui.recording = null;
    const metadata = {
      startedAt: new Date(recording.startedAtMs).toISOString(),
      stoppedAt: new Date(stoppedAtMs).toISOString(),
      durationMs: Math.max(0, stoppedAtMs - recording.startedAtMs),
      dimensions: recording.dimensions,
      mimeType: recording.mimeType || 'video/webm',
      codec: recordingCodec(recording.mimeType),
      audio: recording.audio,
      stopReason: reason,
    };
    window.chromux.captureRecordComplete({
      recordingId: recording.recordingId,
      contactSheetBase64,
      metadata,
    });
    state.ui.captureMedia?.onComplete?.({
      recordingId: recording.recordingId,
      contactSheetBase64,
      metadata,
    });
    return { stopped: true, recordingId: recording.recordingId, ...metadata };
  })().catch((error) => {
    for (const track of recording.stream.getTracks()) track.stop();
    $('#capture-recording-hud').classList.add('hidden');
    if (state.ui.recording === recording) state.ui.recording = null;
    throw error;
  });
  return recording.stopPromise;
}

async function startChromuxRecording(payload) {
  if (state.ui.recording) throw new Error('A Chromux recording is already active.');
  const media = state.ui.captureMedia || {};
  const mediaDevices = media.mediaDevices || navigator.mediaDevices;
  const RecorderClass = media.MediaRecorder || MediaRecorder;
  const requestAudio = payload.audio !== false;
  let stream;
  try {
    stream = await mediaDevices.getDisplayMedia({
      audio: requestAudio,
      video: {
        width: { max: 1280 },
        height: { max: 720 },
        frameRate: { max: 15 },
      },
    });
  } catch (error) {
    if (requestAudio && ['AbortError', 'NotAllowedError', 'NotReadableError', 'NotSupportedError'].includes(error?.name)) {
      const retry = new Error('System audio is unavailable; retry video-only.');
      retry.code = 'CAPTURE_AUDIO_RETRY';
      throw retry;
    }
    throw error;
  }
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack || videoTrack.readyState !== 'live') {
    for (const track of stream.getTracks()) track.stop();
    throw new Error('Chromux window video capture did not start.');
  }
  const usableAudioTracks = stream.getAudioTracks().filter((track) => track.readyState === 'live' && !track.muted);
  const audio = usableAudioTracks.length ? 'available' : 'unavailable';
  if (audio === 'unavailable') {
    for (const track of stream.getAudioTracks()) {
      stream.removeTrack(track);
      track.stop();
    }
  }
  const video = media.createVideo ? media.createVideo() : document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
    throw error;
  }
  const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
  const dimensions = {
    width: Number(settings.width || video.videoWidth || 0),
    height: Number(settings.height || video.videoHeight || 0),
  };
  const mimeType = recordingMimeType(RecorderClass);
  let recorder;
  try {
    recorder = new RecorderClass(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 2_500_000,
    });
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    video.pause();
    video.srcObject = null;
    throw error;
  }
  const recording = {
    recordingId: payload.recordingId,
    requester: payload.requester,
    stream,
    video,
    recorder,
    mimeType: recorder.mimeType || mimeType || 'video/webm',
    audio,
    dimensions,
    startedAtMs: Date.now(),
    stills: [],
    chunkChain: Promise.resolve(),
    stopPromise: null,
    stopReason: null,
    deadlineTimer: null,
    hudTimer: null,
    stillTimer: null,
  };
  recorder.addEventListener('dataavailable', (event) => {
    if (!event.data || !event.data.size) return;
    recording.chunkChain = recording.chunkChain.then(async () => {
      const chunkBase64 = arrayBufferBase64(await event.data.arrayBuffer());
      window.chromux.captureRecordChunk({ recordingId: recording.recordingId, chunkBase64 });
      state.ui.captureMedia?.onChunk?.({ recordingId: recording.recordingId, chunkBase64 });
    });
  });
  recorder.addEventListener('error', () => {
    stopChromuxRecording('recorder-error').catch(() => {});
  });
  videoTrack.addEventListener('ended', () => {
    stopChromuxRecording('stream-ended').catch(() => {});
  }, { once: true });
  state.ui.recording = recording;
  try {
    recorder.start(1000);
  } catch (error) {
    state.ui.recording = null;
    for (const track of stream.getTracks()) track.stop();
    video.pause();
    video.srcObject = null;
    throw error;
  }
  updateRecordingHud(recording);
  await captureRecordingStill(recording).catch(() => {});
  recording.hudTimer = setInterval(() => updateRecordingHud(recording), 250);
  recording.stillTimer = setInterval(() => {
    captureRecordingStill(recording).catch(() => {});
  }, RECORDING_FRAME_INTERVAL_MS);
  recording.deadlineTimer = setTimeout(() => {
    stopChromuxRecording('deadline').catch(() => {});
  }, Math.min(60_000, Math.max(1, Number(payload.deadlineMs) || 60_000)));
  return {
    approved: true,
    recordingId: recording.recordingId,
    startedAt: new Date(recording.startedAtMs).toISOString(),
    audio,
    dimensions,
    mimeType: recording.mimeType,
    codec: recordingCodec(recording.mimeType),
  };
}

async function capturePairedBrowser(payload) {
  const session = browserSessionForCaptureTarget(payload.target?.targetId);
  if (!session) throw new Error('Paired browser target is no longer available.');
  const approval = await requestCaptureApproval({
    captureType: 'screenshot',
    requester: payload.requester,
    target: payload.target,
  });
  if (!approval.approved) return approval;
  const evidence = await collectBrowserEvidence(session, {}, activePageTab(session));
  if (!evidence.pngBase64) throw new Error('Browser screenshot is unavailable.');
  const capturePayload = capturePayloadBase(session, evidence);
  return {
    approved: true,
    pngBase64: evidence.pngBase64,
    dimensions: evidence.dimensions,
    capturedAt: capturePayload.captured_at,
    payload: capturePayload,
    pageUrl: evidence.pageUrl,
    title: evidence.title,
    visibleText: evidence.visibleText,
    visibleTextTruncated: evidence.visibleTextTruncated,
    console: {
      total: evidence.consoleTotal,
      entries: evidence.consoleEntries,
    },
  };
}

async function handleCaptureControlRequest(message = {}) {
  switch (message.action) {
    case 'targets-list':
      return { targets: browserCaptureTargets() };
    case 'approval':
      return requestCaptureApproval(message.payload || {});
    case 'browser-screenshot':
      return capturePairedBrowser(message.payload || {});
    case 'record-start-stream':
      return startChromuxRecording(message.payload || {});
    case 'record-stop':
      if (!state.ui.recording && state.ui.captureApproval?.captureType === 'recording') {
        finishCaptureApproval(false, 'Recording request was cancelled.');
      }
      return stopChromuxRecording(message.payload?.reason || 'requester');
    default:
      throw new Error(`Unknown capture control request: ${message.action}`);
  }
}

$('#capture-approval-allow').onclick = () => finishCaptureApproval(true);
$('#capture-approval-deny').onclick = () => finishCaptureApproval(false);
$('#capture-recording-stop').onclick = () => stopChromuxRecording('user').catch(() => {});
window.chromux.onCaptureControlRequest((message) => {
  Promise.resolve(handleCaptureControlRequest(message)).then((result) => {
    window.chromux.captureControlRespond({ requestId: message.requestId, result });
  }).catch((error) => {
    window.chromux.captureControlRespond({
      requestId: message.requestId,
      error: { message: error?.message || String(error), code: error?.code || null },
    });
  });
});
window.chromux.onBrowserQueueRequest((message) => {
  try {
    const payload = message && message.payload || {};
    const session = state.sessions.get(payload.sessionId);
    if (!session || !session.lifecycle.alive) throw new Error('The originating Chromux session is missing or has exited.');
    const url = normalizedBrowserUrl(payload.url);
    if (!url) throw new Error('Browser queue URL is invalid.');
    const result = routePreview(session, url, 'MCP', {
      reason: payload.reason || 'requested by agent',
      visibility: 'attention',
    });
    window.chromux.browserQueueRespond({ requestId: message.requestId, result });
  } catch (error) {
    window.chromux.browserQueueRespond({
      requestId: message && message.requestId,
      error: { message: error?.message || String(error) },
    });
  }
});
window.addEventListener('beforeunload', () => {
  if (state.ui.captureApproval) finishCaptureApproval(false, 'Chromux window closed.');
  if (state.ui.recording) stopChromuxRecording('window-close').catch(() => {});
});

async function openCaptureModal(session, selection, targetTab = activePageTab(session)) {
  const b = targetTab;
  if (!b || !b.webview) return;
  const evidence = await collectBrowserEvidence(session, selection, targetTab);
  const pageUrl = evidence.pageUrl;

  state.counter += 1;
  const captureId = 'c' + state.counter;
  apply({ type: 'capture-created', captureId, sessionId: session.id, url: pageUrl });
  state.ui.captureModal = {
    captureId,
    pngBase64: evidence.pngBase64,
    payloadBase: capturePayloadBase(session, evidence),
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
  addRow('ELEMENT', evidence.selection?.selector || 'none (page-level capture)', evidence.selection ? 'sel' : '');
  addRow('VISIBLE TEXT', `${utf8ByteLength(evidence.visibleText).toLocaleString()} bytes${evidence.visibleTextTruncated ? ' (truncated)' : ''}`);
  addRow('CONSOLE', `${evidence.consoleEntries.length} of ${evidence.consoleTotal} entries (tail)`);

  const shot = $('#cap-shot');
  shot.innerHTML = '';
  if (evidence.shotDataUrl) {
    const img = document.createElement('img');
    img.src = evidence.shotDataUrl;
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

async function persistComposerBrowserContext(session) {
  const evidence = await collectBrowserEvidence(session, {}, activePageTab(session));
  state.counter += 1;
  const captureId = `c${state.counter}`;
  apply({ type: 'capture-created', captureId, sessionId: session.id, url: evidence.pageUrl });
  const payload = {
    ...capturePayloadBase(session, evidence),
    delivery: {
      adapter: 'composer-context',
      target: 'routed-composer',
      target_cwd: session.cwd,
    },
    notes: session.composer.draft.trim() || null,
  };
  let result;
  try {
    result = await window.chromux.capturePrepare(payload, evidence.pngBase64);
    apply({
      type: 'capture-written',
      captureId,
      payloadPath: result.payloadPath,
      screenshotPath: result.screenshotPath,
      targetSessionId: null,
    });
  } catch (error) {
    apply({
      type: 'capture-failed',
      captureId,
      exitCode: null,
      error: error?.message || String(error),
    });
    throw error;
  }
  return normalizeBrowserContextReference({
    captureId,
    payloadPath: result.payloadPath,
    screenshotPath: result.screenshotPath,
    url: evidence.pageUrl,
    title: evidence.title || '',
    capturedAt: payload.captured_at,
    visibleTextTruncated: evidence.visibleTextTruncated,
  });
}

function boundedComposerContextValue(value, fallback = '') {
  return truncateUtf8(String(value || fallback), BOUNDS.composerContextReferenceBytes);
}

function composerContextReferences(contexts) {
  const normalized = (Array.isArray(contexts) ? contexts : [])
    .map(normalizeBrowserContextReference)
    .filter(Boolean)
    .slice(0, BOUNDS.stagedBrowserContexts);
  if (!normalized.length) return '';
  return [
    'Attached browser evidence:',
    ...normalized.flatMap((context, index) => [
      `${index + 1}. Payload: ${boundedComposerContextValue(context.payloadPath)}`,
      `   Screenshot: ${context.screenshotPath
        ? boundedComposerContextValue(context.screenshotPath)
        : 'unavailable'}`,
      `   URL: ${boundedComposerContextValue(context.url)}`,
      `   Title: ${boundedComposerContextValue(context.title, '(untitled page)')}`,
    ]),
  ].join('\n');
}

function composerPayloadWithContexts(instruction, contexts) {
  const request = String(instruction || '').replace(/\r\n?/g, '\n').trim();
  const evidenceReferences = composerContextReferences(contexts);
  if (!evidenceReferences) return truncateComposerDraft(request);
  const separator = '\n\n';
  const requestBudget = Math.max(
    0,
    BOUNDS.composerDraftBytes - utf8ByteLength(separator) - utf8ByteLength(evidenceReferences)
  );
  return `${truncateUtf8(request, requestBudget)}${separator}${evidenceReferences}`;
}

async function refreshStagedBrowserContext(session, captureId) {
  if (!session || session.composer.routeBusy) return null;
  session.composer.routeBusy = true;
  session.composer.routeError = '';
  renderComposerContexts(session);
  try {
    const context = await persistComposerBrowserContext(session);
    session.composer.stagedContexts = session.composer.stagedContexts
      .map((candidate) => candidate.captureId === captureId ? context : candidate)
      .slice(0, BOUNDS.stagedBrowserContexts);
    renderComposerContexts(session);
    return context;
  } catch (error) {
    session.composer.routeError = `Attachment refresh failed: ${error?.message || error}`;
    renderComposerContexts(session);
    return null;
  } finally {
    session.composer.routeBusy = false;
    renderComposerContexts(session);
  }
}

async function attachCurrentPage(source) {
  if (!source || source.composer.routeBusy) return null;
  source.composer.routeBusy = true;
  source.composer.routeError = '';
  source.composer.routeStatus = '';
  renderComposer(source);
  try {
    const context = await persistComposerBrowserContext(source);
    if (!context) throw new Error('Browser evidence could not be persisted.');
    source.composer.stagedContexts = [context, ...source.composer.stagedContexts]
      .slice(0, BOUNDS.stagedBrowserContexts);
    renderComposer(source);
    return context;
  } catch (error) {
    source.composer.routeError = `Page attachment failed: ${error?.message || error}`;
    renderComposer(source);
    return null;
  } finally {
    source.composer.routeBusy = false;
    renderComposer(source);
  }
}

async function createSessionFromPage(source, { grokAcknowledged = false } = {}) {
  if (!source || source.composer.routeBusy) return null;
  const agent = AGENT_ORDER.includes(source.composer.selectedAgent)
    ? source.composer.selectedAgent
    : (source.agent || '');
  if (agent === 'grok' && !grokAcknowledged) {
    openGrokContextAdvisory(source, 'page');
    return null;
  }
  source.composer.routeBusy = true;
  source.composer.routeError = '';
  source.composer.routeStatus = '';
  renderComposer(source);
  const sourceDraft = source.composer.draft;
  const stagedContexts = source.composer.stagedContexts.slice(0, BOUNDS.stagedBrowserContexts);
  try {
    const currentPage = activePageTab(source);
    const currentUrl = normalizedBrowserUrl(currentPage?.currentUrl || source.els?.urlBar?.value);
    const name = uniqueSessionName(`${source.name}-new`);
    const pageTabId = currentUrl ? 'page-1' : null;
    const created = await createSession({
      name,
      cwd: source.cwd,
      runtime: source.runtime,
      distro: source.distro,
      agent,
      initialUrl: currentUrl,
      initialBrowserTabs: currentUrl ? [{
        id: pageTabId,
        type: 'page',
        url: currentUrl,
        title: currentPage?.title || currentUrl,
      }] : [],
      initialActiveBrowserTabId: pageTabId,
      composerDraft: composerPayloadWithContexts(sourceDraft, stagedContexts),
      initialStagedBrowserContexts: stagedContexts,
      initialBrowserLayoutMode: 'browserChromux',
      initialFullBrowserComposerOpen: true,
      activate: true,
    });
    setComposerDraft(source, '');
    source.composer.stagedContexts = [];
    source.composer.routeError = '';
    source.composer.routeStatus = '';
    renderComposer(source);
    return created;
  } catch (error) {
    source.composer.routeError = `New session failed: ${error?.message || error}`;
    renderComposer(source);
    return null;
  } finally {
    source.composer.routeBusy = false;
    renderComposer(source);
  }
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
const CODEX_COMPAT_TERM = 'xterm-color';
const CODEX_ANSI_THEME_CONFIG = 'tui.theme="ansi"';
const CODEX_UPDATE_CONFIG = 'check_for_update_on_startup=false';

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
function agentCommand(agent, resumeId = null, env = state.env) {
  if (agent === 'claude') {
    const settingsPath = env && env.hooksSettingsPath;
    const base = settingsPath ? `claude --settings ${shellQuote(settingsPath)}` : 'claude';
    return resumeId ? `${base} --resume ${shellQuote(resumeId)}` : base;
  }
  if (agent === 'codex') {
    // Verified: the notify child's /dev/tty write rides the PTY back to us.
    // Codex only reports turn completion, so codex sessions signal turn-end
    // only; needsInput never fires and working is inferred from typed input.
    const notifyPath = env && env.codexNotifyPath;
    // The path sits inside a TOML string inside a shell arg — escape both
    // layers: backslash-escape for TOML, then single-quote for the shell.
    const configs = [CODEX_ANSI_THEME_CONFIG];
    if (notifyPath) configs.push(`notify=["${notifyPath.replace(/[\\"]/g, '\\$&')}"]`);
    configs.push(CODEX_UPDATE_CONFIG);
    const base = `TERM=${CODEX_COMPAT_TERM} codex ${configs
      .map((value) => `-c ${shellQuote(value)}`).join(' ')}`;
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

function codexConfigValues(tokens) {
  const values = [];
  for (let i = 1; i < tokens.length; i += 1) {
    const text = tokens[i].text;
    if (text === '-c' || text === '--config') {
      if (tokens[i + 1]) {
        values.push(tokens[i + 1].text);
        i += 1;
      }
    } else if (text.startsWith('--config=')) {
      values.push(text.slice('--config='.length));
    } else if (text.startsWith('-c') && text.length > 2) {
      values.push(text.slice(2).replace(/^=/, ''));
    }
  }
  return values;
}

function codexHasNotifyConfigArg(tokens) {
  return codexConfigValues(tokens).some((value) => /\bnotify\b/.test(value));
}

function codexHasUpdateCheckOverride(tokens) {
  return codexConfigValues(tokens)
    .some((value) => /\bcheck_for_update_on_startup\s*=\s*false\b/.test(value));
}

function codexThemeConfig(tokens) {
  return codexConfigValues(tokens).find((value) => /\btui\.theme\s*=/.test(value)) || null;
}

function codexThemeIsAnsi(value) {
  return typeof value === 'string'
    && /\btui\.theme\s*=\s*(?:"ansi"|'ansi'|ansi)\s*$/.test(value);
}

function codexNotifyConfig() {
  const notifyPath = state.env && state.env.codexNotifyPath;
  return notifyPath ? `notify=["${notifyPath.replace(/[\\"]/g, '\\$&')}"]` : null;
}

function rewriteShellLaunchLine(line) {
  const parsed = simpleShellTokens(line);
  if (!parsed) return null;
  const commandToken = parsed.tokens[0];
  const agent = commandToken.text;
  if (!ADOPTABLE_AGENTS.has(agent)) return null;
  if (commandToken.raw !== agent) return null;
  if (agent === 'claude' && claudeHasSettingsArg(parsed.tokens)) return null;
  let base = agentCommand(agent);
  if (agent === 'codex') {
    const themeConfig = codexThemeConfig(parsed.tokens);
    const compatibilityProfile = !themeConfig || codexThemeIsAnsi(themeConfig);
    const configs = [];
    if (compatibilityProfile && !themeConfig) configs.push(CODEX_ANSI_THEME_CONFIG);
    if (!codexHasNotifyConfigArg(parsed.tokens)) {
      const notifyConfig = codexNotifyConfig();
      if (notifyConfig) configs.push(notifyConfig);
    }
    if (!codexHasUpdateCheckOverride(parsed.tokens)) configs.push(CODEX_UPDATE_CONFIG);
    if (!compatibilityProfile && configs.length === 0) return null;
    base = `${compatibilityProfile ? `TERM=${CODEX_COMPAT_TERM} ` : ''}codex${configs.length
      ? ` ${configs.map((value) => `-c ${shellQuote(value)}`).join(' ')}`
      : ''}`;
  }
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
  if (session.composer.routeTargetId !== COMPOSER_NEW_SESSION_TARGET) {
    session.composer.selectedAgent = session.agent || '';
    renderComposerContexts(session);
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
    : (mode === 'page'
      ? `Capture this page and open a new Grok Build session · ${session.cwd}`
      : `Open ${session.name} in Grok Build · ${session.cwd}`);
  $('#modal-grok-advisory').classList.remove('hidden');
  $('#grok-context-enable').focus();
}

function openMoveToGroupPicker(session, x, y) {
  closeSessionContextMenu();
  const menu = document.createElement('div');
  menu.className = 'session-menu group-picker';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.setAttribute('role', 'menu');
  const add = (label, detail, action, selected = false) => {
    const item = document.createElement('button');
    item.className = 'session-menu-item';
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(selected));
    const text = document.createElement('span');
    text.className = 'smi-label';
    text.textContent = `${selected ? '✓ ' : ''}${label}`;
    const hint = document.createElement('span');
    hint.className = 'smi-detail';
    hint.textContent = detail;
    item.append(text, hint);
    item.onclick = (event) => {
      event.stopPropagation();
      closeSessionContextMenu();
      action();
    };
    menu.appendChild(item);
  };
  add('Automatic directory', normalizeSessionCwd(session.cwd) || '~',
    () => setSessionCustomTabGroup(session, null), !validCustomTabGroup(session.customTabGroupId));
  for (const group of state.ui.customTabGroups) {
    add(group.name, 'Custom group', () => setSessionCustomTabGroup(session, group.id),
      session.customTabGroupId === group.id);
  }
  add('Create and move…', 'New custom group', () => {
    const name = window.prompt('New custom group name', '');
    if (name === null) return;
    const result = createCustomTabGroup(name);
    if (result.group) setSessionCustomTabGroup(session, result.group.id);
    else {
      setCustomTabGroupError(result.error);
      openSettings();
    }
  });
  document.body.appendChild(menu);
  state.contextMenu = menu;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
  requestAnimationFrame(() => menu.querySelector('button')?.focus());
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
    item.onclick = (event) => {
      event.stopPropagation();
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
  addItem('Move to group…', validCustomTabGroup(session.customTabGroupId)?.name || 'Automatic directory',
    () => openMoveToGroupPicker(session, x, y));
  addItem('Close session', session.name, () => closeSession(session.id), true);

  document.body.appendChild(menu);
  state.contextMenu = menu;

  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
}

function vercelLocation(session) {
  return {
    runtime: session.runtime === 'wsl' ? 'wsl' : 'host',
    distro: session.runtime === 'wsl' ? session.distro : null,
    cwd: session.cwd,
  };
}

function vercelPathContains(root, candidate, runtime) {
  if (typeof root !== 'string' || typeof candidate !== 'string') return false;
  const separator = runtime === 'wsl' ? '/' : (root.includes('\\') ? '\\' : '/');
  const macCanonicalAlias = (value) => {
    if (runtime !== 'host' || state.env?.hostPlatform === 'win32') return value;
    if (value === '/var' || value.startsWith('/var/')) return `/private${value}`;
    if (value === '/tmp' || value.startsWith('/tmp/')) return `/private${value}`;
    return value;
  };
  const cleanRoot = macCanonicalAlias(root).replace(/[\\/]+$/, '');
  candidate = macCanonicalAlias(candidate);
  const foldedRoot = separator === '\\' ? cleanRoot.toLocaleLowerCase() : cleanRoot;
  const foldedCandidate = separator === '\\' ? candidate.toLocaleLowerCase() : candidate;
  return foldedCandidate === foldedRoot || foldedCandidate.startsWith(`${foldedRoot}${separator}`);
}

function vercelProjectForSession(projects, session) {
  if (!session) return null;
  const runtimeMatches = (projects || []).filter((project) => (
    project?.location?.runtime === (session.runtime === 'wsl' ? 'wsl' : 'host')
    && (project.location.runtime !== 'wsl' || project.location.distro === session.distro)
  ));
  const deployMatches = runtimeMatches
    .filter((project) => vercelPathContains(project.deployRoot, session.cwd, project.location.runtime))
    .sort((left, right) => right.deployRoot.length - left.deployRoot.length);
  if (deployMatches.length) return deployMatches[0];
  const repositoryMatches = runtimeMatches.filter((project) => (
    vercelPathContains(project.repositoryRoot, session.cwd, project.location.runtime)
  ));
  return repositoryMatches.length === 1 ? repositoryMatches[0] : null;
}

function updateVercelButtons() {
  for (const session of state.sessions.values()) {
    const button = session.els?.vercelBtn;
    if (!button) continue;
    const configured = vercelProjectForSession(state.ui.vercel.projects, session);
    button.classList.toggle('ready', Boolean(configured));
    button.textContent = configured ? 'VERCEL · READY' : 'VERCEL';
    button.title = configured
      ? 'Review Vercel setup for this project'
      : 'Configure Vercel for this project';
    button.setAttribute('aria-label', button.title);
    renderComposer(session);
  }
}

function vercelErrorMessage(result, fallback) {
  return result?.error?.message || result?.message || fallback;
}

function setVercelStatus(message, kind = '') {
  const status = $('#vercel-status');
  status.textContent = message;
  status.classList.toggle('fail', kind === 'fail');
  status.classList.toggle('current', kind === 'current');
  status.classList.toggle('ready', kind === 'ready');
}

function setVercelBusy(busy) {
  const wizard = state.ui.vercel;
  wizard.busy = busy;
  for (const id of [
    'vercel-profile', 'vercel-use-cli', 'vercel-use-oauth', 'vercel-validate-profile', 'vercel-remove-profile',
    'vercel-token-label', 'vercel-token', 'vercel-connect-token', 'vercel-org-id',
    'vercel-project-id', 'vercel-trigger', 'vercel-production-branch', 'vercel-environment',
    'vercel-save-project', 'vercel-remove-project', 'vercel-ship-review-button',
    'vercel-ship-environment', 'vercel-ship-start', 'vercel-job-cancel', 'vercel-job-retry',
  ]) {
    const element = $(`#${id}`);
    if (element) element.disabled = busy;
  }
  renderVercelSetup();
}

function renderVercelSetup() {
  const wizard = state.ui.vercel;
  const session = state.sessions.get(wizard.sessionId);
  if (!session) return;
  const capability = wizard.capability;
  const cli = capability?.cli;
  $('#vercel-project-context').textContent = `${session.name} · ${session.cwd} · ${
    session.runtime === 'wsl' ? `WSL ${session.distro || ''}` : 'HOST'
  }`;
  const capabilityStatus = $('#vercel-capability-status');
  capabilityStatus.classList.toggle('fail', Boolean(capability && !cli?.available));
  capabilityStatus.classList.toggle('current', Boolean(cli?.available));
  capabilityStatus.textContent = !capability
    ? 'CHECKING THIS PROJECT RUNTIME…'
    : (cli?.available
      ? `VERCEL CLI ${cli.version || 'DETECTED'} · CREDENTIAL ENCRYPTION ${
        capability.secureStorage ? 'AVAILABLE' : 'UNAVAILABLE'
      }`
      : 'VERCEL CLI WAS NOT FOUND IN THIS PROJECT RUNTIME.');
  $('#vercel-install-command').classList.toggle('hidden', !capability || cli?.available);
  $('#vercel-install-command').textContent = cli?.setupCommand || '';

  const select = $('#vercel-profile');
  const preferred = wizard.profileId || wizard.project?.profileId || '';
  select.replaceChildren();
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = wizard.profiles.length ? 'SELECT A CONNECTION' : 'NO SAVED CONNECTIONS';
  select.appendChild(empty);
  for (const profile of wizard.profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = `${profile.label} · ${profile.kind.toUpperCase()}${
      profile.account ? ` · ${profile.account}` : ''
    }`;
    select.appendChild(option);
  }
  if (wizard.profiles.some((profile) => profile.id === preferred)) {
    wizard.profileId = preferred;
    select.value = preferred;
  } else {
    wizard.profileId = '';
    select.value = '';
  }

  const discovery = wizard.discovery;
  const deployRoot = wizard.project?.deployRoot || discovery?.deployRoot?.cwd || '';
  const repositoryRoot = wizard.project?.repositoryRoot || discovery?.repositoryRoot?.cwd || deployRoot;
  $('#vercel-repository-root').textContent = repositoryRoot || '—';
  $('#vercel-repository-root').title = repositoryRoot;
  $('#vercel-deploy-root').textContent = deployRoot || '—';
  $('#vercel-deploy-root').title = deployRoot;
  $('#vercel-validate-profile').disabled = wizard.busy || !wizard.profileId || !cli?.available;
  $('#vercel-remove-profile').disabled = wizard.busy || !wizard.profileId;
  $('#vercel-use-cli').disabled = wizard.busy || !cli?.available;
  $('#vercel-use-oauth').disabled = wizard.busy || !capability?.secureStorage;
  $('#vercel-connect-token').disabled = wizard.busy || !cli?.available || !capability?.secureStorage;
  $('#vercel-token-details').classList.toggle('hidden', Boolean(capability && !capability.secureStorage));
  $('#vercel-save-project').disabled = wizard.busy
    || !cli?.available
    || !wizard.profileId
    || !repositoryRoot
    || !deployRoot
    || !$('#vercel-org-id').value.trim()
    || !$('#vercel-project-id').value.trim();
  $('#vercel-remove-project').classList.toggle('hidden', !wizard.project);
  $('#vercel-remove-project').disabled = wizard.busy || !wizard.project;
  $('#vercel-ship-section').classList.toggle('hidden', !wizard.project);
  $('#vercel-ship-review-button').classList.toggle('hidden', !wizard.project);
  $('#vercel-ship-review-button').disabled = wizard.busy || !wizard.project || !cli?.available;
  $('#vercel-ship-environment-field').classList.toggle('hidden', wizard.project?.trigger === 'git');
  if (wizard.project && !wizard.review) {
    $('#vercel-ship-environment').value = wizard.project.rememberedEnvironment || 'preview';
  }
  renderVercelShipping();
}

const VERCEL_ACTIVE_JOB_PHASES = new Set(['preparing', 'committing', 'pushing', 'discovering', 'building']);

function renderVercelShipping() {
  const wizard = state.ui.vercel;
  const review = wizard.review;
  const reviewNode = $('#vercel-ship-review');
  reviewNode.classList.toggle('hidden', !review);
  if (review) {
    $('#vercel-ship-summary').textContent = `${
      review.environment.toUpperCase()
    } · ${review.trigger.toUpperCase()} · ${review.branch || 'NO BRANCH'} · ${
      review.clean ? 'CLEAN HEAD' : `${review.paths.length} PATH${review.paths.length === 1 ? '' : 'S'}`
    }`;
    const paths = $('#vercel-ship-paths');
    paths.replaceChildren();
    for (const entry of review.paths) {
      const item = document.createElement('li');
      item.textContent = `${entry.status} ${entry.path}`;
      paths.appendChild(item);
    }
    if (!review.paths.length) {
      const item = document.createElement('li');
      item.textContent = 'No local changes. Chromux will monitor the existing HEAD deployment.';
      paths.appendChild(item);
    }
    $('#vercel-commit-message-field').classList.toggle('hidden', review.trigger !== 'git' || review.clean);
    $('#vercel-production-confirm-field').classList.toggle('hidden', !review.production);
    $('#vercel-production-confirm').placeholder = review.productionConfirmation || '';
    $('#vercel-ship-start').disabled = wizard.busy
      || !$('#vercel-ship-confirm').checked
      || (review.trigger === 'git' && !review.clean && !$('#vercel-commit-message').value.trim())
      || (review.production && $('#vercel-production-confirm').value.trim() !== review.productionConfirmation);
  }
  const job = wizard.job;
  $('#vercel-job').classList.toggle('hidden', !job);
  if (!job) return;
  $('#vercel-job-phase').textContent = job.phase.toUpperCase();
  $('#vercel-job-time').textContent = job.updatedAt ? new Date(job.updatedAt).toLocaleTimeString() : '';
  $('#vercel-job-message').textContent = job.message || '';
  const link = $('#vercel-job-url');
  link.classList.toggle('hidden', !job.deploymentUrl);
  link.textContent = job.deploymentUrl || '';
  link.href = job.deploymentUrl || '#';
  $('#vercel-job-cancel').classList.toggle('hidden', !['discovering', 'building'].includes(job.phase));
  $('#vercel-job-retry').classList.toggle('hidden', !job.retryAction || VERCEL_ACTIVE_JOB_PHASES.has(job.phase));
  $('#vercel-job-retry').textContent = job.retryAction === 'push' ? 'RETRY PUSH' : 'RETRY MONITORING';
}

function fillVercelProjectFields(project, discovery) {
  $('#vercel-org-id').value = project?.orgId || discovery?.link?.orgId || '';
  $('#vercel-project-id').value = project?.projectId || discovery?.link?.projectId || '';
  $('#vercel-trigger').value = project?.trigger || 'direct';
  $('#vercel-production-branch').value = project?.productionBranch || '';
  $('#vercel-environment').value = project?.rememberedEnvironment || '';
}

async function refreshVercelProjects() {
  try {
    const result = await window.chromux.vercelProjectsRead();
    state.ui.vercel.projects = result?.ok && Array.isArray(result.projects) ? result.projects : [];
  } catch {
    state.ui.vercel.projects = [];
  }
  updateVercelButtons();
  return state.ui.vercel.projects;
}

async function openVercelSetup(session) {
  const wizard = state.ui.vercel;
  const generation = ++wizard.generation;
  wizard.sessionId = session.id;
  wizard.busy = true;
  wizard.capability = null;
  wizard.discovery = null;
  wizard.profiles = [];
  wizard.project = null;
  wizard.profileId = '';
  wizard.review = null;
  wizard.job = null;
  wizard.jobs = [];
  fillVercelProjectFields(null, null);
  $('#vercel-token').value = '';
  $('#modal-vercel').classList.remove('hidden');
  setVercelStatus('Inspecting this project and its Vercel setup…');
  renderVercelSetup();

  const location = vercelLocation(session);
  const results = await Promise.allSettled([
    window.chromux.vercelCapability(location),
    window.chromux.vercelConnectionsRead(),
    window.chromux.vercelProjectDiscover(location),
    window.chromux.vercelProjectsRead(),
    window.chromux.vercelJobsRead(),
  ]);
  if (generation !== wizard.generation || wizard.sessionId !== session.id) return;
  const [capabilityResult, connectionsResult, discoveryResult, projectsResult, jobsResult] = results.map((result) => (
    result.status === 'fulfilled' ? result.value : null
  ));
  wizard.capability = capabilityResult?.ok ? capabilityResult : {
    ok: false,
    cli: { available: false, setupCommand: 'npm install --global vercel' },
    secureStorage: false,
  };
  wizard.profiles = connectionsResult?.ok && Array.isArray(connectionsResult.profiles)
    ? connectionsResult.profiles : [];
  wizard.discovery = discoveryResult?.ok ? discoveryResult : null;
  wizard.projects = projectsResult?.ok && Array.isArray(projectsResult.projects)
    ? projectsResult.projects : [];
  wizard.project = vercelProjectForSession(wizard.projects, session);
  wizard.jobs = jobsResult?.ok && Array.isArray(jobsResult.jobs) ? jobsResult.jobs : [];
  wizard.job = wizard.project
    ? wizard.jobs.find((job) => job.mappingKey === wizard.project.key) || null
    : null;
  wizard.profileId = wizard.project?.profileId || (wizard.profiles.length === 1 ? wizard.profiles[0].id : '');
  fillVercelProjectFields(wizard.project, wizard.discovery);
  wizard.busy = false;
  updateVercelButtons();
  renderVercelSetup();
  if (!wizard.capability.cli?.available) {
    setVercelStatus('Install the Vercel CLI in this runtime, then reopen setup.', 'fail');
  } else if (wizard.project) {
    setVercelStatus('This project has a saved Vercel mapping. Review or update it below.', 'current');
  } else if (wizard.discovery?.link) {
    setVercelStatus('Found an existing Vercel project link. Choose a connection and save setup.', 'ready');
  } else {
    setVercelStatus('No linked Vercel project was found. Enter the organization and project IDs.', 'ready');
  }
}

async function connectVercelOAuth() {
  const wizard = state.ui.vercel;
  if (wizard.busy) return;
  setVercelBusy(true);
  setVercelStatus('Opening Vercel sign-in. Chromux owns the loopback callback for ten minutes…');
  const result = await window.chromux.vercelOAuthStart({
    id: `oauth-${Date.now().toString(36)}`,
    label: 'Sign in with Vercel',
  }).catch((error) => ({ ok: false, message: error.message }));
  if (!result?.ok) {
    setVercelStatus(vercelErrorMessage(result, 'Vercel sign-in could not start.'), 'fail');
    setVercelBusy(false);
  }
}

async function connectVercelCli() {
  const wizard = state.ui.vercel;
  const session = state.sessions.get(wizard.sessionId);
  if (!session || wizard.busy) return;
  setVercelBusy(true);
  setVercelStatus('Validating Vercel CLI login in this project runtime…');
  const runtimeSlug = session.runtime === 'wsl'
    ? `wsl-${String(session.distro || 'default').toLocaleLowerCase().replace(/[^a-z0-9._-]+/g, '-')}`
    : 'host';
  let result;
  try {
    result = await window.chromux.vercelConnectCli({
      id: `cli-${runtimeSlug}`.slice(0, 64),
      label: session.runtime === 'wsl' ? `Vercel CLI · ${session.distro}` : 'Vercel CLI · Host',
      location: vercelLocation(session),
    });
  } catch (error) {
    result = { ok: false, message: error.message };
  }
  if (result?.ok) {
    const connections = await window.chromux.vercelConnectionsRead().catch(() => null);
    wizard.profiles = connections?.ok ? connections.profiles : wizard.profiles;
    wizard.profileId = result.profile.id;
    setVercelStatus(`Connected as ${result.profile.account || result.profile.label}.`, 'current');
  } else {
    setVercelStatus(vercelErrorMessage(result, 'Vercel CLI login could not be validated.'), 'fail');
  }
  setVercelBusy(false);
}

async function connectVercelToken() {
  const wizard = state.ui.vercel;
  const session = state.sessions.get(wizard.sessionId);
  const label = $('#vercel-token-label').value.trim();
  const token = $('#vercel-token').value;
  if (!session || wizard.busy) return;
  if (!label || !token) {
    setVercelStatus('Enter a connection name and Vercel token.', 'fail');
    return;
  }
  setVercelBusy(true);
  setVercelStatus('Validating the token with Vercel…');
  let result;
  try {
    result = await window.chromux.vercelConnectToken({
      id: `token-${Date.now().toString(36)}`,
      label,
      token,
      location: vercelLocation(session),
    });
  } catch (error) {
    result = { ok: false, message: error.message };
  } finally {
    $('#vercel-token').value = '';
  }
  if (result?.ok) {
    const connections = await window.chromux.vercelConnectionsRead().catch(() => null);
    wizard.profiles = connections?.ok ? connections.profiles : wizard.profiles;
    wizard.profileId = result.profile.id;
    $('#vercel-token-label').value = '';
    $('#vercel-token-details').open = false;
    setVercelStatus(`Encrypted connection saved for ${result.profile.account || result.profile.label}.`, 'current');
  } else {
    setVercelStatus(vercelErrorMessage(result, 'Vercel rejected this token.'), 'fail');
  }
  setVercelBusy(false);
}

async function validateVercelProfile() {
  const wizard = state.ui.vercel;
  const session = state.sessions.get(wizard.sessionId);
  if (!session || !wizard.profileId || wizard.busy) return false;
  setVercelBusy(true);
  setVercelStatus('Validating the selected connection…');
  let result;
  try {
    result = await window.chromux.vercelConnectionValidate({
      profileId: wizard.profileId,
      location: vercelLocation(session),
    });
  } catch (error) {
    result = { ok: false, message: error.message };
  }
  setVercelStatus(
    result?.ok
      ? `Connection validated${result.profile?.account ? ` as ${result.profile.account}` : ''}.`
      : vercelErrorMessage(result, 'The selected connection could not be validated.'),
    result?.ok ? 'current' : 'fail',
  );
  setVercelBusy(false);
  return Boolean(result?.ok);
}

async function removeVercelProfile() {
  const wizard = state.ui.vercel;
  if (!wizard.profileId || wizard.busy) return;
  const profile = wizard.profiles.find((candidate) => candidate.id === wizard.profileId);
  if (!window.confirm(`Remove the Chromux connection “${profile?.label || wizard.profileId}”? Vercel CLI login is not changed.`)) return;
  setVercelBusy(true);
  let result;
  try { result = await window.chromux.vercelConnectionRemove(wizard.profileId); } catch (error) {
    result = { ok: false, message: error.message };
  }
  if (result?.ok) {
    wizard.profiles = wizard.profiles.filter((candidate) => candidate.id !== wizard.profileId);
    wizard.profileId = '';
    setVercelStatus('Chromux connection removed. Vercel CLI login was left unchanged.', 'current');
  } else {
    setVercelStatus(vercelErrorMessage(result, 'The connection could not be removed.'), 'fail');
  }
  setVercelBusy(false);
}

async function saveVercelProject() {
  const wizard = state.ui.vercel;
  const session = state.sessions.get(wizard.sessionId);
  if (!session || !wizard.profileId || wizard.busy) return;
  const deployRoot = wizard.project?.deployRoot || wizard.discovery?.deployRoot?.cwd;
  const repositoryRoot = wizard.project?.repositoryRoot || wizard.discovery?.repositoryRoot?.cwd || deployRoot;
  if (!deployRoot || !repositoryRoot) {
    setVercelStatus('Chromux could not resolve this project directory.', 'fail');
    return;
  }
  const orgId = $('#vercel-org-id').value.trim();
  const projectId = $('#vercel-project-id').value.trim();
  if (!orgId || !projectId) {
    setVercelStatus('Enter both Vercel organization and project IDs.', 'fail');
    return;
  }
  if (!await validateVercelProfile()) return;
  setVercelBusy(true);
  setVercelStatus('Saving the canonical Vercel project mapping…');
  let result;
  try {
    result = await window.chromux.vercelProjectSave({
      location: vercelLocation(session),
      repositoryRoot,
      deployRoot,
      profileId: wizard.profileId,
      orgId,
      projectId,
      trigger: $('#vercel-trigger').value,
      productionBranch: $('#vercel-production-branch').value.trim(),
      rememberedEnvironment: $('#vercel-environment').value || null,
    });
  } catch (error) {
    result = { ok: false, message: error.message };
  }
  if (result?.ok) {
    wizard.project = result.project;
    wizard.review = null;
    await refreshVercelProjects();
    setVercelStatus('Vercel setup saved for this project.', 'current');
  } else {
    setVercelStatus(vercelErrorMessage(result, 'The Vercel project mapping could not be saved.'), 'fail');
  }
  setVercelBusy(false);
}

async function previewVercelShip() {
  const wizard = state.ui.vercel;
  if (!wizard.project || wizard.busy) return;
  const environment = $('#vercel-ship-environment').value;
  setVercelBusy(true);
  setVercelStatus('Revalidating roots, connection, branch, target, and Git status…');
  const result = await window.chromux.vercelShipPreview({
    mappingKey: wizard.project.key,
    environment,
  }).catch((error) => ({ ok: false, message: error.message }));
  wizard.review = result?.ok ? result : null;
  $('#vercel-ship-confirm').checked = false;
  $('#vercel-production-confirm').value = '';
  setVercelStatus(
    result?.ok ? 'Review the exact shipping target and file list below.' : vercelErrorMessage(result, 'Shipping review failed.'),
    result?.ok ? 'ready' : 'fail',
  );
  setVercelBusy(false);
}

async function startVercelShip() {
  const wizard = state.ui.vercel;
  const review = wizard.review;
  if (!review || wizard.busy) return;
  setVercelBusy(true);
  const result = await window.chromux.vercelShipStart({
    mappingKey: review.mappingKey,
    fingerprint: review.fingerprint,
    environment: review.environment,
    commitMessage: $('#vercel-commit-message').value.trim(),
    confirmed: $('#vercel-ship-confirm').checked,
    productionConfirmation: $('#vercel-production-confirm').value.trim(),
  }).catch((error) => ({ ok: false, message: error.message }));
  if (result?.ok) {
    wizard.job = result.job;
    wizard.review = null;
    setVercelStatus('Shipping started. Closing Chromux only stops local monitoring; it never rolls back Git or Vercel.', 'current');
  } else {
    setVercelStatus(vercelErrorMessage(result, 'Shipping could not start.'), 'fail');
  }
  setVercelBusy(false);
}

async function cancelVercelJob() {
  const wizard = state.ui.vercel;
  if (!wizard.job) return;
  const result = await window.chromux.vercelJobCancel(wizard.job.id).catch((error) => ({ ok: false, message: error.message }));
  if (!result?.ok) setVercelStatus(vercelErrorMessage(result, 'Monitoring could not be canceled.'), 'fail');
}

async function retryVercelJob() {
  const wizard = state.ui.vercel;
  if (!wizard.job) return;
  const result = await window.chromux.vercelJobRetry(wizard.job.id).catch((error) => ({ ok: false, message: error.message }));
  if (!result?.ok) setVercelStatus(vercelErrorMessage(result, 'Monitoring could not be retried.'), 'fail');
}

async function removeVercelProject() {
  const wizard = state.ui.vercel;
  if (!wizard.project || wizard.busy) return;
  if (!window.confirm('Remove this project’s Vercel mapping from Chromux? The Vercel project is not changed.')) return;
  setVercelBusy(true);
  let result;
  try { result = await window.chromux.vercelProjectRemove(wizard.project.key); } catch (error) {
    result = { ok: false, message: error.message };
  }
  if (result?.ok) {
    wizard.project = null;
    await refreshVercelProjects();
    setVercelStatus('Project mapping removed. The Vercel project was left unchanged.', 'current');
  } else {
    setVercelStatus(vercelErrorMessage(result, 'The project mapping could not be removed.'), 'fail');
  }
  setVercelBusy(false);
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
  const vercelBtn = document.createElement('button');
  vercelBtn.type = 'button'; vercelBtn.className = 'head-btn vercel-toggle'; vercelBtn.textContent = 'VERCEL';
  vercelBtn.title = 'Configure Vercel for this project'; vercelBtn.setAttribute('aria-label', 'Configure Vercel for this project');
  const composeBtn = document.createElement('button');
  composeBtn.type = 'button'; composeBtn.className = 'head-btn compose-toggle'; composeBtn.textContent = 'COMPOSE';
  composeBtn.title = 'Open multiline composer (⌘⇧Enter)'; composeBtn.setAttribute('aria-label', 'Open multiline composer');
  termHead.append(termLabel, termCwd, vercelBtn, composeBtn);
  const termHost = document.createElement('div');
  termHost.className = 'term-host';
  const startupLoader = document.createElement('section');
  startupLoader.className = 'agent-startup-loader hidden';
  startupLoader.setAttribute('role', 'status');
  startupLoader.setAttribute('aria-live', 'polite');
  startupLoader.setAttribute('aria-atomic', 'true');
  const startupEyebrow = document.createElement('div');
  startupEyebrow.className = 'agent-startup-eyebrow';
  startupEyebrow.textContent = 'AGENT SESSION';
  const startupTitle = document.createElement('div');
  startupTitle.className = 'agent-startup-title';
  const startupStatus = document.createElement('div');
  startupStatus.className = 'agent-startup-status';
  const startupCwd = document.createElement('div');
  startupCwd.className = 'agent-startup-cwd';
  startupCwd.textContent = session.cwd;
  startupCwd.title = session.cwd;
  const startupRows = document.createElement('div');
  startupRows.className = 'agent-startup-rows';
  startupRows.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 8; index += 1) {
    const row = document.createElement('span');
    row.style.setProperty('--startup-row', String(index));
    startupRows.appendChild(row);
  }
  const revealTerminalBtn = document.createElement('button');
  revealTerminalBtn.type = 'button';
  revealTerminalBtn.className = 'head-btn agent-startup-reveal hidden';
  revealTerminalBtn.textContent = 'SHOW TERMINAL';
  revealTerminalBtn.setAttribute('aria-label', 'Show terminal startup output');
  startupLoader.append(
    startupEyebrow, startupTitle, startupStatus, startupCwd, startupRows, revealTerminalBtn,
  );
  const scrollToBottom = document.createElement('button');
  scrollToBottom.type = 'button';
  scrollToBottom.className = 'term-scroll-bottom hidden';
  scrollToBottom.textContent = '↓ SKIP TO BOTTOM';
  scrollToBottom.title = 'Skip to latest terminal output';
  scrollToBottom.setAttribute('aria-label', 'Skip to latest terminal output');
  termHost.append(scrollToBottom, startupLoader);
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
  const composerContext = document.createElement('div');
  composerContext.className = 'composer-context hidden';
  const contextChips = document.createElement('div');
  contextChips.className = 'composer-context-chips';
  const contextActions = document.createElement('div');
  contextActions.className = 'composer-context-actions';
  const contextTargetLabel = document.createElement('label');
  contextTargetLabel.className = 'composer-target-select';
  const contextTargetText = document.createElement('span');
  contextTargetText.textContent = 'TARGET';
  const contextTarget = document.createElement('select');
  contextTarget.setAttribute('aria-label', 'Prompt target session');
  contextTargetLabel.append(contextTargetText, contextTarget);
  const contextAgentLabel = document.createElement('label');
  contextAgentLabel.className = 'composer-agent-select';
  const contextAgentText = document.createElement('span');
  contextAgentText.textContent = 'AGENT';
  const contextAgent = document.createElement('select');
  contextAgent.setAttribute('aria-label', 'Agent for new session from page');
  for (const agent of AGENT_ORDER) {
    const option = document.createElement('option');
    option.value = agent;
    option.textContent = agentLabel(agent);
    contextAgent.appendChild(option);
  }
  contextAgent.value = session.composer.selectedAgent;
  contextAgentLabel.append(contextAgentText, contextAgent);
  const attachPageBtn = document.createElement('button');
  attachPageBtn.type = 'button';
  attachPageBtn.className = 'head-btn composer-attach-page';
  attachPageBtn.textContent = 'ATTACH CURRENT PAGE';
  const contextError = document.createElement('div');
  contextError.className = 'composer-context-error hidden';
  contextError.setAttribute('role', 'status');
  const switchRouteTargetBtn = document.createElement('button');
  switchRouteTargetBtn.type = 'button';
  switchRouteTargetBtn.className = 'head-btn composer-switch-target hidden';
  switchRouteTargetBtn.textContent = 'SWITCH TO TARGET';
  contextActions.append(contextTargetLabel, contextAgentLabel, attachPageBtn);
  composerContext.append(contextChips, contextActions, contextError, switchRouteTargetBtn);
  const gitComposerInserts = document.createElement('div');
  gitComposerInserts.className = 'git-composer-inserts hidden';
  gitComposerInserts.setAttribute('role', 'toolbar');
  gitComposerInserts.setAttribute('aria-label', 'Git worktree prompt inserts');
  for (const [id, label] of GIT_COMPOSER_INSERTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.gitPromptInsert = id;
    button.textContent = label;
    gitComposerInserts.appendChild(button);
  }
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
  composer.append(
    composerToolbar, composerContext, gitComposerInserts, composerInputChoice,
    composerTextarea, composerActions, historyDrawer,
  );
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
  const searchHtmlBtn = document.createElement('button');
  searchHtmlBtn.className = 'nav-btn html-search-btn'; searchHtmlBtn.textContent = '⌕'; searchHtmlBtn.title = 'Explore project HTML';
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'head-btn browser-rail-toggle collapse-btn';
  collapseBtn.title = 'Open paired browser (⌘⇧B)';
  collapseBtn.setAttribute('aria-label', 'Open paired browser (⌘⇧B)');
  renderBrowserRailToggle(collapseBtn, true);
  const fullscreenBtn = document.createElement('button');
  fullscreenBtn.className = 'head-btn browser-rail-toggle browser-fullscreen-toggle';
  fullscreenBtn.title = 'Fill Chromux with browser';
  fullscreenBtn.setAttribute('aria-label', 'Fill Chromux with browser');
  fullscreenBtn.setAttribute('aria-pressed', 'false');
  renderBrowserFullscreenToggle(fullscreenBtn, 'terminal', 'browserChromux');
  const fullBrowserComposerBtn = document.createElement('button');
  fullBrowserComposerBtn.className = 'head-btn browser-rail-toggle browser-compose-toggle hidden';
  fullBrowserComposerBtn.textContent = 'COMPOSE';
  fullBrowserComposerBtn.title = `Open routed Composer (${composerOpenShortcutLabel()})`;
  fullBrowserComposerBtn.setAttribute('aria-label', fullBrowserComposerBtn.title);
  fullBrowserComposerBtn.setAttribute('aria-pressed', 'false');
  const urlBar = document.createElement('input');
  urlBar.className = 'url-bar'; urlBar.type = 'text'; urlBar.spellcheck = false;
  urlBar.setAttribute('autocomplete', 'off');
  urlBar.placeholder = 'awaiting preview — or type a URL and hit ⏎';
  const urlSuggestions = document.createElement('div');
  urlSuggestions.className = 'url-suggestions hidden';
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
  captureBtn.className = 'head-btn capture-btn'; captureBtn.textContent = '⚡ CAPTURE'; captureBtn.disabled = true;
  captureBtn.title = 'Capture page (console + screenshot + URL) without picking an element';

  browserToolbar.append(back, reload, searchHtmlBtn, urlBar, favoriteBtn, consoleChip, captureChip, queueBtn, favoritesBtn, pickBtn, captureBtn);
  webHead.append(webLabel, browserToolbar);

  const browserTabs = document.createElement('div');
  browserTabs.className = 'browser-tabs';

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
  const explorerHost = document.createElement('div');
  explorerHost.className = 'html-explorer hidden';
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
  webHost.append(placeholder, explorerHost, refreshFlash, urlSuggestions);

  const browserRail = document.createElement('div');
  browserRail.className = 'browser-rail';
  browserRail.append(collapseBtn, fullscreenBtn, fullBrowserComposerBtn);
  browserContent.append(webHead, browserTabs, queuePanel, favoritesPanel, webHost);
  webPane.append(browserContent, browserRail);
  view.append(termPane, divider, webPane);
  $('#views').appendChild(view);

  // wiring
  back.onclick = () => { const tab = activePageTab(session); if (tab && tab.webview) tab.webview.goBack(); };
  reload.onclick = () => {
    const tab = activePageTab(session);
    if (tab && tab.webview) tab.webview.reload();
    else if (activeBrowserTab(session)?.type === 'explorer') refreshHtmlExplorer(session, activeBrowserTab(session));
  };
  searchHtmlBtn.onclick = () => openHtmlExplorer(session);
  urlBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitBrowserUrlEntry(session, urlBar.value);
    }
    if (e.key === 'Escape') urlSuggestions.classList.add('hidden');
  });
  urlBar.addEventListener('input', () => handleBrowserUrlInput(session, urlBar.value));
  urlBar.addEventListener('blur', () => setTimeout(() => urlSuggestions.classList.add('hidden'), 120));
  queueBtn.onclick = () => {
    favoritesPanel.classList.add('hidden');
    queuePanel.classList.toggle('hidden');
  };
  favoritesBtn.onclick = () => {
    queuePanel.classList.add('hidden');
    favoritesPanel.classList.toggle('hidden');
  };
  favoriteBtn.onclick = () => toggleFavorite(session, activePageTab(session)?.currentUrl || urlBar.value);
  vercelBtn.onclick = () => openVercelSetup(session);
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
  contextTarget.addEventListener('change', () => {
    session.composer.routeTargetId = contextTarget.value;
    session.composer.routeError = '';
    session.composer.routeStatus = '';
    session.composer.routeBlockedTargetId = null;
    if (contextTarget.value === COMPOSER_NEW_SESSION_TARGET) {
      session.composer.selectedAgent = session.agent || '';
    }
    renderComposer(session);
  });
  contextAgent.addEventListener('change', () => {
    session.composer.selectedAgent = AGENT_ORDER.includes(contextAgent.value)
      ? contextAgent.value : (session.agent || '');
    session.composer.routeError = '';
    renderComposerContexts(session);
  });
  attachPageBtn.onclick = () => attachCurrentPage(session).catch(() => {});
  switchRouteTargetBtn.onclick = () => {
    const targetId = session.composer.routeBlockedTargetId;
    if (targetId && state.sessions.has(targetId)) activateSession(targetId);
  };
  gitComposerInserts.onclick = (event) => {
    const id = event.target?.dataset?.gitPromptInsert;
    if (id) insertGitComposerPrompt(session, id);
  };
  collapseBtn.onclick = () => setBrowserCollapsed(session, session.browser.layoutMode !== 'terminal');
  fullscreenBtn.onclick = () => advanceBrowserLayout(session);
  fullBrowserComposerBtn.onclick = () => toggleFullBrowserComposer(session);
  pickBtn.onclick = () => (session.browser.picking ? null : startPick(session));
  captureBtn.onclick = () => openCaptureModal(session, { selector: null, outerHTML: null, pageTitle: null, pageUrl: activePageTab(session)?.currentUrl || null });
  revealTerminalBtn.onclick = () => revealAgentTerminal(session, 'manual');

  // divider drag
  divider.addEventListener('mousedown', (e) => {
    if (session.browser.layoutMode !== 'paired') return;
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
    view, termPane, termLabel, termHost, scrollToBottom, startupLoader, startupTitle, startupStatus,
    startupCwd, startupRows, revealTerminalBtn, vercelBtn, composeBtn, composer, composerTextarea, composerStatus, composerCount,
    submitComposerBtn, historyBtn, expandComposerBtn, closeComposerBtn, composerInputChoice, composerInputChoiceActions,
    composerContext, contextChips, contextTarget, contextAgent, attachPageBtn, contextError, switchRouteTargetBtn,
    gitComposerInserts,
    historyDrawer, historySearch, historyList, clearHistoryBtn,
    back, reload, searchHtmlBtn, urlBar, urlSuggestions, favoriteBtn, favoritesBtn, favoritesBadge, favoritesPanel, favoritesList, queueBtn, queueBadge, queuePanel, queueList,
    consoleChip, captureChip, pickBtn, captureBtn, webHost, placeholder, refreshFlash,
    explorerHost, browserTabs, divider, webPane, browserContent, browserRail, browserToolbar,
    collapseBtn, fullscreenBtn, fullBrowserComposerBtn,
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

function insertGitComposerPrompt(session, insertId) {
  if (!session || session.sessionPurpose !== GIT_SESSION_PURPOSE) return false;
  const entry = GIT_COMPOSER_INSERTS.find(([id]) => id === insertId);
  if (!entry || (insertId === 'vercel' && !vercelProjectForSession(state.ui.vercel.projects, session))) return false;
  const textarea = session.els?.composerTextarea;
  const start = Number.isInteger(textarea?.selectionStart) ? textarea.selectionStart : session.composer.draft.length;
  const end = Number.isInteger(textarea?.selectionEnd) ? textarea.selectionEnd : start;
  const before = session.composer.draft.slice(0, start);
  const after = session.composer.draft.slice(end);
  const prompt = entry[2];
  const prefix = before && !before.endsWith('\n') ? '\n\n' : '';
  const suffix = after && !after.startsWith('\n') ? '\n\n' : '';
  const available = Math.max(0, BOUNDS.composerDraftBytes - utf8ByteLength(before + prefix + suffix + after));
  const inserted = truncateUtf8(prompt, available);
  setComposerDraft(session, `${before}${prefix}${inserted}${suffix}${after}`);
  const cursor = before.length + prefix.length + inserted.length;
  requestAnimationFrame(() => {
    session.els.composerTextarea.focus();
    session.els.composerTextarea.setSelectionRange(cursor, cursor);
  });
  return inserted.length === prompt.length;
}

function normalizeBrowserContextReference(context) {
  if (!context || typeof context !== 'object') return null;
  const payloadPath = typeof context.payloadPath === 'string' ? context.payloadPath.slice(0, 8192) : '';
  const url = normalizedBrowserUrl(context.url);
  if (!payloadPath || !url) return null;
  return {
    captureId: typeof context.captureId === 'string' ? context.captureId.slice(0, 200) : '',
    payloadPath,
    screenshotPath: typeof context.screenshotPath === 'string' ? context.screenshotPath.slice(0, 8192) : null,
    url,
    title: typeof context.title === 'string' ? context.title.slice(0, 500) : '',
    capturedAt: typeof context.capturedAt === 'string' ? context.capturedAt : new Date().toISOString(),
    visibleTextTruncated: Boolean(context.visibleTextTruncated),
  };
}

function renderComposerContexts(session) {
  if (!session?.els?.composerContext) return;
  const composer = session.composer;
  const active = composer.fullBrowserOpen && session.browser.layoutMode === 'browserChromux';
  const hasContexts = composer.stagedContexts.length > 0;
  session.els.composerContext.classList.toggle('hidden', !active && !hasContexts);
  const targetSelect = session.els.contextTarget;
  const selectedTarget = composer.routeTargetId;
  targetSelect.innerHTML = '';
  for (const target of orderedSessions().filter((candidate) => candidate.lifecycle.alive)) {
    const option = document.createElement('option');
    option.value = target.id;
    option.textContent = `${target.name} · ${agentLabel(target.agent)}`;
    targetSelect.appendChild(option);
  }
  const selectedSession = selectedTarget && state.sessions.get(selectedTarget);
  if (selectedTarget
    && selectedTarget !== COMPOSER_NEW_SESSION_TARGET
    && (!selectedSession || !selectedSession.lifecycle.alive)) {
    const unavailable = document.createElement('option');
    unavailable.value = selectedTarget;
    unavailable.textContent = `${selectedSession?.name || 'Missing session'} · unavailable`;
    unavailable.disabled = true;
    targetSelect.prepend(unavailable);
  }
  const newOption = document.createElement('option');
  newOption.value = COMPOSER_NEW_SESSION_TARGET;
  newOption.textContent = 'New session';
  targetSelect.appendChild(newOption);
  const fallbackTarget = selectedTarget || (active
    ? (session.lifecycle.alive
      ? session.id
      : orderedSessions().find((candidate) => candidate.lifecycle.alive)?.id)
    : session.id);
  composer.routeTargetId = selectedTarget === COMPOSER_NEW_SESSION_TARGET
    ? selectedTarget : (fallbackTarget || COMPOSER_NEW_SESSION_TARGET);
  targetSelect.value = composer.routeTargetId;
  targetSelect.disabled = composer.routeBusy;
  session.els.contextAgent.value = AGENT_ORDER.includes(composer.selectedAgent)
    ? composer.selectedAgent
    : (session.agent || '');
  const creating = composer.routeTargetId === COMPOSER_NEW_SESSION_TARGET;
  session.els.contextAgent.closest('label')?.classList.toggle('hidden', !creating);
  session.els.contextAgent.disabled = composer.routeBusy;
  session.els.attachPageBtn.disabled = composer.routeBusy || !activePageTab(session)?.currentUrl;
  session.els.attachPageBtn.textContent = composer.routeBusy ? 'WORKING…' : 'ATTACH CURRENT PAGE';
  const feedback = composer.routeError || composer.routeStatus || '';
  session.els.contextError.textContent = feedback;
  session.els.contextError.classList.toggle('hidden', !feedback);
  session.els.contextError.classList.toggle('success', Boolean(composer.routeStatus && !composer.routeError));
  session.els.switchRouteTargetBtn.classList.toggle('hidden', !composer.routeBlockedTargetId);
  session.els.switchRouteTargetBtn.disabled = !state.sessions.has(composer.routeBlockedTargetId);
  const host = session.els.contextChips;
  host.innerHTML = '';
  for (const context of composer.stagedContexts) {
    const chip = document.createElement('span');
    chip.className = 'composer-context-chip';
    chip.title = `${context.url}\n${context.payloadPath}`;
    const label = document.createElement('span');
    label.className = 'composer-context-label';
    label.textContent = `PAGE · ${context.title || context.url}`;
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.textContent = '↻';
    refresh.title = 'Refresh browser evidence';
    refresh.setAttribute('aria-label', 'Refresh browser evidence');
    refresh.disabled = composer.routeBusy;
    refresh.onclick = () => refreshStagedBrowserContext(session, context.captureId).catch(() => {});
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = 'Remove browser evidence';
    remove.setAttribute('aria-label', 'Remove browser evidence');
    remove.disabled = composer.routeBusy;
    remove.onclick = () => {
      session.composer.stagedContexts = session.composer.stagedContexts
        .filter((candidate) => candidate.captureId !== context.captureId);
      renderComposerContexts(session);
    };
    chip.append(label, refresh, remove);
    host.appendChild(chip);
  }
}

function renderFullBrowserComposer(session) {
  if (!session?.els) return;
  const active = Boolean(session.composer.fullBrowserOpen
    && session.composer.open
    && session.browser.layoutMode === 'browserChromux');
  session.els.view.classList.toggle('full-browser-composer-open', active);
  session.els.fullBrowserComposerBtn.classList.toggle('active', active);
  session.els.fullBrowserComposerBtn.setAttribute('aria-pressed', String(active));
  session.els.fullBrowserComposerBtn.title = active
    ? 'Close routed Composer (Escape)'
    : `Open routed Composer (${composerOpenShortcutLabel()})`;
  session.els.fullBrowserComposerBtn.setAttribute(
    'aria-label', session.els.fullBrowserComposerBtn.title
  );
  renderComposerContexts(session);
}

function openFullBrowserComposer(session) {
  if (!session?.els || session.browser.layoutMode !== 'browserChromux') return null;
  session.composer.routeTargetId = session.id;
  session.composer.selectedAgent = session.agent || '';
  session.composer.routeError = '';
  session.composer.routeStatus = '';
  session.composer.routeBlockedTargetId = null;
  session.composer.fullBrowserOpen = true;
  openComposer(session);
  renderFullBrowserComposer(session);
  requestAnimationFrame(() => {
    autosizeComposer(session);
  });
  return { sessionId: session.id, open: true };
}

function closeFullBrowserComposer(session) {
  if (!session?.composer?.fullBrowserOpen) return null;
  session.composer.fullBrowserOpen = false;
  closeComposer(session);
  renderFullBrowserComposer(session);
  return { sessionId: session.id, open: false };
}

function toggleFullBrowserComposer(session) {
  return session?.composer?.fullBrowserOpen
    ? closeFullBrowserComposer(session)
    : openFullBrowserComposer(session);
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
  const routeTarget = composer.routeTargetId === COMPOSER_NEW_SESSION_TARGET
    ? COMPOSER_NEW_SESSION_TARGET
    : state.sessions.get(composer.routeTargetId || session.id);
  const routeAvailable = routeTarget === COMPOSER_NEW_SESSION_TARGET
    || Boolean(routeTarget && routeTarget.lifecycle.alive);
  session.els.composer.classList.toggle('hidden', !composer.open);
  if (session.els.gitComposerInserts) {
    const isGitSession = session.sessionPurpose === GIT_SESSION_PURPOSE;
    session.els.gitComposerInserts.classList.toggle('hidden', !isGitSession);
    const vercelInsert = session.els.gitComposerInserts.querySelector('[data-git-prompt-insert="vercel"]');
    if (vercelInsert) vercelInsert.classList.toggle(
      'hidden',
      !isGitSession || !vercelProjectForSession(state.ui.vercel.projects, session),
    );
  }
  session.els.termPane.classList.toggle('composer-expanded', composer.open && composer.expanded);
  session.els.composeBtn.classList.toggle('active', composer.open);
  session.els.composeBtn.classList.toggle('has-draft', Boolean(composer.draft));
  session.els.composeBtn.textContent = 'COMPOSE';
  session.els.composerTextarea.value = composer.draft;
  session.els.composerCount.textContent = `${utf8ByteLength(composer.draft).toLocaleString()} / ${BOUNDS.composerDraftBytes.toLocaleString()} BYTES`;
  session.els.submitComposerBtn.disabled = composer.routeBusy
    || !routeAvailable
    || (routeTarget !== COMPOSER_NEW_SESSION_TARGET && !composer.draft.trim());
  session.els.submitComposerBtn.textContent = routeTarget === COMPOSER_NEW_SESSION_TARGET
    ? 'CREATE SESSION'
    : 'SEND ⌘⇧↵';
  const pendingText = composer.pendingInputChoice ? composer.pendingInputChoice.text : '';
  const appendOverflows = Boolean(pendingText)
    && utf8ByteLength(`${composer.draft}\n${pendingText}`) > BOUNDS.composerDraftBytes;
  session.els.composerStatus.textContent = composer.routeBusy
    ? 'WORKING…'
    : (!routeAvailable
      ? 'TARGET UNAVAILABLE · DRAFT PRESERVED'
      : (appendOverflows
        ? 'APPEND EXCEEDS 64 KIB · CHOOSE REPLACE, COPY, OR DISMISS'
        : (routeTarget === COMPOSER_NEW_SESSION_TARGET
          ? 'CREATE FOR REVIEW · PROMPT STAYS UNSENT'
          : '⌘⇧ENTER SENDS · ENTER NEWLINE')));
  session.els.historyBtn.classList.toggle('active', composer.drawerOpen);
  session.els.historyDrawer.classList.toggle('hidden', !composer.drawerOpen);
  session.els.expandComposerBtn.textContent = composer.expanded ? 'COLLAPSE' : 'EXPAND';
  session.els.expandComposerBtn.setAttribute('aria-label', composer.expanded ? 'Collapse prompt composer' : 'Expand prompt composer');
  session.els.expandComposerBtn.setAttribute('aria-pressed', String(composer.expanded));
  session.els.composerInputChoice.classList.toggle('hidden', !composer.pendingInputChoice);
  const appendChoice = session.els.composerInputChoiceActions.querySelector('[data-composer-input-action="append"]');
  appendChoice.disabled = appendOverflows;
  appendChoice.title = appendOverflows ? 'Combined text exceeds the 64 KiB composer limit' : '';
  renderComposerContexts(session);
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

function clearPendingTerminalLine(session, resolution) {
  if (!session.lifecycle.alive || !resolution || !resolution.canClear || !session.term.typedInputBuf) return false;
  handleTerminalInput(session, '\x15\x0b');
  // xterm may still display the pre-clear row until Codex redraws. Do not
  // recover that stale value if COMPOSE closes and reopens immediately.
  session.term.promptSnapshotInvalidated = true;
  return true;
}

async function resolveComposerInputChoice(session, action) {
  const pending = session && session.composer.pendingInputChoice;
  if (!pending) return false;
  const pendingText = pending.text;
  if (action === 'append') {
    if (utf8ByteLength(`${session.composer.draft}\n${pendingText}`) > BOUNDS.composerDraftBytes) return false;
    setComposerDraft(session, `${session.composer.draft}\n${pendingText}`);
    clearPendingTerminalLine(session, pending);
  } else if (action === 'replace') {
    setComposerDraft(session, pendingText);
    clearPendingTerminalLine(session, pending);
  } else if (action === 'copy') {
    if (!utf8WithinLimit(pendingText) || !await window.chromux.clipboardWriteText(pendingText)) return false;
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
  if (session.term.startup.phase !== 'revealed') {
    session.term.startup.openComposerOnReveal = true;
    return { sessionId: session.id, open: false, pending: true };
  }
  if (session.composer.open) return { sessionId: session.id, open: true };
  // Resolve while xterm still has its original size and visibility. Codex's
  // rendered editor is canonical; the session-local keystroke model is a
  // bounded fallback when the active buffer cannot be identified safely.
  const pending = resolveCurrentTerminalPrompt(session);
  session.composer.routeTargetId = session.id;
  session.composer.selectedAgent = session.agent || '';
  session.composer.routeError = '';
  session.composer.routeStatus = '';
  session.composer.routeBlockedTargetId = null;
  session.composer.open = true;
  if (pending.text && !session.composer.draft) {
    setComposerDraft(session, pending.text);
    clearPendingTerminalLine(session, pending);
  } else if (pending.text && session.composer.draft) {
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
  session.composer.fullBrowserOpen = false;
  session.composer.routeTargetId = null;
  session.composer.routeBlockedTargetId = null;
  renderComposer(session);
  renderFullBrowserComposer(session);
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

function blockComposerRoute(source, targetId, message) {
  source.composer.routeError = message;
  source.composer.routeStatus = '';
  source.composer.routeBlockedTargetId = targetId && state.sessions.has(targetId) ? targetId : null;
  renderComposer(source);
  return false;
}

function composerRouteConflict(source, target) {
  if (!target) return 'That target session no longer exists.';
  if (!target.lifecycle.alive) return `${target.name} has exited.`;
  if (target.term.startup.phase !== 'revealed') return `${target.name} is still starting.`;
  if (target.id !== source.id && target.composer.draft) {
    return `${target.name} already has a Composer draft.`;
  }
  if (target.composer.pendingInputChoice?.text) {
    return `${target.name} has pending terminal input.`;
  }
  const pending = resolveCurrentTerminalPrompt(target);
  if (pending.text) return `${target.name} has pending terminal input.`;
  return '';
}

async function appendComposerHistory(recipient, text) {
  try {
    recipient.composer.history = await window.chromux.promptHistoryAppend(recipient.cwd, {
      text,
      agent: recipient.agent || 'shell',
      sessionName: recipient.name,
      submittedAt: new Date().toISOString(),
    });
    recipient.composer.historyLoaded = true;
    renderComposerHistory(recipient);
  } catch { /* PTY submission succeeded; persistence failure is non-fatal */ }
}

async function submitComposer(session) {
  if (!session || session.composer.routeBusy) return false;
  const routeTargetId = session.composer.routeTargetId || session.id;
  if (routeTargetId === COMPOSER_NEW_SESSION_TARGET) {
    return Boolean(await createSessionFromPage(session));
  }
  const recipient = state.sessions.get(routeTargetId);
  const conflict = composerRouteConflict(session, recipient);
  if (conflict) return blockComposerRoute(session, routeTargetId, `${conflict} Switch to the target to resolve it.`);
  const text = session.composer.draft.replace(/\r\n?/g, '\n');
  if (!text.trim() || !utf8WithinLimit(text)) return false;
  const payload = composerPayloadWithContexts(text, session.composer.stagedContexts);
  if (!recipient.agent && payload.includes('\n')) {
    session.composer.routeConfirmation = { type: 'multiline-shell', targetId: recipient.id };
    const confirmed = window.confirm(
      `Send this multiline prompt to the ${recipient.name} shell? Each line may be interpreted as shell input.`
    );
    session.composer.routeConfirmation = null;
    if (!confirmed) return false;
  }
  session.composer.routeBusy = true;
  session.composer.routeError = '';
  session.composer.routeStatus = '';
  session.composer.routeBlockedTargetId = null;
  renderComposer(session);
  recipient.term.term.paste(payload);
  recipient.term.term.input('\r', true);
  setComposerDraft(session, '');
  session.composer.stagedContexts = [];
  session.composer.routeStatus = `Sent to ${recipient.name}.`;
  session.composer.routeBusy = false;
  renderComposer(session);
  session.els.composerTextarea.focus();
  await appendComposerHistory(recipient, payload);
  return true;
}

function handleComposerKeydown(session, event) {
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation();
    if (session.composer.fullBrowserOpen) closeFullBrowserComposer(session);
    else closeComposer(session);
    return;
  }
  const primary = state.env && state.env.primaryModifier === 'control' ? event.ctrlKey && !event.metaKey : event.metaKey && !event.ctrlKey;
  if (event.key === 'Enter' && primary && event.shiftKey && !event.altKey) {
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

function persistTabGroups() {
  try {
    window.localStorage.setItem(TAB_GROUPS_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      enabled: Boolean(state.ui.tabGroupsEnabled),
      groups: state.ui.customTabGroups.slice(0, MAX_CUSTOM_TAB_GROUPS)
        .map(({ id, name }) => ({ id, name })),
    }));
  } catch { /* unavailable */ }
}

function normalizeSessionCwd(value) {
  let cwd = String(value || '').trim();
  if (!cwd) return '';
  const driveRoot = /^[a-zA-Z]:[\\/]$/.test(cwd);
  while (!driveRoot && cwd.length > 1 && /[\\/]$/.test(cwd)) cwd = cwd.slice(0, -1);
  return cwd;
}

function directoryGroupId(cwd) {
  return `directory:${normalizeSessionCwd(cwd)}`;
}

function validCustomTabGroup(id) {
  return state.ui.customTabGroups.find((group) => group.id === id) || null;
}

function sessionTabGroupId(session) {
  return validCustomTabGroup(session.customTabGroupId)
    ? session.customTabGroupId
    : directoryGroupId(session.cwd);
}

function directoryLabelParts(cwd) {
  const normalized = normalizeSessionCwd(cwd);
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return { normalized, parts, basename: parts[parts.length - 1] || normalized || '~' };
}

function directoryGroupLabels(directoryCwds) {
  const rows = directoryCwds.map(directoryLabelParts);
  const labels = new Map();
  for (const row of rows) {
    const conflicts = rows.filter((other) => other !== row && other.basename === row.basename);
    if (!conflicts.length) {
      labels.set(row.normalized, row.basename);
      continue;
    }
    const parents = row.parts.slice(0, -1);
    let suffix = row.normalized;
    for (let count = 1; count <= Math.max(1, parents.length); count += 1) {
      const candidate = parents.slice(-count).join('/');
      if (conflicts.every((other) => other.parts.slice(0, -1).slice(-count).join('/') !== candidate)) {
        suffix = candidate || row.normalized;
        break;
      }
    }
    labels.set(row.normalized, `${row.basename} — ${suffix}`);
  }
  return labels;
}

function effectiveTabGroups() {
  const sessions = orderedSessions();
  const members = new Map();
  for (const session of sessions) {
    const id = sessionTabGroupId(session);
    if (!members.has(id)) members.set(id, []);
    members.get(id).push(session);
  }
  const groups = [];
  for (const custom of state.ui.customTabGroups) {
    const customMembers = members.get(custom.id) || [];
    if (customMembers.length) groups.push({ ...custom, kind: 'custom', sessions: customMembers, tooltip: custom.name });
  }
  const directoryIds = [];
  for (const session of sessions) {
    const id = sessionTabGroupId(session);
    if (id.startsWith('directory:') && !directoryIds.includes(id)) directoryIds.push(id);
  }
  const directoryCwds = directoryIds.map((id) => id.slice('directory:'.length));
  const labels = directoryGroupLabels(directoryCwds);
  for (const [index, id] of directoryIds.entries()) {
    const cwd = directoryCwds[index];
    groups.push({
      id,
      name: labels.get(cwd) || cwd || '~',
      kind: 'directory',
      sessions: members.get(id) || [],
      tooltip: cwd || '~',
    });
  }
  return groups;
}

function focusedTabGroup(groups = effectiveTabGroups()) {
  let group = groups.find((candidate) => candidate.id === state.ui.focusedTabGroupId) || null;
  if (!group && state.activeId) {
    group = groups.find((candidate) => candidate.sessions.some((session) => session.id === state.activeId)) || null;
  }
  return group || groups[0] || null;
}

function groupAttentionCount(group) {
  const ids = new Set(group.sessions.map((session) => session.id));
  const attention = window.chromuxAttention.projectAttentionItems({
    sessions: orderedSessions(),
    activeId: state.activeId,
    captures: state.captures.values(),
    updateQueue: state.updateQueue,
    updateStatus: state.updateStatus,
  }).filter((item) => ids.has(item.sessionId) && item.type !== 'queue').length;
  return attention + group.sessions.reduce((total, session) => (
    total + session.browser.queue.filter((item) => item.visibility !== 'browser').length
  ), 0);
}

function groupStatus(group) {
  const priority = new Map([['action', 0], ['dead', 1], ['working', 2], ['pending', 3],
    ['completed', 4], ['idle', 5], ['live', 6]]);
  return group.sessions.map((session) => sessionTabIndicator(session))
    .sort((a, b) => (priority.get(a.kind) ?? 99) - (priority.get(b.kind) ?? 99))[0]
    || { kind: 'live', status: 'No sessions' };
}

function revealHorizontalItem(list, item, rightBoundary = null) {
  if (!list || !item) return;
  const itemRect = item.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const visibleRight = rightBoundary ? Math.min(listRect.right, rightBoundary.getBoundingClientRect().left - 6) : listRect.right;
  if (itemRect.left < listRect.left) list.scrollLeft += itemRect.left - listRect.left;
  else if (itemRect.right > visibleRight) list.scrollLeft += itemRect.right - visibleRight;
}

function selectTabGroup(id, { activate = true } = {}) {
  const groups = effectiveTabGroups();
  const group = groups.find((candidate) => candidate.id === id);
  if (!group) return null;
  state.ui.focusedTabGroupId = group.id;
  if (activate) {
    const remembered = state.ui.lastActiveSessionByGroup.get(group.id);
    const target = group.sessions.find((session) => session.id === remembered) || group.sessions[0];
    if (target) {
      activateSession(target.id);
      return target;
    }
  }
  renderTabs();
  requestAnimationFrame(() => {
    revealHorizontalItem($('#group-tab-list'), $(`#group-tab-list [data-group-id="${CSS.escape(group.id)}"]`), $('#tab-actions'));
  });
  return group;
}

function setSessionCustomTabGroup(session, customTabGroupId) {
  const next = validCustomTabGroup(customTabGroupId) ? customTabGroupId : null;
  session.customTabGroupId = next;
  const destinationId = sessionTabGroupId(session);
  state.ui.focusedTabGroupId = destinationId;
  state.ui.lastActiveSessionByGroup.set(destinationId, session.id);
  persistTabGroups();
  renderTabs();
  if (session.id === state.activeId) activateSession(session.id);
}

function customGroupNameError(rawName, exceptId = null) {
  const name = sanitizeCustomTabGroupName(rawName);
  if (!name) return 'Group names must contain 1–80 characters.';
  if (state.ui.customTabGroups.some((group) => group.id !== exceptId
    && group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return 'Custom group names must be unique.';
  }
  return null;
}

function createCustomTabGroup(rawName) {
  const error = customGroupNameError(rawName);
  if (error || state.ui.customTabGroups.length >= MAX_CUSTOM_TAB_GROUPS) {
    return { group: null, error: error || `At most ${MAX_CUSTOM_TAB_GROUPS} custom groups are allowed.` };
  }
  const name = sanitizeCustomTabGroupName(rawName);
  const id = `group-${globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().toLowerCase()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
  const group = { id, name };
  state.ui.customTabGroups.push(group);
  persistTabGroups();
  renderCustomTabGroups();
  renderTabs();
  return { group, error: null };
}

function renameCustomTabGroup(id, rawName) {
  const group = validCustomTabGroup(id);
  const error = customGroupNameError(rawName, id);
  if (!group || error) return { group: null, error: error || 'Custom group no longer exists.' };
  group.name = sanitizeCustomTabGroupName(rawName);
  persistTabGroups();
  renderCustomTabGroups();
  renderTabs();
  return { group, error: null };
}

function deleteCustomTabGroup(id) {
  const group = validCustomTabGroup(id);
  if (!group) return false;
  const members = orderedSessions().filter((session) => session.customTabGroupId === id);
  if (members.length && !window.confirm(`Delete “${group.name}” and return ${members.length} session${members.length === 1 ? '' : 's'} to automatic directory grouping?`)) {
    return false;
  }
  for (const session of members) session.customTabGroupId = null;
  state.ui.customTabGroups = state.ui.customTabGroups.filter((candidate) => candidate.id !== id);
  state.ui.lastActiveSessionByGroup.delete(id);
  persistTabGroups();
  renderCustomTabGroups();
  renderTabs();
  if (state.activeId) activateSession(state.activeId);
  return true;
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
    if (state.ui.hoverTabSessionId === session.id) return;
    state.ui.hoverTabSessionId = session.id;
    updateTabOverflowState();
  });
  tab.addEventListener('mouseleave', () => {
    if (state.ui.hoverTabSessionId !== session.id) return;
    state.ui.hoverTabSessionId = null;
    updateTabOverflowState();
  });
  const tabList = $('#tab-list');
  const actions = $('#tab-actions');
  if (actions && actions.parentElement === tabList) tabList.insertBefore(tab, actions);
  else tabList.appendChild(tab);
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

function reconcileChildren(host, desiredChildren) {
  const desired = new Set(desiredChildren);
  desiredChildren.forEach((child, index) => {
    const current = host.children[index] || null;
    if (current !== child) host.insertBefore(child, current);
  });
  for (const child of [...host.children]) {
    if (!desired.has(child)) child.remove();
  }
}

function buildGroupTab() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'session-tab group-tab';
  const dot = document.createElement('span');
  dot.className = 'tab-dot live';
  dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'tab-label-wrap';
  const count = document.createElement('span');
  count.className = 'group-session-count';
  const badge = document.createElement('span');
  badge.className = 'tab-badge zero';
  button.append(dot, label, count, badge);
  return button;
}

function updateGroupTab(button, group, focused) {
  const status = groupStatus(group);
  const active = Boolean(focused && group.id === focused.id);
  const badgeValue = groupAttentionCount(group);
  button.className = `session-tab group-tab${active ? ' active' : ''}`;
  button.dataset.groupId = group.id;
  button.title = group.tooltip;
  button.setAttribute('aria-label', `${group.name}. ${group.sessions.length} sessions. ${status.status}.`);
  button.setAttribute('aria-current', active ? 'true' : 'false');
  button.querySelector('.tab-dot').className = `tab-dot ${status.kind}`;
  button.querySelector('.tab-label-wrap').textContent = group.name;
  button.querySelector('.group-session-count').textContent = String(group.sessions.length);
  const badge = button.querySelector('.tab-badge');
  badge.className = `tab-badge${badgeValue ? '' : ' zero'}`;
  badge.textContent = String(badgeValue);
  button.onclick = () => selectTabGroup(group.id);
}

function renderTabs() {
  for (const s of state.sessions.values()) {
    if (!s.els || !s.els.tab) continue;
    s.els.tab.classList.toggle('active', s.id === state.activeId);
    updateSessionTabText(s);
  }
  const nav = $('#session-tabs');
  const tabList = $('#tab-list');
  const groupList = $('#group-tab-list');
  const groupedSessions = $('#group-session-list');
  const actions = $('#tab-actions');
  const grouping = state.ui.tabGroupsEnabled && state.sessions.size > 0;
  nav.classList.toggle('grouped', grouping);
  groupList.classList.toggle('hidden', !grouping);
  groupedSessions.classList.toggle('hidden', !grouping);
  tabList.classList.toggle('hidden', grouping);

  if (!grouping) {
    reconcileChildren(tabList, [...orderedSessions().map((session) => session.els.tab), actions]);
    reconcileChildren(groupList, []);
    reconcileChildren(groupedSessions, []);
  } else {
    const groups = effectiveTabGroups();
    const focused = focusedTabGroup(groups);
    if (focused) state.ui.focusedTabGroupId = focused.id;
    const existingGroups = new Map([...groupList.querySelectorAll(':scope > .group-tab')]
      .map((button) => [button.dataset.groupId, button]));
    const groupTabs = [];
    for (const group of groups) {
      const button = existingGroups.get(group.id) || buildGroupTab();
      updateGroupTab(button, group, focused);
      groupTabs.push(button);
    }
    reconcileChildren(groupList, [...groupTabs, actions]);
    reconcileChildren(groupedSessions, focused ? focused.sessions.map((session) => session.els.tab) : []);
    reconcileChildren(tabList, []);
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
  return ['dead', 'action', 'working', 'pending', 'completed', 'idle', 'live']
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
  const existingOptions = new Map([...selector.options].map((option) => [option.value, option]));
  const options = [];
  for (const session of sessions) {
    const option = existingOptions.get(session.id) || document.createElement('option');
    option.value = session.id;
    option.textContent = `${sessionDisplayLabel(session)}${session.lifecycle.alive ? '' : ' (exited)'}`;
    options.push(option);
  }
  reconcileChildren(selector, options);
  selector.value = inspected ? inspected.id : '';
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
    ? [...document.querySelectorAll(`#thread-list .attention-item[data-session-id="${CSS.escape(inspected.id)}"] .attention-reason`)]
      .map((element) => element.dataset.attentionKind || '')
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
  if (item.type === 'conflict' && item.repositoryId && item.worktreeId) {
    return () => focusGitWorktreeSession(item.repositoryId, item.worktreeId).catch(() => {});
  }
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
    if (item.type === 'queue') {
      setBrowserCollapsed(session, false);
      session.els.favoritesPanel.classList.add('hidden');
      session.els.queuePanel.classList.remove('hidden');
    }
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
  row.dataset.attentionKind = item.kind;
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

function inboxAttentionRows(items) {
  return [
    ...items.filter(({ item }) => !item.sessionId),
    ...attentionSessionRows(items),
  ];
}

function syncThreadSessionRowPresentation(row, session) {
  if (!row || !session) return;
  const status = sessionRailStatus(session);
  const label = sessionDisplayLabel(session);
  const attentionSummary = row.dataset.attentionSummary || '';
  row.dataset.sessionStatus = status.label;
  row.title = `${label} — ${status.label}${attentionSummary ? ` — ${attentionSummary}` : ''}\n${session.cwd || '~'}`;
  row.setAttribute('aria-label', `${label}. ${status.label}.${attentionSummary ? ` Needs attention: ${attentionSummary}.` : ''} ${session.cwd || '~'}`);
  const icon = row.querySelector('.rail-status');
  if (icon) {
    const nextClassName = `rail-status ${status.kind}`;
    if (icon.className !== nextClassName) icon.className = nextClassName;
    if (icon.textContent !== status.icon) icon.textContent = status.icon;
    if (icon.title !== status.label) icon.title = status.label;
    if (icon.getAttribute('aria-label') !== status.label) icon.setAttribute('aria-label', status.label);
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
  const attention = preview.popover.querySelector('.thread-preview-attention');
  const attentionRows = preview.popover.querySelector('.thread-preview-attention-rows');
  const description = preview.popover.querySelector('.thread-preview-description');
  if (title) title.textContent = label;
  preview.popover.setAttribute('aria-label', `Preview ${label}. Click to open session.`);
  if (status) status.textContent = `${agentLabel(session.agent)} · ${sessionRailStatus(session).label}`;
  if (cwd) { cwd.title = session.cwd || '~'; cwd.textContent = session.cwd || '~'; }
  const projected = attentionItems()
    .filter(({ item }) => item.scope === 'session' && item.sessionId === session.id)
    .map(({ item }) => item);
  if (attention && attentionRows) {
    attention.hidden = projected.length === 0;
    attentionRows.replaceChildren(...projected.map((item) => {
      const row = document.createElement('div');
      row.className = `thread-preview-attention-row ${item.cls || ''}`.trim();
      row.dataset.attentionKind = item.kind;
      const kind = document.createElement('span');
      kind.className = `thread-preview-attention-kind attention-kind ${item.cls || ''}`.trim();
      kind.textContent = item.kind;
      const detail = document.createElement('span');
      detail.className = 'thread-preview-attention-detail';
      detail.textContent = item.detail || session.cwd || '~';
      row.append(kind, detail);
      return row;
    }));
  }
  if (description) {
    const summary = projected.map((item) => `${item.kind}: ${item.detail || session.cwd || '~'}`).join('. ');
    description.textContent = `Click to open session.${summary ? ` Needs attention: ${summary}.` : ''}`;
  }
}

function syncThreadSessionPresentation(session) {
  if (!session) return;
  document.querySelectorAll(`#thread-list .rail-session-row[data-session-id="${CSS.escape(session.id)}"]`)
    .forEach((row) => syncThreadSessionRowPresentation(row, session));
  syncThreadPreviewPresentation(session);
}

function reorderMountedThreadRows() {
  if (state.ui.railMode !== 'threads' || state.ui.threadSort !== 'az') return;
  document.querySelectorAll('#thread-list .rail-group:not(.attention-thread-group) > .rail-group-rows')
    .forEach((rows) => {
      const mounted = [...rows.children].filter((row) => row.classList.contains('rail-session-row'));
      const mountedById = new Map(mounted.map((row) => [row.dataset.sessionId, row]));
      const sessions = mounted.map((row) => state.sessions.get(row.dataset.sessionId)).filter(Boolean);
      const target = sortThreadSessions(sessions).map((session) => mountedById.get(session.id)).filter(Boolean);
      if (target.length !== mounted.length
        || target.every((row, index) => row === mounted[index])) return;
      for (const row of target) rows.appendChild(row);
    });
}

function attentionHeaderKind(item) {
  return item && item.kind === 'COMPLETED' ? 'COMPLETE' : (item && item.kind) || '';
}

function appendThreadSessionRow(host, session, { attention = null } = {}) {
  const row = document.createElement('button');
  let pointerFocusPending = false;
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
  const name = document.createElement('span');
  name.className = attention ? 'rail-session-name attention-name' : 'rail-session-name';
  if (!attention) {
    const icon = document.createElement('span');
    icon.className = 'rail-status';
    row.append(icon);
  }
  row.append(name);
  if (attention) {
    const primary = attention.items[0];
    const reason = document.createElement('span');
    reason.className = `attention-kind attention-row-reason ${primary.cls || ''}`;
    reason.dataset.attentionKind = primary.kind;
    reason.textContent = attentionHeaderKind(primary);
    row.appendChild(reason);
    if (attention.items.length > 1) {
      const more = document.createElement('span'); more.className = 'attention-row-more'; more.textContent = `+${attention.items.length - 1}`;
      more.setAttribute('aria-label', `${attention.items.length - 1} additional attention item${attention.items.length === 2 ? '' : 's'}`);
      row.appendChild(more);
    }
  }
  row.addEventListener('pointerenter', () => {
    if (session.id === state.activeId) return;
    const preview = state.ui.threadPreview;
    if (preview?.sessionId === session.id) {
      preview.anchorHovered = true;
      cancelThreadPreviewClose(preview);
      return;
    }
    scheduleThreadPreviewOpen(session, row);
  });
  row.addEventListener('pointerleave', () => {
    cancelThreadPreviewOpen(session.id);
    const preview = state.ui.threadPreview;
    if (preview?.sessionId !== session.id) return;
    preview.anchorHovered = false;
    scheduleThreadPreviewClose(preview);
  });
  row.addEventListener('pointerdown', () => {
    pointerFocusPending = true;
    cancelThreadPreviewOpen();
  });
  row.addEventListener('pointerup', () => { pointerFocusPending = false; });
  row.addEventListener('pointercancel', () => { pointerFocusPending = false; });
  row.addEventListener('focus', () => {
    if (pointerFocusPending || session.id === state.activeId) return;
    cancelThreadPreviewOpen();
    openThreadPreview(session, row);
  });
  row.addEventListener('blur', () => {
    pointerFocusPending = false;
    const preview = state.ui.threadPreview;
    if (preview?.sessionId === session.id) scheduleThreadPreviewClose(preview);
  });
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const pending = state.ui.threadPreviewOpenTimer?.sessionId === session.id;
    const open = state.ui.threadPreview?.sessionId === session.id;
    if (!pending && !open) return;
    event.preventDefault();
    cancelThreadPreviewOpen(session.id);
    if (open) dismissThreadPreview();
  });
  row.onclick = (event) => {
    if (event.detail > 1) return;
    cancelThreadPreviewOpen();
    if (session.id === state.activeId) {
      dismissThreadPreview();
      animateThreadSessionConfirmation(row, session);
    } else {
      dismissThreadPreview();
      activateSession(session.id);
    }
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
    attention.items.forEach((item, index) => {
      const reason = document.createElement('div');
      reason.className = `attention-reason ${index === 0 ? 'primary ' : ''}${item.cls || ''}`.trim();
      reason.dataset.attentionKind = item.kind;
      const copy = document.createElement('div'); copy.className = 'attention-reason-copy';
      const detail = document.createElement('span'); detail.className = 'attention-detail'; detail.textContent = item.detail || attention.session.cwd; detail.title = detail.textContent;
      if (index > 0) {
        const kind = document.createElement('span');
        kind.className = `attention-kind ${item.cls || ''}`;
        kind.dataset.attentionKind = item.kind;
        kind.textContent = item.kind;
        copy.appendChild(kind);
      }
      copy.appendChild(detail);
      const actions = document.createElement('div'); actions.className = 'attention-actions'; appendAttentionActions(actions, item);
      reason.append(copy, actions); reasons.appendChild(reason);
    });
    card.appendChild(reasons); rows.appendChild(card);
  }
  details.append(summary, rows); host.appendChild(details);
}

function workingSessionRows() {
  return sortThreadSessions(orderedSessions().filter((session) => session.lifecycle && session.lifecycle.alive
    && session.turn && session.turn.state === 'working'));
}

function appendWorkingSessionsGroup(host, sessions) {
  if (sessions.length === 0) return;
  const details = document.createElement('details');
  details.className = 'rail-group working-thread-group';
  details.dataset.groupKey = 'status:working';
  details.open = true;
  details.addEventListener('toggle', () => {
    if (!details.open) details.open = true;
  });
  const summary = document.createElement('summary'); summary.title = 'Sessions with an agent turn in progress';
  const label = document.createElement('span'); label.className = 'rail-group-label'; label.textContent = 'WORKING';
  const count = document.createElement('span'); count.className = 'rail-group-count'; count.textContent = String(sessions.length);
  summary.append(label, count);
  const rows = document.createElement('div'); rows.className = 'rail-group-rows';
  for (const session of sessions) appendThreadSessionRow(rows, session);
  details.append(summary, rows); host.appendChild(details);
}

function snapshotInboxTriage() {
  return [...state.ui.inboxTriage.values()]
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(-200)
    .map((record) => ({ ...record }));
}

function inboxTriageKey(item) {
  if (item.inboxId) return item.inboxId;
  return `attention:${item.scope || 'session'}:${item.type || 'unknown'}:${item.sessionId || 'global'}`.slice(0, 200);
}

function inboxReopenToken(item) {
  if (item.reopenToken) return String(item.reopenToken).slice(0, 200);
  return `${item.id || ''}:${item.createdAt || 0}:${item.detail || ''}`.slice(0, 200);
}

function inboxItemVisible(item) {
  const key = inboxTriageKey(item);
  const record = state.ui.inboxTriage.get(key);
  if (!record) return true;
  if (record.reopenToken !== inboxReopenToken(item)) {
    state.ui.inboxTriage.delete(key);
    return true;
  }
  if (record.state === 'snoozed' && Date.parse(record.snoozedUntil || '') <= Date.now()) {
    state.ui.inboxTriage.delete(key);
    return true;
  }
  return false;
}

function persistInboxTriage() {
  window.chromux.saveRestoreSnapshot({
    reason: 'inbox-triage',
    sessions: snapshotOpenSessions(),
    inboxTriage: snapshotInboxTriage(),
  }).catch(() => {});
}

function setInboxTriage(item, stateName, snoozedUntil = null) {
  const updatedAt = new Date().toISOString();
  state.ui.inboxTriage.set(inboxTriageKey(item), {
    id: inboxTriageKey(item),
    state: stateName,
    updatedAt,
    ...(snoozedUntil ? { snoozedUntil: new Date(snoozedUntil).toISOString() } : {}),
    reopenToken: inboxReopenToken(item),
  });
  persistInboxTriage();
  invalidate('attention');
}

function snoozeTarget(preset) {
  const now = new Date();
  if (preset === 'hour') return now.getTime() + 60 * 60 * 1000;
  if (preset === 'tomorrow') {
    const target = new Date(now); target.setDate(target.getDate() + 1); target.setHours(9, 0, 0, 0); return target.getTime();
  }
  if (preset === 'week') {
    const target = new Date(now); target.setDate(target.getDate() + 7); target.setHours(9, 0, 0, 0); return target.getTime();
  }
  return null;
}

function openCustomSnooze(item) {
  const value = window.prompt('Snooze until (local date and time)', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  if (!value) return;
  const target = Date.parse(value);
  if (Number.isFinite(target) && target > Date.now()) setInboxTriage(item, 'snoozed', target);
}

function appendInboxItem(host, rowData) {
  const { session } = rowData;
  const items = rowData.items || [rowData.item];
  const item = items[0];
  const card = document.createElement('article');
  const system = !session.id;
  card.className = `inbox-item${system
    ? ` attention-item attention-system-row ${item.cls || ''}`
    : ` attention-item attention-thread ${item.cls || ''}`}`.trim();
  if (system) card.dataset.attentionKind = item.kind;
  card.tabIndex = -1;
  card.dataset.inboxId = inboxTriageKey(item);
  if (!system) card.dataset.sessionId = session.id;
  let open;
  const snoozeButtons = [];
  let snoozeItem = item;
  if (system) {
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'inbox-item-main';
    const title = document.createElement('span'); title.className = 'inbox-item-title'; title.textContent = sessionDisplayLabel(session);
    const kind = document.createElement('span'); kind.className = 'inbox-item-kind'; kind.textContent = item.kind || 'REVIEW';
    const detail = document.createElement('span'); detail.className = 'inbox-item-detail'; detail.textContent = item.detail || session.cwd || '';
    main.append(title, kind, detail);
    open = attentionAction(item);
    main.onclick = open;
    const actions = document.createElement('div'); actions.className = `inbox-item-actions${system ? ' attention-actions' : ''}`;
    const openButton = document.createElement('button'); openButton.type = 'button';
    if (system) openButton.className = 'qi-btn open';
    openButton.textContent = item.primaryAction || 'OPEN'; openButton.onclick = open;
    const done = document.createElement('button'); done.type = 'button'; done.textContent = 'DONE';
    if (system) done.className = 'qi-btn';
    done.onclick = () => setInboxTriage(item, 'done');
    const snooze = document.createElement('button'); snooze.type = 'button'; snooze.textContent = 'SNOOZE';
    if (system) snooze.className = 'qi-btn';
    snoozeButtons.push([snooze, item]);
    actions.appendChild(openButton);
    if (system && attentionItemDismissible(item)) {
      const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'qi-btn'; dismiss.textContent = 'DISMISS';
      dismiss.onclick = () => dismissAttentionItem(item); actions.appendChild(dismiss);
    }
    actions.append(done, snooze);
    card.append(main, actions);
  } else {
    appendThreadSessionRow(card, session, { attention: { session, items } });
    const reasons = document.createElement('div'); reasons.className = 'attention-reasons';
    items.forEach((reasonItem, index) => {
      const reason = document.createElement('div');
      reason.className = `attention-reason ${index === 0 ? 'primary ' : ''}${reasonItem.cls || ''}`.trim();
      reason.dataset.attentionKind = reasonItem.kind;
      const copy = document.createElement('div'); copy.className = 'attention-reason-copy';
      if (index > 0) {
        const kind = document.createElement('span'); kind.className = `attention-kind ${reasonItem.cls || ''}`;
        kind.textContent = reasonItem.kind; copy.appendChild(kind);
      }
      const detail = document.createElement('span'); detail.className = 'attention-detail';
      detail.textContent = reasonItem.detail || session.cwd || ''; detail.title = detail.textContent; copy.appendChild(detail);
      const actions = document.createElement('div'); actions.className = 'attention-actions';
      appendAttentionActions(actions, reasonItem);
      const done = document.createElement('button'); done.type = 'button'; done.className = 'qi-btn'; done.textContent = 'DONE';
      done.onclick = () => setInboxTriage(reasonItem, 'done');
      const snooze = document.createElement('button'); snooze.type = 'button'; snooze.className = 'qi-btn'; snooze.textContent = 'SNOOZE';
      snoozeButtons.push([snooze, reasonItem]);
      actions.append(done, snooze); reason.append(copy, actions); reasons.appendChild(reason);
    });
    card.appendChild(reasons);
  }
  const menu = document.createElement('div'); menu.className = 'inbox-snooze-menu hidden';
  for (const [preset, label] of [['hour', '1 HOUR'], ['tomorrow', 'TOMORROW'], ['week', 'NEXT WEEK']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.onclick = () => setInboxTriage(snoozeItem, 'snoozed', snoozeTarget(preset));
    menu.appendChild(button);
  }
  const custom = document.createElement('button'); custom.type = 'button'; custom.textContent = 'CUSTOM DATE';
  custom.onclick = () => openCustomSnooze(snoozeItem); menu.appendChild(custom);
  for (const [button, target] of snoozeButtons) {
    button.onclick = () => {
      snoozeItem = target;
      menu.classList.toggle('hidden');
    };
  }
  card.appendChild(menu);
  host.appendChild(card);
}

function appendInboxSection(host, { key, label, rows, css = '', renderRow = appendInboxItem }) {
  if (rows.length === 0 && key !== 'all-sessions') return null;
  const section = document.createElement('section');
  section.className = `inbox-section ${css}${key === 'action-required' ? ' rail-group attention-thread-group' : ''}${key === 'ready-finish' ? ' rail-group ready-finish-group' : ''}${key === 'working' ? ' rail-group working-thread-group' : ''}`.trim();
  section.dataset.inboxSection = key;
  if (key === 'action-required') section.dataset.groupKey = 'attention:needs';
  if (key === 'ready-finish') section.dataset.groupKey = 'ready:finish';
  if (key === 'working') section.dataset.groupKey = 'status:working';
  section.open = true;
  const header = document.createElement('header');
  const title = document.createElement('span'); title.className = 'rail-group-label'; title.textContent = label;
  const count = document.createElement('span'); count.className = 'inbox-section-count rail-group-count'; count.textContent = String(rows.length);
  header.append(title, count);
  const body = document.createElement('div');
  body.className = 'inbox-section-body rail-group-rows';
  if (rows.length === 0) {
    const empty = document.createElement('div'); empty.className = 'inbox-empty'; empty.textContent = 'Nothing here.';
    body.appendChild(empty);
  } else {
    for (const row of rows) renderRow(body, row);
  }
  section.append(header, body); host.appendChild(section);
  return body;
}

function renderAttentionQueue() {
  const host = $('#thread-list');
  if (!host) return;
  for (const session of orderedSessions()) {
    if (session.lifecycle?.alive) ensureGitRoot(session.cwd || '~');
  }
  host.innerHTML = '';
  const items = attentionItems();
  const visibleAttention = items.filter(({ item }) => inboxItemVisible(item));
  const actionTypes = new Set(['permission', 'authentication', 'input', 'rateLimited', 'toolFailed', 'delivery', 'updateFailed']);
  const liveSessions = new Map(orderedSessions()
    .filter((session) => session.lifecycle?.alive)
    .map((session) => [session.id, session]));
  const sessionRows = new Map();
  const systemRows = [];
  for (const row of visibleAttention) {
    if (!row.item.sessionId || !liveSessions.has(row.item.sessionId)) {
      systemRows.push(row);
      continue;
    }
    if (!sessionRows.has(row.item.sessionId)) {
      sessionRows.set(row.item.sessionId, { session: liveSessions.get(row.item.sessionId), items: [] });
    }
    sessionRows.get(row.item.sessionId).items.push(row.item);
  }
  for (const repository of state.ui.gitInventory?.repositories || []) {
    for (const worktree of repository.worktrees || []) {
      if (!worktree.conflicted) continue;
      const session = (worktree.associatedSessionIds || [])
        .map((id) => liveSessions.get(id))
        .filter(Boolean)
        .sort((a, b) => sessionActivityAt(b) - sessionActivityAt(a))[0];
      if (!session) continue;
      const conflictItem = {
        id: `git-conflict:${worktree.id}`,
        inboxId: `git-conflict:${worktree.id}`,
        reopenToken: `${worktree.head || ''}:${worktree.totals?.conflicted || 0}:${worktree.latestRelevantAt || ''}`,
        type: 'conflict',
        kind: 'CONFLICT',
        scope: 'session',
        sessionId: session.id,
        detail: `${worktree.branch || 'detached'} · ${worktree.totals?.conflicted || 0} conflicted`,
        repositoryId: repository.id,
        worktreeId: worktree.id,
        primaryAction: 'OPEN GIT SESSION',
        createdAt: Date.parse(worktree.latestRelevantAt || repository.lastSeenAt) || 0,
        cls: 'failed',
      };
      if (!inboxItemVisible(conflictItem)) continue;
      if (!sessionRows.has(session.id)) sessionRows.set(session.id, { session, items: [] });
      sessionRows.get(session.id).items.push(conflictItem);
    }
  }
  const rankedRows = [...sessionRows.values()];
  const actionRequired = [
    ...systemRows.filter(({ item }) => actionTypes.has(item.type)),
    ...rankedRows.filter((row) => row.items.some((item) => actionTypes.has(item.type) || item.type === 'conflict')),
  ];
  const actionSessionIds = new Set(actionRequired.map((row) => row.session?.id).filter((id) => liveSessions.has(id)));
  const ready = [
    ...systemRows.filter(({ item }) => !actionTypes.has(item.type)),
    ...rankedRows.filter((row) => !actionSessionIds.has(row.session.id)),
  ];
  const readySessionIds = new Set(ready.map((row) => row.session?.id).filter((id) => liveSessions.has(id)));
  const working = workingSessionRows()
    .filter((session) => !actionSessionIds.has(session.id) && !readySessionIds.has(session.id));
  const workingIds = new Set(working.map((session) => session.id));
  const rankedSessionIds = new Set([...actionSessionIds, ...readySessionIds, ...workingIds]);
  const allSessions = sortThreadSessions([...liveSessions.values()]
    .filter((session) => !rankedSessionIds.has(session.id)));
  renderRailNavigation(actionRequired.length + ready.length);
  if (state.ui.railMode === 'git') {
    renderGitDiffRail(host);
    return;
  }
  appendInboxSection(host, {
    key: 'action-required',
    label: 'ACTION REQUIRED',
    css: 'action-required',
    rows: actionRequired,
  });
  appendInboxSection(host, {
    key: 'ready-finish',
    label: 'READY TO FINISH',
    css: 'ready-finish',
    rows: ready,
  });
  appendInboxSection(host, {
    key: 'working',
    label: 'WORKING',
    css: 'working',
    rows: working,
    renderRow: (body, session) => appendThreadSessionRow(body, session),
  });
  const allBody = appendInboxSection(host, {
    key: 'all-sessions',
    label: 'ALL SESSIONS',
    css: 'all-sessions',
    rows: allSessions,
    renderRow: (body, session) => appendThreadSessionRow(body, session),
  });
  allBody.innerHTML = '';
  renderGroupedSessionRail(allBody, 'threads', rankedSessionIds);
  syncInboxQueueFocus();
}

function renderRailNavigation(attentionCount) {
  const mode = RAIL_MODES.has(state.ui.railMode) ? state.ui.railMode : 'threads';
  const heading = $('#rail-heading');
  if (heading) heading.textContent = mode === 'git' ? 'GIT CHANGES' : mode.toUpperCase();
  const sortToggle = $('#thread-sort-toggle');
  if (sortToggle) {
    const recent = state.ui.threadSort === 'recent';
    sortToggle.dataset.order = recent ? 'recent' : 'az';
    sortToggle.classList.toggle('hidden', mode !== 'threads');
    sortToggle.setAttribute('aria-label', `Thread order: ${recent ? 'Recent' : 'A–Z'}`);
    sortToggle.title = recent ? 'Sort threads A–Z' : 'Sort threads by recent activity';
    sortToggle.setAttribute('aria-pressed', String(!recent));
  }
  $('#thread-toolbar')?.classList.remove('hidden');
  $('#git-toolbar')?.classList.toggle('hidden', mode !== 'git');
  document.querySelectorAll('[data-git-filter]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.gitFilter === state.ui.gitFilter));
  });
  const count = $('#rail-thread-count');
  if (count) {
    count.textContent = String(attentionCount);
    count.classList.toggle('zero', attentionCount === 0);
    count.setAttribute('aria-label', `${attentionCount} attention item${attentionCount === 1 ? '' : 's'}`);
  }
  const reviewable = (state.ui.gitInventory?.repositories || [])
    .flatMap((repository) => repository.worktrees || [])
    .filter(gitWorktreeNeedsAction);
  const conflicts = reviewable.filter((worktree) => worktree.conflicted).length;
  const gitCount = $('#rail-git-count');
  if (gitCount) {
    gitCount.textContent = String(reviewable.length);
    gitCount.classList.toggle('zero', reviewable.length === 0);
    gitCount.classList.toggle('conflict', conflicts > 0);
    gitCount.setAttribute('aria-label', `${reviewable.length} Git worktree${reviewable.length === 1 ? '' : 's'} to review${conflicts ? `, ${conflicts} conflicted` : ''}`);
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

function selectThreadSort(mode, { persist = true } = {}) {
  const next = THREAD_SORT_MODES.has(mode) ? mode : 'recent';
  state.ui.threadSort = next;
  if (persist) {
    try { window.localStorage.setItem(THREAD_SORT_STORAGE_KEY, next); } catch { /* unavailable */ }
  }
  invalidate('attention');
  return next;
}

function directoryBasename(directory) {
  const clean = String(directory || '~').replace(/\/+$/, '');
  return clean.split('/').filter(Boolean).pop() || clean || '/';
}

function compareThreadText(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}

function compareSessionTieBreakers(a, b) {
  return compareThreadText(sessionDisplayLabel(a), sessionDisplayLabel(b))
    || compareThreadText(a.cwd, b.cwd)
    || compareThreadText(a.id, b.id);
}

function sessionActivityAt(session) {
  return Number.isFinite(session && session.lastActivityAt) ? session.lastActivityAt : 0;
}

function sortThreadSessions(sessions) {
  return [...sessions].sort((a, b) => (state.ui.threadSort === 'recent'
    ? sessionActivityAt(b) - sessionActivityAt(a)
    : 0) || compareSessionTieBreakers(a, b));
}

function sessionRailStatus(session) {
  return window.chromuxAttention.projectSessionStatus(session, state.ui.tabActivityIndicators);
}

function ensureGitRoot(cwd) {
  if (state.ui.gitRoots.has(cwd)) return state.ui.gitRoots.get(cwd);
  const entry = { value: undefined, promise: null };
  entry.promise = Promise.resolve(window.chromux.gitRoot(cwd))
    .then((root) => {
      entry.value = typeof root === 'string' && root ? root : null;
      const session = orderedSessions().filter((candidate) => candidate.cwd === cwd)
        .sort((a, b) => sessionActivityAt(b) - sessionActivityAt(a))[0];
      if (entry.value && session) {
        window.chromux.gitRepositoryObserve({
          runtime: session.runtime === 'wsl' ? 'wsl' : 'host',
          distro: session.distro || null,
          cwd,
          activityAt: sessionActivityAt(session),
        }).then(() => refreshGitInventory({ force: true })).catch(() => {});
      }
    })
    .catch(() => { entry.value = null; })
    .finally(() => invalidate('attention'));
  state.ui.gitRoots.set(cwd, entry);
  return entry;
}

function gitInventorySessions() {
  return orderedSessions().map((session) => ({
    sessionId: session.id,
    runtime: session.runtime === 'wsl' ? 'wsl' : 'host',
    distro: session.distro || null,
    cwd: session.cwd,
    activityAt: sessionActivityAt(session),
  }));
}

function refreshGitInventory({ force = false } = {}) {
  if (state.ui.gitInventoryPromise && !force) return state.ui.gitInventoryPromise;
  if (state.ui.gitInventoryPromise && force) return state.ui.gitInventoryPromise;
  const sessions = gitInventorySessions();
  state.ui.gitInventoryPromise = Promise.all(sessions.map((session) => window.chromux.gitRepositoryObserve({
    runtime: session.runtime,
    distro: session.distro,
    cwd: session.cwd,
    activityAt: session.activityAt,
  }).catch(() => null))).then(() => window.chromux.gitWorktreeInventory({ sessions })).then((response) => {
    if (!response?.ok) throw new Error(response?.error?.message || 'Git inventory failed.');
    state.ui.gitInventory = response;
    state.ui.gitInventoryError = null;
    return response;
  }).catch((error) => {
    state.ui.gitInventoryError = error.message || 'Git inventory failed.';
    return null;
  }).finally(() => {
    state.ui.gitInventoryPromise = null;
    invalidate('attention');
  });
  return state.ui.gitInventoryPromise;
}

function gitWorktreeNeedsAction(worktree) {
  return Boolean(worktree && (
    worktree.conflicted
    || worktree.locked
    || worktree.prunable
    || worktree.dirty
    || worktree.unpublished
    || worktree.ahead > 0
    || worktree.behind > 0
  ));
}

function gitWorktreeMatchesFilter(repository, worktree) {
  const filter = GIT_FILTERS.has(state.ui.gitFilter) ? state.ui.gitFilter : 'action';
  if (filter === 'action' && !gitWorktreeNeedsAction(worktree)) return false;
  if (filter === 'stale' && !(worktree.stale || worktree.prunable || worktree.locked)) return false;
  const query = String(state.ui.gitSearch || '').trim().toLocaleLowerCase();
  if (!query) return true;
  return [
    repository.label,
    repository.root,
    worktree.branch,
    worktree.path,
    worktree.upstream,
  ].some((value) => String(value || '').toLocaleLowerCase().includes(query));
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
  if (!state.ui.gitInventory && !state.ui.gitInventoryPromise) refreshGitInventory();
  if (state.ui.gitInventoryError) {
    const empty = document.createElement('div');
    empty.className = 'attention-empty error';
    empty.textContent = state.ui.gitInventoryError;
    host.appendChild(empty);
    return;
  }
  const repositories = state.ui.gitInventory?.repositories || [];
  if (repositories.length === 0) {
    const empty = document.createElement('div'); empty.className = 'attention-empty';
    empty.textContent = state.ui.gitInventoryPromise ? 'Scanning known repositories…' : 'No known Git repositories yet.';
    host.appendChild(empty); return;
  }
  let visibleWorktrees = 0;
  for (const repository of repositories) {
    const filtered = (repository.worktrees || [])
      .filter((worktree) => gitWorktreeMatchesFilter(repository, worktree));
    if (filtered.length === 0) continue;
    visibleWorktrees += filtered.length;
    const card = document.createElement('section'); card.className = 'git-repository-card'; card.dataset.repositoryId = repository.id;
    const head = document.createElement('div'); head.className = 'git-repository-head';
    const copy = document.createElement('div'); copy.className = 'git-repository-copy';
    const label = document.createElement('b'); label.textContent = repository.label;
    const root = document.createElement('span'); root.textContent = repository.root; root.title = repository.root;
    copy.append(label, root);
    const forget = document.createElement('button'); forget.type = 'button'; forget.className = 'git-mini-button'; forget.textContent = 'FORGET';
    forget.title = 'Remove from Chromux catalog without touching repository files';
    forget.onclick = async () => {
      if (!window.confirm(`Forget ${repository.root} from Chromux?\n\nNo repository files will be changed.`)) return;
      const result = await window.chromux.gitRepositoryForget(repository.id);
      if (result?.ok) refreshGitInventory({ force: true });
    };
    head.append(copy, forget); card.appendChild(head);
    if (repository.error) {
      const message = document.createElement('div'); message.className = 'git-diff-empty error'; message.textContent = repository.error;
      card.appendChild(message);
    }
    for (const worktree of filtered) {
      const row = document.createElement('button'); row.type = 'button';
      row.className = `git-worktree-row${worktree.conflicted || worktree.locked ? ' blocked' : ''}`;
      row.dataset.worktreeId = worktree.id;
      const name = document.createElement('span'); name.className = 'git-worktree-name';
      name.textContent = worktree.branch || 'DETACHED HEAD';
      const badges = document.createElement('span'); badges.className = 'git-worktree-badges';
      badges.textContent = [
        worktree.conflicted ? 'CONFLICT' : null,
        worktree.stale ? 'STALE' : null,
        worktree.prunable ? 'PRUNABLE' : null,
        worktree.locked ? 'LOCKED' : null,
      ].filter(Boolean).join(' · ') || (gitWorktreeNeedsAction(worktree) ? 'ACTION' : 'CLEAN');
      const detail = document.createElement('span'); detail.className = 'git-worktree-detail';
      const associated = (worktree.associatedSessionIds || []).filter((id) => state.sessions.has(id)).length;
      detail.textContent = [
        worktree.path,
        `${worktree.totals?.staged || 0} staged`,
        `${worktree.totals?.unstaged || 0} unstaged`,
        `${worktree.totals?.untracked || 0} untracked`,
        `${worktree.totals?.conflicted || 0} conflicted`,
        `↑${worktree.ahead || 0} ↓${worktree.behind || 0}`,
        worktree.latestRelevantAt ? relativeAge(Date.parse(worktree.latestRelevantAt)) : 'age unknown',
        `${associated} session${associated === 1 ? '' : 's'}`,
      ].join(' · ');
      row.append(name, badges, detail);
      row.onclick = () => focusGitWorktreeSession(repository.id, worktree.id).catch(() => {});
      card.appendChild(row);
    }
    host.appendChild(card);
  }
  if (visibleWorktrees === 0) {
    const empty = document.createElement('div');
    empty.className = 'attention-empty';
    empty.textContent = state.ui.gitSearch
      ? 'No worktrees match this search and filter.'
      : state.ui.gitFilter === 'stale'
        ? 'No stale worktrees.'
        : state.ui.gitFilter === 'action'
          ? 'No worktrees need review.'
          : 'No worktrees in the catalog.';
    host.appendChild(empty);
  }
}

function selectedGitWorktree(repositoryId, worktreeId) {
  const repository = state.ui.gitInventory?.repositories?.find((candidate) => candidate.id === repositoryId);
  const worktree = repository?.worktrees?.find((candidate) => candidate.id === worktreeId);
  return repository && worktree ? { repository, worktree } : null;
}

function gitWorktreeIdentity(repository, worktree) {
  return {
    runtime: repository.runtime === 'wsl' ? 'wsl' : 'host',
    distro: repository.runtime === 'wsl' ? (repository.distro || null) : null,
    path: worktree.path,
  };
}

function gitWorktreeIdentityMatches(session, identity) {
  const candidate = session?.sessionPurpose === GIT_SESSION_PURPOSE
    ? session.worktreeIdentity : null;
  return Boolean(candidate
    && candidate.runtime === identity.runtime
    && (identity.runtime !== 'wsl' || candidate.distro === identity.distro)
    && candidate.path === identity.path);
}

function gitReviewDraft(repository, worktree) {
  return truncateComposerDraft([
    GIT_REVIEW_PROMPT,
    '',
    `Current selection: ${repository.label} · ${worktree.branch || 'detached HEAD'}`,
    `Worktree: ${worktree.path}`,
    `Observed status: ${worktree.totals?.staged || 0} staged · ${worktree.totals?.unstaged || 0} unstaged · ${worktree.totals?.untracked || 0} untracked · ${worktree.totals?.conflicted || 0} conflicted · ↑${worktree.ahead || 0} ↓${worktree.behind || 0}.`,
  ].join('\n'));
}

async function focusGitWorktreeSession(repositoryId, worktreeId, { refreshed = false } = {}) {
  const target = selectedGitWorktree(repositoryId, worktreeId);
  if (!target) {
    selectRailMode('git');
    if (refreshed) return null;
    await refreshGitInventory({ force: true });
    return focusGitWorktreeSession(repositoryId, worktreeId, { refreshed: true });
  }
  const { repository, worktree } = target;
  const identity = gitWorktreeIdentity(repository, worktree);
  let session = orderedSessions()
    .filter((candidate) => candidate.lifecycle?.alive && gitWorktreeIdentityMatches(candidate, identity))
    .sort((a, b) => sessionActivityAt(b) - sessionActivityAt(a))[0] || null;
  if (!session) {
    const associated = (worktree.associatedSessionIds || [])
      .map((id) => state.sessions.get(id))
      .filter(Boolean)
      .sort((a, b) => sessionActivityAt(b) - sessionActivityAt(a))[0] || null;
    const agent = associated?.agent || 'codex';
    session = await createSession({
      name: `Git · ${worktree.branch || 'detached'}`,
      cwd: worktree.path,
      runtime: identity.runtime,
      distro: identity.distro,
      agent,
      composerDraft: gitReviewDraft(repository, worktree),
      sessionPurpose: GIT_SESSION_PURPOSE,
      worktreeIdentity: identity,
      activate: true,
    });
  } else if (!session.composer.draft) {
    setComposerDraft(session, gitReviewDraft(repository, worktree));
  }
  if (!session) return null;
  activateSession(session.id);
  openComposer(session);
  return session;
}

function inboxQueueCards() {
  return [...document.querySelectorAll('#thread-list .inbox-item')];
}

function syncInboxQueueFocus() {
  const cards = inboxQueueCards();
  if (cards.length === 0) {
    state.ui.inboxQueueIndex = 0;
    return;
  }
  state.ui.inboxQueueIndex = Math.max(0, Math.min(state.ui.inboxQueueIndex, cards.length - 1));
  cards.forEach((card, index) => card.classList.toggle('queue-focused', index === state.ui.inboxQueueIndex));
}

function focusInboxQueue(delta) {
  const cards = inboxQueueCards();
  if (cards.length === 0) return;
  state.ui.inboxQueueIndex = (state.ui.inboxQueueIndex + delta + cards.length) % cards.length;
  syncInboxQueueFocus();
  cards[state.ui.inboxQueueIndex].querySelector('.inbox-item-main, .rail-session-row')?.focus();
  cards[state.ui.inboxQueueIndex].scrollIntoView({ block: 'nearest' });
}

function handleInboxQueueKeydown(event) {
  if (state.ui.railMode !== 'threads' || event.defaultPrevented) return false;
  const active = document.activeElement;
  const railContext = active === document.body || active?.closest?.('#rail');
  if (!railContext || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName)) return false;
  const card = active?.closest?.('.inbox-item') || inboxQueueCards()[state.ui.inboxQueueIndex];
  if (event.key === 'j' || event.key === 'ArrowDown') {
    event.preventDefault(); focusInboxQueue(1); return true;
  }
  if (event.key === 'k' || event.key === 'ArrowUp') {
    event.preventDefault(); focusInboxQueue(-1); return true;
  }
  if (!card) return false;
  if (event.key === 'o' || event.key === 'Enter') {
    event.preventDefault(); card.querySelector('.inbox-item-main, .rail-session-row')?.click(); return true;
  }
  if (event.key === 'd') {
    event.preventDefault();
    [...card.querySelectorAll('button')].find((button) => button.textContent === 'DONE')?.click();
    return true;
  }
  if (event.key === 's') {
    event.preventDefault();
    [...card.querySelectorAll('button')].find((button) => button.textContent === 'SNOOZE')?.click();
    return true;
  }
  return false;
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
  if (mode === 'threads') {
    for (const group of groups.values()) {
      group.sessions = sortThreadSessions(group.sessions);
      group.newestActivityAt = Math.max(0, ...group.sessions.map(sessionActivityAt));
    }
    return [...groups.values()].sort((a, b) => (state.ui.threadSort === 'recent'
      ? b.newestActivityAt - a.newestActivityAt
      : 0)
      || (state.ui.threadSort === 'recent' ? compareSessionTieBreakers(a.sessions[0], b.sessions[0]) : 0)
      || compareThreadText(a.label, b.label)
      || compareThreadText(a.title, b.title)
      || compareThreadText(a.key, b.key));
  }
  return [...groups.values()].sort((a, b) => (a.order - b.order)
    || (a.key === 'git:none' ? 1 : b.key === 'git:none' ? -1 : compareThreadText(a.label, b.label)));
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
const THREAD_PREVIEW_HOVER_DELAY_MS = 250;
const THREAD_PREVIEW_EXIT_GRACE_MS = 150;

function cancelThreadPreviewOpen(sessionId = null) {
  const pending = state.ui.threadPreviewOpenTimer;
  if (!pending || (sessionId && pending.sessionId !== sessionId)) return false;
  clearTimeout(pending.timer);
  state.ui.threadPreviewOpenTimer = null;
  return true;
}

function cancelThreadPreviewClose(preview = state.ui.threadPreview) {
  if (!preview?.closeTimer) return false;
  clearTimeout(preview.closeTimer);
  preview.closeTimer = null;
  return true;
}

function threadPreviewContainsFocus(preview) {
  const active = document.activeElement;
  return Boolean(active && (preview.anchor.contains(active) || preview.popover.contains(active)));
}

function scheduleThreadPreviewClose(preview = state.ui.threadPreview) {
  if (!preview || state.ui.threadPreview !== preview) return;
  cancelThreadPreviewClose(preview);
  preview.closeTimer = setTimeout(() => {
    preview.closeTimer = null;
    if (state.ui.threadPreview !== preview
      || preview.anchorHovered
      || preview.popoverHovered
      || threadPreviewContainsFocus(preview)) return;
    dismissThreadPreview({ cancelPendingOpen: false });
  }, THREAD_PREVIEW_EXIT_GRACE_MS);
}

function scheduleThreadPreviewOpen(session, anchor) {
  if (!session || session.id === state.activeId) return;
  cancelThreadPreviewOpen();
  state.ui.threadPreviewOpenTimer = {
    sessionId: session.id,
    timer: setTimeout(() => {
      state.ui.threadPreviewOpenTimer = null;
      const currentAnchor = anchor.isConnected ? anchor
        : document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(session.id)}"]`);
      if (session.id === state.activeId
        || state.ui.railMode !== 'threads'
        || !session.lifecycle?.alive
        || !currentAnchor) return;
      openThreadPreview(session, currentAnchor, { anchorHovered: true });
    }, THREAD_PREVIEW_HOVER_DELAY_MS),
  };
}

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

function threadPreviewRefreshIsCurrent(preview, lifecycleGeneration, refreshGeneration, layer = null) {
  return Boolean(preview
    && state.ui.threadPreview === preview
    && preview.lifecycleGeneration === lifecycleGeneration
    && preview.refreshGeneration === refreshGeneration
    && (!layer || preview.stagingLayer === layer));
}

function setThreadPreviewLayerVisible(layer, visible) {
  if (!layer) return;
  layer.host.classList.toggle('thread-preview-terminal-visible', visible);
  layer.host.classList.toggle('thread-preview-terminal-hidden', !visible);
}

function scaleThreadPreviewTerminal(
  preview = state.ui.threadPreview,
  basisLayer = preview?.visibleLayer,
  { repaintVisible = true } = {},
) {
  if (!preview || state.ui.threadPreview !== preview || !basisLayer) return;
  const screen = basisLayer.host.querySelector('.xterm-screen');
  if (!screen) return;
  const screenRect = screen.getBoundingClientRect();
  const unscaledWidth = screenRect.width / (basisLayer.scale || 1);
  const unscaledHeight = screenRect.height / (basisLayer.scale || 1);
  const scale = Math.min(1,
    basisLayer.host.clientWidth / Math.max(1, unscaledWidth),
    basisLayer.host.clientHeight / Math.max(1, unscaledHeight));
  preview.scale = scale;
  for (const layer of preview.layers) {
    layer.scale = scale;
    layer.host.style.transform = `scale(${scale})`;
  }
  if (repaintVisible) scheduleThreadPreviewPaint(preview, preview.visibleLayer);
}

function scheduleThreadPreviewPaint(preview = state.ui.threadPreview, layer = preview?.visibleLayer) {
  if (!preview || state.ui.threadPreview !== preview || preview.paintFrame) return;
  const lifecycleGeneration = preview.lifecycleGeneration;
  preview.paintFrame = requestAnimationFrame(() => {
    preview.paintFrame = null;
    if (state.ui.threadPreview !== preview
      || preview.lifecycleGeneration !== lifecycleGeneration
      || preview.visibleLayer !== layer
      || !preview.layers.includes(layer)) return;
    // Keep the last complete visible-frame accounting intact while xterm
    // repaints in place. Staging layers clear their accounting separately
    // before a swap, but the mounted layer must never look incomplete between
    // requestAnimationFrame delivery and xterm's render callback.
    preview.paintCount += 1;
    layer.terminal.refresh(0, Math.max(0, layer.terminal.rows - 1));
  });
}

function continueThreadPreviewRefresh(preview) {
  if (!preview || state.ui.threadPreview !== preview || preview.refreshInFlight) return;
  if (!preview.refreshPending) return;
  preview.refreshPending = false;
  beginThreadPreviewRefresh(preview);
}

function finishThreadPreviewRefresh(preview, lifecycleGeneration, refreshGeneration, layer) {
  if (!threadPreviewRefreshIsCurrent(
    preview, lifecycleGeneration, refreshGeneration, layer,
  )) return;
  layer.awaitingPaintGeneration = null;
  preview.refreshInFlight = false;
  preview.activeRefreshes = Math.max(0, preview.activeRefreshes - 1);
  continueThreadPreviewRefresh(preview);
}

function scheduleThreadPreviewSwap(preview, lifecycleGeneration, refreshGeneration, layer) {
  if (!threadPreviewRefreshIsCurrent(
    preview, lifecycleGeneration, refreshGeneration, layer,
  ) || preview.swapFrame) return;
  preview.swapFrame = requestAnimationFrame(() => {
    preview.swapFrame = null;
    if (!threadPreviewRefreshIsCurrent(
      preview, lifecycleGeneration, refreshGeneration, layer,
    ) || layer.awaitingPaintGeneration !== null
      || layer.paintedRows.size < layer.terminal.rows) return;
    const priorVisible = preview.visibleLayer;
    setThreadPreviewLayerVisible(priorVisible, false);
    setThreadPreviewLayerVisible(layer, true);
    preview.visibleLayer = layer;
    preview.stagingLayer = priorVisible;
    preview.refreshCount += 1;
    preview.refreshInFlight = false;
    preview.activeRefreshes = Math.max(0, preview.activeRefreshes - 1);
    continueThreadPreviewRefresh(preview);
  });
}

function recordThreadPreviewRender(preview, layer, start, end) {
  if (!preview || state.ui.threadPreview !== preview || !preview.layers.includes(layer)) return;
  for (let row = start; row <= end; row += 1) layer.paintedRows.add(row);
  const paint = layer.awaitingPaintGeneration;
  if (!paint
    || !threadPreviewRefreshIsCurrent(
      preview, paint.lifecycleGeneration, paint.refreshGeneration, layer,
    )
    || layer.paintedRows.size < layer.terminal.rows) return;
  layer.awaitingPaintGeneration = null;
  scheduleThreadPreviewSwap(
    preview, paint.lifecycleGeneration, paint.refreshGeneration, layer,
  );
}

function paintThreadPreviewStaging(preview, lifecycleGeneration, refreshGeneration, layer) {
  if (!threadPreviewRefreshIsCurrent(
    preview, lifecycleGeneration, refreshGeneration, layer,
  )) return;
  layer.paintedRows.clear();
  layer.awaitingPaintGeneration = { lifecycleGeneration, refreshGeneration };
  preview.paintCount += 1;
  try {
    layer.terminal.refresh(0, Math.max(0, layer.terminal.rows - 1));
  } catch {
    finishThreadPreviewRefresh(preview, lifecycleGeneration, refreshGeneration, layer);
  }
}

function beginThreadPreviewRefresh(preview) {
  if (!preview || state.ui.threadPreview !== preview || preview.refreshInFlight) return;
  const session = state.sessions.get(preview.sessionId);
  if (!session || !session.lifecycle.alive || !session.term.term || !session.term.serializer) {
    dismissThreadPreview();
    return;
  }
  let serialized = '';
  try {
    serialized = session.term.serializer.serialize({ scrollback: THREAD_PREVIEW_SCROLLBACK });
  } catch {
    return;
  }
  const source = session.term.term;
  const layer = preview.stagingLayer;
  const lifecycleGeneration = preview.lifecycleGeneration;
  const refreshGeneration = preview.refreshGeneration + 1;
  preview.refreshGeneration = refreshGeneration;
  preview.refreshInFlight = true;
  preview.refreshPending = false;
  preview.refreshStarts += 1;
  preview.activeRefreshes += 1;
  preview.maxConcurrentRefreshes = Math.max(
    preview.maxConcurrentRefreshes, preview.activeRefreshes,
  );
  layer.awaitingPaintGeneration = null;
  try {
    layer.terminal.reset();
    layer.terminal.resize(
      Math.max(2, source.cols || 80),
      Math.max(1, source.rows || 24),
    );
    layer.terminal.options.theme = terminalThemeFor();
    layer.terminal.write(serialized, () => {
      if (!threadPreviewRefreshIsCurrent(
        preview, lifecycleGeneration, refreshGeneration, layer,
      )) return;
      try {
        layer.terminal.scrollToBottom();
        scaleThreadPreviewTerminal(preview, layer, { repaintVisible: false });
        paintThreadPreviewStaging(
          preview, lifecycleGeneration, refreshGeneration, layer,
        );
      } catch {
        finishThreadPreviewRefresh(
          preview, lifecycleGeneration, refreshGeneration, layer,
        );
      }
    });
  } catch {
    finishThreadPreviewRefresh(preview, lifecycleGeneration, refreshGeneration, layer);
  }
}

function refreshThreadPreview() {
  const preview = state.ui.threadPreview;
  if (!preview) return;
  if (preview.refreshInFlight) {
    preview.refreshPending = true;
    return;
  }
  if (preview.refreshFrame) return;
  const lifecycleGeneration = preview.lifecycleGeneration;
  preview.refreshFrame = requestAnimationFrame(() => {
    preview.refreshFrame = null;
    if (state.ui.threadPreview !== preview
      || preview.lifecycleGeneration !== lifecycleGeneration) return;
    beginThreadPreviewRefresh(preview);
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

function dismissThreadPreview({ cancelPendingOpen = true } = {}) {
  if (cancelPendingOpen) cancelThreadPreviewOpen();
  const preview = state.ui.threadPreview;
  if (!preview) return false;
  state.ui.threadPreview = null;
  cancelThreadPreviewClose(preview);
  preview.lifecycleGeneration += 1;
  if (preview.refreshFrame) cancelAnimationFrame(preview.refreshFrame);
  if (preview.paintFrame) cancelAnimationFrame(preview.paintFrame);
  if (preview.swapFrame) cancelAnimationFrame(preview.swapFrame);
  preview.refreshFrame = null;
  preview.paintFrame = null;
  preview.swapFrame = null;
  preview.refreshInFlight = false;
  preview.refreshPending = false;
  preview.writeDisposable?.dispose();
  for (const layer of preview.layers) {
    layer.awaitingPaintGeneration = null;
    layer.renderDisposable?.dispose();
  }
  preview.resizeObserver?.disconnect();
  window.removeEventListener('resize', preview.reposition);
  $('#thread-list')?.removeEventListener('scroll', preview.reposition);
  document.removeEventListener('pointerdown', preview.outsidePointer, true);
  preview.popover.remove();
  // xterm schedules a viewport sync after writes and resize. Disposing in the
  // same task can leave that callback reading a released render service.
  setTimeout(() => {
    for (const layer of preview.layers) {
      try { layer.terminal.dispose(); } catch { /* already released */ }
    }
  }, 50);
  if (preview.anchor?.isConnected) {
    preview.anchor.setAttribute('aria-expanded', 'false');
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

function openThreadPreview(session, anchor, { anchorHovered = false } = {}) {
  const current = state.ui.threadPreview;
  if (current?.sessionId === session?.id && current.anchor === anchor) {
    current.anchorHovered = current.anchorHovered || anchorHovered;
    cancelThreadPreviewClose(current);
    return true;
  }
  cancelThreadPreviewOpen();
  if (!session?.term?.term || typeof session.term.term.loadAddon !== 'function') {
    return false;
  }
  dismissThreadPreview();
  if (!session.term.serializer) {
    session.term.serializer = new SerializeAddon.SerializeAddon();
    session.term.term.loadAddon(session.term.serializer);
  }
  const popover = document.createElement('section');
  popover.id = 'thread-terminal-preview';
  popover.className = 'thread-terminal-preview';
  popover.setAttribute('role', 'region');
  popover.setAttribute('aria-label', `Preview ${sessionDisplayLabel(session)}. Click to open session.`);
  popover.setAttribute('aria-labelledby', 'thread-terminal-preview-title');
  popover.setAttribute('aria-describedby', 'thread-terminal-preview-description');
  const header = document.createElement('header'); header.className = 'thread-preview-header';
  const title = document.createElement('strong'); title.id = 'thread-terminal-preview-title'; title.className = 'thread-preview-title'; title.textContent = sessionDisplayLabel(session);
  const status = document.createElement('span'); status.className = 'thread-preview-status'; status.textContent = `${agentLabel(session.agent)} · ${sessionRailStatus(session).label}`;
  const cwd = document.createElement('span'); cwd.className = 'thread-preview-cwd'; cwd.title = session.cwd || '~'; cwd.textContent = session.cwd || '~';
  header.append(title, status, cwd);
  const attention = document.createElement('section'); attention.className = 'thread-preview-attention'; attention.hidden = true;
  const attentionHeading = document.createElement('div'); attentionHeading.className = 'thread-preview-attention-heading'; attentionHeading.textContent = 'NEEDS ATTENTION';
  const attentionRows = document.createElement('div'); attentionRows.className = 'thread-preview-attention-rows';
  attention.append(attentionHeading, attentionRows);
  const terminalViewport = document.createElement('div'); terminalViewport.className = 'thread-preview-viewport';
  const terminalHosts = [0, 1].map((index) => {
    const host = document.createElement('div');
    host.className = `thread-preview-terminal ${index === 0
      ? 'thread-preview-terminal-visible'
      : 'thread-preview-terminal-hidden'}`;
    host.dataset.previewLayer = String(index);
    host.setAttribute('aria-hidden', 'true');
    return host;
  });
  terminalViewport.append(...terminalHosts);
  const footer = document.createElement('footer'); footer.className = 'thread-preview-footer';
  footer.innerHTML = '<span>CLICK TO OPEN SESSION</span><span>ESC FROM ROW TO CLOSE</span>';
  const description = document.createElement('span');
  description.id = 'thread-terminal-preview-description';
  description.className = 'thread-preview-description';
  popover.append(header, attention, terminalViewport, footer, description);
  document.body.appendChild(popover);
  const layers = terminalHosts.map((host) => {
    const terminal = new Terminal({
      cols: Math.max(2, session.term.term.cols || 80), rows: Math.max(1, session.term.term.rows || 24),
      fontFamily: '"SF Mono", Menlo, monospace', fontSize: 11, lineHeight: 1.15,
      cursorBlink: false, disableStdin: true, scrollback: THREAD_PREVIEW_SCROLLBACK,
      minimumContrastRatio: TERMINAL_MINIMUM_CONTRAST_RATIO, theme: terminalThemeFor(),
    });
    terminal.open(host);
    return {
      host,
      terminal,
      scale: 1,
      paintedRows: new Set(),
      awaitingPaintGeneration: null,
      renderDisposable: null,
    };
  });
  const preview = {
    sessionId: session.id, anchor, popover, terminalViewport, layers,
    visibleLayer: layers[0], stagingLayer: layers[1],
    refreshFrame: null, paintFrame: null, swapFrame: null,
    refreshInFlight: false, refreshPending: false,
    lifecycleGeneration: 1, refreshGeneration: 0,
    refreshCount: 0, refreshStarts: 0, activeRefreshes: 0, maxConcurrentRefreshes: 0,
    paintCount: 0, scale: 1,
    writeDisposable: null, resizeObserver: null, closeTimer: null,
    anchorHovered, popoverHovered: false,
    reposition: () => positionThreadPreview(), outsidePointer: null,
  };
  state.ui.threadPreview = preview;
  preview.writeDisposable = session.term.term.onWriteParsed(refreshThreadPreview);
  for (const layer of layers) {
    layer.renderDisposable = layer.terminal.onRender(({ start, end }) => {
      recordThreadPreviewRender(preview, layer, start, end);
    });
  }
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
  popover.addEventListener('pointerenter', () => {
    if (state.ui.threadPreview !== preview || preview.ignorePointerPresence) return;
    preview.popoverHovered = true;
    cancelThreadPreviewClose(preview);
  });
  popover.addEventListener('pointerleave', () => {
    if (state.ui.threadPreview !== preview) return;
    preview.popoverHovered = false;
    scheduleThreadPreviewClose(preview);
  });
  syncThreadPreviewPresentation(session);
  anchor.setAttribute('aria-expanded', 'true');
  positionThreadPreview();
  refreshThreadPreview();
  return true;
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
  if (session.term.startup.phase !== 'revealed') return { blocked: 'agent-startup' };
  const raw = String(data || '');
  const userInput = sanitizeTerminalUserInput(session.term, raw);
  const rewrite = userInput === raw ? rewriteShellLaunchInput(session, raw) : null;
  if (rewrite && rewrite.agent === 'codex' && !codexLaunchIsReleased()) {
    writePtyInput(session, '\x15');
    queueCodexLaunch({
      name: session.name,
      cwd: session.cwd,
      agent: 'codex',
      command: rewrite.command,
      source: 'shell-rewrite',
    }, async () => {
      adoptSessionAgent(session, rewrite.agent, 'rewrite', { command: rewrite.command });
      const outgoing = `${rewrite.command}\r`;
      apply({ type: 'user-input', sessionId: session.id, data: outgoing });
      writePtyInput(session, outgoing);
      return session;
    }).catch(() => {});
    return { ...rewrite, held: true };
  }
  const outgoing = rewrite ? rewrite.data : raw;
  const trackedInput = rewrite ? outgoing : userInput;
  if (rewrite) adoptSessionAgent(session, rewrite.agent, 'rewrite', { command: rewrite.command });
  if (trackedInput) apply({ type: 'user-input', sessionId: session.id, data: trackedInput });
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
  const viewport = host.querySelector('.xterm-viewport');
  const disposables = [];
  const tracker = {
    animationFrame: null,
    animationStartedAt: 0,
    viewportUpdateTimer: null,
    disposed: false,
    reducedMotion: typeof reducedMotion === 'function'
      ? reducedMotion
      : () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    dispose() {
      if (tracker.disposed) return;
      tracker.disposed = true;
      cancelTerminalScrollAnimation(session, { render: false });
      if (tracker.viewportUpdateTimer) clearTimeout(tracker.viewportUpdateTimer);
      tracker.viewportUpdateTimer = null;
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
  const updateFromViewport = () => {
    if (tracker.viewportUpdateTimer) return;
    tracker.viewportUpdateTimer = setTimeout(() => {
      tracker.viewportUpdateTimer = null;
      if (!tracker.disposed) update();
    }, 0);
  };
  const cancelFromUser = () => cancelTerminalScrollAnimation(session);
  const activate = () => animateTerminalScrollToBottom(session);

  session.term.scrollToBottom = tracker;
  disposables.push(term.onScroll(update));
  disposables.push(term.onWriteParsed(update));
  disposables.push(term.onResize(update));
  if (viewport) {
    viewport.addEventListener('scroll', updateFromViewport);
    disposables.push({
      dispose() {
        viewport.removeEventListener('scroll', updateFromViewport);
      },
    });
  }
  host.addEventListener('wheel', cancelFromUser, true);
  host.addEventListener('pointerdown', cancelFromUser, true);
  control.addEventListener('click', activate);
  update();
  return tracker;
}

function codexLaunchIsReleased() {
  return state.codexUpdate.phase === 'released' || state.codexUpdate.phase === 'bypassed';
}

function sanitizeCodexUpdateError(value) {
  return String(value || 'Codex update check failed')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, 500);
}

function queueCodexLaunch(options, action = null) {
  return new Promise((resolve, reject) => {
    state.codexUpdate.queue.push({
      sequence: state.codexUpdate.nextSequence++,
      options: { ...options },
      action,
      resolve,
      reject,
    });
    renderWorkspaceWarning();
  });
}

async function releaseCodexLaunches({ bypass = false } = {}) {
  if (state.codexUpdate.releasePromise) return state.codexUpdate.releasePromise;
  state.codexUpdate.phase = 'releasing';
  state.codexUpdate.releasePromise = (async () => {
    let releasedCount = 0;
    while (state.codexUpdate.queue.length > 0) {
      const queued = state.codexUpdate.queue.shift();
      try {
        const session = queued.action
          ? await queued.action()
          : (state.testCodexLaunchExecutor
            ? await state.testCodexLaunchExecutor(queued.options)
            : await createSessionNow(queued.options));
        queued.resolve(session);
        releasedCount += 1;
      } catch (error) {
        queued.reject(error);
      }
    }
    state.codexUpdate.phase = bypass ? 'bypassed' : 'released';
    state.codexUpdate.releasePromise = null;
    renderWorkspaceWarning();
    return releasedCount;
  })();
  return state.codexUpdate.releasePromise;
}

async function applyCodexPreflightStatus(status, { background = false } = {}) {
  const codex = state.codexUpdate;
  if (status?.error) status = { ...status, error: sanitizeCodexUpdateError(status.error) };
  codex.status = status;
  if (background) {
    const releasedCount = codex.failOpenWarning?.releasedCount || 0;
    codex.phase = 'bypassed';
    if (status && !status.error && status.updateAvailable === false) {
      codex.failOpenWarning = null;
    } else if (status && !status.error && status.updateAvailable === true) {
      codex.failOpenWarning = { kind: 'update-available', releasedCount };
    } else {
      codex.failOpenWarning = {
        kind: 'check-failed',
        releasedCount,
        error: status?.error || 'Codex update check failed',
      };
    }
    renderWorkspaceWarning();
    return status;
  }
  if (status && !status.error && status.updateAvailable === false) {
    await releaseCodexLaunches();
  } else if (status && !status.error && status.updateAvailable === true) {
    codex.phase = 'update-available';
    renderWorkspaceWarning();
  } else {
    const releasedCount = await releaseCodexLaunches({ bypass: true });
    codex.failOpenWarning = {
      kind: 'check-failed',
      releasedCount,
      error: status?.error || 'Codex update check failed',
    };
    renderWorkspaceWarning();
  }
  return status;
}

async function checkCodexPreflight({ force = false } = {}) {
  if (state.codexUpdate.checkPromise) return state.codexUpdate.checkPromise;
  const background = state.codexUpdate.phase === 'bypassed';
  if (!background) state.codexUpdate.phase = 'checking';
  state.codexUpdate.progress = '';
  renderWorkspaceWarning();
  const check = state.testCodexUpdateCheck || window.chromux.checkCodexUpdate;
  state.codexUpdate.checkPromise = Promise.resolve(check({ force })).then(async (status) => {
    state.codexUpdate.checkPromise = null;
    return applyCodexPreflightStatus(status, { background });
  }).catch((error) => {
    const status = { error: sanitizeCodexUpdateError(error && error.message) };
    state.codexUpdate.checkPromise = null;
    return applyCodexPreflightStatus(status, { background });
  });
  return state.codexUpdate.checkPromise;
}

async function installCodexUpdate() {
  if (state.codexUpdate.phase === 'updating') return;
  state.codexUpdate.phase = 'updating';
  state.codexUpdate.progress = '';
  renderWorkspaceWarning();
  const result = await window.chromux.installCodexUpdate();
  state.codexUpdate.status = result;
  if (result && result.ok) await releaseCodexLaunches();
  else {
    state.codexUpdate.phase = 'update-failed';
    renderWorkspaceWarning();
  }
}

async function createSession(options) {
  if (options && options.agent === 'codex' && !codexLaunchIsReleased()) {
    return queueCodexLaunch(options);
  }
  return createSessionNow(options);
}

async function createSessionNow({
  name, cwd, agent, initialUrl = null, initialBrowserTabs = [], initialActiveBrowserTabId = null,
  initialQueue = [], initialAttentionRecords = [], command = undefined, resumeLaunch = null, composerDraft = '',
  initialStagedBrowserContexts = [],
  initialBrowserLayoutMode = 'terminal', initialFullBrowserComposerOpen = false,
  initialLastActivityAt = null,
  initialCustomTabGroupId = null,
  sessionPurpose = null, worktreeIdentity = null,
  runtime = null, distro = null,
  activate = true,
}) {
  state.counter += 1;
  const id = 's' + state.counter;
  const session = newSessionShape({
    id, name, cwd, agent, runtime, distro, sessionPurpose, worktreeIdentity,
    startupLoading: true,
  });
  if (state.env?.smoke) session._testCommand = command !== undefined ? command : agentCommand(agent);
  session.customTabGroupId = validCustomTabGroup(initialCustomTabGroupId) ? initialCustomTabGroupId : null;
  const restoredActivityAt = Date.parse(initialLastActivityAt || '');
  if (Number.isFinite(restoredActivityAt)) session.lastActivityAt = restoredActivityAt;
  session.composer.draft = utf8WithinLimit(composerDraft) ? String(composerDraft || '') : '';
  session.composer.stagedContexts = (Array.isArray(initialStagedBrowserContexts)
    ? initialStagedBrowserContexts : [])
    .map(normalizeBrowserContextReference)
    .filter(Boolean)
    .slice(0, BOUNDS.stagedBrowserContexts);
  session.composer.selectedAgent = agent || '';
  session.browser.layoutMode = BROWSER_LAYOUT_MODES.has(initialBrowserLayoutMode)
    ? initialBrowserLayoutMode
    : 'terminal';
  session.composer.fullBrowserOpen = Boolean(
    initialFullBrowserComposerOpen && session.browser.layoutMode === 'browserChromux'
  );
  session.composer.open = session.composer.fullBrowserOpen;
  session.composer.routeTargetId = session.composer.fullBrowserOpen ? id : null;
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
  updateVercelButtons();
  if (Array.isArray(initialBrowserTabs)) {
    for (const saved of initialBrowserTabs.slice(0, 50)) {
      if (!saved || typeof saved !== 'object') continue;
      if (saved.type === 'explorer' && !htmlExplorerTab(session)) {
        session.browser.tabs.push({
          id: String(saved.id || browserTabId(session, 'explorer')),
          type: 'explorer',
          title: 'Project HTML',
          path: String(saved.path || ''),
          query: String(saved.query || ''),
          index: null,
          requestId: 0,
        });
      } else if (saved.type === 'page' && normalizedBrowserUrl(saved.url)) {
        session.browser.tabs.push(createPageTabState(
          String(saved.id || browserTabId(session, 'page')),
          normalizedBrowserUrl(saved.url),
          saved.title || saved.url,
        ));
      }
    }
  }
  if (session.browser.tabs.length) {
    session.browser.tabCounter = Math.max(session.browser.tabCounter, session.browser.tabs.length);
    session.browser.activeTabId = session.browser.tabs.some((tab) => tab.id === initialActiveBrowserTabId)
      ? initialActiveBrowserTabId
      : session.browser.tabs[0].id;
  }
  renderBrowserTabs(session);
  renderComposer(session);
  applyBrowserLayout(session);

  const term = new Terminal({
    fontFamily: '"SF Mono", Menlo, monospace',
    fontSize: 12.5,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 8000,
    macOptionIsMeta: true,
    minimumContrastRatio: TERMINAL_MINIMUM_CONTRAST_RATIO,
    theme: terminalThemeFor(),
    linkHandler: {
      activate(event, text) {
        activateOsc8TerminalLink(session, text, event);
      },
    },
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
  session.term.resizeObserver = new ResizeObserver(() => session.term.fit());
  session.term.resizeObserver.observe(viewEls.termHost);

  state.sessions.set(id, session);
  beginAgentStartup(session);
  session.composer.routeTargetId = session.composer.fullBrowserOpen ? id : session.composer.routeTargetId;
  renderComposer(session);
  for (const source of state.sessions.values()) renderComposerContexts(source);
  apply({ type: 'session-created', sessionId: id, name, cwd, agent });
  let ptyInfo;
  try {
    ptyInfo = await window.chromux.ptyCreate({
      id, cwd, location: { runtime: session.runtime, distro: session.distro, cwd },
      agent,
      command: command !== undefined ? command : agentCommand(agent),
      cols: term.cols, rows: term.rows,
    });
  } catch (error) {
    clearAgentStartupTimer(session);
    state.sessions.delete(id);
    viewEls.view.remove();
    tabEls.tab.remove();
    session.term.resizeObserver?.disconnect();
    session.term.resizeObserver = null;
    term.dispose();
    apply({ type: 'session-closed', sessionId: id });
    renderTabs();
    throw error;
  }
  if (ptyInfo && ptyInfo.signalToken) session.turn.token = ptyInfo.signalToken;
  if (ptyInfo && ptyInfo.location) {
    session.runtime = ptyInfo.location.runtime;
    session.distro = ptyInfo.location.distro;
  }

  session.browser.queue = Array.isArray(initialQueue)
    ? initialQueue.map((item) => normalizeQueueItem(item, 'RESTORE')).filter(Boolean)
    : [];
  renderQueue(session);
  for (const item of session.browser.queue) {
    if (item.liveness === 'checking') probeQueuedPreview(session, item.url);
  }
  if (session.browser.activeTabId) activateBrowserTab(session, session.browser.activeTabId);
  else if (initialUrl) openInPane(session, initialUrl);
  if (activate) {
    activateSession(id, {
      consumeRestoredCompletion: false,
    });
  } else {
    session.els.view.classList.add('offstage');
    session.els.tab.classList.remove('active');
  }
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
  const tabList = state.ui.tabGroupsEnabled ? $('#group-session-list') : $('#tab-list');
  const tabActions = $('#tab-actions');
  if (!session?.els?.tab || !tabList) return;
  revealHorizontalItem(tabList, session.els.tab, state.ui.tabGroupsEnabled ? null : tabActions);
  if (state.ui.tabGroupsEnabled) {
    const groupTab = $(`#group-tab-list [data-group-id="${CSS.escape(sessionTabGroupId(session))}"]`);
    revealHorizontalItem($('#group-tab-list'), groupTab, tabActions);
  }
}

function activateSession(id, { consumeRestoredCompletion = true } = {}) {
  const target = state.sessions.get(id);
  if (!target) return;
  if (state.ui.tabGroupsEnabled) {
    const groupId = sessionTabGroupId(target);
    state.ui.focusedTabGroupId = groupId;
    state.ui.lastActiveSessionByGroup.set(groupId, id);
  }
  dismissThreadPreview();
  if (!state.ui.diagnosticSessionId || !state.sessions.has(state.ui.diagnosticSessionId)) state.ui.diagnosticSessionId = id;
  apply({ type: 'session-focused', sessionId: id, consumeRestoredCompletion });
  for (const s of state.sessions.values()) {
    const active = s.id === id;
    s.els.view.classList.toggle('offstage', !active);
    s.els.tab.classList.toggle('active', active);
    if (active) {
      requestAnimationFrame(() => {
        if (state.activeId !== s.id) return;
        s.term.fit();
        inspectAgentStartupReadiness(s);
        if (s.term.startup.phase !== 'revealed') return;
        if (s.composer.open) s.els.composerTextarea.focus();
        else s.term.term.focus();
      });
    }
  }
  syncBrowserChromuxActiveClass();
  $('#empty-state').classList.toggle('hidden', state.sessions.size > 0);
  renderTabs();
  revealFocusedSessionTab(id);
  invalidate('shortcutDebug', ...(state.env && state.env.devMode ? ['diagnostics'] : []));
}

function closeSession(id) {
  const s = state.sessions.get(id);
  if (!s) return;
  if (state.pendingQueueNavigation?.sessionId === id) state.pendingQueueNavigation = null;
  if (state.ui.threadPreview?.sessionId === id) dismissThreadPreview();
  if (s._threadCueTimer) clearTimeout(s._threadCueTimer);
  clearAgentStartupTimer(s);
  resetSynchronizedOutput(s);
  window.chromux.ptyKill(id);
  if (s.term.scrollToBottom) s.term.scrollToBottom.dispose();
  s.term.resizeObserver?.disconnect();
  s.term.resizeObserver = null;
  s.term.term.dispose();
  if (s.els.webPane.parentElement !== s.els.view) s.els.webPane.remove();
  s.els.view.remove();
  s.els.tab.remove();
  state.sessions.delete(id);
  for (const source of state.sessions.values()) renderComposerContexts(source);
  for (const [groupId, sessionId] of state.ui.lastActiveSessionByGroup) {
    if (sessionId === id) state.ui.lastActiveSessionByGroup.delete(groupId);
  }
  apply({ type: 'session-closed', sessionId: id });
  if (state.activeId === id) {
    const groups = effectiveTabGroups();
    const sameGroup = groups.find((group) => group.id === state.ui.focusedTabGroupId);
    const nextId = sameGroup?.sessions[0]?.id || groups[0]?.sessions[0]?.id || null;
    state.activeId = nextId;
    if (state.activeId) activateSession(state.activeId);
  }
  syncBrowserChromuxActiveClass();
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
  const open = sessions.map((session) => ({
    name: session.name,
    runtime: session.runtime,
    distro: session.distro,
    cwd: session.cwd,
    agent: session.agent || '',
    ...(session.sessionPurpose === GIT_SESSION_PURPOSE && session.worktreeIdentity
      ? {
        sessionPurpose: GIT_SESSION_PURPOSE,
        worktreeIdentity: { ...session.worktreeIdentity },
      }
      : {}),
    resumeId: session.resumeId || null,
    ...(validCustomTabGroup(session.customTabGroupId) ? { customTabGroupId: session.customTabGroupId } : {}),
    wasActive: session.id === state.activeId,
    wasLastActiveInGroup: state.ui.lastActiveSessionByGroup.get(sessionTabGroupId(session)) === session.id,
    alive: Boolean(session.lifecycle.alive),
    currentUrl: activePageTab(session)?.currentUrl || null,
    browserTabs: session.browser.tabs.map((tab) => (tab.type === 'explorer'
      ? { id: tab.id, type: 'explorer', title: 'Project HTML', path: tab.path || '', query: tab.query || '' }
      : { id: tab.id, type: 'page', url: tab.currentUrl, title: tab.title || tab.currentUrl || 'Page' }))
      .filter((tab) => tab.type === 'explorer' || tab.url),
    activeBrowserTabId: session.browser.activeTabId || null,
    queue: session.browser.queue.map((item) => ({
      url: item.url,
      source: item.source || 'RESTORE',
      reason: item.reason || queueReasonForSource(item.source || 'RESTORE'),
      detectedText: item.detectedText || null,
      visibility: item.visibility,
      ts: item.ts || Date.now(),
    })),
    ...(attentionBySession.get(session.id)?.length
      ? { attentionRecords: attentionBySession.get(session.id) }
      : {}),
    ...(session.composer.draft ? { composerDraft: session.composer.draft } : {}),
    ...(session.composer.stagedContexts.length
      ? { stagedBrowserContexts: session.composer.stagedContexts.slice(0, BOUNDS.stagedBrowserContexts) }
      : {}),
    browserLayoutMode: session.browser.layoutMode,
    fullBrowserComposerOpen: Boolean(
      session.composer.fullBrowserOpen && session.browser.layoutMode === 'browserChromux'
    ),
    lastActivityAt: new Date(sessionActivityAt(session)).toISOString(),
    savedAt: new Date().toISOString(),
  }));
  const heldCodex = state.codexUpdate.queue
    .filter((queued) => !queued.action && queued.options && queued.options.agent === 'codex')
    .map(({ options }) => ({
      name: options.name,
      cwd: options.cwd,
      agent: 'codex',
      ...(options.sessionPurpose === GIT_SESSION_PURPOSE && options.worktreeIdentity
        ? {
          sessionPurpose: GIT_SESSION_PURPOSE,
          worktreeIdentity: { ...options.worktreeIdentity },
        }
        : {}),
      resumeId: options.resumeLaunch?.resumeId || null,
      ...(validCustomTabGroup(options.initialCustomTabGroupId)
        ? { customTabGroupId: options.initialCustomTabGroupId }
        : {}),
      wasActive: false,
      wasLastActiveInGroup: false,
      alive: true,
      currentUrl: options.initialUrl || null,
      browserTabs: Array.isArray(options.initialBrowserTabs) ? options.initialBrowserTabs : [],
      activeBrowserTabId: options.initialActiveBrowserTabId || null,
      queue: Array.isArray(options.initialQueue) ? options.initialQueue : [],
      ...(Array.isArray(options.initialAttentionRecords) && options.initialAttentionRecords.length
        ? { attentionRecords: options.initialAttentionRecords }
        : {}),
      ...(options.composerDraft ? { composerDraft: options.composerDraft } : {}),
      ...(Array.isArray(options.initialStagedBrowserContexts) && options.initialStagedBrowserContexts.length
        ? { stagedBrowserContexts: options.initialStagedBrowserContexts.slice(0, BOUNDS.stagedBrowserContexts) }
        : {}),
      browserLayoutMode: BROWSER_LAYOUT_MODES.has(options.initialBrowserLayoutMode)
        ? options.initialBrowserLayoutMode : 'terminal',
      fullBrowserComposerOpen: Boolean(
        options.initialFullBrowserComposerOpen
        && options.initialBrowserLayoutMode === 'browserChromux'
      ),
      lastActivityAt: new Date(Number.isFinite(Date.parse(options.initialLastActivityAt || ''))
        ? Date.parse(options.initialLastActivityAt) : Date.now()).toISOString(),
      savedAt: new Date().toISOString(),
    }));
  return [...open, ...heldCodex];
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
        inboxTriage: snapshotInboxTriage(),
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
  renderCustomTabGroups();
  $('#modal-settings').classList.remove('hidden');
  window.chromux.projectScaffolderConfig().then((config) => {
    state.scaffolderConfig = config;
    renderProjectsRootSetting();
  }).catch((error) => {
    $('#settings-projects-root-status').textContent = error.message || 'Projects Root is unavailable.';
    $('#settings-projects-root-status').classList.add('fail');
  });
  invalidate('shortcutDebug');
  checkUpdates(false).catch(() => {});
}

const WINDOWS_SETUP_STAGE_CHECKS = Object.freeze({
  system: ['windows-build', 'windows-architecture'],
  wsl: ['wsl2-distro'],
  tools: ['bash', 'git', 'node', 'agent-claude', 'agent-codex', 'agent-grok', 'resource-integration'],
  root: ['projects-root'],
});

function selectWindowsSetupStage(stage, { focus = false } = {}) {
  if (!['system', 'wsl', 'tools', 'root', 'ready'].includes(stage)) return;
  state.ui.windowsSetupStage = stage;
  for (const button of document.querySelectorAll('[data-setup-stage]')) {
    const selected = button.dataset.setupStage === stage;
    button.classList.toggle('on', selected);
    button.setAttribute('aria-current', selected ? 'step' : 'false');
    if (selected && focus) button.focus();
  }
  for (const panel of document.querySelectorAll('[data-setup-panel]')) {
    panel.classList.toggle('hidden', panel.dataset.setupPanel !== stage);
  }
}

function windowsSetupCheckRow(item) {
  const row = document.createElement('div');
  row.className = `windows-setup-check ${item.required ? 'required' : 'optional'} ${item.ok ? 'ok' : ''}`;
  row.dataset.checkId = item.id;
  const badge = document.createElement('span');
  badge.className = 'windows-setup-badge';
  badge.textContent = item.ok ? 'Ready' : (item.required ? 'Action Required' : 'Optional');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = item.label;
  const detail = document.createElement('small');
  detail.textContent = item.detail || '';
  copy.append(title, detail);
  row.append(badge, copy);
  const actions = document.createElement('div');
  actions.className = 'windows-setup-check-actions';
  if (!item.ok && item.remediation?.command) {
    const command = document.createElement('button');
    command.className = 'windows-setup-copy';
    command.type = 'button';
    command.textContent = 'COPY COMMAND';
    command.title = item.remediation.command;
    command.onclick = async () => {
      await window.chromux.clipboardWriteText(item.remediation.command);
      command.textContent = 'COPIED';
      setTimeout(() => { command.textContent = 'COPY COMMAND'; }, 1200);
    };
    actions.append(command);
  }
  if (!item.ok && item.remediation?.documentationKey) {
    const guide = document.createElement('button');
    guide.className = 'windows-setup-copy';
    guide.type = 'button';
    guide.textContent = 'OPEN GUIDE';
    guide.onclick = () => {
      window.chromux.windowsSetupOpenDocumentation(item.remediation.documentationKey).catch(() => {});
    };
    actions.append(guide);
  }
  if (actions.childElementCount > 0) row.append(actions);
  return row;
}

function updateWindowsLaunchCapabilities() {
  if (state.env?.hostPlatform !== 'win32' || !state.windowsSetup) return;
  const capabilities = state.windowsSetup.capabilities || {};
  $('#launcher-tab-create').disabled = !capabilities.canCreateProject;
  $('#launcher-tab-create').title = capabilities.canCreateProject
    ? ''
    : 'Complete Windows Setup and choose a writable Projects Root to create projects.';
  for (const button of $('#ns-agent').children) {
    const agent = button.dataset.agent || 'shell';
    const available = capabilities.agents?.[agent] !== false;
    button.disabled = !available;
    button.title = available ? '' : `${agent} is unavailable in the selected WSL2 distribution.`;
  }
  const selectedAgent = $('#ns-agent .on');
  if (selectedAgent?.disabled) {
    for (const button of $('#ns-agent').children) button.classList.toggle('on', (button.dataset.agent || '') === '');
  }
}

function renderWindowsSetup(status) {
  if (!status) return;
  state.windowsSetup = status;
  if (state.env?.runtime) state.env.runtime.setupStatus = status;
  const byId = new Map(status.checks.map((item) => [item.id, item]));
  const hosts = {
    system: $('#windows-setup-system-checks'),
    wsl: $('#windows-setup-wsl-checks'),
    tools: $('#windows-setup-tool-checks'),
    root: $('#windows-setup-root-checks'),
  };
  for (const [stage, ids] of Object.entries(WINDOWS_SETUP_STAGE_CHECKS)) {
    hosts[stage].replaceChildren(...ids.map((id) => byId.get(id)).filter(Boolean).map(windowsSetupCheckRow));
  }
  const distro = $('#windows-setup-distro');
  const previousDistro = distro.value;
  distro.replaceChildren(...status.distros.map((item) => {
    const option = document.createElement('option');
    option.value = item.name;
    option.textContent = `${item.name}${item.version === 2 ? '' : ' (WSL1 unsupported)'}`;
    option.disabled = item.version !== 2;
    option.selected = item.name === status.selectedDistro;
    return option;
  }));
  if (!status.selectedDistro && status.distros.some((item) => item.name === previousDistro && item.version === 2)) {
    distro.value = previousDistro;
  }
  const rootInput = $('#windows-setup-root');
  if (document.activeElement !== rootInput) {
    rootInput.value = status.projectsRoot || status.defaultProjectsRoot || '';
  }
  const missing = status.checks.filter((item) => item.required && !item.ok);
  const optional = status.checks.filter((item) => !item.required && !item.ok);
  $('#windows-setup-summary').textContent = status.setupReady
    ? `Required setup is ready. ${optional.length} optional integration${optional.length === 1 ? '' : 's'} remain unavailable.`
    : `${missing.length} required check${missing.length === 1 ? '' : 's'} need attention before setup can finish.`;
  $('#windows-setup-finish').disabled = !status.setupReady;
  $('#windows-setup-self-test').disabled = !status.capabilities.canCreateProject;
  updateWindowsLaunchCapabilities();
}

function windowsSetupFirstIncompleteStage(status) {
  for (const stage of ['system', 'wsl', 'tools', 'root']) {
    if (WINDOWS_SETUP_STAGE_CHECKS[stage]
      .some((id) => status.checks.find((item) => item.id === id && item.required && !item.ok))) return stage;
  }
  return 'ready';
}

async function openWindowsSetup({ firstRun = false } = {}) {
  const error = $('#windows-setup-error');
  error.classList.add('hidden');
  try {
    const status = await window.chromux.windowsSetupStatus();
    if (!status) return;
    renderWindowsSetup(status);
    $('#windows-setup-overlay').classList.remove('hidden');
    selectWindowsSetupStage(firstRun ? windowsSetupFirstIncompleteStage(status) : state.ui.windowsSetupStage);
    requestAnimationFrame(() => {
      document.querySelector(`[data-setup-stage="${state.ui.windowsSetupStage}"]`)?.focus();
    });
  } catch (failure) {
    error.textContent = failure.message || 'Windows Setup status is unavailable.';
    error.classList.remove('hidden');
    $('#windows-setup-overlay').classList.remove('hidden');
  }
}

async function runWindowsSetupAction(action) {
  const error = $('#windows-setup-error');
  error.classList.add('hidden');
  const wasBlocked = state.windowsSetup && !state.windowsSetup.capabilities?.canOpenSession;
  try {
    const status = await action();
    if (status) renderWindowsSetup(status);
    if (wasBlocked && status?.capabilities?.canOpenSession) {
      await autoRestoreWorkspace();
    }
    return status;
  } catch (failure) {
    error.textContent = failure.message || 'Windows Setup action failed.';
    error.classList.remove('hidden');
    return null;
  }
}

async function changeDeveloperMode(enabled) {
  const toggle = $('#settings-developer-mode');
  const current = Boolean(state.env && state.env.devMode);
  if (Boolean(enabled) === current) return false;
  if (!(await showLifecyclePrompt('dev-mode-restart'))) {
    if (toggle) toggle.checked = current;
    return false;
  }
  const payload = { enabled: Boolean(enabled), sessions: snapshotOpenSessions(), inboxTriage: snapshotInboxTriage() };
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
  let lifecycleStateChanged = false;
  for (const title of res.titles) {
    const previousState = session.turn.state;
    const applied = window.chromuxAttention.applyCodexTitleEvidence(
      session, title.title, Date.now(), session.id === state.activeId,
    );
    lifecycleStateChanged = (applied && session.turn.state !== previousState) || lifecycleStateChanged;
  }
  const latest = res.titles[res.titles.length - 1].title;
  if (latest && latest !== session.term.title) {
    session.term.title = latest;
    syncThreadSessionPresentation(session);
    reorderMountedThreadRows();
  }
  if (lifecycleStateChanged) session.lastActivityAt = Date.now();
  invalidate('tabs', ...(lifecycleStateChanged ? ['attention', 'update', 'badges'] : []),
    ...(state.env && state.env.devMode ? ['diagnostics'] : []));
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

function recoverCodexCompletionFromRenderedTerminal(session, expectedGeneration, output = '') {
  if (!session || session.turn.generation !== expectedGeneration) return false;
  const rendered = renderedTerminalCursorContext(session && session.term && session.term.term);
  const previousTurnState = session.turn.state;
  if (!rendered || !window.chromuxAttention.applyCodexRenderedCompletionFallback(
    session, { ...rendered, output }, Date.now(),
  )) return false;
  session.lastActivityAt = Date.now();
  if (session.id === state.activeId) {
    session.turn.attentionSeenAt = Math.max(session.turn.attentionSeenAt || 0, session.turn.since || 0);
    window.chromuxAttention.consumeCompletedTurn(session.turn, Date.now());
  }
  const lifecycleStateChanged = session.turn.state !== previousTurnState;
  recordEvent({
    type: 'turn-recovered', sessionId: session.id, turnState: session.turn.state,
    source: session.turn.source || 'codex:terminal-idle',
    confidence: session.turn.confidence || 'low',
  });
  invalidate('tabs', ...(lifecycleStateChanged ? ['update', 'attention', 'badges'] : []),
    ...(state.env && state.env.devMode ? ['diagnostics'] : []));
  return true;
}

function hasVisibleTerminalPayload(data) {
  return String(data || '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)/g, '')
    .replace(/\x1b[PX^_][\s\S]*?(?:\x1b\\|$)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/[\x00-\x20\x7f]/g, '')
    .length > 0;
}

const SYNCHRONIZED_OUTPUT_BEGIN = '\x1b[?2026h';
const SYNCHRONIZED_OUTPUT_END = '\x1b[?2026l';
const SYNCHRONIZED_OUTPUT_TIMEOUT_MS = 1000;
const SYNCHRONIZED_OUTPUT_MAX_BYTES = 1024 * 1024;

function resetSynchronizedOutput(session) {
  const terminal = session && session.term;
  if (!terminal) return;
  if (terminal.synchronizedOutputTimer) clearTimeout(terminal.synchronizedOutputTimer);
  terminal.synchronizedOutputActive = false;
  terminal.synchronizedOutputBuffer = '';
  terminal.synchronizedOutputPartial = '';
  terminal.synchronizedOutputBytes = 0;
  terminal.synchronizedOutputTimer = null;
}

function writePtyPayload(session, payload) {
  if (!payload) return;
  const recoveryGeneration = session.turn.generation;
  const shouldRecover = hasVisibleTerminalPayload(payload);
  if (session._ptyOutputTestTrace) session._ptyOutputTestTrace.writes.push(payload);
  session.term.term.write(payload, () => {
    inspectAgentStartupReadiness(session);
    if (!shouldRecover) return;
    if (session._ptyOutputTestTrace) session._ptyOutputTestTrace.recoveryPayloads.push(payload);
    recoverCodexCompletionFromRenderedTerminal(session, recoveryGeneration, payload);
  });
  if (session._ptyOutputTestTrace) session._ptyOutputTestTrace.detectorPayloads.push(payload);
  feedDetector(session, payload);
}

function flushSynchronizedOutput(session) {
  const payload = session.term.synchronizedOutputBuffer;
  resetSynchronizedOutput(session);
  writePtyPayload(session, payload);
}

function synchronizedOutputByteLength(payload) {
  return new TextEncoder().encode(payload).byteLength;
}

function appendSynchronizedOutput(session, payload) {
  if (!payload) return;
  session.term.synchronizedOutputBuffer += payload;
  session.term.synchronizedOutputBytes += synchronizedOutputByteLength(payload);
  if (session.term.synchronizedOutputBytes >= SYNCHRONIZED_OUTPUT_MAX_BYTES) {
    flushSynchronizedOutput(session);
  }
}

function handleSynchronizedOutputTimeout(session) {
  const terminal = session.term;
  terminal.synchronizedOutputTimer = null;
  const partial = terminal.synchronizedOutputPartial;
  terminal.synchronizedOutputPartial = '';
  if (partial) {
    if (terminal.synchronizedOutputActive) appendSynchronizedOutput(session, partial);
    else writePtyPayload(session, partial);
  }
  if (terminal.synchronizedOutputActive) flushSynchronizedOutput(session);
}

function ensureSynchronizedOutputTimer(session) {
  if (session.term.synchronizedOutputTimer) return;
  session.term.synchronizedOutputTimer = setTimeout(() => {
    if (state.sessions.get(session.id) !== session) return;
    handleSynchronizedOutputTimeout(session);
  }, SYNCHRONIZED_OUTPUT_TIMEOUT_MS);
}

function routeSynchronizedOutputSegment(session, payload) {
  if (!payload) return;
  if (session.term.synchronizedOutputActive) appendSynchronizedOutput(session, payload);
  else writePtyPayload(session, payload);
}

function routeSynchronizedPtyOutput(session, data) {
  const terminal = session.term;
  const input = terminal.synchronizedOutputPartial + String(data || '');
  terminal.synchronizedOutputPartial = '';
  let cursor = 0;
  let segmentStart = 0;

  while (cursor < input.length) {
    const markerAt = input.indexOf('\x1b', cursor);
    if (markerAt === -1) {
      routeSynchronizedOutputSegment(session, input.slice(segmentStart));
      cursor = input.length;
      break;
    }
    const remaining = input.slice(markerAt);
    if (remaining.startsWith(SYNCHRONIZED_OUTPUT_BEGIN)) {
      routeSynchronizedOutputSegment(session, input.slice(segmentStart, markerAt));
      if (!terminal.synchronizedOutputActive) {
        terminal.synchronizedOutputActive = true;
        ensureSynchronizedOutputTimer(session);
      }
      cursor = markerAt + SYNCHRONIZED_OUTPUT_BEGIN.length;
      segmentStart = cursor;
      continue;
    }
    if (remaining.startsWith(SYNCHRONIZED_OUTPUT_END)) {
      routeSynchronizedOutputSegment(session, input.slice(segmentStart, markerAt));
      if (terminal.synchronizedOutputActive) flushSynchronizedOutput(session);
      cursor = markerAt + SYNCHRONIZED_OUTPUT_END.length;
      segmentStart = cursor;
      continue;
    }
    if (SYNCHRONIZED_OUTPUT_BEGIN.startsWith(remaining)
      || SYNCHRONIZED_OUTPUT_END.startsWith(remaining)) {
      routeSynchronizedOutputSegment(session, input.slice(segmentStart, markerAt));
      terminal.synchronizedOutputPartial = remaining;
      ensureSynchronizedOutputTimer(session);
      cursor = input.length;
      break;
    }
    cursor = markerAt + 1;
  }

  if (!terminal.synchronizedOutputActive && !terminal.synchronizedOutputPartial
    && terminal.synchronizedOutputTimer) {
    clearTimeout(terminal.synchronizedOutputTimer);
    terminal.synchronizedOutputTimer = null;
  }
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
    const previewEnvelope = env && env.event === 'browser-preview';
    const previewUrl = previewEnvelope && typeof env.url === 'string' && env.url.length <= 4096
      ? normalizedBrowserUrl(env.url) : null;
    const validPreview = previewEnvelope
      && env.sessionId === id
      && env.token === s.turn.token
      && Boolean(previewUrl)
      && (env.reason === null || env.reason === undefined
        || (typeof env.reason === 'string' && env.reason.length <= 240));
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
    if (sig.malformed || sig.sessionId !== id || (!validV2 && !validPreview)) {
      apply({
        type: 'signal-rejected',
        sessionId: id,
        signal: sig.malformed ? null : sig.event,
        claimedSessionId: sig.sessionId || null,
      });
    } else if (validPreview) {
      const validation = Array.isArray(s._written)
        ? Promise.resolve({ url: previewUrl, reason: env.reason || null })
        : window.chromux.browserQueueValidate({
        sessionId: id,
        token: env.token,
        url: previewUrl,
        reason: env.reason,
      });
      validation.then((validated) => {
        const live = state.sessions.get(id);
        if (!live || !live.lifecycle.alive || live.turn.token !== env.token) return;
        routePreview(live, validated.url, 'OSC', {
          reason: validated.reason || 'requested by agent',
          visibility: 'attention',
        });
      }).catch(() => {
        apply({ type: 'signal-rejected', sessionId: id, signal: env.event, claimedSessionId: env.sessionId });
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
    routeSynchronizedPtyOutput(s, res.clean);
  }
  if (s.agent === '' && s.lifecycle.alive) scanPtyAgentDescendants(false).catch(() => {});
}

window.chromux.onPtyData(({ id, data }) => handlePtyData(id, data));

function agentStartupProviderName(agent) {
  return {
    claude: 'Claude Code',
    codex: 'Codex',
    grok: 'Grok Build',
  }[agent] || 'Agent';
}

function clearAgentStartupTimer(session) {
  const startup = session && session.term && session.term.startup;
  if (!startup || !startup.timer) return;
  clearTimeout(startup.timer);
  startup.timer = null;
}

function renderAgentStartup(session) {
  const startup = session && session.term && session.term.startup;
  const els = session && session.els;
  if (!startup || !els || !AGENT_STARTUP_PHASES.has(startup.phase)) return;
  const revealed = startup.phase === 'revealed';
  const stalled = startup.phase === 'stalled';
  els.termHost.classList.toggle('agent-startup-blocked', !revealed);
  els.termHost.setAttribute('aria-busy', String(!revealed));
  const xterm = els.termHost.querySelector('.xterm');
  const helper = els.termHost.querySelector('.xterm-helper-textarea');
  if (xterm) xterm.setAttribute('aria-hidden', String(!revealed));
  if (helper) helper.tabIndex = revealed ? 0 : -1;
  els.startupLoader.classList.toggle('hidden', revealed);
  els.startupLoader.classList.toggle('stalled', stalled);
  els.startupLoader.classList.toggle('exited', Boolean(startup.exited));
  els.startupTitle.textContent = startup.exited
    ? `${agentStartupProviderName(session.agent)} exited`
    : `Starting ${agentStartupProviderName(session.agent)}`;
  els.startupStatus.textContent = startup.exited
    ? `The process exited${Number.isFinite(startup.exitCode) ? ` with code ${startup.exitCode}` : ''} before its prompt appeared.`
    : (stalled ? 'Still starting. You can inspect the terminal without stopping startup.'
      : 'Waiting for the interactive prompt…');
  els.revealTerminalBtn.classList.toggle('hidden', !stalled);
  els.composeBtn.disabled = !revealed;
}

function revealAgentTerminal(session, reason = 'prompt') {
  const startup = session && session.term && session.term.startup;
  if (!startup || startup.phase === 'revealed') return false;
  startup.phase = reason === 'prompt' ? 'ready' : startup.phase;
  startup.revealReason = reason;
  clearAgentStartupTimer(session);
  const openComposerAfterReveal = startup.openComposerOnReveal;
  startup.openComposerOnReveal = false;
  startup.phase = 'revealed';
  renderAgentStartup(session);
  if (openComposerAfterReveal) {
    openComposer(session);
    renderFullBrowserComposer(session);
  }
  requestAnimationFrame(() => {
    if (state.sessions.get(session.id) !== session) return;
    session.term.fit();
    if (state.activeId !== session.id) return;
    if (session.composer.open) session.els.composerTextarea.focus();
    else session.term.term.focus();
  });
  return true;
}

function stallAgentStartup(session) {
  const startup = session && session.term && session.term.startup;
  if (!startup || startup.phase !== 'starting') return false;
  startup.timer = null;
  startup.phase = 'stalled';
  renderAgentStartup(session);
  return true;
}

function beginAgentStartup(session, { timeoutMs = AGENT_STARTUP_TIMEOUT_MS } = {}) {
  const startup = session && session.term && session.term.startup;
  if (!startup) return;
  clearAgentStartupTimer(session);
  renderAgentStartup(session);
  if (startup.phase !== 'starting') return;
  const active = document.activeElement;
  if (active && session.els.termHost.contains(active) && typeof active.blur === 'function') active.blur();
  startup.timer = setTimeout(() => {
    if (state.sessions.get(session.id) === session) stallAgentStartup(session);
  }, Math.max(0, timeoutMs));
}

function inspectAgentStartupReadiness(session) {
  const startup = session && session.term && session.term.startup;
  if (!startup || startup.exited
    || (startup.phase !== 'starting' && startup.phase !== 'stalled')) return false;
  if (!agentStartupPromptReady(session)) return false;
  return revealAgentTerminal(session, 'prompt');
}

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
  if (s.term.synchronizedOutputActive || s.term.synchronizedOutputPartial) {
    handleSynchronizedOutputTimeout(s);
  }
  apply({ type: 'session-exited', sessionId: id, exitCode });
  s.term.term.write(`\r\n\x1b[38;5;210m── session exited (${exitCode}) ──\x1b[0m\r\n`);
  if (s.term.startup.phase !== 'revealed') {
    clearAgentStartupTimer(s);
    s.term.startup.phase = 'stalled';
    s.term.startup.exited = true;
    s.term.startup.exitCode = exitCode;
    renderAgentStartup(s);
  }
  renderComposer(s);
  if (isQuickCodexResumeExit(s)) showResumeRetryWarning(s, exitCode);
}

window.chromux.onPtyExit(handlePtyExit);

// popups intercepted in main → paired session's review queue
window.chromux.onWebviewPopup(({ webContentsId, url }) => {
  for (const s of state.sessions.values()) {
    if (s.browser.tabs.some((tab) => tab.type === 'page' && tab.webContentsId === webContentsId)) {
      const safeUrl = normalizedBrowserUrl(url);
      if (safeUrl) routePreview(s, safeUrl, 'POPUP');
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

function detectedRepresentativeName(row) {
  const name = row && row.agent === 'codex' && row.resume && typeof row.resume.name === 'string'
    ? row.resume.name.trim()
    : '';
  return name || null;
}

function detectedAgentMessagePreview(row) {
  return detectedRepresentativeName(row)
    && typeof row.resume.agentMessagePreview === 'string'
    ? row.resume.agentMessagePreview
    : '';
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
    detectedRepresentativeName(row),
    detectedAgentMessagePreview(row),
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
    runtime: resolved.runtime || null,
    distro: resolved.distro || null,
    agent: resolved.agent || '',
    initialUrl: resolved.currentUrl || null,
    initialBrowserTabs: resolved.browserTabs || row.browserTabs || [],
    initialActiveBrowserTabId: resolved.activeBrowserTabId || row.activeBrowserTabId || null,
    initialQueue: resolved.queue || [],
    initialAttentionRecords: resolved.attentionRecords || [],
    composerDraft: resolved.composerDraft || '',
    initialStagedBrowserContexts: resolved.stagedBrowserContexts || [],
    initialBrowserLayoutMode: resolved.browserLayoutMode || 'terminal',
    initialFullBrowserComposerOpen: Boolean(resolved.fullBrowserComposerOpen),
    initialLastActivityAt: resolved.lastActivityAt || row.lastActivityAt || state.restoreSessions?.savedAt || null,
    initialCustomTabGroupId: validCustomTabGroup(resolved.customTabGroupId) ? resolved.customTabGroupId : null,
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

function detectedSessionName(row, mode) {
  const base = row.cwd ? row.cwd.split('/').filter(Boolean).pop() : row.tty;
  const candidate = mode === 'resume'
    ? (detectedRepresentativeName(row) || `${base}-resumed`)
    : base;
  return uniqueSessionName(candidate);
}

async function openDetectedRow(row, mode) {
  const name = detectedSessionName(row, mode);
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
    el.dataset.tty = row.tty || '';

    const badge = document.createElement('span');
    badge.className = 'dr-badge ' + (row.agent || 'shell');
    badge.textContent = agentLabel(row.agent);

    const main = document.createElement('div');
    main.className = 'dr-main';
    const title = document.createElement('div');
    title.className = 'dr-title';
    const representativeName = detectedRepresentativeName(row);
    const agentMessagePreview = detectedAgentMessagePreview(row);
    title.textContent = representativeName || (row.terminal && row.terminal.title) || row.command;
    title.title = row.command;
    const message = document.createElement('div');
    message.className = 'dr-message';
    message.textContent = agentMessagePreview;
    const sub = document.createElement('div');
    sub.className = 'dr-sub';
    const home = state.env ? state.env.home : '';
    const cwdText = row.cwd ? (home ? row.cwd.replace(home, '~') : row.cwd) : 'cwd unknown';
    const terminalBits = [row.terminal ? row.terminal.app : 'terminal'];
    if (representativeName && row.terminal && row.terminal.title) terminalBits.push(row.terminal.title);
    terminalBits.push(row.tty);
    const bits = [
      terminalBits.join(' · '),
      cwdText,
      'up ' + formatEtime(row.etime),
    ];
    if (row.agent) {
      bits.push(row.resume ? `↺ session ${formatAge(row.resume.ts)}` : 'no saved session found');
    }
    sub.textContent = bits.join('  —  ');
    sub.title = row.cwd || '';
    main.appendChild(title);
    if (agentMessagePreview) main.appendChild(message);
    main.appendChild(sub);
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', [
      agentLabel(row.agent),
      title.textContent,
      agentMessagePreview,
      ...bits,
      row.opened ? 'opened' : '',
    ].filter(Boolean).join('. '));

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
  const pending = visibleDetectedRows().filter((row) => row.agent && !row.opened);
  for (const row of pending.filter((candidate) => candidate.agent !== 'codex')) {
    if (!row.agent || row.opened) continue;
    try {
      await openDetectedRow(row, resumeCommandFor(row) ? 'resume' : 'fresh');
    } catch { /* keep going — remaining rows still open */ }
    renderDetectList();
  }
  await Promise.all(pending.filter((row) => row.agent === 'codex').map(async (row) => {
    try { await openDetectedRow(row, resumeCommandFor(row) ? 'resume' : 'fresh'); } catch { /* keep going */ }
    renderDetectList();
  }));
}

async function openAllRestoredSessions() {
  const snapshot = state.restoreSessions;
  const rows = visibleRestoreRows();
  const btn = $('#restore-open-all');
  btn.disabled = true;
  const pending = rows.filter((row) => !row.opened && !row.restoredAt);
  for (const row of pending.filter((candidate) => candidate.agent !== 'codex')) {
    if (row.opened || row.restoredAt) continue;
    try {
      await openRestoredSession(row);
    } catch { /* keep going */ }
    renderRestoreSessions();
  }
  await Promise.all(pending.filter((row) => row.agent === 'codex').map(async (row) => {
    try { await openRestoredSession(row); } catch { /* keep going */ }
    renderRestoreSessions();
  }));
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

  const codex = state.codexUpdate;
  const waiting = codex && codex.queue.length;
  if (waiting > 0 && !codexLaunchIsReleased()) {
    const status = codex.status || {};
    const main = document.createElement('div');
    main.className = 'rw-main';
    const title = document.createElement('div');
    title.className = 'rw-title';
    title.textContent = codex.phase === 'update-available'
      ? `Codex update available — ${waiting} session${waiting === 1 ? '' : 's'} waiting`
      : codex.phase === 'updating'
        ? `Updating Codex — ${waiting} session${waiting === 1 ? '' : 's'} waiting`
        : codex.phase === 'update-failed'
          ? `Codex update failed — ${waiting} session${waiting === 1 ? '' : 's'} waiting`
          : codex.phase === 'check-failed'
            ? `Codex update check failed — ${waiting} session${waiting === 1 ? '' : 's'} waiting`
            : `Checking Codex — ${waiting} session${waiting === 1 ? '' : 's'} waiting`;
    const detail = document.createElement('div');
    detail.className = 'rw-detail';
    if (codex.phase === 'update-available') {
      detail.textContent = `Installed ${status.currentVersion}; latest ${status.latestVersion}. Update once, then Chromux will resume every waiting Codex session.`;
    } else if (codex.phase === 'updating') {
      detail.textContent = codex.progress || 'Running codex update and verifying the installed version…';
    } else if (codex.phase === 'check-failed' || codex.phase === 'update-failed') {
      detail.textContent = status.error || 'Codex update handling failed. Retry or resume this workspace without updating.';
    } else {
      detail.textContent = 'Chromux is checking the stable release source before starting Codex.';
    }
    detail.title = detail.textContent;
    main.append(title, detail);

    const actions = document.createElement('div');
    actions.className = 'rw-actions';
    if (codex.phase === 'update-available') {
      const notes = document.createElement('button');
      notes.className = 'rw-action';
      notes.textContent = 'RELEASE NOTES';
      notes.onclick = () => window.chromux.openUpdateRelease({ status }).catch(() => {});
      const update = document.createElement('button');
      update.className = 'rw-action rw-primary';
      update.textContent = 'UPDATE CODEX';
      update.onclick = () => installCodexUpdate().catch(() => {});
      actions.append(notes, update);
    } else if (codex.phase === 'check-failed') {
      const retryCheck = document.createElement('button');
      retryCheck.className = 'rw-action rw-primary';
      retryCheck.textContent = 'RETRY CHECK';
      retryCheck.onclick = () => checkCodexPreflight({ force: true }).catch(() => {});
      actions.appendChild(retryCheck);
    } else if (codex.phase === 'update-failed') {
      const retryUpdate = document.createElement('button');
      retryUpdate.className = 'rw-action rw-primary';
      retryUpdate.textContent = 'RETRY UPDATE';
      retryUpdate.onclick = () => installCodexUpdate().catch(() => {});
      actions.appendChild(retryUpdate);
    }
    if (codex.phase !== 'updating' && codex.phase !== 'releasing') {
      const resume = document.createElement('button');
      resume.className = 'rw-action rw-dismiss';
      resume.textContent = 'RESUME ANYWAY';
      resume.onclick = () => releaseCodexLaunches({ bypass: true }).catch(() => {});
      actions.appendChild(resume);
    }
    host.append(main, actions);
    host.classList.remove('hidden');
    return;
  }

  const failOpen = codex && codex.phase === 'bypassed' ? codex.failOpenWarning : null;
  if (failOpen) {
    const status = codex.status || {};
    const released = failOpen.releasedCount || 0;
    const main = document.createElement('div');
    main.className = 'rw-main';
    const title = document.createElement('div');
    title.className = 'rw-title';
    title.textContent = failOpen.kind === 'update-available'
      ? 'Codex update available — restart later'
      : `Codex update check failed — ${released} session${released === 1 ? '' : 's'} released`;
    const detail = document.createElement('div');
    detail.className = 'rw-detail';
    detail.textContent = failOpen.kind === 'update-available'
      ? `Installed ${status.currentVersion}; latest ${status.latestVersion}. Running sessions were not interrupted; update Codex during a later safe restart.`
      : `${failOpen.error || 'Codex update check failed'}. Chromux started the saved sessions without blocking this app run.`;
    detail.title = detail.textContent;
    main.append(title, detail);

    const actions = document.createElement('div');
    actions.className = 'rw-actions';
    if (failOpen.kind === 'update-available') {
      const notes = document.createElement('button');
      notes.className = 'rw-action';
      notes.textContent = 'RELEASE NOTES';
      notes.onclick = () => window.chromux.openUpdateRelease({ status }).catch(() => {});
      actions.appendChild(notes);
    }
    const retryCheck = document.createElement('button');
    retryCheck.className = 'rw-action rw-primary';
    retryCheck.textContent = 'RETRY CHECK';
    retryCheck.onclick = () => checkCodexPreflight({ force: true }).catch(() => {});
    const dismiss = document.createElement('button');
    dismiss.className = 'rw-action rw-dismiss';
    dismiss.textContent = 'DISMISS';
    dismiss.onclick = () => {
      codex.failOpenWarning = null;
      renderWorkspaceWarning();
    };
    actions.append(retryCheck, dismiss);
    host.append(main, actions);
    host.classList.remove('hidden');
    return;
  }

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
  if (state.env?.hostPlatform === 'win32' && !state.windowsSetup?.capabilities?.canOpenSession) return;
  if (!snapshot || snapshot.consumed || !Array.isArray(snapshot.sessions) || snapshot.sessions.length === 0) return;
  if (!['update-install', 'app-close'].includes(snapshot.reason)) return;

  const res = await window.chromux.resolveRestoreSessions({ sessions: snapshot.sessions });
  const restored = [];
  const successful = [];
  const restoreRow = async (row) => {
    try {
      if (state.testRestoreFailureNames && state.testRestoreFailureNames.has(row.name)) {
        throw new Error(`Simulated restore failure: ${row.name}`);
      }
      const name = uniqueSessionName(row.name || (row.cwd ? row.cwd.split('/').filter(Boolean).pop() : 'restored'));
      const command = row.command || undefined;
      const session = await createSession({
        name,
        cwd: row.cwd || (state.env ? state.env.home : '~'),
        runtime: row.runtime || null,
        distro: row.distro || null,
        agent: row.agent || '',
        initialUrl: row.currentUrl || null,
        initialBrowserTabs: row.browserTabs || [],
        initialActiveBrowserTabId: row.activeBrowserTabId || null,
        initialQueue: row.queue || [],
        initialAttentionRecords: row.attentionRecords || [],
        composerDraft: row.composerDraft || '',
        initialStagedBrowserContexts: row.stagedBrowserContexts || [],
        initialBrowserLayoutMode: row.browserLayoutMode || 'terminal',
        initialFullBrowserComposerOpen: Boolean(row.fullBrowserComposerOpen),
        initialLastActivityAt: row.lastActivityAt || snapshot.savedAt || null,
        initialCustomTabGroupId: validCustomTabGroup(row.customTabGroupId) ? row.customTabGroupId : null,
        sessionPurpose: row.sessionPurpose || null,
        worktreeIdentity: row.worktreeIdentity || null,
        command,
        resumeLaunch: resumeLaunchForRow(row, {
          name,
          command,
          source: 'auto-restore',
          autoRestored: true,
        }),
      });
      restored.push({ name: row.name, cwd: row.cwd, agent: row.agent, sessionId: session.id });
      successful.push({ row, session });
      row.opened = true;
      row.restoredAt = new Date().toISOString();
    } catch { /* keep restoring remaining sessions */ }
  };
  const rows = res.sessions || [];
  for (const row of rows.filter((candidate) => candidate.agent !== 'codex')) {
    await restoreRow(row);
  }
  const codexRestores = rows.filter((row) => row.agent === 'codex').map((row) => restoreRow(row));
  await Promise.all(codexRestores);
  for (const { row, session } of successful) {
    if (row.wasLastActiveInGroup === true) {
      state.ui.lastActiveSessionByGroup.set(sessionTabGroupId(session), session.id);
    }
  }
  let restoreTarget = successful.find(({ row }) => row.wasActive === true) || null;
  const priorActiveRow = rows.find((row) => row.wasActive === true) || null;
  if (!restoreTarget && priorActiveRow) {
    const priorGroupId = validCustomTabGroup(priorActiveRow.customTabGroupId)
      ? priorActiveRow.customTabGroupId : directoryGroupId(priorActiveRow.cwd);
    restoreTarget = successful.find(({ session }) => sessionTabGroupId(session) === priorGroupId
      && state.ui.lastActiveSessionByGroup.get(priorGroupId) === session.id)
      || successful.find(({ session }) => sessionTabGroupId(session) === priorGroupId)
      || null;
  }
  if (!restoreTarget) {
    const firstGroup = effectiveTabGroups()[0];
    const remembered = firstGroup && state.ui.lastActiveSessionByGroup.get(firstGroup.id);
    restoreTarget = successful.find(({ session }) => session.id === remembered)
      || successful.find(({ session }) => session.id === firstGroup?.sessions[0]?.id)
      || successful[0]
      || null;
  }
  if (restoreTarget) activateSession(restoreTarget.session.id, {
    consumeRestoredCompletion: false,
  });
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

function launcherPrimaryModifierLabel() {
  return state.env && state.env.primaryModifier === 'control' ? 'Ctrl' : '⌘';
}

function selectedLauncherAgent() {
  return $('#ns-agent .on')?.dataset.agent || '';
}

function scaffolderRequest() {
  const source = $('#pc-source .on')?.dataset.source || 'fresh';
  return {
    source,
    cloneUrl: source === 'clone' ? $('#pc-clone-url').value.trim() : '',
    name: $('#pc-name').value.trim(),
    category: $('#pc-category').value,
    sandboxType: $('#pc-sandbox-type').value,
  };
}

function renderScaffolderCategories() {
  const config = state.scaffolderConfig;
  if (!config) return;
  const category = $('#pc-category');
  const previous = category.value;
  category.replaceChildren(...config.categories.map((entry) => {
    const option = document.createElement('option');
    option.value = entry.name;
    option.textContent = `${entry.name} — ${entry.description || entry.type}`;
    return option;
  }));
  if (config.categories.some((entry) => entry.name === previous)) category.value = previous;
  const sandbox = $('#pc-sandbox-type');
  const previousSandbox = sandbox.value;
  sandbox.replaceChildren(...config.sandboxTypes.map((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    return option;
  }));
  if (config.sandboxTypes.includes(previousSandbox)) sandbox.value = previousSandbox;
  renderScaffolderConditionalFields();
}

function renderScaffolderConditionalFields() {
  const source = $('#pc-source .on')?.dataset.source || 'fresh';
  $('#pc-clone-field').classList.toggle('hidden', source !== 'clone');
  const category = state.scaffolderConfig?.categories.find((entry) => entry.name === $('#pc-category').value);
  $('#pc-sandbox-field').classList.toggle('hidden', category?.type !== 'sandbox');
}

let scaffolderPreviewGeneration = 0;

async function refreshScaffolderPreview() {
  const generation = ++scaffolderPreviewGeneration;
  renderScaffolderConditionalFields();
  const status = $('#pc-status');
  status.textContent = '';
  status.classList.remove('fail');
  try {
    if (!state.scaffolderConfig) {
      state.scaffolderConfig = await window.chromux.projectScaffolderConfig();
      renderScaffolderCategories();
    }
    const preview = await window.chromux.projectScaffolderPreview(scaffolderRequest());
    if (generation !== scaffolderPreviewGeneration) return null;
    $('#pc-name').value = preview.name;
    $('#pc-destination').textContent = preview.target;
    if (preview.exists) {
      status.textContent = 'Destination already exists.';
      status.classList.add('fail');
    }
    $('#pc-create-only').disabled = preview.exists || state.ui.projectCreationPending;
    $('#pc-create-launch').disabled = preview.exists || state.ui.projectCreationPending
      || (selectedLauncherAgent() === 'grok' && !$('#ns-grok-enable').checked);
    return preview;
  } catch (error) {
    if (generation !== scaffolderPreviewGeneration) return null;
    $('#pc-destination').textContent = 'Complete the fields to preview the destination.';
    status.textContent = error.message || 'Project destination is invalid.';
    status.classList.add('fail');
    $('#pc-create-only').disabled = true;
    $('#pc-create-launch').disabled = true;
    return null;
  }
}

function selectLauncherMode(mode) {
  const selected = mode === 'create' ? 'create' : 'open';
  state.ui.launcherMode = selected;
  const creating = selected === 'create';
  $('#launcher-tab-open').classList.toggle('on', !creating);
  $('#launcher-tab-open').setAttribute('aria-selected', String(!creating));
  $('#launcher-tab-create').classList.toggle('on', creating);
  $('#launcher-tab-create').setAttribute('aria-selected', String(creating));
  $('#launcher-open-panel').classList.toggle('hidden', creating);
  $('#launcher-create-panel').classList.toggle('hidden', !creating);
  $('#ns-create').classList.toggle('hidden', creating);
  $('#pc-create-only').classList.toggle('hidden', !creating);
  $('#pc-create-launch').classList.toggle('hidden', !creating);
  if (creating) {
    refreshScaffolderPreview().finally(() => {
      const target = $('#pc-name').value ? $('#pc-name') : ($('#pc-clone-url').value ? $('#pc-name') : $('#pc-name'));
      target.focus();
    });
  } else {
    $('#ns-name').focus();
    $('#ns-name').select();
  }
  renderAgentDataWarning();
}

function openNewSessionModal(mode = 'open') {
  if (state.env?.hostPlatform === 'win32') {
    const capabilities = state.windowsSetup?.capabilities;
    if (!capabilities?.canOpenSession || (mode === 'create' && !capabilities.canCreateProject)) {
      state.ui.windowsSetupStage = capabilities?.canOpenSession ? 'root' : 'system';
      openWindowsSetup().catch(() => {});
      return;
    }
  }
  $('#ns-name').value = `session-${state.counter + 1}`;
  $('#ns-cwd').value = state.lastCwd || (state.env ? state.env.home : '');
  $('#pc-name').value = '';
  $('#pc-clone-url').value = '';
  $('#pc-status').textContent = '';
  $('#ns-grok-enable').checked = false;
  renderAgentDataWarning();
  $('#modal-new').classList.remove('hidden');
  renderSavedProjects();
  refreshProjectConfig().catch(() => {});
  invalidate('shortcutDebug');
  $('#launcher-tab-open kbd').textContent = `${launcherPrimaryModifierLabel()}T`;
  $('#launcher-tab-create kbd').textContent = `${launcherPrimaryModifierLabel()}N`;
  selectLauncherMode(mode);
}

$('#btn-new-session').onclick = () => {
  closeSessionSearch();
  openNewSessionModal('open');
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
$('#btn-first-session').onclick = () => openNewSessionModal('open');
document.querySelectorAll('[data-rail-mode]').forEach((button) => {
  button.addEventListener('click', () => selectRailMode(button.dataset.railMode));
});
$('#git-search').addEventListener('input', (event) => {
  state.ui.gitSearch = event.target.value;
  invalidate('attention');
});
document.querySelectorAll('[data-git-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    state.ui.gitFilter = GIT_FILTERS.has(button.dataset.gitFilter) ? button.dataset.gitFilter : 'action';
    document.querySelectorAll('[data-git-filter]').forEach((candidate) => {
      candidate.setAttribute('aria-pressed', String(candidate.dataset.gitFilter === state.ui.gitFilter));
    });
    invalidate('attention');
  });
});
$('#thread-sort-toggle').addEventListener('click', () => {
  selectThreadSort(state.ui.threadSort === 'recent' ? 'az' : 'recent');
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
$('#settings-tab-groups').addEventListener('change', (event) => {
  state.ui.tabGroupsEnabled = Boolean(event.target.checked);
  if (state.ui.tabGroupsEnabled && state.activeId) {
    const active = state.sessions.get(state.activeId);
    state.ui.focusedTabGroupId = active ? sessionTabGroupId(active) : null;
  }
  persistTabGroups();
  renderTabs();
  if (state.activeId) requestAnimationFrame(() => revealFocusedSessionTab(state.activeId));
});
const addCustomTabGroupFromSettings = () => {
  const input = $('#custom-tab-group-name');
  const result = createCustomTabGroup(input.value);
  setCustomTabGroupError(result.error || '');
  if (result.group) input.value = '';
  input.focus();
};
$('#custom-tab-group-add').addEventListener('click', addCustomTabGroupFromSettings);
$('#custom-tab-group-name').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addCustomTabGroupFromSettings();
  }
});
$('#settings-thread-preview-size').addEventListener('change', (event) => {
  applyThreadPreviewSize(event.target.value);
});
$('#settings-browser-fullscreen-behavior').addEventListener('change', (event) => {
  applyBrowserFullscreenBehavior(event.target.value);
});
$('#settings-prevent-sleep').addEventListener('change', (event) => {
  changePreventSleep(event.target.checked);
});
$('#settings-wsl-distro').addEventListener('change', async (event) => {
  const result = await window.chromux.wslSelectDistro(event.target.value);
  state.env.runtime.selectedDistro = result.selectedDistro;
  state.env.runtime.readiness = result.readiness;
  if (result.setupStatus) renderWindowsSetup(result.setupStatus);
  const ready = result.readiness && result.readiness.ready;
  $('#settings-wsl-status').textContent = ready
    ? (result.readiness.warning || 'READY')
    : (result.readiness.error || 'NOT READY');
  $('#settings-wsl-status').classList.toggle('fail', !ready);
  state.scaffolderConfig = await window.chromux.projectScaffolderConfig().catch(() => null);
  renderProjectsRootSetting();
});
$('#settings-windows-setup').addEventListener('click', () => {
  $('#modal-settings').classList.add('hidden');
  openWindowsSetup().catch(() => {});
});
$('#windows-setup-stages').addEventListener('click', (event) => {
  const button = event.target.closest('[data-setup-stage]');
  if (button) selectWindowsSetupStage(button.dataset.setupStage);
});
$('#windows-setup-stages').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const stages = [...document.querySelectorAll('[data-setup-stage]')];
  const current = stages.indexOf(event.target.closest('[data-setup-stage]'));
  if (current < 0) return;
  event.preventDefault();
  const index = event.key === 'Home' ? 0
    : event.key === 'End' ? stages.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + stages.length) % stages.length;
  selectWindowsSetupStage(stages[index].dataset.setupStage, { focus: true });
});
$('#windows-setup-distro').addEventListener('change', (event) => {
  runWindowsSetupAction(() => window.chromux.windowsSetupSelectDistro(event.target.value));
});
$('#windows-setup-create-confirm').addEventListener('change', (event) => {
  $('#windows-setup-create-root').disabled = !event.target.checked;
});
$('#windows-setup-save-root').addEventListener('click', () => {
  runWindowsSetupAction(() => window.chromux.windowsSetupSaveRoot($('#windows-setup-root').value.trim(), false));
});
$('#windows-setup-create-root').addEventListener('click', async () => {
  if (!$('#windows-setup-create-confirm').checked) return;
  const status = await runWindowsSetupAction(
    () => window.chromux.windowsSetupSaveRoot($('#windows-setup-root').value.trim(), true),
  );
  if (status) {
    $('#windows-setup-create-confirm').checked = false;
    $('#windows-setup-create-root').disabled = true;
  }
});
$('#windows-setup-refresh').addEventListener('click', () => {
  runWindowsSetupAction(() => window.chromux.windowsSetupRefresh());
});
$('#windows-setup-finish').addEventListener('click', async () => {
  const status = await runWindowsSetupAction(() => window.chromux.windowsSetupComplete());
  if (status?.completion) $('#windows-setup-overlay').classList.add('hidden');
});
$('#windows-setup-self-test').addEventListener('click', async () => {
  const diagnostics = $('#windows-setup-diagnostics');
  diagnostics.classList.remove('hidden');
  diagnostics.textContent = 'Running a local WSL PTY self-test…';
  try {
    const result = await window.chromux.windowsSetupSelfTest();
    diagnostics.textContent = [
      `Result: ${result.ok ? 'PASS' : 'FAIL'}`,
      `Distribution: ${result.distro}`,
      `Projects Root: ${result.projectsRoot}`,
      result.detail || '',
    ].join('\n');
  } catch (failure) {
    diagnostics.textContent = `Result: FAIL\n${failure.message || 'Self-test failed.'}`;
  }
});
$('#windows-setup-settings').addEventListener('click', () => {
  $('#windows-setup-overlay').classList.add('hidden');
  openSettings();
});
$('#windows-setup-docs').addEventListener('click', () => {
  window.chromux.windowsSetupOpenDocumentation('chromux').catch(() => {});
});
$('#windows-setup-exit').addEventListener('click', () => {
  window.chromux.windowsSetupExit().catch(() => {});
});
function renderProjectsRootSetting() {
  if (!state.scaffolderConfig) return;
  $('#settings-projects-root').value = state.scaffolderConfig.root;
  const warnings = state.scaffolderConfig.warnings || [];
  $('#settings-projects-root-status').textContent = warnings.join(' ');
  $('#settings-projects-root-status').classList.toggle('fail', warnings.length > 0);
}
$('#settings-projects-root-save').addEventListener('click', async () => {
  const status = $('#settings-projects-root-status');
  try {
    state.scaffolderConfig = await window.chromux.projectScaffolderSetRoot($('#settings-projects-root').value.trim());
    renderProjectsRootSetting();
    const setupStatus = await window.chromux.windowsSetupStatus().catch(() => null);
    if (setupStatus) renderWindowsSetup(setupStatus);
    status.textContent = `SAVED FOR ${state.scaffolderConfig.distro || 'THIS MAC'}`;
    status.classList.remove('fail');
  } catch (error) {
    status.textContent = error.message || 'Projects Root could not be saved.';
    status.classList.add('fail');
  }
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
  if (dir) {
    $('#ns-cwd').value = typeof dir === 'string' ? dir : dir.cwd;
    await refreshProjectConfig();
  }
};

async function refreshProjectConfig(location = null) {
  let cwd = $('#ns-cwd').value.trim();
  if (cwd.startsWith('~')) cwd = (state.env ? state.env.home : '') + cwd.slice(1);
  const config = await window.chromux.projectConfig(location || cwd);
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
    use.onclick = async () => {
      $('#ns-name').value = project.name;
      $('#ns-cwd').value = project.cwd;
      await refreshProjectConfig(project);
      $('#ns-start-script').value = project.script;
    };
    const remove = document.createElement('button'); remove.className = 'qi-btn'; remove.textContent = 'REMOVE';
    remove.onclick = async () => { state.projects = await window.chromux.projectsReplace(state.projects.filter((item) => !(item.cwd === project.cwd && item.script === project.script))); renderSavedProjects(); };
    row.append(use, remove); host.appendChild(row);
  }
}

async function saveCurrentProject() {
  const config = state.projectConfig; const script = $('#ns-start-script').value;
  if (!config || !config.valid || !config.scripts.includes(script)) return null;
  const name = $('#ns-name').value.trim() || config.cwd.split('/').pop();
  state.projects = await window.chromux.projectsReplace([...state.projects, {
    name, runtime: config.runtime, distro: config.distro, cwd: config.cwd, script,
  }]);
  renderSavedProjects();
  return state.projects.find((item) => item.cwd === config.cwd && item.script === script) || null;
}

$('#ns-cwd').addEventListener('change', () => refreshProjectConfig().catch(() => {}));
$('#ns-save-project').onclick = () => saveCurrentProject();
$('#ns-start-project').onclick = async () => {
  const project = await saveCurrentProject();
  if (!project) return;
  $('#modal-new').classList.add('hidden');
  await createSession({
    name: project.name,
    runtime: project.runtime,
    distro: project.distro,
    cwd: project.cwd,
    agent: '',
    command: project.startCommand,
  });
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
  if (state.ui.launcherMode === 'create') refreshScaffolderPreview().catch(() => {});
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
  if (source && mode === 'page') createSessionFromPage(source, { grokAcknowledged: true }).catch(() => {});
  else if (source) duplicateSession(source, 'grok', mode).catch(() => {});
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

$('#launcher-tab-open').addEventListener('click', () => selectLauncherMode('open'));
$('#launcher-tab-create').addEventListener('click', () => selectLauncherMode('create'));
$('#pc-source').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-source]');
  if (!button) return;
  for (const candidate of $('#pc-source').children) candidate.classList.toggle('on', candidate === button);
  if (button.dataset.source === 'clone' && !$('#pc-name').value.trim()) $('#pc-clone-url').focus();
  refreshScaffolderPreview().catch(() => {});
});
for (const id of ['pc-name', 'pc-clone-url', 'pc-category', 'pc-sandbox-type']) {
  $(id.startsWith('#') ? id : `#${id}`).addEventListener(id.startsWith('pc-') && id !== 'pc-name' && id !== 'pc-clone-url' ? 'change' : 'input', () => {
    refreshScaffolderPreview().catch(() => {});
  });
}

async function createScaffoldedProject({ launch }) {
  if (state.ui.projectCreationPending) return null;
  state.ui.projectCreationPending = true;
  const status = $('#pc-status');
  $('#pc-create-only').disabled = true;
  $('#pc-create-launch').disabled = true;
  const preview = await refreshScaffolderPreview();
  if (!preview || preview.exists) {
    state.ui.projectCreationPending = false;
    await refreshScaffolderPreview();
    return null;
  }
  const agent = selectedLauncherAgent();
  if (launch && agent === 'grok' && !$('#ns-grok-enable').checked) {
    state.ui.projectCreationPending = false;
    await refreshScaffolderPreview();
    return null;
  }
  status.textContent = 'CREATING PROJECT…';
  status.classList.remove('fail');
  let created = null;
  try {
    created = await window.chromux.projectScaffolderCreate(scaffolderRequest());
    const warning = created.warnings?.length ? ` ${created.warnings.join(' ')}` : '';
    status.textContent = `CREATED ${created.target}.${warning}`;
    if (launch) {
      await createSession({
        name: created.name,
        runtime: created.runtime,
        distro: created.distro,
        cwd: created.target,
        agent,
      });
      $('#modal-new').classList.add('hidden');
    }
    state.ui.projectCreationPending = false;
    return created;
  } catch (error) {
    status.textContent = created
      ? `CREATED ${created.target}, BUT THE SESSION COULD NOT LAUNCH: ${error.message || 'unknown error'}`
      : (error.message || 'Project creation failed.');
    status.classList.add('fail');
    state.ui.projectCreationPending = false;
    $('#pc-create-only').disabled = false;
    $('#pc-create-launch').disabled = agent === 'grok' && !$('#ns-grok-enable').checked;
    return null;
  }
}

$('#pc-create-only').addEventListener('click', () => createScaffoldedProject({ launch: false }));
$('#pc-create-launch').addEventListener('click', () => createScaffoldedProject({ launch: true }));
$('#vercel-profile').addEventListener('change', () => {
  state.ui.vercel.profileId = $('#vercel-profile').value;
  renderVercelSetup();
});
for (const id of [
  'vercel-org-id', 'vercel-project-id', 'vercel-trigger',
  'vercel-production-branch', 'vercel-environment',
]) {
  $(`#${id}`).addEventListener('input', renderVercelSetup);
  $(`#${id}`).addEventListener('change', renderVercelSetup);
}
$('#vercel-use-cli').addEventListener('click', () => connectVercelCli());
$('#vercel-use-oauth').addEventListener('click', () => connectVercelOAuth());
$('#vercel-connect-token').addEventListener('click', () => connectVercelToken());
$('#vercel-validate-profile').addEventListener('click', () => validateVercelProfile());
$('#vercel-remove-profile').addEventListener('click', () => removeVercelProfile());
$('#vercel-save-project').addEventListener('click', () => saveVercelProject());
$('#vercel-remove-project').addEventListener('click', () => removeVercelProject());
$('#vercel-ship-review-button').addEventListener('click', () => previewVercelShip());
$('#vercel-ship-start').addEventListener('click', () => startVercelShip());
$('#vercel-job-cancel').addEventListener('click', () => cancelVercelJob());
$('#vercel-job-retry').addEventListener('click', () => retryVercelJob());
for (const id of ['vercel-ship-confirm', 'vercel-production-confirm', 'vercel-commit-message']) {
  $(`#${id}`).addEventListener('input', renderVercelShipping);
  $(`#${id}`).addEventListener('change', renderVercelShipping);
}
$('#vercel-ship-environment').addEventListener('change', () => {
  state.ui.vercel.review = null;
  renderVercelSetup();
});

window.chromux.onVercelOAuthUpdate(async (result) => {
  const wizard = state.ui.vercel;
  if (result?.ok) {
    const connections = await window.chromux.vercelConnectionsRead().catch(() => null);
    wizard.profiles = connections?.ok ? connections.profiles : wizard.profiles;
    wizard.profileId = result.profile.id;
    setVercelStatus(`Vercel sign-in saved for ${result.profile.account || result.profile.label}.`, 'current');
  } else {
    setVercelStatus(vercelErrorMessage(result, 'Vercel sign-in did not complete.'), 'fail');
  }
  setVercelBusy(false);
});

window.chromux.onVercelJobUpdate((job) => {
  const wizard = state.ui.vercel;
  const index = wizard.jobs.findIndex((candidate) => candidate.id === job.id);
  if (index >= 0) wizard.jobs[index] = job;
  else wizard.jobs.unshift(job);
  if (wizard.project?.key === job.mappingKey) wizard.job = job;
  renderVercelShipping();
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $('#' + btn.dataset.close).classList.add('hidden');
    // Closing the modal drops only the compose context — the capture record
    // survives, so in-flight deliveries still resolve and stay attributable.
    if (btn.dataset.close === 'modal-capture') state.ui.captureModal = null;
    if (btn.dataset.close === 'modal-grok-advisory') closeGrokContextAdvisory();
    if (btn.dataset.close === 'modal-vercel') {
      state.ui.vercel.generation += 1;
      $('#vercel-token').value = '';
      window.chromux.vercelOAuthCancel().catch(() => {});
    }
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
  await window.chromux.confirmAppClose({ sessions: snapshotOpenSessions(), inboxTriage: snapshotInboxTriage() });
});

window.chromux.onShortcutDebugInput(noteShortcutDebugInput);
window.chromux.onShortcutActivateSessionIndex(handleShortcutActivateSessionIndex);
window.chromux.onShortcutFocusNextQueueItem(handleShortcutFocusNextQueueItem);
window.chromux.onShortcutToggleBrowser(handleShortcutToggleBrowser);
window.chromux.onShortcutBrowserFullscreen(handleShortcutBrowserFullscreen);
window.chromux.onShortcutOpenNewSession(handleShortcutOpenNewSession);
window.chromux.onShortcutCreateProject(handleShortcutCreateProject);
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

  if (state.ui.tabGroupsEnabled) {
    const groups = effectiveTabGroups();
    const group = groups[index];
    if (!group) return null;

    const activeIndex = group.sessions.findIndex((session) => session.id === state.activeId);
    const remembered = state.ui.lastActiveSessionByGroup.get(group.id);
    const session = activeIndex >= 0
      ? group.sessions[(activeIndex + 1) % group.sessions.length]
      : group.sessions.find((candidate) => candidate.id === remembered) || group.sessions[0];
    if (!session) return null;

    activateSession(session.id);
    return { index, groupId: group.id, sessionId: session.id };
  }

  const session = orderedSessions()[index];
  if (!session) return null;
  activateSessionByIndex(index);
  return { index, groupId: null, sessionId: session.id };
}

function handleShortcutFocusNextQueueItem(now = Date.now()) {
  if (modalOpen() || editableFocused()) return null;
  return focusNextQueuedPreview(now);
}

function handleShortcutToggleBrowser() {
  if (modalOpen() || editableFocused()) return null;
  const session = state.sessions.get(state.activeId);
  if (!session) return null;
  setBrowserCollapsed(session, session.browser.layoutMode !== 'terminal');
  return { sessionId: session.id, collapsed: session.browser.layoutMode === 'terminal' };
}

function handleShortcutBrowserFullscreen() {
  if (modalOpen() || editableFocused()) return null;
  const session = state.sessions.get(state.activeId);
  if (!session) return null;
  advanceBrowserLayout(session);
  return { sessionId: session.id, layoutMode: session.browser.layoutMode };
}

function handleShortcutOpenNewSession() {
  if (guardedShortcutDisabledReason(shortcutFocusContext())) return null;
  openNewSessionModal('open');
  return { opened: true, mode: 'open' };
}

function handleShortcutCreateProject() {
  if (guardedShortcutDisabledReason(shortcutFocusContext())) return null;
  openNewSessionModal('create');
  return { opened: true, mode: 'create' };
}

function handleShortcutOpenDetectModal() {
  if (guardedShortcutDisabledReason(shortcutFocusContext())) return null;
  openDetectModal();
  return { opened: true };
}

function handleShortcutOpenComposer() {
  if (guardedShortcutDisabledReason(shortcutFocusContext())) return null;
  const session = state.sessions.get(state.activeId);
  if (!session) return null;
  return session.browser.layoutMode === 'browserChromux'
    ? openFullBrowserComposer(session)
    : openComposer(session);
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

function fallbackChromuxShortcutAction(input, primaryModifier = state.env && state.env.primaryModifier) {
  const windowsPrimary = primaryModifier === 'control';
  const primary = windowsPrimary
    ? Boolean(input.control && !input.meta)
    : Boolean(input.meta && !input.control);
  if (!primary || input.alt || input.type !== 'keyDown') return null;
  const key = String(input.key || '').toUpperCase();
  if (/^[1-9]$/.test(key) && !input.shift) return { id: 'session-index', index: Number(key) - 1 };
  if (key === 'T' && !input.shift) return { id: 'new-session' };
  if (key === 'N' && !input.shift) return { id: 'create-project' };
  if (key === 'D' && !input.shift) return { id: 'detect' };
  if (key === 'J' && !input.shift) return { id: 'queue-focus' };
  if (key === 'B' && input.shift) return { id: 'browser-toggle' };
  if (key === 'F' && input.shift) return { id: 'browser-fullscreen' };
  if (String(input.key || '').toLowerCase() === 'enter' && input.shift) return { id: 'composer-open' };
  return null;
}

function chromuxShortcutActionFromInput(input) {
  if (window.chromux && typeof window.chromux.shortcutAction === 'function') {
    return window.chromux.shortcutAction(input);
  }
  return fallbackChromuxShortcutAction(input);
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
  else if (action.id === 'browser-fullscreen') result = handleShortcutBrowserFullscreen();
  else if (action.id === 'new-session') result = handleShortcutOpenNewSession();
  else if (action.id === 'create-project') result = handleShortcutCreateProject();
  else if (action.id === 'detect') result = handleShortcutOpenDetectModal();
  else if (action.id === 'composer-open') result = handleShortcutOpenComposer();
  else return;

  if (result !== null) {
    noteShortcutDebugInput(shortcutDebugInputFromDomEvent(e, 'renderer'));
    e.preventDefault();
  }
}

if (window.chromuxTest) {
  window.chromuxTestVercel = {
    addSession(opts = {}) {
      return window.chromuxTestBrowser.addSession({
        name: 'vercel-project',
        agent: 'codex',
        cwd: '/tmp',
        ...opts,
      });
    },
    async open(id) {
      await openVercelSetup(testSession(id));
      return this.snapshot(id);
    },
    async connectCli() {
      await connectVercelCli();
      return this.snapshot(state.ui.vercel.sessionId);
    },
    selectProfile(profileId) {
      state.ui.vercel.profileId = profileId;
      renderVercelSetup();
    },
    setProject({ orgId, projectId, trigger = 'direct', productionBranch = '', environment = '' } = {}) {
      $('#vercel-org-id').value = orgId || '';
      $('#vercel-project-id').value = projectId || '';
      $('#vercel-trigger').value = trigger;
      $('#vercel-production-branch').value = productionBranch;
      $('#vercel-environment').value = environment;
      renderVercelSetup();
    },
    async save() {
      await saveVercelProject();
      return this.snapshot(state.ui.vercel.sessionId);
    },
    async reviewShip(environment = 'preview') {
      $('#vercel-ship-environment').value = environment;
      await previewVercelShip();
      return this.snapshot(state.ui.vercel.sessionId);
    },
    confirmShip({ reviewed = true, commitMessage = '', productionConfirmation = '' } = {}) {
      $('#vercel-ship-confirm').checked = reviewed;
      $('#vercel-commit-message').value = commitMessage;
      $('#vercel-production-confirm').value = productionConfirmation;
      renderVercelShipping();
      return this.snapshot(state.ui.vercel.sessionId);
    },
    async startShip() {
      await startVercelShip();
      return this.snapshot(state.ui.vercel.sessionId);
    },
    snapshot(id) {
      const session = state.sessions.get(id);
      return {
        open: !$('#modal-vercel').classList.contains('hidden'),
        header: session?.els?.vercelBtn?.textContent || '',
        headerReady: Boolean(session?.els?.vercelBtn?.classList.contains('ready')),
        capability: $('#vercel-capability-status').textContent,
        installCommand: $('#vercel-install-command').textContent,
        status: $('#vercel-status').textContent,
        profiles: state.ui.vercel.profiles.map((profile) => ({
          id: profile.id, label: profile.label, kind: profile.kind, account: profile.account,
        })),
        profileId: state.ui.vercel.profileId,
        repositoryRoot: $('#vercel-repository-root').textContent,
        deployRoot: $('#vercel-deploy-root').textContent,
        orgId: $('#vercel-org-id').value,
        projectId: $('#vercel-project-id').value,
        saveDisabled: $('#vercel-save-project').disabled,
        review: state.ui.vercel.review ? {
          environment: state.ui.vercel.review.environment,
          production: state.ui.vercel.review.production,
          productionConfirmation: state.ui.vercel.review.productionConfirmation,
          paths: state.ui.vercel.review.paths.length,
        } : null,
        shipDisabled: $('#vercel-ship-start').disabled,
        job: state.ui.vercel.job ? {
          id: state.ui.vercel.job.id,
          phase: state.ui.vercel.job.phase,
          deploymentUrl: state.ui.vercel.job.deploymentUrl,
          retryAction: state.ui.vercel.job.retryAction,
        } : null,
        tokenValue: $('#vercel-token').value,
      };
    },
  };

  window.chromuxTestWindowsSetup = {
    render(status) {
      state.env = state.env || {};
      state.env.hostPlatform = 'win32';
      renderWindowsSetup(status);
      $('#windows-setup-overlay').classList.remove('hidden');
      selectWindowsSetupStage(windowsSetupFirstIncompleteStage(status));
    },
    stage: () => state.ui.windowsSetupStage,
    visible: () => !$('#windows-setup-overlay').classList.contains('hidden'),
    summary: () => $('#windows-setup-summary').textContent,
    checks: () => [...document.querySelectorAll('.windows-setup-check')].map((row) => ({
      id: row.dataset.checkId,
      badge: row.querySelector('.windows-setup-badge')?.textContent || '',
    })),
    capabilityState: () => ({
      createTabDisabled: $('#launcher-tab-create').disabled,
      agents: Object.fromEntries([...$('#ns-agent').children].map((button) => [
        button.dataset.agent || 'shell',
        !button.disabled,
      ])),
      finishDisabled: $('#windows-setup-finish').disabled,
      selfTestDisabled: $('#windows-setup-self-test').disabled,
    }),
    selectStage(stage) { selectWindowsSetupStage(stage); },
    rootValue: () => $('#windows-setup-root').value,
    confirmCreate(enabled) {
      $('#windows-setup-create-confirm').checked = Boolean(enabled);
      $('#windows-setup-create-confirm').dispatchEvent(new Event('change', { bubbles: true }));
      return $('#windows-setup-create-root').disabled;
    },
    focusTrap() {
      selectWindowsSetupStage('ready');
      $('#windows-setup-refresh').focus();
      $('#windows-setup-refresh').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      return document.activeElement?.id || '';
    },
    arrowFrom(stage, key) {
      const button = document.querySelector(`[data-setup-stage="${stage}"]`);
      button.focus();
      button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      return { stage: state.ui.windowsSetupStage, focused: document.activeElement?.dataset?.setupStage || '' };
    },
  };
  window.chromuxTestCaptureControl = {
    targets: () => browserCaptureTargets(),
    requestApproval: (payload, timeoutMs) => requestCaptureApproval(payload, timeoutMs),
    allow: () => finishCaptureApproval(true),
    deny: (reason) => finishCaptureApproval(false, reason),
    approval: () => state.ui.captureApproval ? {
      captureType: state.ui.captureApproval.captureType,
      requester: captureRequesterLabel(state.ui.captureApproval.requester),
      target: state.ui.captureApproval.target?.label || null,
      visible: !$('#modal-capture-approval').classList.contains('hidden'),
    } : null,
    setMediaMocks(mocks) { state.ui.captureMedia = mocks || null; },
    start: (payload) => startChromuxRecording(payload),
    stop: (reason) => stopChromuxRecording(reason),
    recording: () => state.ui.recording ? {
      recordingId: state.ui.recording.recordingId,
      audio: state.ui.recording.audio,
      dimensions: { ...state.ui.recording.dimensions },
      visible: !$('#capture-recording-hud').classList.contains('hidden'),
    } : null,
    hud: () => ({
      visible: !$('#capture-recording-hud').classList.contains('hidden'),
      requester: $('#capture-recording-requester').textContent,
      elapsed: $('#capture-recording-elapsed').textContent,
      audio: $('#capture-recording-audio').textContent,
    }),
  };
  window.chromuxTestCodexGate = {
    reset() {
      state.codexUpdate.phase = 'checking';
      state.codexUpdate.status = null;
      state.codexUpdate.queue = [];
      state.codexUpdate.nextSequence = 0;
      state.codexUpdate.progress = '';
      state.codexUpdate.checkPromise = null;
      state.codexUpdate.releasePromise = null;
      state.codexUpdate.failOpenWarning = null;
      state.testCodexLaunchExecutor = null;
      state.testCodexUpdateCheck = null;
      state.testCodexLaunchTrace = [];
      renderWorkspaceWarning();
    },
    useFakeLauncher() {
      const trace = [];
      state.testCodexLaunchExecutor = async (options) => {
        trace.push(options.name);
        return { id: options.name, name: options.name };
      };
      state.testCodexLaunchTrace = trace;
    },
    launch(agent, name, trace) {
      if (agent !== 'codex') {
        trace.push(name);
        return Promise.resolve({ id: name, name });
      }
      return createSession({ name, cwd: '/tmp', agent: 'codex' });
    },
    launchOptions(options) {
      return createSession({ cwd: '/tmp', ...options, agent: 'codex' });
    },
    setStatus(status) {
      return applyCodexPreflightStatus({ ...status });
    },
    retryWith(status, delayMs = 0) {
      state.testCodexUpdateCheck = () => new Promise((resolve) => {
        setTimeout(() => resolve({ ...status }), delayMs);
      });
      return checkCodexPreflight({ force: true });
    },
    failUpdate(error = 'fixture update failure') {
      state.codexUpdate.status = { ...(state.codexUpdate.status || {}), error };
      state.codexUpdate.phase = 'update-failed';
      renderWorkspaceWarning();
    },
    succeedUpdate(status = {}) {
      state.codexUpdate.status = { ...(state.codexUpdate.status || {}), ...status, ok: true, error: null };
      return releaseCodexLaunches();
    },
    resumeAnyway: () => releaseCodexLaunches({ bypass: true }),
    phase: () => state.codexUpdate.phase,
    waiting: () => state.codexUpdate.queue.map((item) => item.options.name),
    launched: () => [...(state.testCodexLaunchTrace || [])],
    snapshot: () => snapshotOpenSessions(),
    warning: () => ({
      hidden: $('#restore-warning').classList.contains('hidden'),
      title: $('#restore-warning .rw-title')?.textContent || '',
      detail: $('#restore-warning .rw-detail')?.textContent || '',
      buttons: [...document.querySelectorAll('#restore-warning button')].map((button) => button.textContent),
    }),
  };

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
    detectDetails: () => [...document.querySelectorAll('#detect-list .detect-row')].map((row) => ({
      tty: row.dataset.tty || '',
      title: row.querySelector('.dr-title')?.textContent || '',
      titleTitle: row.querySelector('.dr-title')?.title || '',
      message: row.querySelector('.dr-message')?.textContent || '',
      messageTitle: row.querySelector('.dr-message')?.title || '',
      sub: row.querySelector('.dr-sub')?.textContent || '',
      ariaLabel: row.getAttribute('aria-label') || '',
    })),
    nextSessionName(tty, mode) {
      const row = state.detect && state.detect.rows.find((candidate) => candidate.tty === tty);
      return row ? detectedSessionName(row, mode) : null;
    },
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
    session.term.startup.phase = 'revealed';
    session.term.startup.revealReason = 'test-fixture';
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
    for (const item of session.browser.queue) {
      if (item.liveness === 'checking') probeQueuedPreview(session, item.url);
    }
    flushRender();
    return session.id;
  };

  const addRenderableTestSession = ({
    name = 'tab-test', agent = 'codex', cwd = '/tmp', turnState = 'unknown', alive = true,
    realTerminal = false, cols = 64, rows = 16, composerDraft = '', lastActivityAt = null,
    attentionRecords = [], customTabGroupId = null, queue = [],
  } = {}) => {
    state.counter += 1;
    const session = newSessionShape({ id: 's' + state.counter, name, cwd, agent });
    session.term.startup.phase = 'revealed';
    session.term.startup.revealReason = 'test-fixture';
    session.customTabGroupId = validCustomTabGroup(customTabGroupId) ? customTabGroupId : null;
    session.turn.state = turnState;
    if (turnState !== 'unknown') session.turn.since = Date.now();
    session.lifecycle.alive = alive;
    session.browser.queue = Array.isArray(queue)
      ? queue.map((item) => normalizeQueueItem(item, 'RESTORE')).filter(Boolean)
      : [];
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
      const term = new Terminal({
        cols, rows, scrollback: 600, fontFamily: 'monospace', fontSize: 12, lineHeight: 1,
        minimumContrastRatio: TERMINAL_MINIMUM_CONTRAST_RATIO, theme: terminalThemeFor(),
      });
      term.open(viewEls.termHost);
      term.resize(cols, rows);
      term.onData((data) => handleTerminalInput(session, data));
      session.term.term = term;
    } else {
      session.term.term = { write: (d) => written.push(d), focus() {}, dispose() {} };
    }
    session.term.fit = () => {};
    state.sessions.set(session.id, session);
    for (const source of state.sessions.values()) renderComposerContexts(source);
    apply({ type: 'session-created', sessionId: session.id, name, cwd, agent });
    renderQueue(session);
    for (const item of session.browser.queue) {
      if (item.liveness === 'checking') probeQueuedPreview(session, item.url);
    }
    activateSession(session.id);
    session.restoredAttentionRecords = Array.isArray(attentionRecords)
      ? attentionRecords.filter((record) => record && RESTORE_ATTENTION_TYPES.has(record.type))
      : [];
    if (Number.isFinite(lastActivityAt)) session.lastActivityAt = lastActivityAt;
    flushRender();
    return session.id;
  };

  window.chromuxTestStartupLoader = {
    timeoutMs: () => AGENT_STARTUP_TIMEOUT_MS,
    addSession({
      name = 'startup-test', agent = 'codex', cwd = '/tmp/startup-test',
      cols = 80, rows = 24, timeoutMs = AGENT_STARTUP_TIMEOUT_MS,
    } = {}) {
      const id = addRenderableTestSession({ name, agent, cwd, realTerminal: true, cols, rows });
      const session = testSession(id);
      session.term.startup.phase = ADOPTABLE_AGENTS.has(agent) ? 'starting' : 'revealed';
      session.term.startup.exited = false;
      session.term.startup.exitCode = null;
      session.term.startup.revealReason = ADOPTABLE_AGENTS.has(agent) ? null : 'shell';
      beginAgentStartup(session, { timeoutMs });
      return id;
    },
    write(id, data) { handlePtyData(id, String(data)); },
    renderOnly(id, data) { testSession(id).term.term.write(String(data)); },
    input(id, data) { return handleTerminalInput(testSession(id), String(data)); },
    ptyInputs: (id) => (testSession(id)._ptyInputs || []).slice(),
    exit(id, exitCode = 1) { handlePtyExit({ id, exitCode }); },
    reveal(id) { testSession(id).els.revealTerminalBtn.click(); },
    focus(id) { activateSession(id); flushRender(); },
    close(id) {
      const session = testSession(id);
      const timerWasActive = Boolean(session.term.startup.timer);
      closeSession(id);
      return { timerWasActive, timerCleared: !session.term.startup.timer };
    },
    exists: (id) => state.sessions.has(id),
    state(id) {
      const session = testSession(id);
      const loaderStyle = getComputedStyle(session.els.startupLoader);
      const helper = session.els.termHost.querySelector('.xterm-helper-textarea');
      return {
        phase: session.term.startup.phase,
        revealReason: session.term.startup.revealReason,
        exited: session.term.startup.exited,
        exitCode: session.term.startup.exitCode,
        timerActive: Boolean(session.term.startup.timer),
        hidden: session.els.startupLoader.classList.contains('hidden'),
        stalled: session.els.startupLoader.classList.contains('stalled'),
        busy: session.els.termHost.getAttribute('aria-busy'),
        role: session.els.startupLoader.getAttribute('role'),
        live: session.els.startupLoader.getAttribute('aria-live'),
        title: session.els.startupTitle.textContent,
        status: session.els.startupStatus.textContent,
        cwd: session.els.startupCwd.textContent,
        revealHidden: session.els.revealTerminalBtn.classList.contains('hidden'),
        revealLabel: session.els.revealTerminalBtn.textContent,
        composeDisabled: session.els.composeBtn.disabled,
        background: loaderStyle.backgroundColor,
        color: loaderStyle.color,
        display: loaderStyle.display,
        bufferText: renderedTerminalTail(session.term.term).join('\n'),
        terminalAriaHidden: session.els.termHost.querySelector('.xterm')?.getAttribute('aria-hidden') || null,
        helperTabIndex: helper ? helper.tabIndex : null,
        terminalFocused: document.activeElement === helper,
      };
    },
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
      session.term.resizeObserver = new ResizeObserver(() => session.term.fit());
      session.term.resizeObserver.observe(session.els.termHost);
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
    async renderPromptFixture(id, prompt, menuRows = []) {
      const term = testSession(id).term.term;
      term.reset();
      const menu = Array.isArray(menuRows) && menuRows.length
        ? `\x1b7\r\n${menuRows.join('\r\n')}\x1b8`
        : '';
      return new Promise((resolve) => term.write(String(prompt) + menu, resolve));
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
        appendConflictDisabled: session.els.composerInputChoiceActions
          .querySelector('[data-composer-input-action="append"]').disabled,
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
    emit(id, event, detail = null) {
      apply({ type: 'turn-signal', sessionId: id, signal: event, detail });
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
    attentionKinds: () => [...document.querySelectorAll('#thread-list .attention-system-row, #thread-list .attention-reason')]
      .map((el) => el.dataset.attentionKind || ''),
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
      const dotStyle = getComputedStyle(session.els.dot);
      return {
        active: tab.classList.contains('active'),
        truncated: tab.classList.contains('truncated'),
        marquee: tab.classList.contains('marquee'),
        paused: tab.classList.contains('paused'),
        hoverScroll: tab.classList.contains('hover-scroll'),
        indicator: ['dead', 'action', 'working', 'pending', 'completed', 'idle', 'live']
          .find((kind) => session.els.dot.classList.contains(kind)) || 'unknown',
        indicatorPresentation: {
          backgroundColor: dotStyle.backgroundColor,
          boxShadow: dotStyle.boxShadow,
          height: dotStyle.height,
          opacity: dotStyle.opacity,
          width: dotStyle.width,
        },
        indicatorCount: tab.querySelectorAll('.tab-dot').length,
        label: label.textContent,
        title: tab.title,
        ariaLabel: tab.getAttribute('aria-label') || '',
        wrapWidth: wrap.clientWidth,
        labelWidth: label.scrollWidth,
      };
    },
    grouping: {
      enabled: () => state.ui.tabGroupsEnabled,
      setEnabled(enabled) {
        state.ui.tabGroupsEnabled = Boolean(enabled);
        if (state.ui.tabGroupsEnabled && state.activeId) {
          state.ui.focusedTabGroupId = sessionTabGroupId(testSession(state.activeId));
        }
        persistTabGroups();
        renderTabs();
        flushRender();
      },
      create(name) {
        const result = createCustomTabGroup(name);
        flushRender();
        return result.group ? { ...result.group } : { error: result.error };
      },
      rename(id, name) {
        const result = renameCustomTabGroup(id, name);
        flushRender();
        return result.group ? { ...result.group } : { error: result.error };
      },
      delete(id, confirm = true) {
        const original = window.confirm;
        window.confirm = () => confirm;
        try { return deleteCustomTabGroup(id); } finally { window.confirm = original; }
      },
      move(sessionId, groupId = null) {
        setSessionCustomTabGroup(testSession(sessionId), groupId);
        flushRender();
      },
      select(id) {
        const result = selectTabGroup(id);
        flushRender();
        return result && result.id;
      },
      groups: () => effectiveTabGroups().map((group) => ({
        id: group.id,
        name: group.name,
        kind: group.kind,
        sessions: group.sessions.map((session) => session.id),
        tooltip: group.tooltip,
      })),
      definitions: () => state.ui.customTabGroups.map((group) => ({ ...group })),
      focused: () => state.ui.focusedTabGroupId,
      active: () => state.activeId,
      upper: () => [...document.querySelectorAll('#group-tab-list .group-tab')].map((tab) => ({
        id: tab.dataset.groupId,
        label: tab.querySelector('.tab-label-wrap')?.textContent || '',
        count: tab.querySelector('.group-session-count')?.textContent || '',
        indicator: ['dead', 'action', 'working', 'pending', 'completed', 'idle', 'live']
          .find((kind) => tab.querySelector('.tab-dot')?.classList.contains(kind)) || '',
        badge: tab.querySelector('.tab-badge')?.textContent || '0',
        active: tab.classList.contains('active'),
        title: tab.title,
      })),
      lower: () => [...document.querySelectorAll('#group-session-list > .session-tab')]
        .map((tab) => [...state.sessions.values()].find((session) => session.els.tab === tab)?.id || ''),
      storageProbe(raw) {
        const prior = window.localStorage.getItem(TAB_GROUPS_STORAGE_KEY);
        try {
          window.localStorage.setItem(TAB_GROUPS_STORAGE_KEY, raw);
          return storedTabGroups();
        } finally {
          if (prior === null) window.localStorage.removeItem(TAB_GROUPS_STORAGE_KEY);
          else window.localStorage.setItem(TAB_GROUPS_STORAGE_KEY, prior);
        }
      },
      snapshot: () => snapshotOpenSessions().map((row) => ({ ...row })),
      async autoRestore(failNames = []) {
        state.testRestoreFailureNames = new Set(failNames);
        try {
          await autoRestoreWorkspace();
          flushRender();
          return {
            activeId: state.activeId,
            sessions: orderedSessions().map((session) => ({
              id: session.id,
              name: session.name,
              cwd: session.cwd,
              customTabGroupId: session.customTabGroupId,
            })),
          };
        } finally {
          state.testRestoreFailureNames = null;
        }
      },
      shortcut(index) {
        const result = handleShortcutActivateSessionIndex({ index });
        flushRender();
        return result;
      },
      setQueue(sessionId, items) {
        const session = testSession(sessionId);
        session.browser.queue = (items || []).map((item) => normalizeQueueItem(
          typeof item === 'string' ? { url: item } : item,
          'RESTORE',
        )).filter(Boolean);
        renderQueue(session);
        flushRender();
      },
    },
    flushRender,
  };

  window.chromuxTestRail = {
    addSession: addRenderableTestSession,
    addTerminalSession: (options = {}) => addRenderableTestSession({ ...options, realTerminal: true }),
    focus(id) { activateSession(id); flushRender(); },
    emit(id, event, detail = null) { apply({ type: 'turn-signal', sessionId: id, signal: event, detail }); flushRender(); },
    submit(id, data = 'prompt\r') { handleTerminalInput(testSession(id), data); flushRender(); },
    async submitComposer(id, text = 'composed prompt') {
      const session = testSession(id);
      setComposerDraft(session, text);
      const result = await submitComposer(session);
      flushRender();
      return result;
    },
    ptyOutput(id, data = 'streaming output') { handlePtyData(id, data); flushRender(); },
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
    threadSort: () => state.ui.threadSort,
    storedThreadSort: () => {
      try { return window.localStorage.getItem(THREAD_SORT_STORAGE_KEY); } catch { return null; }
    },
    migrateThreadSort(value) {
      if (value === null) window.localStorage.removeItem(THREAD_SORT_STORAGE_KEY);
      else window.localStorage.setItem(THREAD_SORT_STORAGE_KEY, value);
      const mode = storedThreadSort();
      state.ui.threadSort = mode;
      invalidate('attention');
      flushRender();
      return { mode, stored: window.localStorage.getItem(THREAD_SORT_STORAGE_KEY) };
    },
    selectThreadSort(mode) { selectThreadSort(mode); flushRender(); return state.ui.threadSort; },
    threadSortControl: () => {
      const button = $('#thread-sort-toggle');
      const icon = button?.querySelector('svg');
      const rect = button?.getBoundingClientRect();
      return {
        text: button?.textContent || '',
        hidden: Boolean(button?.classList.contains('hidden')),
        label: button?.getAttribute('aria-label') || '',
        title: button?.title || '',
        pressed: button?.getAttribute('aria-pressed') || '',
        order: button?.dataset.order || '',
        hasIcon: Boolean(icon),
        focused: document.activeElement === button,
        geometry: rect ? {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        } : null,
      };
    },
    railHeaderControls: () => {
      const toolbarElement = $('#thread-toolbar');
      const header = $('.rail-header')?.getBoundingClientRect();
      const head = $('.rail-head')?.getBoundingClientRect();
      const detect = $('#btn-detect')?.getBoundingClientRect();
      const toolbar = toolbarElement?.getBoundingClientRect();
      return {
        header: header ? { top: header.top, bottom: header.bottom } : null,
        head: head ? { top: head.top, bottom: head.bottom } : null,
        detect: detect ? {
          top: detect.top,
          right: detect.right,
          bottom: detect.bottom,
          width: detect.width,
          height: detect.height,
        } : null,
        toolbar: toolbar ? { top: toolbar.top, bottom: toolbar.bottom } : null,
        toolbarHidden: Boolean(toolbarElement?.classList.contains('hidden')),
      };
    },
    focusThreadSortControl() { $('#thread-sort-toggle')?.focus(); },
    activityAt: (id) => testSession(id).lastActivityAt,
    setActivity(id, value) {
      testSession(id).lastActivityAt = Number(value);
      invalidate('attention');
      flushRender();
    },
    heading: () => $('#rail-heading')?.textContent || '',
    attentionCount: () => Number($('#rail-thread-count')?.textContent || 0),
    attentionCards: () => [...document.querySelectorAll('.attention-thread')].map((card) => {
      const primary = card.querySelector('.attention-row-reason');
      return {
        id: card.dataset.sessionId,
        primaryKind: primary?.textContent || '',
        primaryColor: primary ? getComputedStyle(primary).color : '',
        more: card.querySelector('.attention-row-more')?.textContent || '',
        reasons: [...card.querySelectorAll('.attention-reason')].map((reason) => {
          const visibleKind = reason.querySelector('.attention-kind');
          const detail = reason.querySelector('.attention-detail');
          const lineHeight = detail ? parseFloat(getComputedStyle(detail).lineHeight) : 0;
          return {
            kind: reason.dataset.attentionKind || '',
            visibleKind: visibleKind?.textContent || '',
            detail: detail?.textContent || '',
            color: visibleKind || primary ? getComputedStyle(visibleKind || primary).color : '',
            summaryLines: detail && lineHeight ? Math.round(detail.clientHeight / lineHeight) : 0,
            actions: [...reason.querySelectorAll('.attention-actions .qi-btn')].map((button) => button.textContent),
          };
        }),
      };
    }),
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
      const cards = [...document.querySelectorAll(`.attention-thread[data-session-id="${CSS.escape(id)}"]`)];
      const reason = cards.flatMap((card) => [...card.querySelectorAll('.attention-reason')])
        .find((candidate) => candidate.dataset.attentionKind === kind);
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
      count: Number(button.querySelector('.rail-count')?.textContent || 0),
      conflict: Boolean(button.querySelector('.rail-count.conflict')),
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
        status: row.querySelector('.rail-status')?.getAttribute('aria-label') || row.dataset.sessionStatus || '',
        statusCount: row.querySelectorAll('.rail-status').length,
        animationName: row.querySelector('.rail-status')
          ? getComputedStyle(row.querySelector('.rail-status')).animationName
          : 'none',
        title: row.title,
        ariaLabel: row.getAttribute('aria-label') || '',
      })),
    })),
    clickRow(id) {
      const row = document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(id)}"]`);
      if (!row) throw new Error(`Missing rail row: ${id}`);
      row.click(); flushRender(); return state.activeId;
    },
    hoverRow(id) {
      const row = document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(id)}"]`);
      if (!row) throw new Error(`Missing rail row: ${id}`);
      row.dispatchEvent(new PointerEvent('pointerenter'));
      flushRender();
    },
    unhoverRow(id) {
      const row = document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(id)}"]`);
      if (!row) throw new Error(`Missing rail row: ${id}`);
      row.dispatchEvent(new PointerEvent('pointerleave'));
      flushRender();
    },
    focusRow(id) {
      const row = document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(id)}"]`);
      if (!row) throw new Error(`Missing rail row: ${id}`);
      if (document.activeElement === row) row.blur();
      row.focus();
      if (document.activeElement === row
        && state.activeId !== id
        && state.ui.threadPreview?.sessionId !== id) {
        row.dispatchEvent(new FocusEvent('focus'));
      }
    },
    rowKey(id, key) {
      const row = document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(id)}"]`);
      if (!row) throw new Error(`Missing rail row: ${id}`);
      row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      flushRender();
    },
    doubleClickRow(id) {
      const row = document.querySelector(`#thread-list .rail-session-row[data-session-id="${CSS.escape(id)}"]`);
      if (!row) throw new Error(`Missing rail row: ${id}`);
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
      flushRender();
      return state.activeId;
    },
    doubleClickRowsAcrossRender(firstId, secondId) {
      const first = document.querySelector(
        `#thread-list .rail-session-row[data-session-id="${CSS.escape(firstId)}"]`,
      );
      if (!first) throw new Error(`Missing first rail row: ${firstId}`);
      first.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      flushRender();
      const firstLeftAttention = !document.querySelector(
        `.attention-thread[data-session-id="${CSS.escape(firstId)}"]`,
      );
      const second = document.querySelector(
        `#thread-list .rail-session-row[data-session-id="${CSS.escape(secondId)}"]`,
      );
      if (!second) throw new Error(`Missing exposed rail row: ${secondId}`);
      second.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      second.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
      flushRender();
      return {
        activeId: state.activeId,
        firstLeftAttention,
        secondStayedAttention: Boolean(document.querySelector(
          `.attention-thread[data-session-id="${CSS.escape(secondId)}"]`,
        )),
      };
    },
    doubleClickAttentionAction(id, kind, label) {
      const cards = [...document.querySelectorAll(`.attention-thread[data-session-id="${CSS.escape(id)}"]`)];
      const reason = cards.flatMap((card) => [...card.querySelectorAll('.attention-reason')])
        .find((candidate) => candidate.dataset.attentionKind === kind);
      const button = [...(reason?.querySelectorAll('.attention-actions .qi-btn') || [])]
        .find((candidate) => candidate.textContent === label);
      if (!button) throw new Error(`Missing ${label} action for ${kind} on ${id}`);
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
      flushRender();
      return state.activeId;
    },
    write(id, data) {
      const term = testSession(id).term.term;
      return new Promise((resolve) => term.write(String(data), resolve));
    },
    preview() {
      const preview = state.ui.threadPreview;
      if (!preview) return null;
      const layer = preview.visibleLayer;
      const terminal = layer.terminal;
      const buffer = terminal.buffer.active;
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
      const attention = preview.popover.querySelector('.thread-preview-attention');
      const surfaceBackgrounds = [
        preview.popover,
        preview.popover.querySelector('.thread-preview-header'),
        ...(!attention?.hidden ? [attention] : []),
        preview.terminalViewport,
        preview.popover.querySelector('.thread-preview-footer'),
      ].map((element) => getComputedStyle(element).backgroundColor);
      const headerTitleRect = preview.popover.querySelector('.thread-preview-title').getBoundingClientRect();
      const screenRect = layer.host.querySelector('.xterm-screen').getBoundingClientRect();
      const footerLabelRect = preview.popover.querySelector('.thread-preview-footer span').getBoundingClientRect();
      const viewportRect = preview.terminalViewport.getBoundingClientRect();
      return {
        sessionId: preview.sessionId,
        text: lines.join('\n'),
        html: layer.host.innerHTML,
        focused: document.activeElement === preview.popover,
        role: preview.popover.getAttribute('role'),
        ariaLabel: preview.popover.getAttribute('aria-label'),
        labelledBy: preview.popover.getAttribute('aria-labelledby'),
        describedBy: preview.popover.getAttribute('aria-describedby'),
        description: preview.popover.querySelector('.thread-preview-description')?.textContent || '',
        title: preview.popover.querySelector('.thread-preview-title')?.textContent || '',
        footer: preview.popover.querySelector('.thread-preview-footer')?.textContent || '',
        cwdTitle: preview.popover.querySelector('.thread-preview-cwd')?.title || '',
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        cols: terminal.cols, rows: terminal.rows,
        sourceCols: source.cols, sourceRows: source.rows,
        bufferLength: buffer.length,
        nonEmptyLines: lines.filter((line) => line.length > 0).length,
        layerCount: preview.layers.length,
        visibleLayerCount: preview.layers.filter((candidate) => (
          candidate.host.classList.contains('thread-preview-terminal-visible')
          && getComputedStyle(candidate.host).opacity === '1'
        )).length,
        visibleLayer: preview.layers.indexOf(layer),
        layerStyles: preview.layers.map((candidate) => {
          const style = getComputedStyle(candidate.host);
          return {
            opacity: style.opacity,
            transitionDuration: style.transitionDuration,
            ariaHidden: candidate.host.getAttribute('aria-hidden'),
          };
        }),
        refreshInFlight: preview.refreshInFlight,
        refreshPending: preview.refreshPending,
        refreshStarts: preview.refreshStarts,
        maxConcurrentRefreshes: preview.maxConcurrentRefreshes,
        refreshCount: preview.refreshCount,
        paintCount: preview.paintCount,
        paintedRows: layer.paintedRows.size,
        coloredCells,
        surfaceBackgrounds,
        attention: {
          hidden: !attention || attention.hidden,
          heading: attention?.querySelector('.thread-preview-attention-heading')?.textContent || '',
          rows: [...(attention?.querySelectorAll('.thread-preview-attention-row') || [])].map((row) => ({
            kind: row.dataset.attentionKind || '',
            label: row.querySelector('.thread-preview-attention-kind')?.textContent || '',
            detail: row.querySelector('.thread-preview-attention-detail')?.textContent || '',
            color: getComputedStyle(row.querySelector('.thread-preview-attention-kind')).color,
            actions: row.querySelectorAll('button').length,
          })),
          height: attention?.getBoundingClientRect().height || 0,
          scrollHeight: attention?.scrollHeight || 0,
          maxHeight: attention ? parseFloat(getComputedStyle(attention).maxHeight) : 0,
        },
        terminalHeight: viewportRect.height,
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
    hoverPreview() {
      state.ui.threadPreview?.popover.dispatchEvent(new PointerEvent('pointerenter'));
      flushRender();
    },
    unhoverPreview() {
      state.ui.threadPreview?.popover.dispatchEvent(new PointerEvent('pointerleave'));
      flushRender();
    },
    clearPreviewPointerPresence() {
      const preview = state.ui.threadPreview;
      if (!preview) return;
      preview.ignorePointerPresence = true;
      preview.anchorHovered = false;
      preview.popoverHovered = false;
      scheduleThreadPreviewClose(preview);
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
    queueCount: (id) => testSession(id).browser.queue.length,
    queueUrls: (id) => testSession(id).browser.queue.map((item) => item.url),
    queuePanelHidden: (id) => testSession(id).els.queuePanel.classList.contains('hidden'),
    browserCollapsed: (id) => testSession(id).browser.layoutMode === 'terminal',
    turnState: (id) => ({ ...testSession(id).turn }),
    attentionKinds: () => [...document.querySelectorAll('#thread-list .attention-system-row, #thread-list .attention-reason')]
      .map((el) => el.dataset.attentionKind || ''),
    resolveGitRoot: (cwd) => window.chromux.gitRoot(cwd),
    gitCacheSize: () => state.ui.gitRoots.size,
    inboxSections: () => [...document.querySelectorAll('#thread-list .inbox-section')].map((section) => ({
      key: section.dataset.inboxSection,
      label: section.querySelector(':scope > header .rail-group-label')?.textContent || '',
      count: Number(section.querySelector(':scope > header .inbox-section-count')?.textContent || 0),
      items: [...section.querySelectorAll(':scope > .inbox-section-body > .inbox-item')].map((item) => ({
        id: item.dataset.inboxId,
        sessionId: item.dataset.sessionId || null,
        kind: item.querySelector('.attention-row-reason, .inbox-item-kind')?.textContent || '',
      })),
    })),
    inboxTriage: () => snapshotInboxTriage(),
    clickInboxAction(id, label) {
      const card = [...document.querySelectorAll('#thread-list .inbox-item')]
        .find((candidate) => candidate.dataset.inboxId === id);
      const button = [...(card?.querySelectorAll('button') || [])].find((candidate) => candidate.textContent === label);
      if (!button) throw new Error(`Missing inbox action ${label} for ${id}`);
      button.click(); flushRender();
    },
    expireInbox(id) {
      const record = state.ui.inboxTriage.get(id);
      if (record) record.snoozedUntil = new Date(Date.now() - 1000).toISOString();
      invalidate('attention'); flushRender();
    },
    pressInboxKey(key) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      flushRender();
      return document.activeElement?.closest?.('.inbox-item')?.dataset.inboxId || null;
    },
    gitRepositories: () => (state.ui.gitInventory?.repositories || []).map((repository) => ({
      id: repository.id,
      root: repository.root,
      worktrees: repository.worktrees.map((worktree) => ({
        id: worktree.id,
        path: worktree.path,
        rank: worktree.rank,
        stale: worktree.stale,
        prunable: worktree.prunable,
        nextAction: worktree.nextAction,
      })),
    })),
    setGitInventory(inventory) {
      state.ui.gitInventory = inventory && Array.isArray(inventory.repositories)
        ? inventory : { ok: true, kind: 'inventory', repositories: [] };
      state.ui.gitInventoryError = null;
      invalidate('attention'); flushRender();
      return this.gitRepositories();
    },
    async openGitSession(repositoryId, worktreeId) {
      const session = await focusGitWorktreeSession(repositoryId, worktreeId);
      flushRender();
      return session ? {
        id: session.id,
        name: session.name,
        agent: session.agent,
        purpose: session.sessionPurpose,
        worktreeIdentity: session.worktreeIdentity ? { ...session.worktreeIdentity } : null,
        draft: session.composer.draft,
        composerOpen: session.composer.open,
      } : null;
    },
    gitFilter: () => ({
      filter: state.ui.gitFilter,
      search: state.ui.gitSearch,
      visible: [...document.querySelectorAll('.git-worktree-row')].map((row) => row.dataset.worktreeId),
    }),
    setGitFilter(filter, search = state.ui.gitSearch) {
      state.ui.gitFilter = GIT_FILTERS.has(filter) ? filter : 'action';
      state.ui.gitSearch = String(search || '');
      $('#git-search').value = state.ui.gitSearch;
      invalidate('attention'); flushRender();
      return this.gitFilter();
    },
    gitSessions: () => orderedSessions()
      .filter((session) => session.sessionPurpose === GIT_SESSION_PURPOSE)
      .map((session) => ({
        id: session.id,
        name: session.name,
        agent: session.agent,
        draft: session.composer.draft,
        composerOpen: session.composer.open,
        worktreeIdentity: session.worktreeIdentity ? { ...session.worktreeIdentity } : null,
      })),
    insertGitPrompt(id, insertId) {
      const session = testSession(id);
      const inserted = insertGitComposerPrompt(session, insertId);
      flushRender();
      return { inserted, draft: session.composer.draft };
    },
    setGitDraft(id, draft, start = null, end = null) {
      const session = testSession(id);
      setComposerDraft(session, draft);
      const textarea = session.els.composerTextarea;
      const selectionStart = Number.isInteger(start) ? Math.max(0, Math.min(start, session.composer.draft.length)) : session.composer.draft.length;
      const selectionEnd = Number.isInteger(end) ? Math.max(selectionStart, Math.min(end, session.composer.draft.length)) : selectionStart;
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
      return session.composer.draft;
    },
    setVercelProjects(projects) {
      state.ui.vercel.projects = Array.isArray(projects) ? projects.map((project) => ({ ...project })) : [];
      updateVercelButtons();
      flushRender();
    },
    async waitForGit() {
      await Promise.all([...state.ui.gitRoots.values()].map((entry) => entry.promise));
      flushRender();
      await refreshGitInventory({ force: true });
      flushRender();
    },
    gitDiffs: () => (state.ui.gitInventory?.repositories || []).map((repository) => {
      const files = repository.worktrees.flatMap((worktree) => worktree.files || []);
      const staged = files.filter((file) => ![' ', '?', '.'].includes(file.index)).length;
      const unstaged = files.filter((file) => ![' ', '.'].includes(file.worktree)).length;
      return {
        title: repository.root,
        count: files.length,
        totals: `${staged} staged · ${unstaged} unstaged`,
        clean: files.length === 0,
        files: files.map((file) => {
          const status = gitFileStatus(file);
          return { path: file.path, status: status.label, staged: ![' ', '?', '.'].includes(file.index) };
        }),
      };
    }),
    flushRender,
  };

  window.chromuxTestSynchronizedOutput = {
    addSession({ name = 'synchronized-output', realTerminal = false } = {}) {
      const id = addRenderableTestSession({ name, agent: 'codex', realTerminal, cols: 64, rows: 12 });
      testSession(id)._ptyOutputTestTrace = {
        writes: [],
        detectorPayloads: [],
        recoveryPayloads: [],
      };
      return id;
    },
    feed(id, chunk) {
      handlePtyData(id, chunk);
      flushRender();
    },
    trace(id) {
      const session = testSession(id);
      const trace = session._ptyOutputTestTrace;
      const buffer = session.term.term.buffer?.active;
      const screen = buffer
        ? Array.from({ length: buffer.length }, (_, index) => buffer.getLine(index)?.translateToString(true) || '')
          .join('\n')
        : (session._written || []).join('');
      return {
        writes: trace.writes.slice(),
        detectorPayloads: trace.detectorPayloads.slice(),
        recoveryPayloads: trace.recoveryPayloads.slice(),
        screen,
        syncActive: session.term.synchronizedOutputActive,
        syncBytes: session.term.synchronizedOutputBytes,
      };
    },
    pendingTimer: (id) => Boolean(testSession(id).term.synchronizedOutputTimer),
    hasSession: (id) => state.sessions.has(id),
    dispose(id) { closeSession(id); },
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
    attentionKinds: () => [...document.querySelectorAll('#thread-list .attention-system-row, #thread-list .attention-reason')]
      .map((el) => el.dataset.attentionKind || ''),
    attentionButtons(kind) {
      for (const el of document.querySelectorAll('#thread-list .attention-system-row, #thread-list .attention-reason')) {
        if (el.dataset.attentionKind !== kind) continue;
        return [...el.querySelectorAll('.attention-actions .qi-btn')].map((button) => button.textContent);
      }
      return [];
    },
    clickAttentionPrimary(kind) {
      for (const el of document.querySelectorAll('#thread-list .attention-system-row, #thread-list .attention-reason')) {
        if (el.dataset.attentionKind !== kind) continue;
        const primary = el.querySelector('.attention-actions .qi-btn.open');
        if (!primary) throw new Error(`No primary action on ${kind}`);
        primary.click();
        flushRender();
        return true;
      }
      throw new Error(`No attention item ${kind}`);
    },
    dismissItem(kind) {
      for (const el of document.querySelectorAll('#thread-list .attention-system-row, #thread-list .attention-reason')) {
        if (el.dataset.attentionKind !== kind) continue;
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
      kind: el.dataset.attentionKind || '',
      name: el.closest('.attention-item')?.querySelector('.attention-name')?.textContent || '',
      detail: el.querySelector('.attention-detail')?.textContent || '',
      actions: [...el.querySelectorAll('.attention-actions .qi-btn')].map((button) => button.textContent),
    })),
    dismissItem(kind, name) {
      for (const el of document.querySelectorAll('#thread-list .attention-reason, #thread-list .attention-system-row')) {
        if (el.dataset.attentionKind !== kind) continue;
        const item = el.closest('.attention-item');
        if (name && item?.querySelector('.attention-name')?.textContent !== name) continue;
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
    emit(id, event, detail = null) {
      apply({ type: 'turn-signal', sessionId: id, signal: event, detail });
      flushRender();
    },
    queueUrls: (id) => testSession(id).browser.queue.map((item) => item.url),
    queueItems: (id) => testSession(id).browser.queue.map((item) => ({ ...item })),
    queueRows: (id) => [...testSession(id).els.queueList.querySelectorAll('.queue-item')].map((el) => ({
      source: el.querySelector('.qi-src')?.textContent || '',
      reason: el.querySelector('.qi-reason')?.textContent || '',
      url: el.querySelector('.qi-url')?.textContent || '',
      status: el.querySelector('.qi-status')?.textContent || '',
      actions: [...el.querySelectorAll('.qi-btn')].map((button) => button.textContent),
      ariaLabel: el.getAttribute('aria-label') || '',
    })),
    queueCount: (id) => testSession(id).browser.queue.length,
    tabBadge: (id) => testSession(id).els.tabBadge?.textContent || '0',
    candidates: (id) => testSession(id).term.previewCandidates.map((item) => item.url),
    turnState: (id) => ({ ...testSession(id).turn }),
    setSignalToken(id, token) { testSession(id).turn.token = token; },
    routeExplicit(id, url, source = 'MCP', reason = 'requested by agent') {
      const result = routePreview(testSession(id), normalizedBrowserUrl(url), source, {
        reason,
        visibility: 'attention',
      });
      flushRender();
      return result;
    },
    currentUrl: (id) => testSession(id).browser.currentUrl,
    activeBrowserTabId: (id) => testSession(id).browser.activeTabId,
    pendingQueueNavigation: () => state.pendingQueueNavigation ? { ...state.pendingQueueNavigation } : null,
    queuePanelHidden: (id) => testSession(id).els.queuePanel.classList.contains('hidden'),
    showQueue(id) {
      testSession(id).els.queuePanel.classList.remove('hidden');
      flushRender();
    },
    closeBrowserTab(id, tabId) {
      closeBrowserTab(testSession(id), tabId);
      flushRender();
    },
    focus(id) {
      activateSession(id);
      flushRender();
    },
    attentionItems: () => [...document.querySelectorAll('#thread-list .attention-reason, #thread-list .attention-system-row')].map((el) => ({
      kind: el.dataset.attentionKind || '',
      name: el.closest('.attention-item')?.querySelector('.attention-name')?.textContent || '',
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
    async recheckQueued(id, url) {
      return probeQueuedPreview(testSession(id), url, { retry: false });
    },
    setLiveness(id, url, liveness) {
      const session = testSession(id);
      const item = queuedPreview(session, url);
      if (!item) throw new Error(`No queued preview for ${url}`);
      item.probeGeneration = (item.probeGeneration || 0) + 1;
      item.liveness = liveness;
      renderQueue(session);
      flushRender();
    },
    async openServerLauncher(id, url) {
      const session = testSession(id);
      const item = queuedPreview(session, url);
      if (!item) throw new Error(`No queued preview for ${url}`);
      await openServerLauncher(session, item);
      flushRender();
    },
    launcher(id) {
      const launcher = testSession(id).browser.serverLauncher;
      return launcher ? {
        url: launcher.url,
        loading: launcher.loading,
        valid: Boolean(launcher.config?.valid),
        reason: launcher.config?.reason || null,
        scripts: launcher.config?.scripts?.slice() || [],
        recommendedScript: launcher.config?.recommendedScript || null,
        selectedScript: launcher.selectedScript,
        error: launcher.error,
      } : null;
    },
    selectServerScript(id, script) {
      const launcher = testSession(id).browser.serverLauncher;
      if (!launcher || !launcher.config?.scripts?.includes(script)) return false;
      launcher.selectedScript = script;
      renderQueue(testSession(id));
      flushRender();
      return true;
    },
    async launchServer(id) {
      const session = testSession(id);
      return launchServerScript(session, session.browser.serverLauncher);
    },
    failLoad(id, url, errorCode = -102, isMainFrame = true) {
      const session = testSession(id);
      const tab = activePageTab(session);
      if (isMainFrame && tab) failPendingQueueNavigation(session, tab, url);
      if (errorCode !== -3 && isMainFrame) queueLoopbackFailure(session, url);
      flushRender();
    },
    finishLoad(id, url) {
      const session = testSession(id);
      removeSuccessfulQueuedPreview(session, url);
      const tab = activePageTab(session);
      if (tab) completePendingQueueNavigation(session, tab, url);
      flushRender();
    },
    redirectLoad(id, url) {
      const session = testSession(id);
      const tab = activePageTab(session);
      if (tab) redirectPendingQueueNavigation(session, tab, url);
      flushRender();
    },
    activeId: () => state.activeId,
    sessions: () => orderedSessions().map((session) => ({
      id: session.id,
      name: session.name,
      cwd: session.cwd,
      command: session._testCommand || null,
      active: session.id === state.activeId,
      alive: session.lifecycle.alive,
    })),
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
    shortcutBrowserFullscreen() {
      const result = handleShortcutBrowserFullscreen();
      flushRender();
      return result;
    },
    shortcutCreateProject() {
      const result = handleShortcutCreateProject();
      flushRender();
      return result;
    },
    fallbackAction: (input, primaryModifier) => fallbackChromuxShortcutAction(input, primaryModifier),
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
    queueUrls: (id) => testSession(id).browser.queue.map((item) => item.url),
    queuePanelHidden: (id) => testSession(id).els.queuePanel.classList.contains('hidden'),
    browserCollapsed: (id) => testSession(id).browser.layoutMode === 'terminal',
    browserLayoutMode: (id) => testSession(id).browser.layoutMode,
    focusedOpenUrl: () => document.activeElement?.dataset?.queueOpenUrl || null,
    clickFocused() {
      if (!document.activeElement) throw new Error('Nothing focused');
      document.activeElement.click();
      flushRender();
    },
    currentUrl: (id) => testSession(id).browser.currentUrl,
    context: () => ({ ...shortcutFocusContext() }),
    launcherMode: () => state.ui.launcherMode,
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
    setGrouping(enabled) {
      state.ui.tabGroupsEnabled = Boolean(enabled);
      if (state.ui.tabGroupsEnabled && state.activeId) {
        state.ui.focusedTabGroupId = sessionTabGroupId(testSession(state.activeId));
      }
      invalidate('shortcutDebug');
      flushRender();
    },
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
      testSession(id).browser.layoutMode = collapsed ? 'terminal' : 'paired';
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
    shortcutCreateProject() {
      const result = handleShortcutCreateProject();
      flushRender();
      return result;
    },
    shortcutDetect() {
      const result = handleShortcutOpenDetectModal();
      flushRender();
      return result;
    },
    shortcutBrowserFullscreen() {
      const result = handleShortcutBrowserFullscreen();
      flushRender();
      return result;
    },
    newModalOpen: () => !$('#modal-new').classList.contains('hidden'),
    launcherMode: () => state.ui.launcherMode,
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
      for (const item of session.browser.queue) {
        if (item.liveness === 'checking') probeQueuedPreview(session, item.url);
      }
      activateSession(session.id);
      flushRender();
      return session.id;
    },
    open(id, url) {
      openInPane(testSession(id), url);
      flushRender();
      return true;
    },
    openNew(id, url, title = '') {
      const tab = openOrFocusBrowserTab(testSession(id), url, title);
      flushRender();
      return tab ? tab.id : null;
    },
    tabs(id) {
      const session = testSession(id);
      return session.browser.tabs.map((tab) => ({
        id: tab.id,
        type: tab.type,
        url: tab.currentUrl || null,
        title: tab.title,
        path: tab.path || '',
        query: tab.query || '',
        active: tab.id === session.browser.activeTabId,
        consoleTotal: tab.consoleTotal || 0,
      }));
    },
    activateTab(id, tabId) {
      const result = activateBrowserTab(testSession(id), tabId);
      flushRender();
      return result;
    },
    closeTab(id, tabId) {
      closeBrowserTab(testSession(id), tabId);
      flushRender();
    },
    setTabConsole(id, tabId, total) {
      const session = testSession(id);
      const tab = session.browser.tabs.find((item) => item.id === tabId);
      if (tab && tab.type === 'page') {
        tab.consoleTotal = total;
        tab.consoleBuf = total ? [{ level: 'error', message: 'fixture' }] : [];
      }
      if (activePageTab(session) === tab) renderConsoleChip(session);
    },
    consoleText(id) {
      return testSession(id).els.consoleChip.textContent;
    },
    explore(id, options = {}) {
      const tab = openHtmlExplorer(testSession(id), options);
      flushRender();
      return tab.id;
    },
    submit(id, value) {
      submitBrowserUrlEntry(testSession(id), value);
      flushRender();
    },
    snapshot: () => snapshotOpenSessions().map((row) => ({ ...row })),
    clickTerminalLink(id, url) {
      let prevented = false;
      activateTerminalLink(testSession(id), url, { preventDefault() { prevented = true; } });
      flushRender();
      return prevented;
    },
    clickOsc8Link(id, url) {
      let prevented = false;
      const activated = activateOsc8TerminalLink(testSession(id), url, { preventDefault() { prevented = true; } });
      flushRender();
      return { activated, prevented };
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
    fullscreen(id) {
      const session = testSession(id);
      advanceBrowserLayout(session);
      flushRender();
    },
    collapseControl(id) {
      testSession(id).els.collapseBtn.click();
      flushRender();
    },
    shortcutToggle() {
      const result = handleShortcutToggleBrowser();
      flushRender();
      return result;
    },
    shortcutFullscreen() {
      const result = handleShortcutBrowserFullscreen();
      flushRender();
      return result;
    },
    focus(id) {
      activateSession(id);
      flushRender();
    },
    shortcutFocus(id) {
      const index = orderedSessions().findIndex((session) => session.id === id);
      const result = handleShortcutActivateSessionIndex({ index });
      flushRender();
      return result;
    },
    narrow(id, browserPx = 240) {
      const session = testSession(id);
      session.browser.expandedGridTemplate = `minmax(320px, 1fr) 6px ${browserPx}px`;
      applyBrowserLayout(session);
      flushRender();
    },
    scrollCaptureIntoView(id) {
      const session = testSession(id);
      flushRender();
      session.els.browserToolbar.scrollLeft = session.els.browserToolbar.scrollWidth;
    },
    preference: () => state.ui.browserFullscreenBehavior,
    preferenceStored: () => window.localStorage.getItem(BROWSER_FULLSCREEN_BEHAVIOR_STORAGE_KEY),
    preferenceSelectValue: () => $('#settings-browser-fullscreen-behavior')?.value || '',
    preferenceStorageProbe(raw) {
      const prior = window.localStorage.getItem(BROWSER_FULLSCREEN_BEHAVIOR_STORAGE_KEY);
      try {
        if (raw === null) window.localStorage.removeItem(BROWSER_FULLSCREEN_BEHAVIOR_STORAGE_KEY);
        else window.localStorage.setItem(BROWSER_FULLSCREEN_BEHAVIOR_STORAGE_KEY, raw);
        return {
          value: storedBrowserFullscreenBehavior(),
          stored: window.localStorage.getItem(BROWSER_FULLSCREEN_BEHAVIOR_STORAGE_KEY),
        };
      } finally {
        if (prior === null) window.localStorage.removeItem(BROWSER_FULLSCREEN_BEHAVIOR_STORAGE_KEY);
        else window.localStorage.setItem(BROWSER_FULLSCREEN_BEHAVIOR_STORAGE_KEY, prior);
      }
    },
    setPreference(behavior) {
      const select = $('#settings-browser-fullscreen-behavior');
      if (!select) throw new Error('Missing browser fullscreen behavior setting');
      select.value = behavior;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      flushRender();
      return state.ui.browserFullscreenBehavior;
    },
    state(id) {
      const session = testSession(id);
      const toolbar = session.els.browserToolbar;
      const toolbarStyle = getComputedStyle(toolbar);
      const toolbarRect = toolbar.getBoundingClientRect();
      const captureRect = session.els.captureBtn.getBoundingClientRect();
      const webPaneRect = session.els.webPane.getBoundingClientRect();
      const viewRect = session.els.view.getBoundingClientRect();
      const railRect = session.els.browserRail.getBoundingClientRect();
      const toggleRect = session.els.collapseBtn.getBoundingClientRect();
      const fullscreenRect = session.els.fullscreenBtn.getBoundingClientRect();
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
      const fullscreenIcon = session.els.fullscreenBtn.querySelector('.browser-fullscreen-icon');
      const fillsRenderer = Math.abs(webPaneRect.top) <= 1
        && Math.abs(webPaneRect.left) <= 1
        && Math.abs(webPaneRect.bottom - window.innerHeight) <= 1
        && Math.abs(webPaneRect.right - window.innerWidth) <= 1;
      const coveredByBrowser = (element) => {
        const rect = element?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return Boolean(hit && session.els.webPane.contains(hit));
      };
      const railHit = document.elementFromPoint(
        fullscreenRect.left + fullscreenRect.width / 2,
        fullscreenRect.top + fullscreenRect.height / 2
      );
      return {
        active: state.activeId === id,
        layoutMode: session.browser.layoutMode,
        collapsed: session.browser.layoutMode === 'terminal',
        fullscreen: isBrowserExpansionLayout(session.browser.layoutMode),
        grid: session.els.view.style.gridTemplateColumns,
        webCollapsed: session.els.webPane.classList.contains('collapsed'),
        webHostHidden: getComputedStyle(session.els.webHost).display === 'none',
        terminalHidden: getComputedStyle(session.els.termPane).display === 'none',
        terminalVisible: getComputedStyle(session.els.termPane).display !== 'none',
        dividerHidden: getComputedStyle(session.els.divider).display === 'none',
        webFillsWorkspace: Math.abs(webPaneRect.top - viewRect.top) <= 1
          && Math.abs(webPaneRect.bottom - viewRect.bottom) <= 1
          && Math.abs(webPaneRect.left - viewRect.left) <= 1
          && Math.abs(webPaneRect.right - viewRect.right) <= 1,
        webFillsRenderer: fillsRenderer,
        chromuxContentCovered: [
          $('#rail'), $('#session-tabs'), $('#workspace'), $('#statusbar'),
        ].every(coveredByBrowser),
        titlebarCovered: coveredByBrowser($('#titlebar')),
        browserRailUsable: Boolean(
          railHit
          && session.els.browserRail.contains(railHit)
          && getComputedStyle(session.els.browserRail).pointerEvents !== 'none'
        ),
        dividerDisabled: session.els.divider.classList.contains('disabled'),
        collapseText: session.els.collapseBtn.textContent,
        collapseTitle: session.els.collapseBtn.title,
        collapseAriaLabel: session.els.collapseBtn.getAttribute('aria-label'),
        railWidth: Math.round(railRect.width),
        railBounds: { top: railRect.top, bottom: railRect.bottom, height: railRect.height },
        toggleBounds: { top: toggleRect.top, bottom: toggleRect.bottom, height: toggleRect.height },
        fullscreenBounds: { top: fullscreenRect.top, bottom: fullscreenRect.bottom, height: fullscreenRect.height },
        railControlsEqual: Math.abs(toggleRect.height - fullscreenRect.height) <= 1,
        collapseInTopHalf: Math.abs(toggleRect.top - railRect.top) <= 1
          && Math.abs(toggleRect.bottom - fullscreenRect.top) <= 1,
        fullscreenInBottomHalf: Math.abs(fullscreenRect.bottom - railRect.bottom) <= 1,
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
        fullscreenTitle: session.els.fullscreenBtn.title,
        fullscreenAriaLabel: session.els.fullscreenBtn.getAttribute('aria-label'),
        fullscreenPressed: session.els.fullscreenBtn.getAttribute('aria-pressed'),
        fullscreenNextLayout: session.els.fullscreenBtn.dataset.nextLayout || '',
        fullscreenIconPresent: Boolean(fullscreenIcon),
        fullscreenIconAriaHidden: Boolean(fullscreenIcon && fullscreenIcon.getAttribute('aria-hidden') === 'true'),
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

  window.chromuxTestFullBrowserComposer = {
    addSession({
      name = 'composer-test', agent = 'codex', cwd = '/tmp', url = 'https://example.test/page',
      title = 'Example page', visibleText = 'Visible browser evidence', consoleEntries = [],
      stagedContexts = [], composerDraft = '', runtime = 'host', distro = null,
    } = {}) {
      const id = addRenderableTestSession({ name, agent, cwd, composerDraft, realTerminal: true });
      const session = testSession(id);
      session.runtime = runtime;
      session.distro = distro;
      const page = createPageTabState(`page-${id}`, url, title);
      page.currentUrl = url;
      page.consoleBuf = consoleEntries.slice(-BOUNDS.consoleTail);
      page.consoleTotal = consoleEntries.length;
      page.webContentsId = 1000 + state.counter;
      const webview = {
        capturePage: async () => ({ toDataURL: () => 'data:image/png;base64,aW1hZ2U=' }),
        executeJavaScript: async (script) => (String(script).includes('document.title') ? title : visibleText),
        getTitle: () => title,
      };
      page.webview = webview;
      session.browser.tabs = [page];
      session.browser.activeTabId = page.id;
      session.browser.tabCounter = 1;
      session.els.urlBar.value = url;
      session.composer.stagedContexts = stagedContexts.map(normalizeBrowserContextReference).filter(Boolean);
      session._composerTestWebview = webview;
      renderBrowserTabs(session);
      renderConsoleChip(session);
      renderComposerContexts(session);
      return id;
    },
    addLiveBrowserSession({
      name = 'live-browser-test', agent = 'codex', cwd = '/tmp', composerDraft = '',
    } = {}) {
      return addRenderableTestSession({ name, agent, cwd, composerDraft, realTerminal: true });
    },
    focus(id) { activateSession(id); flushRender(); },
    enterFull(id) {
      const session = testSession(id);
      setBrowserLayoutMode(session, 'browserChromux', { recordReturn: true });
      flushRender();
    },
    leaveFull(id, mode = 'paired') {
      setBrowserLayoutMode(testSession(id), mode);
      flushRender();
    },
    clickToggle(id) { testSession(id).els.fullBrowserComposerBtn.click(); flushRender(); },
    shortcutOpen(id) {
      activateSession(id);
      const result = handleShortcutOpenComposer();
      flushRender();
      return result;
    },
    hostShortcut(id) {
      activateSession(id);
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', metaKey: true, shiftKey: true, bubbles: true, cancelable: true,
      }));
      flushRender();
    },
    escape(id) {
      activateSession(id);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      flushRender();
    },
    setDraft(id, value) { setComposerDraft(testSession(id), value); },
    draft: (id) => testSession(id).composer.draft,
    async submit(id) { return submitComposer(testSession(id)); },
    async resolveConflict(id, action) { return resolveComposerInputChoice(testSession(id), action); },
    rawInput(id, data) { testSession(id).term.term.input(String(data), true); flushRender(); },
    pendingInput: (id) => testSession(id).term.typedInputBuf,
    ptyInputs: (id) => (testSession(id)._ptyInputs || []).slice(),
    clearPtyInputs(id) { testSession(id)._ptyInputs = []; },
    ptyOutput(id, data) { handlePtyData(id, String(data)); },
    exit(id, exitCode = 0) { handlePtyExit({ id, exitCode }); flushRender(); },
    close(id) { closeSession(id); flushRender(); },
    expand(id) { toggleComposerExpanded(testSession(id)); flushRender(); },
    queue(id, url) {
      apply({ type: 'preview-queued', sessionId: id, url, source: 'TERM' });
      renderQueue(testSession(id));
      flushRender();
    },
    snapshot: () => snapshotOpenSessions().map((row) => ({ ...row })),
    activeId: () => state.activeId,
    sessionCount: () => state.sessions.size,
    sessionNames: () => orderedSessions().map((session) => session.name),
    tabCount: () => orderedSessions().filter((session) => session.els?.tab?.isConnected).length,
    threadSessionCount: () => new Set(
      [...document.querySelectorAll('#thread-list [data-session-id]')]
        .map((element) => element.dataset.sessionId)
        .filter(Boolean)
    ).size,
    activityAt: (id) => testSession(id).lastActivityAt,
    turnState: (id) => testSession(id).turn.state,
    setTurnState(id, turnState) {
      const session = testSession(id);
      session.turn.state = turnState;
      session.turn.since = Date.now();
      renderTabs();
      flushRender();
    },
    targetOptions(id) {
      return [...testSession(id).els.contextTarget.options]
        .map((option) => ({ value: option.value, text: option.textContent }));
    },
    selectedTarget(id) { return testSession(id).composer.routeTargetId; },
    selectTarget(id, targetId) {
      const session = testSession(id);
      session.els.contextTarget.value = targetId;
      session.els.contextTarget.dispatchEvent(new Event('change', { bubbles: true }));
      return session.composer.routeTargetId;
    },
    newSessionTarget: COMPOSER_NEW_SESSION_TARGET,
    selectedAgent(id) { return testSession(id).composer.selectedAgent; },
    selectAgent(id, agent) {
      const session = testSession(id);
      session.els.contextAgent.value = agent;
      session.els.contextAgent.dispatchEvent(new Event('change', { bubbles: true }));
      return session.composer.selectedAgent;
    },
    async history(id) { return loadComposerHistory(testSession(id), { force: true }); },
    async collectEvidence(id, selection = {}) {
      const session = testSession(id);
      const evidence = await collectBrowserEvidence(session, selection);
      const payload = capturePayloadBase(session, evidence);
      return {
        payload,
        screenshotIncluded: Boolean(evidence.pngBase64),
        visibleTextBytes: utf8ByteLength(evidence.visibleText),
      };
    },
    async captureContext(id) {
      const context = await persistComposerBrowserContext(testSession(id));
      return context ? { ...context } : null;
    },
    async attachCurrentPage(id) { return attachCurrentPage(testSession(id)); },
    async livePage(id) {
      const tab = activePageTab(testSession(id));
      if (!tab?.webview) return null;
      let visibleText = '';
      try {
        visibleText = await tab.webview.executeJavaScript(
          "String((document.body && document.body.innerText) || '')"
        );
      } catch { /* page may still be loading */ }
      return {
        url: tab.currentUrl || '',
        title: tab.title || '',
        loading: Boolean(tab.loading),
        hasWebview: Boolean(tab.webview?.isConnected),
        visibleText,
      };
    },
    stageContext(id, context) {
      const session = testSession(id);
      const normalized = normalizeBrowserContextReference(context);
      if (normalized) session.composer.stagedContexts = [normalized, ...session.composer.stagedContexts]
        .slice(0, BOUNDS.stagedBrowserContexts);
      renderComposerContexts(session);
      return session.composer.stagedContexts.length;
    },
    async refreshContext(id, captureId) {
      return refreshStagedBrowserContext(testSession(id), captureId);
    },
    removeFirstContext(id) {
      const button = testSession(id).els.contextChips
        .querySelector('.composer-context-chip button[aria-label="Remove browser evidence"]');
      if (button) button.click();
      return testSession(id).composer.stagedContexts.length;
    },
    async createFromPage(id, options = {}) {
      const source = testSession(id);
      const created = await createSessionFromPage(source, options);
      flushRender();
      return created ? {
        id: created.id,
        name: created.name,
        cwd: created.cwd,
        runtime: created.runtime,
        distro: created.distro,
        agent: created.agent,
        layoutMode: created.browser.layoutMode,
        fullBrowserComposerOpen: created.composer.fullBrowserOpen,
        draft: created.composer.draft,
        contexts: created.composer.stagedContexts.map((context) => ({ ...context })),
        url: activePageTab(created)?.currentUrl || null,
        partitionId: created.browser.partitionId,
      } : null;
    },
    payloadWithContexts(instruction, contexts) {
      return composerPayloadWithContexts(instruction, contexts);
    },
    removeWebview(id) {
      const session = testSession(id);
      const page = activePageTab(session);
      if (page) page.webview = null;
    },
    routeError: (id) => testSession(id).composer.routeError,
    routeStatus: (id) => testSession(id).composer.routeStatus,
    switchOffered: (id) => !testSession(id).els.switchRouteTargetBtn.classList.contains('hidden'),
    switchToTarget(id) { testSession(id).els.switchRouteTargetBtn.click(); flushRender(); },
    contexts: (id) => testSession(id).composer.stagedContexts.map((context) => ({ ...context })),
    grokWarningVisible: () => !$('#modal-grok-advisory').classList.contains('hidden'),
    state(id) {
      const session = testSession(id);
      const browser = session.els.webPane.getBoundingClientRect();
      const composer = session.els.composer.getBoundingClientRect();
      const titlebar = $('#titlebar').getBoundingClientRect();
      const browserRail = session.els.browserRail.getBoundingClientRect();
      const composerButton = session.els.fullBrowserComposerBtn.getBoundingClientRect();
      const hit = document.elementFromPoint(
        composerButton.left + composerButton.width / 2,
        composerButton.top + composerButton.height / 2
      );
      return {
        layoutMode: session.browser.layoutMode,
        open: session.composer.fullBrowserOpen,
        composerOpen: session.composer.open,
        expanded: session.composer.expanded,
        draft: session.composer.draft,
        browserBounds: { left: browser.left, right: browser.right, top: browser.top, bottom: browser.bottom },
        composerBounds: { left: composer.left, right: composer.right, top: composer.top, bottom: composer.bottom },
        titlebarBottom: titlebar.bottom,
        browserRailUsable: Boolean(hit && session.els.browserRail.contains(hit)),
        browserRailBounds: { left: browserRail.left, right: browserRail.right },
        webviewIdentity: session.browser.webview === session._composerTestWebview,
        currentUrl: session.browser.currentUrl,
        activeTabId: session.browser.activeTabId,
        consoleTotal: activePageTab(session)?.consoleTotal || 0,
        queueCount: session.browser.queue.length,
        partitionId: session.browser.partitionId,
        composerToggleHidden: session.els.fullBrowserComposerBtn.classList.contains('hidden'),
        toggleText: session.els.fullBrowserComposerBtn.textContent,
        target: session.composer.routeTargetId,
        targetSelectorVisible: getComputedStyle(session.els.contextTarget.closest('label')).display !== 'none',
        agentSelectorVisible: getComputedStyle(session.els.contextAgent.closest('label')).display !== 'none',
        sourceActive: state.activeId === id,
      };
    },
    flushRender,
  };

  window.chromuxTestLocalhostFirstSuccess = {
    async createManagedSession(options = {}) {
      const session = await createSessionNow({
        name: options.name || 'localhost-first-success',
        cwd: options.cwd || '/tmp',
        agent: options.agent || '',
        command: options.command,
        activate: options.activate !== false,
        initialBrowserLayoutMode: options.initialBrowserLayoutMode || 'terminal',
      });
      session._ptyInputs = [];
      return session.id;
    },
    sessionIds: () => orderedSessions().map((session) => session.id),
    terminalText(id, maxChars = 24_000) {
      const session = testSession(id);
      if (!session.term.serializer) {
        session.term.serializer = new SerializeAddon.SerializeAddon();
        session.term.term.loadAddon(session.term.serializer);
      }
      return session.term.serializer.serialize({ scrollback: 500 })
        .slice(-Math.max(1, Number(maxChars) || 1));
    },
    queueUrls: (id) => testSession(id).browser.queue.map((item) => item.url),
    currentUrl: (id) => testSession(id).browser.currentUrl,
    openQueued(id, url) {
      window.chromuxTestPreviews.openQueued(id, url);
    },
    async page(id) {
      return window.chromuxTestFullBrowserComposer.livePage(id);
    },
    async attach(id) {
      return attachCurrentPage(testSession(id));
    },
    async refresh(id, captureId) {
      return refreshStagedBrowserContext(testSession(id), captureId);
    },
    contexts(id) {
      return testSession(id).composer.stagedContexts.map((context) => ({ ...context }));
    },
    selectTarget(sourceId, targetId) {
      return window.chromuxTestFullBrowserComposer.selectTarget(sourceId, targetId);
    },
    setDraft(id, value) {
      setComposerDraft(testSession(id), value);
    },
    async submit(id) {
      return submitComposer(testSession(id));
    },
    ptyInputs(id) {
      return (testSession(id)._ptyInputs || []).slice();
    },
    close(id) {
      closeSession(id);
      flushRender();
    },
    closeAll() {
      for (const id of [...state.sessions.keys()]) closeSession(id);
      flushRender();
    },
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
    resolve: (cwd, script) => window.chromux.projectScriptResolve(cwd, script),
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
      return session ? {
        name: session.name,
        cwd: session.cwd,
        queue: session.browser.queue.slice(),
        currentUrl: session.browser.currentUrl,
        collapsed: session.browser.layoutMode === 'terminal',
      } : null;
    },
  };

  window.chromuxTestProjectLauncher = {
    ready: async () => {
      if (!state.scaffolderConfig) state.scaffolderConfig = await window.chromux.projectScaffolderConfig();
      renderScaffolderCategories();
      return state.scaffolderConfig;
    },
    open: async (mode = 'open') => {
      openNewSessionModal(mode);
      await new Promise((resolve) => setTimeout(resolve, 25));
      return state.ui.launcherMode;
    },
    mode: () => state.ui.launcherMode,
    selectMode: (mode) => selectLauncherMode(mode),
    selectSource(source) {
      const button = $(`#pc-source [data-source="${source}"]`);
      if (!button) throw new Error(`Unknown source: ${source}`);
      button.click();
    },
    setCloneUrl(value) { $('#pc-clone-url').value = value; return refreshScaffolderPreview(); },
    setName(value) { $('#pc-name').value = value; return refreshScaffolderPreview(); },
    setCategory(value) { $('#pc-category').value = value; return refreshScaffolderPreview(); },
    setSandboxType(value) { $('#pc-sandbox-type').value = value; return refreshScaffolderPreview(); },
    selectAgent(agent) {
      const button = $(`#ns-agent [data-agent="${agent}"]`);
      if (!button) throw new Error(`Unknown agent: ${agent}`);
      button.click();
    },
    preview: () => refreshScaffolderPreview(),
    destination: () => $('#pc-destination').textContent,
    status: () => $('#pc-status').textContent,
    cloneVisible: () => !$('#pc-clone-field').classList.contains('hidden'),
    sandboxVisible: () => !$('#pc-sandbox-field').classList.contains('hidden'),
    createOnly: () => createScaffoldedProject({ launch: false }),
    createAndLaunch: () => createScaffoldedProject({ launch: true }),
    buttons: () => ({
      createOnly: !$('#pc-create-only').disabled,
      createAndLaunch: !$('#pc-create-launch').disabled,
    }),
    sessionState: () => {
      const session = state.sessions.get(state.activeId);
      return session ? {
        name: session.name,
        cwd: session.cwd,
        runtime: session.runtime,
        distro: session.distro,
        agent: session.agent,
      } : null;
    },
    setRoot: async (root) => {
      state.scaffolderConfig = await window.chromux.projectScaffolderSetRoot(root);
      renderScaffolderCategories();
      return state.scaffolderConfig;
    },
    setRootFromSettings: async (root) => {
      openSettings();
      await new Promise((resolve) => setTimeout(resolve, 25));
      $('#settings-projects-root').value = root;
      $('#settings-projects-root-save').click();
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline && state.scaffolderConfig?.root !== root) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const result = {
        root: state.scaffolderConfig?.root,
        field: $('#settings-projects-root').value,
        status: $('#settings-projects-root-status').textContent,
      };
      $('#modal-settings').classList.add('hidden');
      return result;
    },
  };

  window.chromuxTestAgentCommand = {
    build: (agent, resumeId = null) => agentCommand(agent, resumeId),
    buildWithEnv: (agent, resumeId = null, env = {}) => agentCommand(agent, resumeId, { ...state.env, ...env }),
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
        minimumContrastRatio: TERMINAL_MINIMUM_CONTRAST_RATIO,
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
        minimumContrastRatio: TERMINAL_MINIMUM_CONTRAST_RATIO,
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
    nativeScroll(id, position) {
      const viewport = testSession(id).els.termHost.querySelector('.xterm-viewport');
      if (!viewport) throw new Error('Missing native xterm viewport');
      const maximum = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const { baseY } = testSession(id).term.term.buffer.active;
      if (position === 'bottom') viewport.scrollTop = maximum;
      else if (position === 'page-up') {
        const pageHeight = baseY > 0 ? (maximum / baseY) * testSession(id).term.term.rows : 0;
        viewport.scrollTop = Math.max(0, maximum - pageHeight);
      }
      else viewport.scrollTop = Math.max(0, Math.min(maximum, Number(position) || 0));
    },
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
      const viewport = session.els.termHost.querySelector('.xterm-viewport');
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
        physicalViewportY: viewport ? viewport.scrollTop : null,
        physicalViewportMaximum: viewport ? Math.max(0, viewport.scrollHeight - viewport.clientHeight) : null,
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
      const session = await createSessionNow({
        name: 'context-menu-test',
        cwd: '/tmp/chromux-context-menu',
        agent: 'codex',
      });
      return session.id;
    },
    sessionTab: (id) => testSession(id).els.tab,
    trackRealTerminal(terminal) {
      state.counter += 1;
      const session = newSessionShape({
        id: 's' + state.counter,
        name: 'tracked-theme-terminal',
        cwd: '/tmp',
        agent: 'codex',
      });
      session.term.term = terminal;
      state.sessions.set(session.id, session);
      return session.id;
    },
    untrackRealTerminal(id) {
      state.sessions.delete(id);
    },
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
    typeInput(id, data = 'x') { apply({ type: 'user-input', sessionId: id, data }); flushRender(); },
    ptyOutput(id, data) { handlePtyData(id, data); flushRender(); },
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
      const node = document.querySelector(`#thread-list .attention-item[data-session-id="${CSS.escape(id)}"] .attention-reason`);
      if (!node) throw new Error(`Missing attention row: ${id}`);
      node.dataset.attentionKind = kind;
      invalidate('diagnostics');
      flushRender();
    },
    injectTabIndicator(id, kind) { testSession(id).els.dot.className = `tab-dot ${kind}`; invalidate('diagnostics'); flushRender(); },
    visible: () => !$('#developer-diagnostics').classList.contains('hidden'),
    groupText: () => $('#diagnostic-groups').textContent,
    mismatches: () => document.querySelectorAll('#diagnostic-groups .mismatch').length,
    events: () => [...document.querySelectorAll('#diagnostic-events .diagnostic-event')].map((node) => node.textContent),
    selectorLabels: () => [...$('#diagnostic-session').options].map((option) => option.textContent),
    selectorIds: () => [...$('#diagnostic-session').options].map((option) => option.value),
    selectorOption: (id) => [...$('#diagnostic-session').options].find((option) => option.value === id) || null,
    clearFocus() { state.activeId = null; flushRender(); },
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
  const fullscreenBtn = document.createElement('button');
  const fullBrowserComposerBtn = document.createElement('button');
  const composerContext = document.createElement('div');
  const contextChips = document.createElement('div');
  const contextTargetLabel = document.createElement('label');
  const contextTarget = document.createElement('select');
  contextTargetLabel.appendChild(contextTarget);
  const contextAgentLabel = document.createElement('label');
  const contextAgent = document.createElement('select');
  for (const agent of AGENT_ORDER) {
    const option = document.createElement('option');
    option.value = agent;
    contextAgent.appendChild(option);
  }
  contextAgentLabel.appendChild(contextAgent);
  const attachPageBtn = document.createElement('button');
  const contextError = document.createElement('div');
  const switchRouteTargetBtn = document.createElement('button');
  composerContext.append(
    contextChips, contextTargetLabel, contextAgentLabel, attachPageBtn, contextError, switchRouteTargetBtn
  );
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
    fullscreenBtn,
    fullBrowserComposerBtn,
    composerContext,
    contextChips,
    contextTarget,
    contextAgent,
    attachPageBtn,
    contextError,
    switchRouteTargetBtn,
    urlBar: document.createElement('input'),
    captureChip: document.createElement('span'),
  };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !$('#windows-setup-overlay').classList.contains('hidden')) {
    const focusable = [...$('#windows-setup-overlay').querySelectorAll(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.closest('.hidden'));
    if (focusable.length > 0) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  handleInboxQueueKeydown(e);
  handleRendererShortcutKeydown(e);
  if (e.key === 'Escape') {
    if (state.ui.captureApproval) {
      e.preventDefault();
      finishCaptureApproval(false, 'Capture denied in Chromux.');
      return;
    }
    noteShortcutDebugInput(shortcutDebugInputFromDomEvent(e, 'renderer'));
    closeSessionContextMenu();
    $('#modal-settings').classList.add('hidden');
    $('#modal-resources').classList.add('hidden');
    $('#modal-new').classList.add('hidden');
    if (!$('#modal-vercel').classList.contains('hidden')) {
      $('#modal-vercel').classList.add('hidden');
      state.ui.vercel.generation += 1;
      $('#vercel-token').value = '';
    }
    $('#modal-detect').classList.add('hidden');
    $('#drawer-log').classList.add('hidden');
    closeSessionSearch({ restoreFocus: true });
    const activeSession = state.sessions.get(state.activeId);
    if (activeSession?.composer.fullBrowserOpen) closeFullBrowserComposer(activeSession);
    for (const session of state.sessions.values()) {
      if (session.browser.serverLauncher) closeServerLauncher(session);
    }
    invalidate('shortcutDebug');
  }
});


document.addEventListener('click', (event) => {
  if (event.target.closest('.server-launcher-popover, .start-server')) return;
  for (const session of state.sessions.values()) {
    if (session.browser.serverLauncher) closeServerLauncher(session);
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
window.addEventListener('resize', syncBrowserChromuxTopInset);

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
  if (state.ui.threadPreview) return;
  if (state.ui.railMode === 'git' || state.ui.railMode === 'threads') refreshGitInventory({ force: true });
}, 5000);

// boot
(async () => {
  state.favoritesReady = window.chromux.favoritesRead().then((favorites) => {
    state.favorites = Array.isArray(favorites) ? favorites : [];
    renderAllFavorites();
  }).catch(() => { state.favorites = []; });
  await state.favoritesReady;
  state.projects = await window.chromux.projectsRead().catch(() => []);
  state.env = await window.chromux.getEnv();
  state.windowsSetup = state.env?.runtime?.setupStatus || null;
  state.scaffolderConfig = await window.chromux.projectScaffolderConfig().catch(() => null);
  document.body.classList.toggle('host-win32', state.env.hostPlatform === 'win32');
  if (state.env.hostPlatform === 'win32') {
    const modifier = 'Ctrl';
    $('#btn-detect').title = `Detect open WSL agent sessions (${modifier}+D)`;
    $('#btn-new-session').title = `New session (${modifier}+T)`;
    $('#settings-wsl-runtime').classList.remove('hidden');
    $('#settings-wsl-divider').classList.remove('hidden');
    $('#prevent-sleep-copy').textContent = 'Keep this Windows PC awake while Chromux is open.';
    $('#prevent-sleep-label').textContent = 'Keep Windows awake';
    const distroSelect = $('#settings-wsl-distro');
    distroSelect.innerHTML = '';
    for (const distro of state.env.runtime.distros || []) {
      const option = document.createElement('option');
      option.value = distro.name;
      option.textContent = `${distro.name}${distro.version === 2 ? '' : ' (WSL1 unsupported)'}`;
      option.disabled = distro.version !== 2;
      option.selected = distro.name === state.env.runtime.selectedDistro;
      distroSelect.appendChild(option);
    }
    const readiness = state.env.runtime.readiness || {};
    $('#settings-wsl-status').textContent = readiness.ready ? (readiness.warning || 'READY') : (readiness.error || 'NOT READY');
    $('#settings-wsl-status').classList.toggle('fail', !readiness.ready);
    if (state.windowsSetup) renderWindowsSetup(state.windowsSetup);
  }
  if (!state.env.capabilities || !state.env.capabilities.iosSimulator) {
    $('#resource-simulator-capacity').parentElement.classList.add('hidden');
    $('#resource-capacity-select').closest('.resource-capacity-control').classList.add('hidden');
  }
  state.restoreSessions = state.env.restoreSessions || null;
  state.ui.inboxTriage = new Map((state.restoreSessions?.inboxTriage || []).map((record) => [record.id, record]));
  window.chromux.onUpdateStatus((status) => renderUpdateStatus(status));
  window.chromux.onCodexUpdateProgress((progress) => {
    if (progress && progress.output) {
      state.codexUpdate.progress = `${state.codexUpdate.progress}${progress.output}`.slice(-4000).trim();
    }
    renderWorkspaceWarning();
  });
  window.chromux.onPreventSleepStatus((status) => renderPreventSleepStatus(status));
  $('#storage-path').textContent = state.env.capturesDir.replace(state.env.home, '~');
  $('.sb-ver').textContent = `chromux ${state.env.version || '0.6.0'} — prototype`;
  $('#settings-developer-mode').checked = Boolean(state.env.devMode);
  renderPreventSleepStatus();
  renderDeveloperDiagnostics();
  await refreshVercelProjects();
  checkCodexPreflight().catch(() => {});
  if (state.env.hostPlatform === 'win32' && state.env.isPackaged && state.windowsSetup?.needsSetup) {
    await openWindowsSetup({ firstRun: true });
  }
  await autoRestoreWorkspace().catch((err) => {
    renderRestoreWarning([{ name: 'restore failed', cwd: err.message, agent: 'chromux' }]);
  });
  for (const session of orderedSessions()) ensureGitRoot(session.cwd || '~');
  await refreshGitInventory({ force: true }).catch(() => {});
  await checkUpdates(false).catch(() => {});
  updateBadges();
  renderAttentionQueue();
  renderShortcutDebug();
  reportShortcutFocusContext();
})();
