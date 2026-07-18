// Chromux v1 — main process.
// Owns: window, PTY sessions (node-pty), capture payload persistence (~/.chromux),
// claude -p delivery adapter, and webview popup interception (review-queue routing).
'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const pty = require('node-pty');
const yaml = require('js-yaml');
const { checkForUpdates } = require('./update-checker');
const {
  CHROMUX_SHORTCUT_ACTIONS,
  chromuxShortcutAction,
  classifyShortcutFocusContext,
  sessionShortcutDigit,
  shouldRouteChromuxShortcut,
} = require('./shortcut-input');

const SMOKE = process.argv.includes('--smoke');
const SECURITY_RESOURCES = Object.freeze({
  'wire-analysis': 'https://gist.github.com/cereblab/dc9a40bc26120f4540e4e09b75ffb547',
  'reproduction-kit': 'https://github.com/cereblab/grok-build-exfil-repro',
  'independent-report': 'https://sourcefeed.dev/a/grok-build-quietly-uploads-entire-repos-to-gcs',
  'xai-privacy': 'https://x.ai/legal/privacy-policy',
});

const CHROMUX_HOME = path.join(os.homedir(), '.chromux');
const CAPTURES_DIR = path.join(CHROMUX_HOME, 'captures');
const DELIVERY_LOG = path.join(CHROMUX_HOME, 'delivery-log.jsonl');
const UPDATE_CACHE = path.join(CHROMUX_HOME, 'update-cache.json');
const UPDATE_SOURCE = path.join(CHROMUX_HOME, 'update-source.json');
const UPDATE_INSTALL_LOG = path.join(CHROMUX_HOME, 'update-install.log');
const RESTORE_SESSIONS = path.join(CHROMUX_HOME, 'restore-sessions.json');
const FAVORITES_FILE = path.join(CHROMUX_HOME, 'favorites.json');
const PROJECTS_FILE = path.join(CHROMUX_HOME, 'projects.json');
const HOOKS_CLAUDE = path.join(CHROMUX_HOME, 'hooks-claude.json');
const CODEX_NOTIFY = path.join(CHROMUX_HOME, 'codex-notify.sh');
const GROK_HOOK_SCRIPT = path.join(CHROMUX_HOME, 'grok-hook.sh');
const HOOKS_GROK = path.join(CHROMUX_HOME, 'hooks-grok.json');
const SIGNAL_CLASSIFIER = path.join(CHROMUX_HOME, 'signal-classifier.js');
const GROK_HOOKS_INSTALL_NAME = 'chromux-turn-signals.json';
const PACKAGE_PATH = path.join(__dirname, 'package.json');
const KNOWN_AGENTS = ['claude', 'codex', 'grok', ''];
const QUEUE_REASON_BY_SOURCE = {
  TERM: 'detected in agent output',
  FILE: 'local HTML path exists',
  POPUP: 'opened by page popup',
  RESTORE: 'restored from previous session',
};
const FAVORITES_MAX = 200;
const FAVORITES_INPUT_MAX = 400;
const FAVORITES_FILE_BYTES_MAX = 1024 * 1024;
const FAVORITE_URL_MAX = 4096;
const FAVORITE_TITLE_MAX = 200;
const PROJECTS_MAX = 100;
const PROJECTS_FILE_BYTES_MAX = 1024 * 1024;
const PROJECT_NAME_MAX = 100;
const PACKAGE_JSON_BYTES_MAX = 1024 * 1024;

let win = null;
const ptys = new Map(); // sessionId -> IPty
const deliveries = new Map(); // deliveryId -> ChildProcess
let closeConfirmed = false;
const shortcutFocusContexts = new Map(); // webContentsId -> { focusKind }
const shortcutRouteLog = [];

if (SMOKE && !process.env.CHROMUX_KEEP_USER_DATA) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-smoke-user-data-')));
}

if (SMOKE) {
  ipcMain.handle('test-send-host-input', (_e, input) => {
    if (!win || win.isDestroyed()) return false;
    win.webContents.sendInputEvent(input || {});
    return true;
  });
  ipcMain.handle('test-shortcut-route-log', () => shortcutRouteLog.slice(-100));
  ipcMain.handle('test-classify-pty-agent-descendants', (_e, { procs = [], roots = [] } = {}) => ({
    rows: classifyPtyAgentDescendants(procs, roots),
  }));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

function ensureDirs() {
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
}

function normalizeFavoriteRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const rawUrl = typeof record.url === 'string' ? record.url.trim() : '';
  if (!rawUrl || rawUrl.length > FAVORITE_URL_MAX) return null;
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return null; }
  if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password) return null;
  parsed.hash = '';
  const url = parsed.href;
  const title = typeof record.title === 'string'
    ? record.title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, FAVORITE_TITLE_MAX)
    : '';
  const created = new Date(record.createdAt);
  if (!Number.isFinite(created.getTime())) return null;
  const createdAt = created.toISOString();
  return { url, title: title || url, createdAt };
}

function validateFavorites(records) {
  if (!Array.isArray(records)) return [];
  const seen = new Set();
  const valid = [];
  for (const candidate of records.slice(0, FAVORITES_INPUT_MAX)) {
    const record = normalizeFavoriteRecord(candidate);
    if (!record || seen.has(record.url)) continue;
    seen.add(record.url);
    valid.push(record);
    if (valid.length >= FAVORITES_MAX) break;
  }
  return valid;
}

function readFavorites() {
  try {
    if (fs.statSync(FAVORITES_FILE).size > FAVORITES_FILE_BYTES_MAX) return [];
    return validateFavorites(JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8')));
  } catch {
    return [];
  }
}

function replaceFavorites(records) {
  if (!Array.isArray(records) || records.length > FAVORITES_INPUT_MAX) {
    throw new Error(`favorites must be an array of at most ${FAVORITES_INPUT_MAX} records`);
  }
  const valid = validateFavorites(records);
  ensureDirs();
  const tmp = path.join(CHROMUX_HOME, `.favorites-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(valid, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, FAVORITES_FILE);
    try { fs.chmodSync(FAVORITES_FILE, 0o600); } catch { /* best effort */ }
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* renamed or absent */ }
  }
  return valid;
}

function packageProjectConfig(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim() || cwd.includes('\0')) return { valid: false, reason: 'Choose a project directory.' };
  const resolved = path.resolve(cwd.trim());
  let stat;
  try { stat = fs.statSync(resolved); } catch { return { valid: false, reason: 'Project directory does not exist.' }; }
  if (!stat.isDirectory()) return { valid: false, reason: 'Project path is not a directory.' };
  const packagePath = path.join(resolved, 'package.json');
  let pkg;
  try {
    if (fs.statSync(packagePath).size > PACKAGE_JSON_BYTES_MAX) return { valid: false, reason: 'package.json is too large.' };
    pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch { return { valid: false, reason: 'No readable package.json was found.' }; }
  const scripts = pkg && pkg.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)
    ? Object.keys(pkg.scripts).filter((name) => typeof pkg.scripts[name] === 'string' && name.length <= 100).sort()
    : [];
  if (!scripts.length) return { valid: false, reason: 'package.json has no runnable scripts.' };
  let runner = 'npm';
  const declared = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : '';
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(declared)) runner = declared;
  else if (fs.existsSync(path.join(resolved, 'pnpm-lock.yaml'))) runner = 'pnpm';
  else if (fs.existsSync(path.join(resolved, 'yarn.lock'))) runner = 'yarn';
  else if (fs.existsSync(path.join(resolved, 'bun.lockb')) || fs.existsSync(path.join(resolved, 'bun.lock'))) runner = 'bun';
  return { valid: true, cwd: resolved, source: 'package.json', runner, scripts };
}

function normalizeProjectRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const config = packageProjectConfig(record.cwd);
  const script = typeof record.script === 'string' ? record.script.trim() : '';
  if (!config.valid || !config.scripts.includes(script)) return null;
  const name = typeof record.name === 'string' ? record.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, PROJECT_NAME_MAX) : '';
  return { name: name || path.basename(config.cwd), cwd: config.cwd, source: config.source, script, runner: config.runner, startCommand: `${config.runner} run ${shellQuote(script)}` };
}

function validateProjects(records) {
  if (!Array.isArray(records)) return [];
  const seen = new Set(); const valid = [];
  for (const candidate of records.slice(0, PROJECTS_MAX * 2)) {
    const record = normalizeProjectRecord(candidate); const key = record && `${record.cwd}\n${record.script}`;
    if (!record || seen.has(key)) continue;
    seen.add(key); valid.push(record);
    if (valid.length >= PROJECTS_MAX) break;
  }
  return valid;
}

function readProjects() {
  try {
    if (fs.statSync(PROJECTS_FILE).size > PROJECTS_FILE_BYTES_MAX) return [];
    return validateProjects(JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')));
  } catch { return []; }
}

function replaceProjects(records) {
  if (!Array.isArray(records) || records.length > PROJECTS_MAX * 2) throw new Error('projects must be a bounded array');
  const valid = validateProjects(records); ensureDirs();
  const tmp = path.join(CHROMUX_HOME, `.projects-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(valid, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, PROJECTS_FILE);
    try { fs.chmodSync(PROJECTS_FILE, 0o600); } catch { /* best effort */ }
  } finally { try { fs.unlinkSync(tmp); } catch { /* renamed or absent */ } }
  return valid;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function shortcutDebugModifierActive(input, name) {
  const direct = Boolean(input && input[name]);
  const dom = Boolean(input && input[`${name}Key`]);
  const modifiers = Array.isArray(input && input.modifiers)
    ? input.modifiers.map((value) => String(value).toLowerCase())
    : [];
  if (name === 'meta') return direct || dom || modifiers.includes('meta') || modifiers.includes('command') || modifiers.includes('cmd');
  if (name === 'control') return direct || dom || modifiers.includes('control') || modifiers.includes('ctrl');
  if (name === 'alt') return direct || dom || modifiers.includes('alt') || modifiers.includes('option');
  if (name === 'shift') return direct || dom || modifiers.includes('shift');
  return direct || dom;
}

function shortcutDebugPrimaryModifierActive(input) {
  return shortcutDebugModifierActive(input, 'meta') || shortcutDebugModifierActive(input, 'control');
}

function shortcutDebugKey(input) {
  const key = String(input && input.key ? input.key : '');
  const keyCode = String(input && input.keyCode ? input.keyCode : '');
  const code = String(input && input.code ? input.code : '');
  const detailsActive = shortcutDebugPrimaryModifierActive(input);
  const digit = sessionShortcutDigit(input || {});

  const lower = key && key.toLowerCase() !== 'unidentified' ? key.toLowerCase() : keyCode.toLowerCase();
  if (lower === 'meta' || lower === 'command' || code === 'MetaLeft' || code === 'MetaRight') return '⌘';
  if (lower === 'shift' || code === 'ShiftLeft' || code === 'ShiftRight') return detailsActive ? '⇧' : null;
  if (lower === 'alt' || lower === 'option' || code === 'AltLeft' || code === 'AltRight') return '⌥';
  if (lower === 'control' || code === 'ControlLeft' || code === 'ControlRight') return '⌃';
  if (!detailsActive) return null;
  if (digit) return digit;
  if (['j', 'b', 't', 'd', 'q'].includes(lower)) return lower.toUpperCase();
  if (['c', 'v'].includes(lower)) return lower.toUpperCase();
  if (lower === 'escape' || code === 'Escape') return 'Esc';
  if (lower === 'arrowup' || code === 'ArrowUp') return '↑';
  if (lower === 'arrowdown' || code === 'ArrowDown') return '↓';
  if (lower === 'arrowleft' || code === 'ArrowLeft') return '←';
  if (lower === 'arrowright' || code === 'ArrowRight') return '→';
  return null;
}

function emitShortcutDebugInput(input, source, webContentsId = null) {
  const key = shortcutDebugKey(input);
  const type = input && input.type ? String(input.type) : 'unknown';
  const meta = shortcutDebugModifierActive(input, 'meta');
  const control = shortcutDebugModifierActive(input, 'control');
  const shiftActive = shortcutDebugModifierActive(input, 'shift');
  const shiftDiagnostic = shiftActive && (meta || control || (type === 'keyDown' && (key === '⌘' || key === '⌃')));
  send('shortcut-debug-input', {
    source,
    webContentsId,
    type,
    key,
    modifiers: {
      meta,
      shift: shiftDiagnostic,
      alt: shortcutDebugModifierActive(input, 'alt'),
      control,
    },
    repeat: Boolean(input && input.isAutoRepeat),
    ts: Date.now(),
  });
}

function recordShortcutRoute(input, source, webContentsId, action, intercepted, focusKind) {
  if (!SMOKE) return;
  shortcutRouteLog.push({
    source,
    webContentsId,
    type: input && input.type ? String(input.type) : 'unknown',
    key: shortcutDebugKey(input),
    action: action ? action.id : null,
    intercepted: Boolean(intercepted),
    focusKind,
    ts: Date.now(),
  });
  if (shortcutRouteLog.length > 200) shortcutRouteLog.shift();
}

function requestGuardedQuit(reason = 'app-quit') {
  send('lifecycle-confirm-close', {
    reason,
    liveCount: ptys.size,
    alwaysConfirm: reason === 'app-quit',
  });
}

function shortcutFocusContextForSource(source, webContentsId = null) {
  const id = source === 'host' && win && !win.isDestroyed()
    ? win.webContents.id
    : webContentsId;
  const stored = Number.isFinite(id) ? shortcutFocusContexts.get(id) : null;
  return stored || { focusKind: 'appSurface' };
}

ipcMain.on('shortcut-focus-context', (event, payload = {}) => {
  const requestedId = Number(payload && payload.webContentsId);
  const webContentsId = Number.isFinite(requestedId) && requestedId > 0
    ? requestedId
    : event.sender.id;
  shortcutFocusContexts.set(webContentsId, {
    focusKind: classifyShortcutFocusContext(payload && (payload.focusKind || payload)),
  });
});

function handleShellShortcutInput(event, input, source = 'host', webContentsId = null) {
  emitShortcutDebugInput(input, source, webContentsId);
  const action = chromuxShortcutAction(input || {});
  const context = shortcutFocusContextForSource(source, webContentsId);
  const focusKind = classifyShortcutFocusContext(context);
  if (!action || !shouldRouteChromuxShortcut(input || {}, context)) {
    recordShortcutRoute(input || {}, source, webContentsId, action, false, focusKind);
    return false;
  }

  event.preventDefault();
  recordShortcutRoute(input || {}, source, webContentsId, action, true, focusKind);
  if (action.id === CHROMUX_SHORTCUT_ACTIONS.SESSION_INDEX) {
    send('shortcut-activate-session-index', { index: action.index });
    return true;
  }
  if (action.id === CHROMUX_SHORTCUT_ACTIONS.QUEUE_FOCUS) {
    send('shortcut-focus-next-queue-item');
    return true;
  }
  if (action.id === CHROMUX_SHORTCUT_ACTIONS.BROWSER_TOGGLE) {
    send('shortcut-toggle-browser');
    return true;
  }
  if (action.id === CHROMUX_SHORTCUT_ACTIONS.GUARDED_QUIT) {
    requestGuardedQuit('app-quit');
    return true;
  }
  if (action.id === CHROMUX_SHORTCUT_ACTIONS.NEW_SESSION) {
    send('shortcut-open-new-session');
    return true;
  }
  if (action.id === CHROMUX_SHORTCUT_ACTIONS.DETECT) {
    send('shortcut-open-detect-modal');
    return true;
  }
  return false;
}

function installAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        {
          label: 'Quit Chromux',
          click: () => requestGuardedQuit('app-quit'),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Toggle Paired Browser',
          click: () => send('shortcut-toggle-browser'),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function appendDeliveryLog(entry) {
  try {
    fs.appendFileSync(DELIVERY_LOG, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('delivery log write failed:', err.message);
  }
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeSignalClassifier() {
  ensureDirs();
  const source = String.raw`'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const agent = process.argv[2] || '';
const nativeEvent = process.argv[3] || '';
let raw = process.argv[4] || '';
if (!raw) { try { raw = fs.readFileSync(0, 'utf8'); } catch {} }
const ignored = () => process.exit(agent === 'codex' ? 20 : 0);
if (raw.length > 65536) ignored();
let payload = {};
try { payload = raw ? JSON.parse(raw) : {}; } catch { ignored(); }
if (agent === 'codex' && payload.type !== 'agent-turn-complete') ignored();
const sessionId = process.env.CHROMUX_SESSION_ID || '';
const token = process.env.CHROMUX_SIGNAL_TOKEN || '';
if (!['claude','codex','grok'].includes(agent)) process.exit(0);
if (!sessionId || !token) process.exit(agent === 'codex' ? 1 : 0);
const text = [payload.message, payload.title, payload.notification_type, payload.type,
  payload.reason, payload.error, payload.last_assistant_message].filter((v) => typeof v === 'string').join(' ').slice(0, 4096);
const lower = text.toLowerCase();
let event = null; let reason = null; let stopped = false;
if (nativeEvent === 'UserPromptSubmit') event = 'turn-started';
else if (nativeEvent === 'Stop' || nativeEvent === 'agent-turn-complete') { event = 'turn-completed'; stopped = true; }
else if (nativeEvent === 'SubagentStop') process.exit(0);
else if (nativeEvent === 'Notification') {
  if (/permission|approval|allow|confirm/.test(lower)) { event = 'permission-required'; reason = 'permission'; }
  else if (/authenticat|log[ -]?in|sign[ -]?in|credential|api key|oauth/.test(lower)) { event = 'authentication-required'; reason = 'authentication'; }
  else if (/rate limit|usage limit|quota|too many requests|limit reset/.test(lower)) { event = 'rate-limited'; reason = 'rate-limit'; stopped = /stopp|abort|cannot continue|try again later/.test(lower); }
  else if (/tool.*fail|command.*fail|execution.*fail|error running/.test(lower)) { event = 'tool-failed'; reason = 'tool-failure'; stopped = /stopp|abort|cannot continue/.test(lower); }
  else if (/input|answer|question|choose|select|provide|waiting/.test(lower)) { event = 'input-required'; reason = 'input'; }
  else event = 'unknown-notification';
} else process.exit(0);
const stateDir = process.env.CHROMUX_STATE_DIR || path.dirname(__filename);
const statePath = path.join(stateDir, 'signal-' + crypto.createHash('sha256').update(sessionId + token).digest('hex').slice(0, 24) + '.json');
let state = { sequence: -1, turnId: null };
try {
  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (Number.isSafeInteger(saved.sequence) && saved.sequence >= -1) state.sequence = saved.sequence;
  if (typeof saved.turnId === 'string' && saved.turnId.length <= 128) state.turnId = saved.turnId;
} catch {}
state.sequence += 1;
const requestedTurnId = payload.turn_id ?? payload.turnId;
const boundedTurnId = (typeof requestedTurnId === 'string' || typeof requestedTurnId === 'number')
  ? String(requestedTurnId).slice(0, 128) : '';
if (event === 'turn-started' || !state.turnId) state.turnId = boundedTurnId || crypto.randomUUID();
const envelope = { v: 2, sessionId, token, agent, event, reason,
  message: text.slice(0, 1024) || null, turnId: state.turnId, eventId: crypto.randomUUID(),
  sequence: state.sequence, timestamp: Date.now(), source: agent + ':' + nativeEvent,
  confidence: event === 'unknown-notification' ? 'low' : 'high', stopped };
try { fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 }); }
catch { process.exit(1); }
const encoded = Buffer.from(JSON.stringify(envelope)).toString('base64url');
try { fs.writeFileSync('/dev/tty', '\x1b]777;chromux;v2;' + encoded + '\x07'); }
catch { process.exit(1); }
`;
  fs.writeFileSync(SIGNAL_CLASSIFIER, source, { mode: 0o700 });
  fs.chmodSync(SIGNAL_CLASSIFIER, 0o700);
  return SIGNAL_CLASSIFIER;
}

function classifierCommand(agent, event, payloadArg = '') {
  const node = shellQuote(process.execPath);
  const args = `${shellQuote(SIGNAL_CLASSIFIER)} ${agent} ${event}${payloadArg ? ` ${payloadArg}` : ''}`;
  return `ELECTRON_RUN_AS_NODE=1 ${node} ${args}`;
}

// ---------------------------------------------------------------------------
// Deterministic turn signals — Claude Code hooks. Chromux launches claude with
// `--settings ~/.chromux/hooks-claude.json` (merges with, never replaces, user
// settings). Each hook is dependency-free sh printf that emits JSON whose
// `terminalSequence` Claude Code writes to its own terminal, so the signal
// rides the PTY Chromux already owns — no extra IPC, no file watchers. The
// session id comes from CHROMUX_SESSION_ID in the PTY env; the renderer drops
// any signal whose id does not match the PTY it arrived on (guards `claude -p`
// children and pasted logs).
// ---------------------------------------------------------------------------

function chromuxHookCommand(event) {
  // The doubled backslashes make printf emit the six-character texts
  // "backslash-u001b" / "backslash-u0007", so stdout stays valid JSON;
  // Claude Code's JSON parser decodes them into the real ESC/BEL bytes.
  if (hookInstall.helper) return classifierCommand('claude', event);
  return `printf '{"terminalSequence":"\\\\u001b]777;chromux;v1;${event === 'UserPromptSubmit' ? 'turn-start' : event === 'Stop' ? 'turn-end' : 'input-needed'};%s\\\\u0007"}' "$CHROMUX_SESSION_ID"`;
}

function writeClaudeHooksSettings() {
  ensureDirs();
  const hook = (event) => [{ hooks: [{ type: 'command', command: chromuxHookCommand(event) }] }];
  const settings = {
    hooks: {
      // No SubagentStop on purpose: a subagent finishing must not read as
      // session-level turn completion.
      UserPromptSubmit: hook('UserPromptSubmit'),
      Notification: hook('Notification'),
      Stop: hook('Stop'),
    },
  };
  fs.writeFileSync(HOOKS_CLAUDE, JSON.stringify(settings, null, 2) + '\n');
  return HOOKS_CLAUDE;
}

// Set in app.whenReady: true only after the corresponding hook file was
// written successfully. When false, agents launch uninstrumented instead of
// pointing --settings/notify at a path that was never written.
const hookInstall = { helper: false, claude: false, codex: false, grok: false };

// POSIX single-quoting: close the quote, emit an escaped ', reopen. Safe for
// any byte the filesystem allows (spaces, quotes, backslashes).
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function claudeCommand(resumeId = null) {
  const base = hookInstall.claude ? `claude --settings ${shellQuote(HOOKS_CLAUDE)}` : 'claude';
  return resumeId ? `${base} --resume ${shellQuote(resumeId)}` : base;
}

// Codex turn signals — verified on codex-cli 0.142.5: `codex -c notify=[...]`
// is accepted (invalid values are rejected at parse time), the notify child is
// invoked with a single JSON arg of type "agent-turn-complete", and a
// /dev/tty write from that child rides the PTY back into our pty-data stream.
// Codex has no turn-start/input-needed notifications, so codex sessions get
// turn-end only; "working" is inferred in the renderer from submitted input.
function writeCodexNotifyScript() {
  ensureDirs();
  const script = [
    '#!/bin/sh',
    '# Chromux codex notify hook. Emits a turn-end OSC to the controlling',
    '# terminal so the signal arrives on the PTY Chromux owns. The session id',
    '# comes from CHROMUX_SESSION_ID in the PTY env; the renderer drops any',
    '# signal whose id does not match the PTY it arrived on.',
    '[ -n "$CHROMUX_SESSION_ID" ] || exit 0',
    ...(hookInstall.helper ? [] : [
      'case "$1" in',
      '  *\'"type":"agent-turn-complete"\'*) ;;',
      '  *) exit 0 ;; # only turn completion may signal turn-end',
      'esac',
    ]),
    hookInstall.helper
      ? [
        `${classifierCommand('codex', 'agent-turn-complete', '"$1"')} >/dev/null 2>&1`,
        'status=$?',
        'case "$status" in',
        '  0|20) exit 0 ;; # delivered or intentionally ignored',
        '  *) printf \'\\033]777;chromux;v1;turn-end;%s\\007\' "$CHROMUX_SESSION_ID" > /dev/tty 2>/dev/null || true ;;',
        'esac',
      ].join('\n')
      : 'printf \'\\033]777;chromux;v1;turn-end;%s\\007\' "$CHROMUX_SESSION_ID" > /dev/tty 2>/dev/null || true',
    '',
  ].join('\n');
  fs.writeFileSync(CODEX_NOTIFY, script, { mode: 0o755 });
  fs.chmodSync(CODEX_NOTIFY, 0o755); // mode above is ignored when the file already exists
  return CODEX_NOTIFY;
}

function codexCommand(resumeId = null) {
  // The path sits inside a TOML string inside a shell arg — escape both
  // layers: backslash-escape for TOML, then single-quote for the shell.
  const notifyToml = `notify=["${CODEX_NOTIFY.replace(/[\\"]/g, '\\$&')}"]`;
  const base = hookInstall.codex ? `codex -c ${shellQuote(notifyToml)}` : 'codex';
  return resumeId ? `${base} resume ${shellQuote(resumeId)}` : base;
}

// Grok Build turn signals — Grok discovers hooks from ~/.grok/hooks/*.json
// (always trusted; no per-launch --settings flag). Chromux rewrites a
// dependency-free notify script and a matching hook JSON into both
// ~/.chromux/ and ~/.grok/hooks/chromux-turn-signals.json. The script no-ops
// unless CHROMUX_SESSION_ID is set, so non-Chromux Grok sessions are untouched.
// Passive Grok hooks ignore stdout, so the OSC is written to /dev/tty (same
// path as Codex notify) and rides the PTY Chromux already owns.
function grokHomeDir() {
  const override = process.env.GROK_HOME;
  return override && typeof override === 'string' && override.trim()
    ? override.trim()
    : path.join(os.homedir(), '.grok');
}

function writeGrokHooks() {
  ensureDirs();
  const script = [
    '#!/bin/sh',
    '# Chromux Grok Build hook. Emits a turn OSC to the controlling terminal',
    '# so the signal arrives on the PTY Chromux owns. The session id comes',
    '# from CHROMUX_SESSION_ID in the PTY env; the renderer drops any signal',
    '# whose id does not match the PTY it arrived on. Outside Chromux the env',
    '# var is unset and this exits immediately.',
    '[ -n "$CHROMUX_SESSION_ID" ] || exit 0',
    'event="$1"',
    'case "$event" in',
    hookInstall.helper
      ? '  UserPromptSubmit|Notification|Stop) ;;'
      : '  turn-start|input-needed|turn-end) ;;',
    '  *) exit 0 ;;',
    'esac',
    hookInstall.helper
      ? `ELECTRON_RUN_AS_NODE=1 ${shellQuote(process.execPath)} ${shellQuote(SIGNAL_CLASSIFIER)} grok "$event" >/dev/null 2>&1 || true`
      : 'printf \'\\033]777;chromux;v1;%s;%s\\007\' "$event" "$CHROMUX_SESSION_ID" > /dev/tty 2>/dev/null || true',
    '',
  ].join('\n');
  fs.writeFileSync(GROK_HOOK_SCRIPT, script, { mode: 0o755 });
  fs.chmodSync(GROK_HOOK_SCRIPT, 0o755);

  // Absolute path is single-quoted so HOME with spaces/quotes still works when
  // Grok runs the hook command through a shell.
  const run = (event) => `${shellQuote(GROK_HOOK_SCRIPT)} ${event}`;
  const hook = (event) => [{ hooks: [{ type: 'command', command: run(event) }] }];
  const settings = {
    hooks: {
      // No SubagentStop: a subagent finishing must not read as session-level
      // turn completion (same policy as Claude Code hooks).
      UserPromptSubmit: hook(hookInstall.helper ? 'UserPromptSubmit' : 'turn-start'),
      Notification: hook(hookInstall.helper ? 'Notification' : 'input-needed'),
      Stop: hook(hookInstall.helper ? 'Stop' : 'turn-end'),
    },
  };
  const json = JSON.stringify(settings, null, 2) + '\n';
  fs.writeFileSync(HOOKS_GROK, json);

  const grokHooksDir = path.join(grokHomeDir(), 'hooks');
  fs.mkdirSync(grokHooksDir, { recursive: true });
  fs.writeFileSync(path.join(grokHooksDir, GROK_HOOKS_INSTALL_NAME), json);
  return HOOKS_GROK;
}

function grokCommand(resumeId = null) {
  // Launch flags are not required: hooks install into Grok's global discovery
  // path. Resume uses the public CLI form verified on grok 0.2.x.
  return resumeId ? `grok --resume ${shellQuote(resumeId)}` : 'grok';
}

function sanitizeRestoreSession(session) {
  if (!session || typeof session !== 'object') return null;
  const cwd = typeof session.cwd === 'string' && session.cwd ? session.cwd : os.homedir();
  const agent = KNOWN_AGENTS.includes(session.agent) ? session.agent : '';
  const queue = Array.isArray(session.queue)
    ? session.queue.map((item) => ({
      url: typeof item.url === 'string' ? item.url : '',
      source: typeof item.reason === 'string' && item.reason.trim() && typeof item.source === 'string' && item.source
        ? item.source
        : 'RESTORE',
      reason: typeof item.reason === 'string' && item.reason.trim()
        ? item.reason.trim()
        : QUEUE_REASON_BY_SOURCE.RESTORE,
      detectedText: typeof item.detectedText === 'string' && item.detectedText ? item.detectedText : null,
      ts: Number.isFinite(item.ts) ? item.ts : Date.now(),
    })).filter((item) => item.url)
    : [];
  return {
    name: String(session.name || path.basename(cwd) || 'session').slice(0, 80),
    cwd,
    agent,
    alive: session.alive !== false,
    currentUrl: typeof session.currentUrl === 'string' && session.currentUrl ? session.currentUrl : null,
    queue,
    savedAt: typeof session.savedAt === 'string' ? session.savedAt : new Date().toISOString(),
    opened: Boolean(session.opened),
    restoredAt: typeof session.restoredAt === 'string' ? session.restoredAt : null,
  };
}

function writeRestoreSnapshot({ sessions, reason = 'manual', restoreId = null, savedAt = null, consumed = false, consumedAt = null }) {
  ensureDirs();
  const clean = Array.isArray(sessions) ? sessions.map(sanitizeRestoreSession).filter(Boolean) : [];
  const payload = {
    schemaVersion: 2,
    restoreId: restoreId || `restore-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    reason,
    savedAt: savedAt || new Date().toISOString(),
    consumed: Boolean(consumed),
    consumedAt: consumedAt || null,
    sessions: clean,
  };
  fs.writeFileSync(RESTORE_SESSIONS, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

function readRestoreSnapshot() {
  const payload = readJson(RESTORE_SESSIONS);
  if (!payload || !Array.isArray(payload.sessions)) return null;
  return {
    schemaVersion: payload.schemaVersion || 1,
    restoreId: payload.restoreId || `legacy-${payload.savedAt || 'unknown'}`,
    reason: payload.reason || 'unknown',
    savedAt: payload.savedAt || null,
    consumed: Boolean(payload.consumed),
    consumedAt: payload.consumedAt || null,
    sessions: payload.sessions.map(sanitizeRestoreSession).filter(Boolean),
  };
}

function markRestoreSnapshotConsumed(restoreId, restoredSessions = []) {
  const snapshot = readRestoreSnapshot();
  if (!snapshot || (restoreId && snapshot.restoreId !== restoreId)) return snapshot;
  const restoredKeys = new Set(restoredSessions.map((s) => `${s.name || ''}\n${s.cwd || ''}\n${s.agent || ''}`));
  const consumedAt = new Date().toISOString();
  return writeRestoreSnapshot({
    ...snapshot,
    restoreId: snapshot.restoreId,
    consumed: true,
    consumedAt,
    sessions: snapshot.sessions.map((session) => {
      const key = `${session.name || ''}\n${session.cwd || ''}\n${session.agent || ''}`;
      return restoredKeys.size === 0 || restoredKeys.has(key)
        ? { ...session, opened: true, restoredAt: consumedAt }
        : session;
    }),
  });
}

function agentResumeCommand(agent, resumeId) {
  if (!resumeId) return null;
  if (agent === 'claude') return claudeCommand(resumeId);
  if (agent === 'codex') return codexCommand(resumeId);
  if (agent === 'grok') return grokCommand(resumeId);
  return null;
}

function resolveRestoreSessions(sessions) {
  const codexIndex = codexSessionIndex();
  const resolved = [];
  const unresolved = [];
  for (const raw of Array.isArray(sessions) ? sessions : []) {
    const session = sanitizeRestoreSession(raw);
    if (!session) continue;
    let resume = null;
    if (session.agent === 'claude') resume = latestClaudeSession(session.cwd);
    else if (session.agent === 'codex') resume = codexIndex.get(session.cwd) || null;
    else if (session.agent === 'grok') resume = latestGrokSession(session.cwd);
    const command = agentResumeCommand(session.agent, resume && resume.id);
    const row = { ...session, resume, command };
    resolved.push(row);
    if (session.agent && !command) {
      unresolved.push({
        name: session.name,
        cwd: session.cwd,
        agent: session.agent,
      });
    }
  }
  return { sessions: resolved, unresolved };
}

function currentVersion() {
  const pkg = readJson(PACKAGE_PATH) || {};
  return app.getVersion() || pkg.version || '0.0.0';
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function managedUpdateSource() {
  const manifest = readJson(UPDATE_SOURCE);
  const sourceDir = manifest && typeof manifest.sourceDir === 'string' ? manifest.sourceDir : '';
  if (!sourceDir) {
    return {
      available: false,
      reason: 'missing-source',
      message: 'No managed install source is recorded for this app.',
    };
  }
  const pkg = readJson(path.join(sourceDir, 'package.json'));
  if (!pkg || pkg.name !== 'chromux' || !pkg.scripts || typeof pkg.scripts['install-app'] !== 'string') {
    return {
      available: false,
      reason: 'invalid-source',
      sourceDir,
      message: 'The recorded install source is not a Chromux app checkout with an install-app script.',
    };
  }
  return {
    available: true,
    sourceDir,
    installedAt: typeof manifest.installedAt === 'string' ? manifest.installedAt : null,
    command: 'npm run install-app',
  };
}

function scheduleManagedUpdateInstall(source) {
  const command = [
    `echo "Chromux managed update started at $(date)"`,
    `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done`,
    `cd ${shellQuote(source.sourceDir)}`,
    'npm run install-app',
    `open ${shellQuote('/Applications/Chromux.app')}`,
  ].join('\n');
  const child = spawn('/bin/zsh', ['-lc', `${command} > ${shellQuote(UPDATE_INSTALL_LOG)} 2>&1`], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function quitForManagedUpdate() {
  closeConfirmed = true;
  for (const p of ptys.values()) p.kill();
  if (win && !win.isDestroyed()) win.destroy();
  app.quit();
}

function getUpdateStatus(opts = {}) {
  return checkForUpdates({
    currentVersion: currentVersion(),
    cacheFile: UPDATE_CACHE,
    manual: Boolean(opts.manual),
    releasesUrl: process.env.CHROMUX_RELEASES_URL,
  }).then((status) => ({
    ...status,
    managedInstall: managedUpdateSource(),
  }));
}

function focusMainWindow() {
  if (!win || win.isDestroyed()) {
    if (app.isReady()) createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1680,
    height: 1020,
    minWidth: 1100,
    minHeight: 640,
    title: 'Chromux',
    acceptFirstMouse: true,
    backgroundColor: '#0b0e11',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.on('before-input-event', (event, input) => {
    handleShellShortcutInput(event, input, 'host', win.webContents.id);
  });

  if (SMOKE) {
    win.webContents.on('console-message', (_e, level, message) => {
      console.log(`[renderer:${level}] ${message}`);
    });
    win.webContents.once('did-finish-load', async () => {
      // Optional scripted E2E: CHROMUX_E2E points at a JS file run in the
      // renderer; it must resolve to a report string.
      const e2ePath = process.env.CHROMUX_E2E;
      if (e2ePath && fs.existsSync(e2ePath)) {
        try {
          const result = await win.webContents.executeJavaScript(fs.readFileSync(e2ePath, 'utf8'));
          if (process.env.CHROMUX_E2E_OUT) fs.writeFileSync(process.env.CHROMUX_E2E_OUT, String(result));
          else console.log('E2E_RESULT:', result);
        } catch (err) {
          console.log('E2E_FAIL:', err.message);
        }
        if (process.env.CHROMUX_SHOT) {
          const img = await win.webContents.capturePage();
          fs.writeFileSync(process.env.CHROMUX_SHOT, img.toPNG());
        }
        app.quit();
        return;
      }
      setTimeout(() => {
        console.log('SMOKE_OK');
        app.quit();
      }, 2500);
    });
  }

  win.on('close', (event) => {
    if (closeConfirmed || ptys.size === 0 || SMOKE) return;
    event.preventDefault();
    requestGuardedQuit('app-close');
  });

  win.on('closed', () => {
    win = null;
  });
}

app.on('second-instance', () => {
  focusMainWindow();
});

// Popups from guest pages never open new windows; they are routed to the
// paired session's review queue (never steal attention — idea-brief wedge #4).
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.on('before-input-event', (event, input) => {
      handleShellShortcutInput(event, input, 'webview', contents.id);
    });
    contents.setWindowOpenHandler(({ url }) => {
      send('webview-popup', { webContentsId: contents.id, url });
      return { action: 'deny' };
    });
  }
});

// ---------------------------------------------------------------------------
// PTY sessions
// ---------------------------------------------------------------------------

ipcMain.handle('pty-create', (_e, { id, cwd, command, cols, rows }) => {
  const shellPath = process.env.SHELL || '/bin/zsh';
  const signalToken = crypto.randomBytes(32).toString('base64url');
  const p = pty.spawn(shellPath, ['-l'], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd && fs.existsSync(cwd) ? cwd : os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', CHROMUX: '1', CHROMUX_SESSION_ID: id,
      CHROMUX_SIGNAL_TOKEN: signalToken, CHROMUX_STATE_DIR: CHROMUX_HOME },
  });
  ptys.set(id, p);
  p.onData((data) => send('pty-data', { id, data }));
  p.onExit(({ exitCode }) => {
    ptys.delete(id);
    send('pty-exit', { id, exitCode });
  });
  if (command) {
    // Give the login shell a beat to print its prompt, then launch the agent CLI
    // unchanged — Chromux wraps the CLIs, it never modifies them.
    setTimeout(() => {
      if (ptys.has(id)) p.write(command + '\r');
    }, 700);
  }
  return { ok: true, signalToken };
});

ipcMain.on('pty-input', (_e, { id, data }) => {
  const p = ptys.get(id);
  if (p) p.write(data);
});

ipcMain.on('pty-resize', (_e, { id, cols, rows }) => {
  const p = ptys.get(id);
  if (p && cols > 0 && rows > 0) {
    try { p.resize(cols, rows); } catch { /* racing exit */ }
  }
});

ipcMain.on('pty-kill', (_e, { id }) => {
  const p = ptys.get(id);
  if (p) p.kill();
});

// ---------------------------------------------------------------------------
// Capture persistence — the file-drop is not a fallback afterthought: every
// capture is written to disk first (inspectable, retryable), then delivered.
// ---------------------------------------------------------------------------

ipcMain.handle('capture-prepare', (_e, { payload, pngBase64 }) => {
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const dir = path.join(CAPTURES_DIR, stamp);
  fs.mkdirSync(dir, { recursive: true });

  let screenshotPath = null;
  if (pngBase64) {
    screenshotPath = path.join(dir, 'screenshot.png');
    fs.writeFileSync(screenshotPath, Buffer.from(pngBase64, 'base64'));
  }
  payload.screenshot = {
    path: screenshotPath,
    mode: screenshotPath ? 'visible-viewport' : 'unavailable',
  };

  const payloadPath = path.join(dir, 'payload.yaml');
  const yamlText = yaml.dump(payload, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(payloadPath, yamlText);

  return { payloadPath, screenshotPath, yamlText, dir };
});

// ---------------------------------------------------------------------------
// Delivery adapter v1: one-off `claude -p` (prompt over stdin, login shell so
// PATH matches the user's terminal). Streams output back; logs every attempt.
// ---------------------------------------------------------------------------

ipcMain.handle('deliver-claude', (_e, { deliveryId, payloadPath, yamlText, cwd, targetSession, notes }) => {
  const prompt = [
    'You are receiving a browser evidence capture from Chromux, a desktop cockpit that pairs',
    'coding-agent terminal sessions with embedded browser panes. The user captured the state of',
    'a page rendered by this project and wants you to analyze it and act on their note.',
    '',
    `Payload file on disk: ${payloadPath}`,
    payloadPath ? `A screenshot (if present) is referenced inside the payload.` : '',
    '',
    '--- CAPTURE PAYLOAD (YAML) ---',
    yamlText,
    '--- END PAYLOAD ---',
    '',
    notes ? `User note: ${notes}` : 'No user note was attached; infer intent from the captured evidence.',
  ].join('\n');

  const child = spawn(process.env.SHELL || '/bin/zsh', ['-lc', 'claude -p'], {
    cwd: cwd && fs.existsSync(cwd) ? cwd : os.homedir(),
    env: { ...process.env },
  });
  deliveries.set(deliveryId, child);

  child.stdout.on('data', (d) => send('deliver-output', { deliveryId, stream: 'stdout', chunk: d.toString() }));
  child.stderr.on('data', (d) => send('deliver-output', { deliveryId, stream: 'stderr', chunk: d.toString() }));
  child.on('close', (code) => {
    deliveries.delete(deliveryId);
    send('deliver-close', { deliveryId, exitCode: code });
    appendDeliveryLog({
      ts: new Date().toISOString(),
      adapter: 'claude -p',
      payload_path: payloadPath,
      target_session: targetSession,
      cwd,
      exit_status: code,
    });
  });
  child.on('error', (err) => {
    deliveries.delete(deliveryId);
    send('deliver-close', { deliveryId, exitCode: -1, error: err.message });
    appendDeliveryLog({
      ts: new Date().toISOString(),
      adapter: 'claude -p',
      payload_path: payloadPath,
      target_session: targetSession,
      cwd,
      exit_status: -1,
      error: err.message,
    });
  });

  child.stdin.write(prompt);
  child.stdin.end();
  return { started: true };
});

ipcMain.on('deliver-cancel', (_e, { deliveryId }) => {
  const child = deliveries.get(deliveryId);
  if (child) child.kill('SIGTERM');
});

ipcMain.on('log-filedrop', (_e, { payloadPath, targetSession, cwd }) => {
  appendDeliveryLog({
    ts: new Date().toISOString(),
    adapter: 'file-drop',
    payload_path: payloadPath,
    target_session: targetSession,
    cwd,
    exit_status: 0,
  });
});

// ---------------------------------------------------------------------------
// External-session detection — scan the machine for open terminal tabs and the
// claude/codex/grok sessions running inside them, so they can be adopted into
// Chromux (resume the CLI's own saved conversation, or start fresh).
// Read-only: ps + lsof + AppleScript + session-store file mtimes.
// ---------------------------------------------------------------------------

function runCmd(cmd, args, timeout = 10000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout));
    });
  });
}

async function listTtyProcesses() {
  const out = await runCmd('/bin/ps', ['-axo', 'pid=,ppid=,tty=,etime=,command=']);
  const procs = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);
    if (m) procs.push({ pid: +m[1], ppid: +m[2], tty: m[3], etime: m[4], command: m[5].trim() });
  }
  return procs;
}

// Subcommands / headless entrypoints that are not interactive agent sessions.
const GROK_NON_SESSION_TOKENS = new Set([
  'agent', 'completions', 'dashboard', 'export', 'help', 'import', 'inspect',
  'leader', 'login', 'logout', 'mcp', 'memory', 'models', 'plugin', 'sessions',
  'setup', 'trace', 'update', 'version', 'v', 'worktree', 'wrap',
  '-p', '--single', '--prompt-file', '--prompt-json',
]);

// 'claude' | 'codex' | 'grok' | null. Matches the CLI entrypoints only
// ('claude', 'node …/codex', 'grok'), not helpers like codex's
// SkyComputerUseClient, and skips one-off headless deliveries (`claude -p`,
// `grok -p` / `grok --single`, including our own adapter's).
function classifyAgentCommand(command) {
  const tokens = command.split(/\s+/);
  let head = tokens.shift() || '';
  if (path.basename(head) === 'node' && tokens.length) head = tokens.shift();
  const name = path.basename(head);
  if (name === 'claude') return tokens[0] === '-p' ? null : 'claude';
  if (name === 'codex') return 'codex';
  if (name === 'grok') {
    if (GROK_NON_SESSION_TOKENS.has(tokens[0])) return null;
    // Headless flags may appear after other options: `grok -m x -p "…"`.
    if (tokens.some((t) => t === '-p' || t === '--single' || t.startsWith('--single=')
      || t === '--prompt-file' || t.startsWith('--prompt-file=')
      || t === '--prompt-json' || t.startsWith('--prompt-json='))) {
      return null;
    }
    return 'grok';
  }
  return null;
}

function isLoginShellCommand(command) {
  const head = command.split(/\s+/)[0] || '';
  return ['zsh', 'bash', 'fish', 'sh'].includes(path.basename(head).replace(/^-/, ''));
}

function descendsFrom(pid, ancestorPid, byPid) {
  let cur = pid;
  for (let hops = 0; hops < 64; hops += 1) {
    if (cur === ancestorPid) return true;
    const proc = byPid.get(cur);
    if (!proc || proc.ppid <= 1) return false;
    cur = proc.ppid;
  }
  return false;
}

function ancestryDepth(pid, ancestorPid, byPid) {
  let cur = pid;
  for (let depth = 0; depth < 64; depth += 1) {
    if (cur === ancestorPid) return depth;
    const proc = byPid.get(cur);
    if (!proc || proc.ppid <= 1) return Number.MAX_SAFE_INTEGER;
    cur = proc.ppid;
  }
  return Number.MAX_SAFE_INTEGER;
}

function classifyPtyAgentDescendants(procs, roots) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const agentPids = new Set(
    procs.filter((p) => classifyAgentCommand(p.command)).map((p) => p.pid),
  );
  const rows = [];
  for (const root of roots) {
    const rootPid = Number(root && root.pid);
    if (!root || !root.id || !Number.isFinite(rootPid) || rootPid <= 0) continue;
    const agents = procs
      .filter((p) => p.pid !== rootPid && descendsFrom(p.pid, rootPid, byPid))
      .filter((p) => classifyAgentCommand(p.command) && !agentPids.has(p.ppid))
      .sort((a, b) =>
        (ancestryDepth(a.pid, rootPid, byPid) - ancestryDepth(b.pid, rootPid, byPid))
        || (a.pid - b.pid));
    const agentKinds = new Set(agents.map((p) => classifyAgentCommand(p.command)));
    const target = agentKinds.size === 1 ? agents[0] : null;
    rows.push({
      id: root.id,
      rootPid,
      pid: target ? target.pid : null,
      agent: target ? classifyAgentCommand(target.command) : '',
      command: target ? target.command : '',
      etime: target ? target.etime : '',
      conflict: agentKinds.size > 1,
      candidates: agents.map((p) => ({
        pid: p.pid,
        ppid: p.ppid,
        agent: classifyAgentCommand(p.command),
        command: p.command,
        etime: p.etime,
      })),
    });
  }
  return rows;
}

async function lsofCwds(pids) {
  const cwds = new Map();
  if (pids.length === 0) return cwds;
  const out = await runCmd('/usr/sbin/lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fn']);
  let pid = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = +line.slice(1);
    else if (line.startsWith('n') && pid !== null) cwds.set(pid, line.slice(1));
  }
  return cwds;
}

// tty basename (ttys012) -> { app, title, busy }. Best-effort: Terminal.app
// and iTerm2 expose tabs over AppleScript; other emulators just lack titles.
async function listTerminalTabs() {
  const tabs = new Map();
  const scripts = [
    ['Terminal', `
      set out to ""
      if application "Terminal" is running then
        tell application "Terminal"
          repeat with w in windows
            repeat with t in tabs of w
              try
                set out to out & (tty of t) & tab & (busy of t) & tab & (custom title of t) & linefeed
              end try
            end repeat
          end repeat
        end tell
      end if
      return out`],
    ['iTerm2', `
      set out to ""
      if application "iTerm2" is running then
        tell application "iTerm2"
          repeat with w in windows
            repeat with t in tabs of w
              repeat with s in sessions of t
                try
                  set out to out & (tty of s) & tab & "false" & tab & (name of s) & linefeed
                end try
              end repeat
            end repeat
          end repeat
        end tell
      end if
      return out`],
  ];
  await Promise.all(scripts.map(async ([appName, script]) => {
    const out = await runCmd('/usr/bin/osascript', ['-e', script]);
    for (const line of out.split('\n')) {
      const [ttyPath, busy, ...titleParts] = line.split('\t');
      if (!ttyPath || !ttyPath.startsWith('/dev/tty')) continue;
      tabs.set(path.basename(ttyPath), {
        app: appName,
        busy: busy === 'true',
        title: (titleParts.join('\t') || '').trim() || null,
      });
    }
  }));
  return tabs;
}

// Latest saved claude session for a project dir: ~/.claude/projects stores one
// dir per cwd (path munged to dashes) with one <session-uuid>.jsonl per session.
function latestClaudeSession(cwd) {
  const munged = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  const dir = path.join(os.homedir(), '.claude', 'projects', munged);
  let best = null;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const id = f.slice(0, -6);
      if (!/^[0-9a-f-]{16,}$/i.test(id)) continue;
      const mtimeMs = fs.statSync(path.join(dir, f)).mtimeMs;
      if (!best || mtimeMs > best.ts) best = { id, ts: mtimeMs };
    }
  } catch { /* no sessions for this project */ }
  return best;
}

// Latest saved Grok Build session for a project dir.
// Layout: ~/.grok/sessions/<url-encoded-cwd>/<session-id>/summary.json
// (GROK_HOME overrides ~/.grok). Long paths may use a slug+hash group with a
// `.cwd` file recording the original path — we resolve that as a fallback.
function latestGrokSession(cwd) {
  if (!cwd || typeof cwd !== 'string') return null;
  const root = path.join(grokHomeDir(), 'sessions');
  let best = null;

  const considerGroup = (groupDir) => {
    let names;
    try { names = fs.readdirSync(groupDir); } catch { return; }
    for (const name of names) {
      if (!/^[0-9a-f-]{16,}$/i.test(name)) continue;
      const sessionDir = path.join(groupDir, name);
      const summaryPath = path.join(sessionDir, 'summary.json');
      let ts = 0;
      try {
        const summary = readJson(summaryPath);
        const stamp = summary
          && (summary.last_active_at || summary.updated_at
            || (summary.info && (summary.info.last_active_at || summary.info.updated_at)));
        if (typeof stamp === 'string') {
          const parsed = Date.parse(stamp);
          if (Number.isFinite(parsed)) ts = parsed;
        }
        if (!ts) ts = fs.statSync(summaryPath).mtimeMs;
      } catch {
        try { ts = fs.statSync(sessionDir).mtimeMs; } catch { continue; }
      }
      if (!best || ts > best.ts) best = { id: name, ts };
    }
  };

  considerGroup(path.join(root, encodeURIComponent(cwd)));
  if (best) return best;

  // Fallback: hashed long-path groups (and any encoding mismatch) via .cwd or
  // a summary.json info.cwd match. Capped walk — DETECT only needs "latest".
  try {
    const groups = fs.readdirSync(root);
    for (const group of groups) {
      if (group === 'session_search.sqlite') continue;
      const groupDir = path.join(root, group);
      let matched = false;
      try {
        if (fs.readFileSync(path.join(groupDir, '.cwd'), 'utf8').trim() === cwd) matched = true;
      } catch { /* no .cwd marker */ }
      if (!matched) {
        try {
          for (const name of fs.readdirSync(groupDir)) {
            if (!/^[0-9a-f-]{16,}$/i.test(name)) continue;
            const summary = readJson(path.join(groupDir, name, 'summary.json'));
            const summaryCwd = summary && summary.info && summary.info.cwd;
            if (summaryCwd === cwd) { matched = true; break; }
          }
        } catch { /* unreadable group */ }
      }
      if (matched) considerGroup(groupDir);
    }
  } catch { /* no grok sessions root */ }
  return best;
}

function readFirstLine(file, cap = 262144) {
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(cap);
    const n = fs.readSync(fd, buf, 0, cap, 0);
    const text = buf.toString('utf8', 0, n);
    const nl = text.indexOf('\n');
    return nl === -1 ? text : text.slice(0, nl);
  } catch {
    return '';
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

// cwd -> latest codex session. Rollout files live under
// ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl; the first line is a
// session_meta record carrying the session id and cwd. Newest-first walk,
// capped — old sessions aren't worth resuming from a "what's open now" scan.
function codexSessionIndex(fileCap = 400) {
  const root = path.join(os.homedir(), '.codex', 'sessions');
  const listDesc = (dir) => {
    try { return fs.readdirSync(dir).sort().reverse(); } catch { return []; }
  };
  const files = [];
  outer:
  for (const y of listDesc(root)) {
    for (const mo of listDesc(path.join(root, y))) {
      for (const d of listDesc(path.join(root, y, mo))) {
        for (const f of listDesc(path.join(root, y, mo, d))) {
          if (!f.endsWith('.jsonl')) continue;
          files.push(path.join(root, y, mo, d, f));
          if (files.length >= fileCap) break outer;
        }
      }
    }
  }
  const index = new Map();
  for (const file of files) {
    try {
      const meta = JSON.parse(readFirstLine(file));
      const p = meta && meta.type === 'session_meta' ? meta.payload : null;
      const id = p && (p.id || p.session_id);
      if (!p || !p.cwd || !id || !/^[0-9a-f-]{16,}$/i.test(id)) continue;
      if (!index.has(p.cwd)) {
        index.set(p.cwd, { id, ts: Date.parse(meta.timestamp) || fs.statSync(file).mtimeMs });
      }
    } catch { /* unreadable rollout */ }
  }
  return index;
}

ipcMain.handle('detect-external', async () => {
  const [procs, tabs] = await Promise.all([listTtyProcesses(), listTerminalTabs()]);
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const agentPids = new Set(
    procs.filter((p) => classifyAgentCommand(p.command)).map((p) => p.pid),
  );

  // Group by tty; skip anything spawned by Chromux itself (our own PTYs).
  const byTty = new Map();
  for (const proc of procs) {
    if (!/^ttys\d+$/.test(proc.tty)) continue;
    if (descendsFrom(proc.pid, process.pid, byPid)) continue;
    if (!byTty.has(proc.tty)) byTty.set(proc.tty, []);
    byTty.get(proc.tty).push(proc);
  }

  // One row per tty: the top-level agent process if present (codex spawns a
  // same-named vendor child — keep the one whose parent is not an agent),
  // otherwise the tab's login shell.
  const rows = [];
  for (const [tty, list] of byTty) {
    const agents = list.filter((p) => classifyAgentCommand(p.command) && !agentPids.has(p.ppid));
    const target = agents[0]
      || list.find((p) => p.command.startsWith('-') && isLoginShellCommand(p.command))
      || list.find((p) => isLoginShellCommand(p.command));
    if (!target) continue;
    rows.push({
      tty,
      pid: target.pid,
      agent: agents[0] ? classifyAgentCommand(agents[0].command) : '',
      command: target.command,
      etime: target.etime,
      cwd: null,
      terminal: tabs.get(tty) || null,
      resume: null,
    });
  }

  const cwds = await lsofCwds(rows.map((r) => r.pid));
  const codexIndex = codexSessionIndex();
  for (const row of rows) {
    row.cwd = cwds.get(row.pid) || null;
    if (!row.cwd) continue;
    if (row.agent === 'claude') row.resume = latestClaudeSession(row.cwd);
    else if (row.agent === 'codex') row.resume = codexIndex.get(row.cwd) || null;
    else if (row.agent === 'grok') row.resume = latestGrokSession(row.cwd);
  }

  const agentRank = { claude: 0, codex: 1, grok: 2, '': 3 };
  rows.sort((a, b) =>
    ((agentRank[a.agent] ?? 9) - (agentRank[b.agent] ?? 9))
    || (parseInt(a.tty.slice(4), 10) - parseInt(b.tty.slice(4), 10)));
  // tabs empty with rows present ⇒ Chromux lacks macOS Automation permission
  // for Terminal/iTerm2 (or neither is scriptable) — titles are best-effort.
  return { rows, tabTitles: tabs.size > 0, scannedAt: new Date().toISOString() };
});

ipcMain.handle('detect-pty-agents', async () => {
  const roots = [...ptys.entries()]
    .map(([id, p]) => ({ id, pid: Number(p && p.pid) }))
    .filter((row) => row.id && Number.isFinite(row.pid) && row.pid > 0);
  if (roots.length === 0) return { rows: [], scannedAt: new Date().toISOString() };
  const procs = await listTtyProcesses();
  return {
    rows: classifyPtyAgentDescendants(procs, roots),
    scannedAt: new Date().toISOString(),
  };
});

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

// Preview-detection guard: terminal soft-wrapping can split long paths, so a
// matched .html path is only routed if it actually exists on disk.
ipcMain.handle('file-exists', (_e, p) => {
  try { return fs.existsSync(p); } catch { return false; }
});

ipcMain.handle('pick-directory', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: os.homedir(),
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('read-delivery-log', () => {
  try {
    const text = fs.readFileSync(DELIVERY_LOG, 'utf8');
    return text.trim().split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean).reverse();
  } catch {
    return [];
  }
});

ipcMain.on('reveal-path', (_e, { p }) => {
  if (p) shell.showItemInFolder(p);
});

ipcMain.handle('get-env', () => ({
  home: os.homedir(),
  chromuxHome: CHROMUX_HOME,
  capturesDir: CAPTURES_DIR,
  deliveryLog: DELIVERY_LOG,
  restoreSessions: readRestoreSnapshot(),
  // null when the hook install failed at startup: the renderer then launches
  // agents uninstrumented instead of pointing them at broken paths.
  hooksSettingsPath: hookInstall.claude ? HOOKS_CLAUDE : null,
  codexNotifyPath: hookInstall.codex ? CODEX_NOTIFY : null,
  // Grok hooks install into ~/.grok/hooks (no launch flag). Expose path for
  // diagnostics/tests; launch always uses bare `grok` / `grok --resume`.
  grokHooksPath: hookInstall.grok ? HOOKS_GROK : null,
  version: currentVersion(),
}));

ipcMain.handle('favorites-read', () => readFavorites());
ipcMain.handle('favorites-replace', (_e, records) => replaceFavorites(records));
ipcMain.handle('projects-read', () => readProjects());
ipcMain.handle('projects-replace', (_e, records) => replaceProjects(records));
ipcMain.handle('project-config', (_e, cwd) => packageProjectConfig(cwd));

ipcMain.handle('check-updates', (_e, opts = {}) => getUpdateStatus(opts));

ipcMain.handle('save-restore-snapshot', (_e, { reason = 'manual', sessions = [] } = {}) => (
  writeRestoreSnapshot({ reason, sessions })
));

ipcMain.handle('get-restore-snapshot', () => readRestoreSnapshot());

ipcMain.handle('mark-restore-snapshot-consumed', (_e, { restoreId, restoredSessions = [] } = {}) => (
  markRestoreSnapshotConsumed(restoreId, restoredSessions)
));

ipcMain.handle('resolve-restore-sessions', (_e, { sessions = [] } = {}) => (
  resolveRestoreSessions(sessions)
));

ipcMain.handle('confirm-app-close', (_e, { sessions = [] } = {}) => {
  // An idle quit (no open sessions) must not clobber a pending restore
  // snapshot the user hasn't reopened yet.
  const incoming = Array.isArray(sessions) ? sessions : [];
  const existing = readRestoreSnapshot();
  const pendingOnDisk = existing && !existing.consumed && existing.sessions.length > 0;
  if (incoming.length > 0 || !pendingOnDisk) {
    writeRestoreSnapshot({ reason: 'app-close', sessions: incoming });
  }
  closeConfirmed = true;
  for (const p of ptys.values()) p.kill();
  if (win && !win.isDestroyed()) win.destroy();
  app.quit();
  return { ok: true };
});

ipcMain.handle('open-update-release', async (_e, opts = {}) => {
  const status = opts.status && opts.status.releaseUrl ? opts.status : await getUpdateStatus({ manual: true });
  if (!status || !status.releaseUrl) return { ok: false, message: 'No GitHub Release URL is available.' };
  await shell.openExternal(status.releaseUrl);
  return { ok: true, releaseUrl: status.releaseUrl };
});

ipcMain.handle('open-security-resource', async (_e, resource) => {
  const url = SECURITY_RESOURCES[resource];
  if (!url) throw new Error('Unknown security resource');
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('install-update', async (_e, opts = {}) => {
  const status = opts.status && opts.status.updateAvailable ? opts.status : await getUpdateStatus({ manual: true });
  if (!status || !status.updateAvailable) {
    return { ok: false, message: 'No newer Chromux release is available.' };
  }
  const source = managedUpdateSource();
  if (!source.available) {
    return {
      ok: false,
      message: source.message,
      reason: source.reason,
      releaseUrl: status.releaseUrl || null,
    };
  }
  try {
    scheduleManagedUpdateInstall(source);
    setTimeout(quitForManagedUpdate, 250);
    return {
      ok: true,
      sourceDir: source.sourceDir,
      command: source.command,
      logPath: UPDATE_INSTALL_LOG,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Could not start managed update install: ${err.message}`,
      sourceDir: source.sourceDir,
      logPath: UPDATE_INSTALL_LOG,
    };
  }
});

app.whenReady().then(() => {
  ensureDirs();
  installAppMenu();
  try { writeSignalClassifier(); hookInstall.helper = true; } catch (err) { console.error('signal classifier write failed; using legacy hooks:', err.message); }
  try { writeClaudeHooksSettings(); hookInstall.claude = true; } catch (err) { console.error('hooks settings write failed:', err.message); }
  try { writeCodexNotifyScript(); hookInstall.codex = true; } catch (err) { console.error('codex notify script write failed:', err.message); }
  try { writeGrokHooks(); hookInstall.grok = true; } catch (err) { console.error('grok hooks write failed:', err.message); }
  createWindow();
  getUpdateStatus().then((status) => send('update-status', status)).catch(() => {});
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const p of ptys.values()) p.kill();
  app.quit();
});
