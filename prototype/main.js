// Chromux v1 — main process.
// Owns: window, PTY sessions (node-pty), capture payload persistence (~/.chromux),
// claude -p delivery adapter, and webview popup interception (review-queue routing).
'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  clipboard,
  powerSaveBlocker,
  autoUpdater,
  safeStorage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn, execFile } = require('child_process');
const pty = require('node-pty');
const yaml = require('js-yaml');
const { checkForUpdates } = require('./update-checker');
const { createCodexDetectMetadata } = require('./codex-detect-metadata');
const {
  codexSearchPath,
  createCodexUpdateService,
  resolveOnPath,
} = require('./codex-update-service');
const { createDevModeRestart, resolveDevMode, restartArgs } = require('./dev-mode');
const { BrokerClient } = require('./resource-broker/client');
const { createPreventSleepController } = require('./prevent-sleep');
const {
  createHostAdapter,
  createProject: scaffoldProject,
  createWslAdapter,
  loadScaffolderConfig,
  previewProject: previewScaffoldProject,
  validateAbsoluteRoot,
} = require('./project-scaffolder');
const { MAX_DRAFT_BYTES, createPromptHistoryStore } = require('./prompt-history');
const { previewProbe } = require('./preview-probe');
const { cleanupOrphanedStorage } = require('./storage-cleanup');
const { createGitWorktreeService } = require('./git-worktree-service');
const { createVercelService } = require('./vercel-service');
const { createVercelOAuthLoopback } = require('./vercel-oauth-loopback');
const { createVercelShippingService } = require('./vercel-shipping-service');
const { normalizeBrowserQueueRequest } = require('./browser-queue');
const { resolveChromuxUserDataPath } = require('./user-data-path');
const { CaptureArtifactStore } = require('./capture/artifact-store');
const { CaptureCoordinator } = require('./capture/coordinator');
const { CaptureControlServer } = require('./capture/control');
const { WslRuntime, linuxPathToWindows, windowsPathToLinux, workspaceLocation } = require('./platform/runtime');
const { capabilities, windowOptions, windowsSupport } = require('./platform/host');
const {
  SETUP_SCHEMA_VERSION,
  buildSetupStatus,
  createRoot: createWindowsProjectsRoot,
  inspectRoot: inspectWindowsProjectsRoot,
  DOCUMENTATION_URLS: WINDOWS_SETUP_DOCUMENTATION_URLS,
} = require('./windows-setup');
const {
  CHROMUX_SHORTCUT_ACTIONS,
  chromuxShortcutAction,
  classifyShortcutFocusContext,
  sessionShortcutDigit,
  shouldRouteChromuxShortcut,
} = require('./shortcut-input');

const SMOKE = process.argv.includes('--smoke');
function isBackgroundE2E({ smoke, e2ePath, showE2EWindow }) {
  return smoke && Boolean(e2ePath) && showE2EWindow !== '1';
}
const BACKGROUND_E2E = isBackgroundE2E({
  smoke: SMOKE,
  e2ePath: process.env.CHROMUX_E2E,
  showE2EWindow: process.env.CHROMUX_E2E_SHOW_WINDOW,
});
let squirrelStartup = false;
if (process.platform === 'win32') {
  try { squirrelStartup = require('electron-squirrel-startup'); } catch { squirrelStartup = false; }
}
if (squirrelStartup) app.quit();
const resolvedUserDataPath = resolveChromuxUserDataPath({
  appDataDir: app.getPath('appData'),
  argv: process.argv,
  smoke: SMOKE,
  keepSmokeUserData: Boolean(process.env.CHROMUX_KEEP_USER_DATA),
});
if (resolvedUserDataPath) app.setPath('userData', resolvedUserDataPath);
const SECURITY_RESOURCES = Object.freeze({
  'wire-analysis': 'https://gist.github.com/cereblab/dc9a40bc26120f4540e4e09b75ffb547',
  'reproduction-kit': 'https://github.com/cereblab/grok-build-exfil-repro',
  'independent-report': 'https://sourcefeed.dev/a/grok-build-quietly-uploads-entire-repos-to-gcs',
  'xai-privacy': 'https://x.ai/legal/privacy-policy',
});

const CHROMUX_HOME = process.env.CHROMUX_HOME_DIR || path.join(os.homedir(), '.chromux');
const CAPTURES_DIR = path.join(CHROMUX_HOME, 'captures');
const DELIVERY_LOG = path.join(CHROMUX_HOME, 'delivery-log.jsonl');
const UPDATE_CACHE = path.join(CHROMUX_HOME, 'update-cache.json');
const UPDATE_SOURCE = path.join(CHROMUX_HOME, 'update-source.json');
const UPDATE_INSTALL_LOG = path.join(CHROMUX_HOME, 'update-install.log');
const RESTORE_SESSIONS = path.join(CHROMUX_HOME, 'restore-sessions.json');
const GIT_REPOSITORIES_FILE = path.join(CHROMUX_HOME, 'git-repositories.json');
const VERCEL_CREDENTIALS_FILE = path.join(CHROMUX_HOME, 'vercel-credentials.json');
const VERCEL_PROJECTS_FILE = path.join(CHROMUX_HOME, 'vercel-projects.json');
const VERCEL_JOBS_FILE = path.join(CHROMUX_HOME, 'vercel-jobs.json');
const VERCEL_OAUTH_CLIENT_ID = process.env.CHROMUX_VERCEL_OAUTH_CLIENT_ID || '';
const RESTORE_ATTENTION_TYPES = new Set([
  'permission', 'authentication', 'input', 'rateLimited', 'toolFailed', 'delivery', 'completed',
]);
const MAX_RESTORE_ATTENTION_RECORDS = 20;
const MAX_RESTORE_ATTENTION_DETAIL_BYTES = 4096;
const MAX_RESTORE_ATTENTION_ID_CHARS = 200;
const MAX_INBOX_TRIAGE_RECORDS = 200;
const MAX_STAGED_BROWSER_CONTEXTS = 5;
const MAX_RESTORE_PATH_CHARS = 8192;
const BROWSER_LAYOUT_MODES = new Set(['paired', 'terminal', 'browserWorkspace', 'browserChromux']);
const CUSTOM_TAB_GROUP_ID_RE = /^group-[a-z0-9-]{1,64}$/;
const PREFERENCES_FILE = path.join(CHROMUX_HOME, 'preferences.json');
const FAVORITES_FILE = path.join(CHROMUX_HOME, 'favorites.json');
const PROJECTS_FILE = path.join(CHROMUX_HOME, 'projects.json');
const PROMPT_HISTORY_FILE = path.join(CHROMUX_HOME, 'prompt-history.json');
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
const WINDOW_BUTTON_COORD_MAX = 200;
const GIT_CWD_MAX = 4096;
const GIT_ROOT_TIMEOUT_MS = 2500;
const HTML_INDEX_MAX_FILES = 10000;
const HTML_INDEX_INPUT_MAX = 4096;
const HTML_INDEX_EXCLUDED_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'bower_components',
  '.npm', '.pnpm-store', '.yarn', '.cache', '.turbo',
  'vendor', '.venv', 'venv', 'Pods',
]);

function boundedSetupDiagnostic(value) {
  return String(value || '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[^\x20-\x7e\r\n\t]/g, '')
    .trim()
    .slice(-2000);
}

let win = null;
const ptys = new Map(); // sessionId -> IPty
const deliveries = new Map(); // deliveryId -> ChildProcess
let closeConfirmed = false;
let preventSleepController = null;
let captureCoordinator = null;
let captureControlServer = null;
let displayMediaGrant = null;
let captureRendererSequence = 0;
let previewRendererSequence = 0;
let captureShutdownComplete = false;
let captureShutdownPromise = null;
const captureRendererPending = new Map();
const previewRendererPending = new Map();
const wslRuntime = new WslRuntime();
let runtimeState = {
  kind: process.platform === 'win32' ? 'wsl' : 'host',
  selectedDistro: null,
  distros: [],
  readiness: { ready: process.platform !== 'win32', checks: [], error: null },
  home: process.platform === 'win32' ? '/home' : os.homedir(),
};
let windowsSetupStatus = null;
let windowsHookWarning = null;
const shortcutFocusContexts = new Map(); // webContentsId -> { focusKind }
const shortcutRouteLog = [];
const resourceClient = new BrokerClient({ client: {
  clientId: `chromux-app:${process.pid}`,
  displayName: 'Chromux desktop app',
  pid: process.pid,
  cooperative: true,
} });
const promptHistory = createPromptHistoryStore({ filePath: PROMPT_HISTORY_FILE });
const codexDetectMetadata = process.platform === 'win32'
  ? createCodexDetectMetadata({
    resolveExecutable: () => runtimeState.selectedDistro ? 'wsl.exe' : null,
    spawnProcess: (_file, args, options) => spawn('wsl.exe', [
      '--distribution', runtimeState.selectedDistro, '--exec', 'codex', ...args,
    ], options),
  })
  : createCodexDetectMetadata();
const codexUpdateService = process.platform === 'win32'
  ? createCodexUpdateService({
    resolveExecutable: () => runtimeState.selectedDistro ? 'codex' : null,
    run: (_file, args) => wslRuntime.run(runtimeState.selectedDistro, ['codex', ...args]),
  })
  : createCodexUpdateService();

function readPreferences() {
  try {
    const payload = JSON.parse(fs.readFileSync(PREFERENCES_FILE, 'utf8'));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  } catch { return {}; }
}

function writePreference(name, value) {
  ensureDirs();
  const payload = readPreferences();
  const temporary = `${PREFERENCES_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ...payload, [name]: value }, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, PREFERENCES_FILE);
  try { fs.chmodSync(PREFERENCES_FILE, 0o600); } catch { /* best effort */ }
}

function readDevModePreference() {
  const payload = readPreferences();
  return typeof payload.devMode === 'boolean' ? payload.devMode : null;
}

function writeDevModePreference(enabled) {
  writePreference('devMode', enabled);
}

async function readWslShellValue(name) {
  if (!runtimeState.selectedDistro) return '';
  const commands = {
    P_BASE: 'printf %s "${P_BASE:-}"',
    XDG_CACHE_HOME: 'printf %s "${XDG_CACHE_HOME:-}"',
    P_NP_HOOK: 'printf %s "${P_NP_HOOK:-}"',
  };
  if (!commands[name]) return '';
  try {
    const result = await wslRuntime.run(runtimeState.selectedDistro, ['bash', '-lc', commands[name]]);
    const value = result.stdout.trim();
    return value.includes('\0') || value.includes('\n') ? '' : value;
  } catch {
    return '';
  }
}

function persistedProjectsRoot(kind, distro = null) {
  const roots = readPreferences().projectsRoots;
  if (!roots || typeof roots !== 'object' || Array.isArray(roots)) return null;
  if (kind === 'host') return typeof roots.host === 'string' ? roots.host : null;
  const wsl = roots.wsl;
  return wsl && typeof wsl === 'object' && !Array.isArray(wsl) && typeof wsl[distro] === 'string'
    ? wsl[distro]
    : null;
}

function persistProjectsRoot(kind, distro, root) {
  const current = readPreferences().projectsRoots;
  const roots = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  if (kind === 'host') {
    writePreference('projectsRoots', { ...roots, host: root });
    return;
  }
  const wsl = roots.wsl && typeof roots.wsl === 'object' && !Array.isArray(roots.wsl) ? roots.wsl : {};
  writePreference('projectsRoots', { ...roots, wsl: { ...wsl, [distro]: root } });
}

async function projectScaffolderAdapter() {
  if (process.platform !== 'win32') {
    return createHostAdapter({ home: os.homedir(), env: process.env });
  }
  if (!runtimeState.selectedDistro) throw new Error('Choose a ready WSL2 distribution first.');
  wslRuntime.select(runtimeState.selectedDistro);
  const [pBase, xdgCacheHome, hook] = await Promise.all([
    readWslShellValue('P_BASE'),
    readWslShellValue('XDG_CACHE_HOME'),
    readWslShellValue('P_NP_HOOK'),
  ]);
  return createWslAdapter({
    runtime: wslRuntime,
    distro: runtimeState.selectedDistro,
    home: runtimeState.home,
    env: { P_BASE: pBase, XDG_CACHE_HOME: xdgCacheHome, P_NP_HOOK: hook },
  });
}

async function projectScaffolderContext() {
  const adapter = await projectScaffolderAdapter();
  const config = await loadScaffolderConfig({
    adapter,
    projectsRoot: persistedProjectsRoot(adapter.kind, adapter.distro),
  });
  return { adapter, config };
}

const DEV_MODE = resolveDevMode({
  argv: process.argv,
  persisted: readDevModePreference(),
  isPackaged: app.isPackaged,
});

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

const hasSingleInstanceLock = !squirrelStartup && app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

async function initializeRuntime() {
  if (process.platform !== 'win32') return runtimeState;
  const support = windowsSupport();
  if (!support.supported) {
    runtimeState.readiness = { ready: false, checks: [], error: support.error };
    return runtimeState;
  }
  try {
    const distros = await wslRuntime.list();
    const persisted = readPreferences().wslDistro;
    const selected = distros.find((distro) => distro.name === persisted && distro.version === 2)
      || distros.find((distro) => distro.default && distro.version === 2)
      || distros.find((distro) => distro.version === 2)
      || null;
    runtimeState = {
      ...runtimeState,
      distros,
      selectedDistro: selected && selected.name,
      readiness: selected
        ? await wslRuntime.readiness(selected.name)
        : { ready: false, checks: [], error: 'Install and initialize a WSL2 distribution before using Chromux.' },
    };
    if (selected) {
      try {
        const result = await wslRuntime.run(selected.name, ['bash', '-lc', 'printf %s \"$HOME\"']);
        if (result.stdout.trim().startsWith('/')) runtimeState.home = result.stdout.trim();
      } catch { /* readiness contains the actionable failure */ }
    }
  } catch (error) {
    runtimeState = {
      ...runtimeState,
      readiness: { ready: false, checks: [], error: `WSL2 could not be enumerated: ${error.message}` },
    };
  }
  return runtimeState;
}

async function refreshWindowsSetupStatus({ migrateExisting = false } = {}) {
  if (process.platform !== 'win32') {
    windowsSetupStatus = null;
    return null;
  }
  const preferences = readPreferences();
  const selected = runtimeState.selectedDistro;
  const root = selected ? persistedProjectsRoot('wsl', selected) : null;
  windowsSetupStatus = await buildSetupStatus({
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    runtime: wslRuntime,
    distros: runtimeState.distros,
    selectedDistro: selected,
    root,
    home: runtimeState.home,
    completion: preferences.windowsSetup,
    hookWarning: windowsHookWarning,
    migrateExisting: migrateExisting
      && Boolean(selected)
      && Boolean(root),
  });
  if (!preferences.windowsSetup && windowsSetupStatus?.completion) {
    writePreference('windowsSetup', windowsSetupStatus.completion);
  }
  return windowsSetupStatus;
}

function selectedWorkspace(input) {
  const location = workspaceLocation(input, {
    platform: process.platform,
    selectedDistro: runtimeState.selectedDistro,
  });
  if (location.runtime === 'wsl') wslRuntime.select(location.distro);
  return location;
}

function hostPath(input) {
  const location = selectedWorkspace(input);
  return location.runtime === 'wsl' ? linuxPathToWindows(location.cwd, location.distro) : location.cwd;
}

function workspaceFromWindowsPath(input, requestedDistro = null) {
  const unc = /^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(?:\\(.*))?$/i.exec(String(input || ''));
  const distro = unc ? unc[1] : (requestedDistro || runtimeState.selectedDistro);
  wslRuntime.select(distro);
  return { runtime: 'wsl', distro, cwd: windowsPathToLinux(input) };
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
  const projectName = typeof pkg.name === 'string' && pkg.name.trim()
    ? pkg.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, PROJECT_NAME_MAX)
    : path.basename(resolved);
  const recommendedScript = ['dev', 'start', 'serve', 'preview'].find((name) => scripts.includes(name)) || null;
  return { valid: true, cwd: resolved, source: 'package.json', runner, scripts, projectName, recommendedScript };
}

function resolveProjectScript(cwd, script) {
  const config = packageProjectConfig(cwd);
  const selected = typeof script === 'string' ? script.trim() : '';
  if (!config.valid) return config;
  if (!selected || !config.scripts.includes(selected)) {
    return { valid: false, reason: 'Choose a validated package script.' };
  }
  return {
    valid: true,
    cwd: config.cwd,
    source: config.source,
    runner: config.runner,
    script: selected,
    projectName: config.projectName,
    command: `${config.runner} run ${shellQuote(selected)}`,
  };
}

function normalizeProjectRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  let location;
  try { location = selectedWorkspace(record.location || record); } catch { return null; }
  const config = packageProjectConfig(location.runtime === 'wsl' ? linuxPathToWindows(location.cwd, location.distro) : location.cwd);
  const script = typeof record.script === 'string' ? record.script.trim() : '';
  if (!config.valid || !config.scripts.includes(script)) return null;
  const name = typeof record.name === 'string' ? record.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, PROJECT_NAME_MAX) : '';
  return {
    name: name || path.posix.basename(location.cwd),
    runtime: location.runtime,
    distro: location.distro,
    cwd: location.cwd,
    source: config.source,
    script,
    runner: config.runner,
    startCommand: `${config.runner} run ${shellQuote(script)}`,
  };
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

function captureWindowTargetId() {
  return win && !win.isDestroyed() ? `chromux-window:${win.id}` : null;
}

function requestCaptureRenderer(action, payload = {}, timeoutMs = 35_000) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return Promise.reject(new Error('Chromux window is not available for capture approval.'));
  }
  const requestId = `capture-rpc-${process.pid}-${++captureRendererSequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      captureRendererPending.delete(requestId);
      const error = new Error('Capture approval timed out and was denied.');
      error.code = 'CAPTURE_DENIED';
      reject(error);
    }, timeoutMs);
    captureRendererPending.set(requestId, { resolve, reject, timer, action });
    win.webContents.send('capture-control-request', { requestId, action, payload });
  });
}

function requestPreviewRenderer(payload = {}, timeoutMs = 5000) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return Promise.reject(new Error('Chromux window is not available.'));
  }
  const requestId = `preview-rpc-${process.pid}-${++previewRendererSequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      previewRendererPending.delete(requestId);
      reject(new Error('Chromux browser queue request timed out.'));
    }, timeoutMs);
    previewRendererPending.set(requestId, { resolve, reject, timer });
    win.webContents.send('browser-queue-request', { requestId, payload });
  });
}

function normalizeExplicitPreviewRequest(params = {}) {
  return normalizeBrowserQueueRequest(params, {
    sessionForId: (sessionId) => ptys.get(sessionId),
    platform: process.platform,
    linuxPathToWindows,
  });
}

async function addExplicitBrowserQueue(params = {}) {
  const request = normalizeExplicitPreviewRequest(params);
  return requestPreviewRenderer(request);
}

function decodeCaptureBase64(value, maxBytes, label) {
  if (typeof value !== 'string' || !value || value.length > Math.ceil(maxBytes * 4 / 3) + 16) {
    throw new Error(`${label} is missing or too large`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`${label} is missing or too large`);
  return bytes;
}

function configureDisplayMediaCapture() {
  if (!win || win.isDestroyed()) return;
  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    const grant = displayMediaGrant;
    displayMediaGrant = null;
    const valid = grant
      && grant.expiresAt > Date.now()
      && request.videoRequested
      && request.frame
      && request.frame.top === request.frame
      && request.frame.url.startsWith('file:');
    if (!valid) {
      callback({});
      return;
    }
    callback({
      video: { id: grant.sourceId, name: 'Chromux window' },
      ...(request.audioRequested ? { audio: 'loopback' } : {}),
    });
  }, { useSystemPicker: false });
}

async function captureTargetsProvider() {
  const windowId = captureWindowTargetId();
  if (!windowId) return [];
  let browsers = [];
  try {
    const result = await requestCaptureRenderer('targets-list', {}, 5000);
    browsers = Array.isArray(result?.targets) ? result.targets : [];
  } catch { /* renderer may still be loading */ }
  const supported = process.platform === 'darwin';
  return [
    {
      targetId: windowId,
      kind: 'window',
      label: 'Chromux window',
      supportsScreenshot: supported,
      supportsRecording: supported,
    },
    ...browsers.map((target) => ({
      targetId: target.targetId,
      kind: 'browser',
      label: target.label,
      supportsScreenshot: supported && target.supportsScreenshot !== false,
      supportsRecording: false,
    })),
  ];
}

async function captureScreenshotProvider({ target, caller }) {
  if (target.kind === 'window') {
    const approval = await requestCaptureRenderer('approval', {
      captureType: 'screenshot',
      requester: caller,
      target: {
        targetId: target.targetId,
        kind: target.kind,
        label: target.label,
      },
    });
    if (!approval?.approved) return { approved: false, reason: approval?.reason };
    if (!win || win.isDestroyed()) throw new Error('Chromux window closed before capture.');
    const image = await win.webContents.capturePage();
    return {
      approved: true,
      png: image.toPNG(),
      capturedAt: new Date().toISOString(),
      dimensions: image.getSize(),
      metadata: { mode: 'whole-chromux-window' },
    };
  }
  const evidence = await requestCaptureRenderer('browser-screenshot', {
    requester: caller,
    target: {
      targetId: target.targetId,
      kind: target.kind,
      label: target.label,
    },
  });
  if (!evidence?.approved) return { approved: false, reason: evidence?.reason };
  return {
    approved: true,
    png: decodeCaptureBase64(evidence.pngBase64, 12 * 1024 * 1024, 'browser screenshot'),
    payload: evidence.payload,
    capturedAt: evidence.capturedAt,
    dimensions: evidence.dimensions || null,
    metadata: { mode: 'visible-browser-viewport' },
    result: {
      pageUrl: evidence.pageUrl,
      title: evidence.title || null,
      visibleText: evidence.visibleText || '',
      visibleTextTruncated: Boolean(evidence.visibleTextTruncated),
      console: evidence.console || { total: 0, entries: [] },
    },
  };
}

async function captureRecordApprover({ recordingId: id, target, caller }) {
  return requestCaptureRenderer('approval', {
    recordingId: id,
    captureType: 'recording',
    requester: caller,
    target: {
      targetId: target.targetId,
      kind: target.kind,
      label: target.label,
    },
  });
}

async function captureRecordStarter({ recordingId: id, target, caller }) {
  if (!win || win.isDestroyed()) throw new Error('Chromux window closed before recording.');
  const startStream = async (audio) => {
    displayMediaGrant = {
      recordingId: id,
      sourceId: win.getMediaSourceId(),
      expiresAt: Date.now() + 10_000,
    };
    try {
      return await requestCaptureRenderer('record-start-stream', {
        recordingId: id,
        targetId: target.targetId,
        requester: caller,
        deadlineMs: 60_000,
        audio,
      }, 25_000);
    } finally {
      if (displayMediaGrant?.recordingId === id) displayMediaGrant = null;
    }
  };
  try {
    return await startStream(true);
  } catch (error) {
    if (error.code !== 'CAPTURE_AUDIO_RETRY') throw error;
    return startStream(false);
  }
}

async function captureRecordStopper({ recordingId: id, reason }) {
  await requestCaptureRenderer('record-stop', { recordingId: id, reason }, 15_000);
}

async function initializeCaptureControl() {
  if (captureControlServer) return;
  const store = new CaptureArtifactStore({ root: CAPTURES_DIR });
  captureCoordinator = new CaptureCoordinator({
    platform: process.platform,
    store,
    targetsProvider: captureTargetsProvider,
    screenshotProvider: captureScreenshotProvider,
    recordApprover: captureRecordApprover,
    recordStarter: captureRecordStarter,
    recordStopper: captureRecordStopper,
  });
  captureControlServer = new CaptureControlServer({
    chromuxHome: CHROMUX_HOME,
    dispatch: (method, params, caller) => (
      method === 'browser.queue.add'
        ? addExplicitBrowserQueue(params, caller)
        : captureCoordinator.dispatch(method, params, caller)
    ),
    onDisconnect: (caller) => captureCoordinator.disconnect(caller),
  });
  await captureControlServer.start();
}

ipcMain.on('capture-control-response', (event, message = {}) => {
  if (!win || event.sender !== win.webContents) return;
  const pending = captureRendererPending.get(message.requestId);
  if (!pending) return;
  captureRendererPending.delete(message.requestId);
  clearTimeout(pending.timer);
  if (message.error) {
    const error = new Error(message.error.message || `Capture renderer request failed: ${pending.action}`);
    error.code = message.error.code || null;
    pending.reject(error);
  } else {
    pending.resolve(message.result);
  }
});

ipcMain.on('browser-queue-response', (event, message = {}) => {
  if (!win || event.sender !== win.webContents) return;
  const pending = previewRendererPending.get(message.requestId);
  if (!pending) return;
  previewRendererPending.delete(message.requestId);
  clearTimeout(pending.timer);
  if (message.error) pending.reject(new Error(message.error.message || 'Browser queue request failed.'));
  else pending.resolve(message.result);
});

ipcMain.on('capture-record-chunk', (event, message = {}) => {
  if (!win || event.sender !== win.webContents || !captureCoordinator) return;
  try {
    const chunk = decodeCaptureBase64(message.chunkBase64, 4 * 1024 * 1024, 'recording chunk');
    captureCoordinator.appendChunk(message.recordingId, chunk);
  } catch (error) {
    console.error(`capture recording chunk rejected: ${error.message}`);
  }
});

ipcMain.on('capture-record-complete', (event, message = {}) => {
  if (!win || event.sender !== win.webContents || !captureCoordinator) return;
  try {
    const contactSheet = message.contactSheetBase64
      ? decodeCaptureBase64(message.contactSheetBase64, 8 * 1024 * 1024, 'recording contact sheet')
      : null;
    captureCoordinator.complete(message.recordingId, {
      contactSheet,
      metadata: message.metadata || {},
    });
  } catch (error) {
    console.error(`capture recording completion rejected: ${error.message}`);
  }
});

function initializePreventSleep() {
  const persisted = readPreferences().preventSleep === true;
  preventSleepController = createPreventSleepController({
    powerSaveBlocker,
    onStatus(status) {
      try { writePreference('preventSleep', status.enabled); } catch (err) { console.error('prevent sleep preference write failed:', err.message); }
      send('prevent-sleep-status', status);
    },
  });
  if (persisted) preventSleepController.setEnabled(true);
  return preventSleepController.status();
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
  if (['j', 'b', 'f', 't', 'd', 'q', 'enter'].includes(lower)) return lower === 'enter' ? 'Enter' : lower.toUpperCase();
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

function validWindowButtonPosition(position) {
  return Boolean(position)
    && Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && Number.isInteger(position.x)
    && Number.isInteger(position.y)
    && position.x >= 0
    && position.y >= 0
    && position.x <= WINDOW_BUTTON_COORD_MAX
    && position.y <= WINDOW_BUTTON_COORD_MAX;
}

ipcMain.on('set-window-button-position', (event, position) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
  if (!validWindowButtonPosition(position)) return;
  if (process.platform !== 'darwin' || typeof win.setWindowButtonPosition !== 'function') return;
  win.setWindowButtonPosition({ x: position.x, y: position.y });
});

function handleShellShortcutInput(event, input, source = 'host', webContentsId = null) {
  emitShortcutDebugInput(input, source, webContentsId);
  const action = chromuxShortcutAction(input || {}, process.platform);
  const context = shortcutFocusContextForSource(source, webContentsId);
  const focusKind = classifyShortcutFocusContext(context);
  if (!action || !shouldRouteChromuxShortcut(input || {}, context, process.platform)) {
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
  if (action.id === CHROMUX_SHORTCUT_ACTIONS.BROWSER_FULLSCREEN) {
    send('shortcut-browser-fullscreen');
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
  if (action.id === CHROMUX_SHORTCUT_ACTIONS.CREATE_PROJECT) {
    send('shortcut-create-project');
    return true;
  }
  if (action.id === CHROMUX_SHORTCUT_ACTIONS.DETECT) {
    send('shortcut-open-detect-modal');
    return true;
  }
  if (action.id === CHROMUX_SHORTCUT_ACTIONS.COMPOSER_OPEN) {
    send('shortcut-open-composer');
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
      label: 'File',
      submenu: [
        {
          label: 'Open Existing…',
          accelerator: 'CommandOrControl+T',
          click: () => {
            const context = shortcutFocusContextForSource('host');
            if (['terminal', 'appSurface'].includes(classifyShortcutFocusContext(context))) {
              send('shortcut-open-new-session');
            }
          },
        },
        {
          label: 'Create Project…',
          accelerator: 'CommandOrControl+N',
          click: () => {
            const context = shortcutFocusContextForSource('host');
            if (['terminal', 'appSurface'].includes(classifyShortcutFocusContext(context))) {
              send('shortcut-create-project');
            }
          },
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
        {
          label: 'Toggle Browser Fullscreen',
          accelerator: 'CommandOrControl+Shift+F',
          click: () => send('shortcut-browser-fullscreen'),
        },
        {
          label: 'Open Terminal Composer',
          accelerator: 'CommandOrControl+Shift+Enter',
          click: () => send('shortcut-open-composer'),
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
const requestedResumeId = agent === 'codex' ? payload['thread-id'] : payload.session_id;
const resumeId = typeof requestedResumeId === 'string'
  && /^[0-9a-f][0-9a-f-]{15,127}$/i.test(requestedResumeId) ? requestedResumeId : null;
if (event === 'turn-started' || !state.turnId) state.turnId = boundedTurnId || crypto.randomUUID();
const envelope = { v: 2, sessionId, token, agent, event, reason,
  message: text.slice(0, 1024) || null, turnId: state.turnId, eventId: crypto.randomUUID(),
  sequence: state.sequence, timestamp: Date.now(), source: agent + ':' + nativeEvent,
  confidence: event === 'unknown-notification' ? 'low' : 'high', stopped, resumeId };
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
let runtimeHookPaths = { claude: HOOKS_CLAUDE, codex: CODEX_NOTIFY, grok: HOOKS_GROK };

function writeWslFile(distro, file, content, mode = '700') {
  return new Promise(async (resolve, reject) => {
    try {
      await wslRuntime.run(distro, ['mkdir', '-p', path.posix.dirname(file)]);
    } catch (error) {
      reject(error);
      return;
    }
    const child = spawn('wsl.exe', ['--distribution', distro, '--exec', 'tee', file], {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', async (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Could not write ${file}`));
        return;
      }
      try {
        await wslRuntime.run(distro, ['chmod', mode, file]);
        resolve();
      } catch (error) { reject(error); }
    });
    child.stdin.end(content);
  });
}

async function installWslHooks() {
  const distro = runtimeState.selectedDistro;
  if (!distro || !runtimeState.readiness.ready) return;
  writeSignalClassifier();
  const base = `${runtimeState.home}/.chromux`;
  const classifier = `${base}/signal-classifier.js`;
  const claudeSettings = `${base}/hooks-claude.json`;
  const codexNotify = `${base}/codex-notify.sh`;
  const grokScript = `${base}/grok-hook.sh`;
  const grokSettings = `${base}/hooks-grok.json`;
  const classifierRun = (agent, event, arg = '') => `node ${shellQuote(classifier)} ${agent} ${event}${arg ? ` ${arg}` : ''}`;
  const claudeHook = (event) => [{ hooks: [{ type: 'command', command: classifierRun('claude', event) }] }];
  const claude = JSON.stringify({ hooks: {
    UserPromptSubmit: claudeHook('UserPromptSubmit'),
    Notification: claudeHook('Notification'),
    Stop: claudeHook('Stop'),
  } }, null, 2) + '\n';
  const codex = `#!/bin/sh\n[ -n "$CHROMUX_SESSION_ID" ] || exit 0\n${classifierRun('codex', 'agent-turn-complete', '"$1"')} >/dev/null 2>&1\n`;
  const grok = `#!/bin/sh\n[ -n "$CHROMUX_SESSION_ID" ] || exit 0\n${classifierRun('grok', '"$1"')} >/dev/null 2>&1 || true\n`;
  const grokHook = (event) => [{ hooks: [{ type: 'command', command: `${shellQuote(grokScript)} ${event}` }] }];
  const grokJson = JSON.stringify({ hooks: {
    UserPromptSubmit: grokHook('UserPromptSubmit'),
    Notification: grokHook('Notification'),
    Stop: grokHook('Stop'),
  } }, null, 2) + '\n';
  await writeWslFile(distro, classifier, fs.readFileSync(SIGNAL_CLASSIFIER), '700');
  await writeWslFile(distro, claudeSettings, claude, '600');
  await writeWslFile(distro, codexNotify, codex, '700');
  await writeWslFile(distro, grokScript, grok, '700');
  await writeWslFile(distro, grokSettings, grokJson, '600');
  await wslRuntime.run(distro, ['mkdir', '-p', `${runtimeState.home}/.grok/hooks`]);
  await writeWslFile(distro, `${runtimeState.home}/.grok/hooks/${GROK_HOOKS_INSTALL_NAME}`, grokJson, '600');
  runtimeHookPaths = { claude: claudeSettings, codex: codexNotify, grok: grokSettings };
  hookInstall.helper = true;
  hookInstall.claude = true;
  hookInstall.codex = true;
  hookInstall.grok = true;
}

const RESUME_ID_RE = /^[0-9a-f][0-9a-f-]{15,127}$/i;

function sanitizeResumeId(value) {
  return typeof value === 'string' && RESUME_ID_RE.test(value) ? value : null;
}

// POSIX single-quoting: close the quote, emit an escaped ', reopen. Safe for
// any byte the filesystem allows (spaces, quotes, backslashes).
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function claudeCommand(resumeId = null) {
  const base = hookInstall.claude ? `claude --settings ${shellQuote(runtimeHookPaths.claude)}` : 'claude';
  return resumeId ? `${base} --resume ${shellQuote(resumeId)}` : base;
}

const CODEX_COMPAT_TERM = 'xterm-color';
const CODEX_ANSI_THEME_CONFIG = 'tui.theme="ansi"';
const CODEX_UPDATE_CONFIG = 'check_for_update_on_startup=false';

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
  const notifyToml = `notify=["${runtimeHookPaths.codex.replace(/[\\"]/g, '\\$&')}"]`;
  const configs = [
    CODEX_ANSI_THEME_CONFIG,
    ...(hookInstall.codex ? [notifyToml] : []),
    CODEX_UPDATE_CONFIG,
  ];
  // TERM is scoped to Codex, so the surrounding Chromux shell keeps its
  // normal xterm-256color capability after Codex exits.
  const base = `TERM=${CODEX_COMPAT_TERM} codex ${configs
    .map((value) => `-c ${shellQuote(value)}`).join(' ')}`;
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

function normalizedActivityTimestamp(value, fallback = null) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  const fallbackParsed = typeof fallback === 'string' ? Date.parse(fallback) : NaN;
  return Number.isFinite(fallbackParsed) ? new Date(fallbackParsed).toISOString() : null;
}

function sanitizeBrowserContextReference(context) {
  if (!context || typeof context !== 'object') return null;
  if (typeof context.payloadPath !== 'string' || !context.payloadPath
    || context.payloadPath.length > MAX_RESTORE_PATH_CHARS) return null;
  if (typeof context.url !== 'string' || context.url.length > 8192) return null;
  try {
    const parsed = new URL(context.url);
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  } catch { return null; }
  const screenshotPath = typeof context.screenshotPath === 'string' && context.screenshotPath
    && context.screenshotPath.length <= MAX_RESTORE_PATH_CHARS
    ? context.screenshotPath : null;
  return {
    captureId: typeof context.captureId === 'string' ? context.captureId.slice(0, 200) : '',
    payloadPath: context.payloadPath,
    screenshotPath,
    url: context.url,
    title: typeof context.title === 'string' ? context.title.slice(0, 500) : '',
    capturedAt: normalizedActivityTimestamp(context.capturedAt) || new Date().toISOString(),
    visibleTextTruncated: Boolean(context.visibleTextTruncated),
  };
}

function sanitizeRestoreSession(session) {
  if (!session || typeof session !== 'object') return null;
  const runtime = session.runtime === 'wsl' || (process.platform === 'win32' && session.runtime !== 'host') ? 'wsl' : 'host';
  const distro = runtime === 'wsl'
    ? (typeof session.distro === 'string' && session.distro ? session.distro : runtimeState.selectedDistro)
    : null;
  let cwd = typeof session.cwd === 'string' && session.cwd ? session.cwd : (runtime === 'wsl' ? runtimeState.home : os.homedir());
  if (runtime === 'wsl') {
    try { cwd = windowsPathToLinux(cwd); } catch { /* retain unresolved legacy POSIX path */ }
  }
  const agent = KNOWN_AGENTS.includes(session.agent) ? session.agent : '';
  const queue = Array.isArray(session.queue)
    ? session.queue.slice(0, 50).map((item) => ({
      url: typeof item.url === 'string' ? item.url : '',
      source: typeof item.reason === 'string' && item.reason.trim() && typeof item.source === 'string' && item.source
        ? item.source
        : 'RESTORE',
      reason: typeof item.reason === 'string' && item.reason.trim()
        ? item.reason.trim()
        : QUEUE_REASON_BY_SOURCE.RESTORE,
      detectedText: typeof item.detectedText === 'string' && item.detectedText ? item.detectedText : null,
      visibility: item.visibility === 'browser' ? 'browser' : 'attention',
      ts: Number.isFinite(item.ts) ? item.ts : Date.now(),
    })).filter((item) => item.url)
    : [];
  const composerDraft = typeof session.composerDraft === 'string'
    && Buffer.byteLength(session.composerDraft, 'utf8') <= MAX_DRAFT_BYTES
    ? session.composerDraft
    : null;
  const stagedBrowserContexts = (Array.isArray(session.stagedBrowserContexts)
    ? session.stagedBrowserContexts : [])
    .map(sanitizeBrowserContextReference)
    .filter(Boolean)
    .slice(0, MAX_STAGED_BROWSER_CONTEXTS);
  const browserLayoutMode = BROWSER_LAYOUT_MODES.has(session.browserLayoutMode)
    ? session.browserLayoutMode : 'terminal';
  const attentionRecords = Array.isArray(session.attentionRecords)
    ? session.attentionRecords.slice(0, MAX_RESTORE_ATTENTION_RECORDS).map((record) => {
      if (!record || typeof record !== 'object' || !RESTORE_ATTENTION_TYPES.has(record.type)) return null;
      if (typeof record.id !== 'string' || record.id.length === 0
        || record.id.length > MAX_RESTORE_ATTENTION_ID_CHARS
        || !/^[A-Za-z0-9:_-]+$/.test(record.id)) return null;
      if (typeof record.detail !== 'string'
        || Buffer.byteLength(record.detail, 'utf8') > MAX_RESTORE_ATTENTION_DETAIL_BYTES) return null;
      if (!Number.isFinite(record.occurredAt) || record.occurredAt <= 0) return null;
      return {
        id: record.id,
        type: record.type,
        detail: record.detail,
        occurredAt: record.occurredAt,
      };
    }).filter(Boolean)
    : [];
  const browserTabIds = new Set();
  const browserTabs = Array.isArray(session.browserTabs)
    ? session.browserTabs.slice(0, 50).map((tab, index) => {
      if (!tab || typeof tab !== 'object') return null;
      const type = tab.type === 'explorer' ? 'explorer' : 'page';
      let id = typeof tab.id === 'string' && tab.id ? tab.id.slice(0, 100) : `${type}-${index}`;
      while (browserTabIds.has(id)) id = `${type}-${index}-${browserTabIds.size}`;
      browserTabIds.add(id);
      if (tab.type === 'explorer') {
        return {
          id,
          type: 'explorer',
          title: 'Project HTML',
          path: typeof tab.path === 'string' ? tab.path.slice(0, HTML_INDEX_INPUT_MAX) : '',
          query: typeof tab.query === 'string' ? tab.query.slice(0, 500) : '',
        };
      }
      if (tab.type !== 'page' || typeof tab.url !== 'string' || !tab.url) return null;
      try {
        const parsed = new URL(tab.url);
        if (!['http:', 'https:', 'file:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
      } catch { return null; }
      return {
        id,
        type: 'page',
        url: tab.url.slice(0, 8192),
        title: typeof tab.title === 'string' && tab.title ? tab.title.slice(0, 200) : tab.url.slice(0, 200),
      };
    }).filter(Boolean)
    : [];
  if (browserTabs.length === 0 && typeof session.currentUrl === 'string' && session.currentUrl) {
    browserTabs.push({ id: 'legacy-page', type: 'page', url: session.currentUrl, title: session.currentUrl.slice(0, 200) });
  }
  const activeBrowserTabId = browserTabs.some((tab) => tab.id === session.activeBrowserTabId)
    ? session.activeBrowserTabId
    : (browserTabs[0] ? browserTabs[0].id : null);
  return {
    name: String(session.name || path.basename(cwd) || 'session').slice(0, 80),
    runtime,
    distro,
    unresolved: runtime === 'wsl' && !runtimeState.distros.some((candidate) => candidate.name === distro && candidate.version === 2),
    cwd,
    agent,
    resumeId: sanitizeResumeId(session.resumeId),
    ...(typeof session.customTabGroupId === 'string' && CUSTOM_TAB_GROUP_ID_RE.test(session.customTabGroupId)
      ? { customTabGroupId: session.customTabGroupId }
      : {}),
    ...(typeof session.wasActive === 'boolean' ? { wasActive: session.wasActive } : {}),
    ...(typeof session.wasLastActiveInGroup === 'boolean'
      ? { wasLastActiveInGroup: session.wasLastActiveInGroup }
      : {}),
    alive: session.alive !== false,
    currentUrl: typeof session.currentUrl === 'string' && session.currentUrl ? session.currentUrl : null,
    browserTabs,
    activeBrowserTabId,
    queue,
    ...(normalizedActivityTimestamp(session.lastActivityAt)
      ? { lastActivityAt: normalizedActivityTimestamp(session.lastActivityAt) }
      : {}),
    savedAt: typeof session.savedAt === 'string' ? session.savedAt : new Date().toISOString(),
    opened: Boolean(session.opened),
    restoredAt: typeof session.restoredAt === 'string' ? session.restoredAt : null,
    ...(attentionRecords.length > 0 ? { attentionRecords } : {}),
    ...(composerDraft ? { composerDraft } : {}),
    ...(stagedBrowserContexts.length > 0 ? { stagedBrowserContexts } : {}),
    browserLayoutMode,
    fullBrowserComposerOpen: Boolean(
      (session.fullBrowserComposerOpen || session.chatOpen)
      && browserLayoutMode === 'browserChromux'
    ),
  };
}

function sanitizeInboxTriage(records) {
  if (!Array.isArray(records)) return [];
  return records.slice(-MAX_INBOX_TRIAGE_RECORDS).map((record) => {
    if (!record || typeof record !== 'object') return null;
    if (typeof record.id !== 'string' || record.id.length === 0
      || record.id.length > MAX_RESTORE_ATTENTION_ID_CHARS) return null;
    if (!['done', 'snoozed'].includes(record.state)) return null;
    const updatedAt = normalizedActivityTimestamp(record.updatedAt);
    const snoozedUntil = record.state === 'snoozed' ? normalizedActivityTimestamp(record.snoozedUntil) : null;
    if (!updatedAt || (record.state === 'snoozed' && !snoozedUntil)) return null;
    return {
      id: record.id,
      state: record.state,
      updatedAt,
      ...(snoozedUntil ? { snoozedUntil } : {}),
      reopenToken: typeof record.reopenToken === 'string'
        ? record.reopenToken.slice(0, MAX_RESTORE_ATTENTION_ID_CHARS) : '',
    };
  }).filter(Boolean);
}

function writeRestoreSnapshot({
  sessions,
  inboxTriage = [],
  reason = 'manual',
  restoreId = null,
  savedAt = null,
  consumed = false,
  consumedAt = null,
}) {
  ensureDirs();
  const snapshotSavedAt = normalizedActivityTimestamp(savedAt) || new Date().toISOString();
  const clean = Array.isArray(sessions) ? sessions.map(sanitizeRestoreSession).filter(Boolean)
    .map((session) => ({
      ...session,
      lastActivityAt: normalizedActivityTimestamp(session.lastActivityAt, snapshotSavedAt),
    })) : [];
  const payload = {
    schemaVersion: 10,
    restoreId: restoreId || `restore-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    reason,
    savedAt: snapshotSavedAt,
    consumed: Boolean(consumed),
    consumedAt: consumedAt || null,
    inboxTriage: sanitizeInboxTriage(inboxTriage),
    sessions: clean,
  };
  fs.writeFileSync(RESTORE_SESSIONS, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

function readRestoreSnapshot() {
  const payload = readJson(RESTORE_SESSIONS);
  if (!payload || !Array.isArray(payload.sessions)) return null;
  const schemaVersion = Number.isSafeInteger(payload.schemaVersion) && payload.schemaVersion > 0
    ? payload.schemaVersion : 1;
  const snapshotSavedAt = normalizedActivityTimestamp(payload.savedAt) || new Date(0).toISOString();
  return {
    schemaVersion,
    restoreId: payload.restoreId || `legacy-${payload.savedAt || 'unknown'}`,
    reason: payload.reason || 'unknown',
    savedAt: snapshotSavedAt,
    consumed: Boolean(payload.consumed),
    consumedAt: payload.consumedAt || null,
    inboxTriage: schemaVersion >= 10 ? sanitizeInboxTriage(payload.inboxTriage) : [],
    sessions: payload.sessions.map(sanitizeRestoreSession).filter(Boolean).map((session) => {
      const clean = {
        ...session,
        lastActivityAt: normalizedActivityTimestamp(
          schemaVersion >= 7 ? session.lastActivityAt : null,
          snapshotSavedAt,
        ),
      };
      if (schemaVersion < 8) {
        delete clean.customTabGroupId;
        delete clean.wasActive;
        delete clean.wasLastActiveInGroup;
      }
      if (schemaVersion < 9) {
        delete clean.chatMessages;
        delete clean.stagedBrowserContexts;
        clean.browserLayoutMode = 'terminal';
        clean.fullBrowserComposerOpen = false;
      }
      delete clean.chatMessages;
      delete clean.chatOpen;
      return clean;
    }),
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
    inboxTriage: snapshot.inboxTriage,
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
  const cleanSessions = (Array.isArray(sessions) ? sessions : [])
    .map(sanitizeRestoreSession).filter(Boolean);
  const candidateCache = new Map();
  const codexCandidates = process.platform === 'win32' ? new Map() : codexSessionIndex();
  const used = new Set();
  const exactOwners = new Map();
  cleanSessions.forEach((session, index) => {
    const id = sanitizeResumeId(session.resumeId);
    const key = id && session.agent ? `${session.agent}:${id}` : null;
    if (key && !exactOwners.has(key)) exactOwners.set(key, index);
  });
  const resolved = [];
  const unresolved = [];
  const inferred = [];
  const candidatesFor = (agent, cwd) => {
    const key = `${agent}\n${cwd}`;
    if (candidateCache.has(key)) return candidateCache.get(key);
    let candidates = [];
    if (agent === 'claude') candidates = claudeSessions(cwd);
    else if (agent === 'codex') candidates = codexCandidates.get(cwd) || [];
    else if (agent === 'grok') candidates = grokSessions(cwd);
    candidateCache.set(key, candidates);
    return candidates;
  };
  cleanSessions.forEach((session, index) => {
    if (session.unresolved) {
      unresolved.push({
        name: session.name,
        cwd: session.cwd,
        agent: session.agent,
        resumeId: sanitizeResumeId(session.resumeId),
        runtime: session.runtime,
        distro: session.distro,
        reason: 'missing-distro',
      });
      return;
    }
    let resume = null;
    let inferredMatch = false;
    const savedId = sanitizeResumeId(session.resumeId);
    const savedKey = savedId ? `${session.agent}:${savedId}` : null;
    if (session.agent && savedId && exactOwners.get(savedKey) === index) {
      resume = { id: savedId, ts: null, exact: true };
    } else if (session.agent) {
      resume = candidatesFor(session.agent, session.cwd)
        .find((candidate) => {
          const key = `${session.agent}:${candidate.id}`;
          return !used.has(key) && !exactOwners.has(key);
        }) || null;
      inferredMatch = Boolean(resume);
    }
    if (resume) used.add(`${session.agent}:${resume.id}`);
    const command = agentResumeCommand(session.agent, resume && resume.id);
    const row = { ...session, resumeId: resume ? resume.id : session.resumeId, resume, command };
    resolved.push(row);
    if (inferredMatch) {
      inferred.push({
        name: session.name,
        cwd: session.cwd,
        agent: session.agent,
        resumeId: resume.id,
        reason: savedId ? 'duplicate-resume-id' : 'missing-resume-id',
      });
    }
    if (session.agent && !command) {
      unresolved.push({
        name: session.name,
        cwd: session.cwd,
        agent: session.agent,
        resumeId: savedId,
      });
    }
  });
  return { sessions: resolved, unresolved, inferred };
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
    managedInstall: process.platform === 'darwin' ? managedUpdateSource() : {
      available: Boolean(status.windows && status.windows.complete),
      reason: status.windows && status.windows.complete ? 'squirrel' : 'missing-windows-assets',
      message: status.windows && status.windows.complete
        ? 'Windows update assets are available.'
        : 'This release does not contain a complete Windows x64 Squirrel update set.',
    },
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
    show: !BACKGROUND_E2E,
    paintWhenInitiallyHidden: true,
    acceptFirstMouse: true,
    backgroundColor: '#0b0e11',
    ...windowOptions(process.platform),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  configureDisplayMediaCapture();

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
    if (!SMOKE && !closeConfirmed && captureCoordinator?.active) {
      event.preventDefault();
      const id = captureCoordinator.active.recordingId;
      captureCoordinator.stopInternal(id, 'window-close').then(() => {
        if (!win || win.isDestroyed()) return;
        if (ptys.size === 0) {
          closeConfirmed = true;
          win.close();
        } else {
          requestGuardedQuit('app-close');
        }
      }).catch((error) => {
        console.error(`recording stop before window close failed: ${error.message}`);
      });
      return;
    }
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

ipcMain.handle('pty-create', (_e, { id, cwd, location, command, agent = '', cols, rows }) => {
  if (process.platform === 'win32') {
    if (!windowsSetupStatus?.capabilities?.canOpenSession) {
      throw new Error('Windows Setup requires a ready WSL2 distribution with Bash, Git, and Node 22.12+.');
    }
    const agentId = KNOWN_AGENTS.includes(agent) ? agent : '';
    if (agentId && !windowsSetupStatus.capabilities.agents[agentId]) {
      throw new Error(`${agentId} is not installed in the selected WSL2 distribution.`);
    }
  }
  const workspace = selectedWorkspace(location || cwd || (process.platform === 'win32' ? runtimeState.home : os.homedir()));
  const signalToken = crypto.randomBytes(32).toString('base64url');
  const sessionEnv = { ...process.env, TERM: 'xterm-256color', CHROMUX: '1', CHROMUX_SESSION_ID: id,
    CHROMUX_SIGNAL_TOKEN: signalToken, CHROMUX_STATE_DIR: workspace.runtime === 'wsl' ? `${runtimeState.home}/.chromux` : CHROMUX_HOME };
  const spec = workspace.runtime === 'wsl'
    ? wslRuntime.ptySpec(workspace, sessionEnv)
    : {
      file: process.env.SHELL || '/bin/zsh',
      args: ['-l'],
      cwd: fs.existsSync(workspace.cwd) ? workspace.cwd : os.homedir(),
      env: sessionEnv,
    };
  const p = pty.spawn(spec.file, spec.args, {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: spec.cwd,
    env: spec.env,
  });
  p.chromuxLocation = workspace;
  p.chromuxSignalToken = signalToken;
  ptys.set(id, p);
  if (!SMOKE) {
    resourceClient.request('resource.register', {
      resourceId: `browser:${id}`,
      details: { kind: 'browser', label: `Chromux browser ${id}`, sessionId: id, explicitTarget: true, exclusive: false },
    }).catch(() => {});
  }
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
  return { ok: true, signalToken, location: workspace };
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
  const dir = fs.mkdtempSync(path.join(CAPTURES_DIR, `${stamp}-`));

  let screenshotPath = null;
  if (pngBase64) {
    screenshotPath = path.join(dir, 'screenshot.png');
    fs.writeFileSync(screenshotPath, Buffer.from(pngBase64, 'base64'));
  }
  const runtimeScreenshotPath = process.platform === 'win32' && screenshotPath ? windowsPathToLinux(screenshotPath) : screenshotPath;
  payload.screenshot = {
    path: runtimeScreenshotPath,
    mode: screenshotPath ? 'visible-viewport' : 'unavailable',
  };

  const payloadPath = path.join(dir, 'payload.yaml');
  const yamlText = yaml.dump(payload, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(payloadPath, yamlText);

  const runtimePayloadPath = process.platform === 'win32' ? windowsPathToLinux(payloadPath) : payloadPath;
  return {
    payloadPath: runtimePayloadPath,
    screenshotPath: runtimeScreenshotPath,
    hostPayloadPath: payloadPath,
    hostScreenshotPath: screenshotPath,
    yamlText,
    dir,
    hostDir: dir,
  };
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

  const workspace = selectedWorkspace(cwd || (process.platform === 'win32' ? runtimeState.home : os.homedir()));
  const child = workspace.runtime === 'wsl'
    ? spawn('wsl.exe', ['--distribution', workspace.distro, '--cd', workspace.cwd, '--exec', 'claude', '-p'], {
      cwd: process.env.SystemRoot || 'C:\\Windows',
      env: { ...process.env, SystemRoot: process.env.SystemRoot || 'C:\\Windows' },
    })
    : spawn(process.env.SHELL || '/bin/zsh', ['-lc', 'claude -p'], {
      cwd: workspace.cwd && fs.existsSync(workspace.cwd) ? workspace.cwd : os.homedir(),
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
// Read-only: ps + lsof + AppleScript + local agent session metadata.
// ---------------------------------------------------------------------------

function runCmd(cmd, args, timeout = 10000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout));
    });
  });
}

function gitCommandResult(location, args, options = {}) {
  if (!location || !Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
    return Promise.resolve({ ok: false, stdout: '', stderr: 'Invalid Git request.', code: -1 });
  }
  const timeout = Math.min(Math.max(Number(options.timeout) || 10000, 1000), 120000);
  const maxBuffer = Math.min(Math.max(Number(options.maxBuffer) || 8 * 1024 * 1024, 1024), 16 * 1024 * 1024);
  if (location.runtime === 'wsl') {
    return wslRuntime.run(location.distro, ['env', 'GIT_TERMINAL_PROMPT=0', 'git', '-C', location.cwd, ...args], {
      timeout,
      maxBuffer,
      signal: options.signal,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }).then((result) => ({
      ok: true,
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
      code: 0,
    })).catch((err) => ({
      ok: false,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || err.message || ''),
      code: Number.isInteger(err.code) ? err.code : 1,
    }));
  }
  return new Promise((resolve) => {
    execFile('/usr/bin/git', ['-C', location.cwd, ...args], {
      timeout,
      maxBuffer,
      signal: options.signal,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }, (err, stdout, stderr) => resolve({
      ok: !err,
      stdout: String(stdout || ''),
      stderr: String(stderr || ''),
      code: err && Number.isInteger(err.code) ? err.code : (err ? 1 : 0),
    }));
  });
}

async function canonicalGitPath(location) {
  if (!location || typeof location.cwd !== 'string' || location.cwd.includes('\0')) throw new Error('Invalid path');
  if (location.runtime === 'wsl') {
    const base = path.posix.normalize(location.cwd);
    const candidate = location.child ? path.posix.resolve(base, location.child) : base;
    const response = await wslRuntime.run(location.distro, ['realpath', '-m', '--', candidate]);
    const resolved = response.stdout.trim();
    if (!resolved.startsWith('/')) throw new Error('Invalid WSL path');
    if (location.child && resolved !== base && !resolved.startsWith(`${base.replace(/\/+$/, '')}/`)) {
      throw new Error('Path leaves worktree');
    }
    return resolved;
  }
  const base = fs.realpathSync(location.cwd);
  if (!location.child) return base;
  const candidate = fs.realpathSync(path.resolve(base, location.child));
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) throw new Error('Path leaves worktree');
  return candidate;
}

async function gitFileMtime(location) {
  if (location.runtime === 'wsl') {
    const candidate = path.posix.resolve(location.cwd, location.path);
    if (candidate !== location.cwd && !candidate.startsWith(`${location.cwd.replace(/\/+$/, '')}/`)) return 0;
    try {
      const response = await wslRuntime.run(location.distro, ['stat', '-c', '%Y', '--', candidate]);
      return Number(response.stdout.trim()) * 1000 || 0;
    } catch {
      return 0;
    }
  }
  try {
    const base = fs.realpathSync(location.cwd);
    const candidate = path.resolve(base, location.path);
    if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) return 0;
    return fs.lstatSync(candidate).mtimeMs;
  } catch {
    return 0;
  }
}

const gitWorktrees = createGitWorktreeService({
  catalogFile: GIT_REPOSITORIES_FILE,
  run: gitCommandResult,
  canonicalize: canonicalGitPath,
  statMtime: gitFileMtime,
});

function vercelCommandResult(location, args, options = {}) {
  if (!location || !Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
    return Promise.resolve({ ok: false, stdout: '', stderr: 'Invalid Vercel request.', code: -1 });
  }
  const timeout = Math.min(Math.max(Number(options.timeout) || 15000, 1000), 16 * 60 * 1000);
  const maxBuffer = Math.min(Math.max(Number(options.maxBuffer) || 8 * 1024 * 1024, 1024), 16 * 1024 * 1024);
  const allowedVercelEnv = {};
  for (const key of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
    if (typeof options.env?.[key] === 'string') allowedVercelEnv[key] = options.env[key];
  }
  if (location.runtime === 'wsl') {
    const priorWslEnv = String(process.env.WSLENV || '').split(':').filter(Boolean);
    const childEnv = {
      ...process.env,
      ...allowedVercelEnv,
      WSLENV: [...new Set([...priorWslEnv, ...Object.keys(allowedVercelEnv)])].join(':'),
    };
    return new Promise((resolve) => {
      execFile('wsl.exe', [
        '--distribution', location.distro,
        '--cd', location.cwd,
        '--exec', 'vercel',
        ...args,
      ], {
        timeout,
        maxBuffer,
        env: childEnv,
        signal: options.signal,
        windowsHide: true,
      }, (runError, stdout, stderr) => resolve({
        ok: !runError,
        stdout: String(stdout || '').replace(/\r/g, ''),
        stderr: String(stderr || '').replace(/\r/g, ''),
        code: runError && Number.isInteger(runError.code) ? runError.code : (runError ? 1 : 0),
      }));
    });
  }
  const envPath = codexSearchPath();
  const executable = resolveOnPath('vercel', envPath);
  if (!executable) return Promise.resolve({ ok: false, stdout: '', stderr: 'Vercel CLI was not found in this runtime.', code: 127 });
  return new Promise((resolve) => {
    execFile(executable, args, {
      cwd: location.cwd,
      timeout,
      maxBuffer,
      signal: options.signal,
      env: { ...process.env, PATH: envPath, ...allowedVercelEnv },
    }, (runError, stdout, stderr) => resolve({
      ok: !runError,
      stdout: String(stdout || ''),
      stderr: String(stderr || ''),
      code: runError && Number.isInteger(runError.code) ? runError.code : (runError ? 1 : 0),
    }));
  });
}

async function readVercelProjectLink(location) {
  if (location.runtime === 'wsl') {
    try {
      const result = await wslRuntime.run(location.distro, [
        'cat', '--', path.posix.join(location.cwd, '.vercel', 'project.json'),
      ], { timeout: 3000, maxBuffer: 64 * 1024 });
      return JSON.parse(result.stdout);
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(location.cwd, '.vercel', 'project.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function vercelRepositoryRoot(location) {
  const response = await gitCommandResult(location, ['rev-parse', '--show-toplevel'], { timeout: 4000 });
  if (!response.ok || !response.stdout.trim()) return null;
  try {
    return canonicalGitPath({ ...location, cwd: response.stdout.trim() });
  } catch {
    return null;
  }
}

const vercel = createVercelService({
  credentialFile: VERCEL_CREDENTIALS_FILE,
  projectsFile: VERCEL_PROJECTS_FILE,
  // Renderer fixtures use isolated HOME directories that intentionally have
  // no macOS login keychain. Avoid probing Keychain in that explicit smoke
  // mode; production always uses Electron's OS-backed safeStorage object.
  safeStorage: SMOKE && process.env.CHROMUX_E2E_DISABLE_SAFE_STORAGE === '1'
    ? { isEncryptionAvailable: () => false }
    : safeStorage,
  run: vercelCommandResult,
  canonicalize: async (location) => ({ ...location, cwd: await canonicalGitPath(location) }),
  readProjectLink: readVercelProjectLink,
  gitRoot: async (location) => {
    const cwd = await vercelRepositoryRoot(location);
    return cwd ? { ...location, cwd } : null;
  },
  oauthClientId: VERCEL_OAUTH_CLIENT_ID,
  oauthRequest: VERCEL_OAUTH_CLIENT_ID ? async (kind, payload) => {
    const endpoint = kind === 'revoke'
      ? 'https://api.vercel.com/login/oauth/token/revoke'
      : 'https://api.vercel.com/login/oauth/token';
    const body = new URLSearchParams({ client_id: payload.clientId });
    if (kind === 'exchange') {
      body.set('grant_type', 'authorization_code');
      body.set('code', payload.code);
      body.set('code_verifier', payload.codeVerifier);
      body.set('redirect_uri', payload.redirectUri);
    } else if (kind === 'refresh') {
      body.set('grant_type', 'refresh_token');
      body.set('refresh_token', payload.refreshToken);
    } else {
      body.set('token', payload.token || payload.refreshToken);
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data.error_description || data.error || `Vercel OAuth HTTP ${response.status}`).slice(0, 1000));
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      account: data.user?.username || data.user?.name || null,
    };
  } : null,
});

const vercelShipping = createVercelShippingService({
  jobsFile: VERCEL_JOBS_FILE,
  resolveProject: (key) => vercel.resolveProject(key),
  validateProject: (project) => vercel.validateConnection(
    project.profileId,
    { ...project.location, cwd: project.deployRoot },
  ),
  runGit: gitCommandResult,
  runVercel: (key, args, options) => vercel.projectCommand(key, args, options),
  emit: (job) => {
    if (win && !win.isDestroyed()) win.webContents.send('vercel-job-update', job);
  },
});

const vercelOAuth = createVercelOAuthLoopback({
  configured: Boolean(VERCEL_OAUTH_CLIENT_ID),
  begin: (request) => vercel.beginOAuth(request),
  complete: (request) => vercel.completeOAuth(request),
  openExternal: (url) => shell.openExternal(url),
});

async function gitRoot(cwd) {
  if (process.platform === 'win32') {
    let location;
    try { location = selectedWorkspace(cwd); } catch { return null; }
    try {
      const result = await wslRuntime.run(location.distro, ['git', '-C', location.cwd, 'rev-parse', '--show-toplevel']);
      const root = result.stdout.trim();
      return root.startsWith('/') ? root : null;
    } catch { return null; }
  }
  if (typeof cwd !== 'string' || cwd.length === 0 || cwd.length > GIT_CWD_MAX || !path.isAbsolute(cwd)) return null;
  let directory;
  try {
    directory = fs.realpathSync(cwd);
    if (!fs.statSync(directory).isDirectory()) return null;
  } catch { return null; }
  const output = await runCmd('/usr/bin/git', ['-C', directory, 'rev-parse', '--show-toplevel'], GIT_ROOT_TIMEOUT_MS);
  const root = output.trim();
  if (!root || root.includes('\0') || !path.isAbsolute(root)) return null;
  try {
    const resolved = fs.realpathSync(root);
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch { return null; }
}

async function gitDiffSummary(cwd) {
  const root = await gitRoot(cwd);
  if (!root) return null;
  if (process.platform === 'win32') {
    let location;
    try { location = selectedWorkspace(cwd); } catch { return null; }
    let output;
    try {
      output = (await wslRuntime.run(location.distro, [
        'git', '-C', root, 'status', '--porcelain=v1', '--untracked-files=all',
      ])).stdout;
    } catch { return null; }
    const files = output.split('\n').filter(Boolean).map((field) => ({
      path: field.slice(3),
      originalPath: null,
      index: field[0],
      worktree: field[1],
    }));
    return {
      root,
      files,
      totals: {
        files: files.length,
        staged: files.filter((file) => ![' ', '?'].includes(file.index)).length,
        unstaged: files.filter((file) => file.worktree !== ' ').length,
        untracked: files.filter((file) => file.index === '?' && file.worktree === '?').length,
      },
    };
  }
  const output = await new Promise((resolve) => {
    execFile('/usr/bin/git', [
      '-C', root, 'status', '--porcelain=v1', '-z', '--untracked-files=all',
    ], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : String(stdout)));
  });
  if (output === null) return null;
  const fields = output.split('\0');
  const files = [];
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    if (!field || field.length < 4) continue;
    const index = field[0];
    const worktree = field[1];
    const filePath = field.slice(3);
    if (!filePath) continue;
    const renamed = index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C';
    const originalPath = renamed ? (fields[++i] || null) : null;
    files.push({ path: filePath, originalPath, index, worktree });
  }
  return {
    root,
    files,
    totals: {
      files: files.length,
      staged: files.filter((file) => ![' ', '?'].includes(file.index)).length,
      unstaged: files.filter((file) => file.worktree !== ' ').length,
      untracked: files.filter((file) => file.index === '?' && file.worktree === '?').length,
    },
  };
}

function isWithinProject(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function htmlProjectContext({ sessionId, launchCwd } = {}) {
  if (process.platform === 'win32') {
    const ptySession = typeof sessionId === 'string' ? ptys.get(sessionId) : null;
    let location;
    try {
      location = selectedWorkspace((ptySession && ptySession.chromuxLocation) || launchCwd || runtimeState.home);
    } catch {
      return { ok: false, error: 'Project directory is unavailable.', root: null, liveCwd: null, launchCwd: null };
    }
    let liveLinux = null;
    if (ptySession) {
      try {
        const owned = await scanWslProcesses({ chromuxOnly: true });
        liveLinux = owned.find((row) => row.id === sessionId && row.distro === location.distro)?.cwd || null;
      } catch { /* use launch cwd */ }
    }
    const launchLinux = typeof launchCwd === 'string' && launchCwd.startsWith('/') ? launchCwd : location.cwd;
    const baseLinux = liveLinux || launchLinux;
    const rootLinux = await gitRoot({ runtime: 'wsl', distro: location.distro, cwd: launchLinux || baseLinux }) || launchLinux || baseLinux;
    try {
      const root = linuxPathToWindows(rootLinux, location.distro);
      const liveCwd = liveLinux ? linuxPathToWindows(liveLinux, location.distro) : null;
      const launch = launchLinux ? linuxPathToWindows(launchLinux, location.distro) : null;
      return {
        ok: true,
        root,
        liveCwd: liveCwd || launch,
        launchCwd: launch,
        location: { runtime: 'wsl', distro: location.distro, cwd: rootLinux },
      };
    } catch {
      return { ok: false, error: 'Project directory is unavailable.', root: null, liveCwd: null, launchCwd: null };
    }
  }
  let liveCwd = null;
  const ptySession = typeof sessionId === 'string' ? ptys.get(sessionId) : null;
  if (ptySession && Number.isInteger(ptySession.pid)) {
    try { liveCwd = (await lsofCwds([ptySession.pid])).get(ptySession.pid) || null; } catch { liveCwd = null; }
  }
  const launch = typeof launchCwd === 'string' && launchCwd.length <= HTML_INDEX_INPUT_MAX && path.isAbsolute(launchCwd)
    ? launchCwd
    : null;
  const base = liveCwd || launch;
  if (!base) return { ok: false, error: 'Project directory is unavailable.', root: null, liveCwd: null, launchCwd: launch };
  let root = await gitRoot(launch || base);
  if (!root) {
    try { root = fs.realpathSync(launch || base); } catch { return { ok: false, error: 'Project directory is unavailable.', root: null, liveCwd, launchCwd: launch }; }
  }
  return { ok: true, root, liveCwd: liveCwd || base, launchCwd: launch || base };
}

function walkProjectHtml(root) {
  const files = [];
  const visit = (directory) => {
    if (files.length >= HTML_INDEX_MAX_FILES) return;
    let rows;
    try { rows = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    for (const row of rows) {
      if (files.length >= HTML_INDEX_MAX_FILES) break;
      if (row.isSymbolicLink()) continue;
      if (row.isDirectory()) {
        if (!HTML_INDEX_EXCLUDED_DIRS.has(row.name)) visit(path.join(directory, row.name));
        continue;
      }
      if (!row.isFile() || !/\.html?$/i.test(row.name)) continue;
      const absolute = path.join(directory, row.name);
      let real;
      try { real = fs.realpathSync(absolute); } catch { continue; }
      if (!isWithinProject(root, real)) continue;
      files.push({ path: path.relative(root, real).split(path.sep).join('/'), name: row.name });
    }
  };
  visit(root);
  return { files, truncated: files.length >= HTML_INDEX_MAX_FILES };
}

async function projectHtmlIndex(options = {}) {
  const context = await htmlProjectContext(options);
  if (!context.ok) return { ...context, files: [] };
  return { ...context, ...walkProjectHtml(context.root) };
}

function htmlFileUrl(absolute) {
  return pathToFileURL(absolute).href;
}

async function resolveProjectHtml(options = {}) {
  const reference = typeof options.reference === 'string' ? options.reference.trim() : '';
  if (!reference || reference.length > HTML_INDEX_INPUT_MAX || reference.includes('\0') || !/\.html?(?:[?#].*)?$/i.test(reference)) {
    return { ok: false, status: 'invalid', error: 'Enter an HTML file path.' };
  }
  const context = await htmlProjectContext(options);
  if (!context.ok) return { ...context, status: 'error' };
  let decoded = reference.replace(/^file:\/\//i, '');
  try { decoded = decodeURIComponent(decoded); } catch { return { ...context, ok: false, status: 'invalid', error: 'Malformed path encoding.' }; }
  const decodedWithoutUrlSuffix = decoded.replace(/[?#].*$/, '');
  const candidates = [];
  const addCandidate = (candidate) => {
    const absolute = path.resolve(candidate);
    if (!/\.html?$/i.test(absolute)) return;
    try {
      const real = fs.realpathSync(absolute);
      if (isWithinProject(context.root, real) && fs.statSync(real).isFile() && !candidates.includes(real)) candidates.push(real);
    } catch { /* absent */ }
  };
  const explicitReferences = decoded === decodedWithoutUrlSuffix ? [decoded] : [decoded, decodedWithoutUrlSuffix];
  for (const explicitReference of explicitReferences) {
    if (explicitReference.startsWith('~/')) addCandidate(path.join(os.homedir(), explicitReference.slice(2)));
    else if (path.isAbsolute(explicitReference)) addCandidate(explicitReference);
    else {
      addCandidate(path.join(context.liveCwd, explicitReference));
      addCandidate(path.join(context.launchCwd, explicitReference));
      addCandidate(path.join(context.root, explicitReference));
    }
  }
  if (candidates.length === 1) {
    return { ...context, ok: true, status: 'resolved', path: path.relative(context.root, candidates[0]).split(path.sep).join('/'), url: htmlFileUrl(candidates[0]) };
  }
  const { files } = walkProjectHtml(context.root);
  const normalized = decodedWithoutUrlSuffix.replace(/\\/g, '/').replace(/^\.?\//, '');
  const fallback = files.filter((file) => file.path === normalized || file.path.endsWith(`/${normalized}`) || file.name === path.basename(normalized));
  if (fallback.length === 1) {
    const absolute = path.join(context.root, ...fallback[0].path.split('/'));
    return { ...context, ok: true, status: 'resolved', path: fallback[0].path, url: htmlFileUrl(absolute) };
  }
  return {
    ...context,
    ok: false,
    status: fallback.length > 1 ? 'ambiguous' : 'missing',
    query: path.basename(normalized),
    matches: fallback.slice(0, 100),
    error: fallback.length > 1 ? 'Multiple project HTML files match.' : 'No matching project HTML file was found.',
  };
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
  if (process.platform !== 'darwin') {
    for (const pid of pids) {
      try { cwds.set(pid, fs.readlinkSync(`/proc/${pid}/cwd`)); } catch { /* exited or unavailable */ }
    }
    return cwds;
  }
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
function claudeSessions(cwd) {
  const munged = cwd.replace(/[^a-zA-Z0-9]/g, '-');
  const dir = path.join(os.homedir(), '.claude', 'projects', munged);
  const sessions = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const id = f.slice(0, -6);
      if (!sanitizeResumeId(id)) continue;
      const mtimeMs = fs.statSync(path.join(dir, f)).mtimeMs;
      sessions.push({ id, ts: mtimeMs });
    }
  } catch { /* no sessions for this project */ }
  return sessions.sort((a, b) => b.ts - a.ts);
}

function latestClaudeSession(cwd) {
  return claudeSessions(cwd)[0] || null;
}

// Latest saved Grok Build session for a project dir.
// Layout: ~/.grok/sessions/<url-encoded-cwd>/<session-id>/summary.json
// (GROK_HOME overrides ~/.grok). Long paths may use a slug+hash group with a
// `.cwd` file recording the original path — we resolve that as a fallback.
function grokSessions(cwd) {
  if (!cwd || typeof cwd !== 'string') return [];
  const root = path.join(grokHomeDir(), 'sessions');
  const sessions = new Map();

  const considerGroup = (groupDir) => {
    let names;
    try { names = fs.readdirSync(groupDir); } catch { return; }
    for (const name of names) {
      if (!sanitizeResumeId(name)) continue;
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
      const existing = sessions.get(name);
      if (!existing || ts > existing.ts) sessions.set(name, { id: name, ts });
    }
  };

  considerGroup(path.join(root, encodeURIComponent(cwd)));
  if (sessions.size > 0) return [...sessions.values()].sort((a, b) => b.ts - a.ts);

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
            if (!sanitizeResumeId(name)) continue;
            const summary = readJson(path.join(groupDir, name, 'summary.json'));
            const summaryCwd = summary && summary.info && summary.info.cwd;
            if (summaryCwd === cwd) { matched = true; break; }
          }
        } catch { /* unreadable group */ }
      }
      if (matched) considerGroup(groupDir);
    }
  } catch { /* no grok sessions root */ }
  return [...sessions.values()].sort((a, b) => b.ts - a.ts);
}

function latestGrokSession(cwd) {
  return grokSessions(cwd)[0] || null;
}

async function scanWslProcesses({ chromuxOnly = false } = {}) {
  const rows = [];
  for (const distro of runtimeState.distros.filter((candidate) => candidate.version === 2)) {
    let result;
    try {
      result = await wslRuntime.run(distro.name, ['ps', '-eo', 'pid=,ppid=,tty=,etime=,args=']);
    } catch { continue; }
    const processes = result.stdout.split('\n').map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/);
      return match ? { pid: Number(match[1]), ppid: Number(match[2]), tty: match[3], etime: match[4], command: match[5].trim() } : null;
    }).filter(Boolean);
    for (const processRow of processes) {
      const agent = classifyAgentCommand(processRow.command);
      if (!agent) continue;
      let environ = '';
      try {
        environ = (await wslRuntime.run(distro.name, ['cat', `/proc/${processRow.pid}/environ`])).stdout;
      } catch { /* process may have exited */ }
      const owned = environ.includes('CHROMUX=1') || environ.includes('CHROMUX_SESSION_ID=');
      if (chromuxOnly !== owned) continue;
      let cwd = null;
      try { cwd = (await wslRuntime.run(distro.name, ['readlink', `/proc/${processRow.pid}/cwd`])).stdout.trim() || null; } catch { /* exited */ }
      const sessionIdMatch = /CHROMUX_SESSION_ID=([A-Za-z0-9_-]+)/.exec(environ);
      rows.push({
        id: sessionIdMatch ? sessionIdMatch[1] : undefined,
        tty: `${distro.name}:${processRow.tty}`,
        pid: processRow.pid,
        agent,
        command: processRow.command,
        etime: processRow.etime,
        cwd,
        runtime: 'wsl',
        distro: distro.name,
        terminal: null,
        resume: null,
      });
    }
  }
  return rows;
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

// cwd -> newest-first Codex sessions. Rollout files live under
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
      if (!p || !p.cwd || !sanitizeResumeId(id)) continue;
      const rows = index.get(p.cwd) || [];
      if (!rows.some((row) => row.id === id)) {
        rows.push({ id, ts: Date.parse(meta.timestamp) || fs.statSync(file).mtimeMs });
        rows.sort((a, b) => b.ts - a.ts);
        index.set(p.cwd, rows);
      }
    } catch { /* unreadable rollout */ }
  }
  return index;
}

ipcMain.handle('detect-external', async () => {
  if (process.platform === 'win32') {
    const rows = await scanWslProcesses();
    for (const distro of new Set(rows.filter((row) => row.agent === 'codex' && row.cwd).map((row) => row.distro))) {
      const scanner = createCodexDetectMetadata({
        resolveExecutable: () => 'wsl.exe',
        spawnProcess: (_file, args, options) => spawn('wsl.exe', [
          '--distribution', distro, '--exec', 'codex', ...args,
        ], options),
      });
      const distroRows = rows.filter((row) => row.distro === distro && row.agent === 'codex' && row.cwd);
      const metadata = await scanner.scan(distroRows.map((row) => row.cwd));
      for (const row of distroRows) row.resume = metadata.get(row.cwd) || null;
    }
    return { rows, tabTitles: false, scannedAt: new Date().toISOString() };
  }
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
    else if (row.agent === 'grok') row.resume = latestGrokSession(row.cwd);
  }
  const codexRows = rows.filter((row) => row.agent === 'codex' && row.cwd);
  const enrichedCodex = await codexDetectMetadata.scan(codexRows.map((row) => row.cwd));
  for (const row of codexRows) {
    row.resume = enrichedCodex.get(row.cwd) || (codexIndex.get(row.cwd) || [])[0] || null;
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
  if (process.platform === 'win32') {
    return { rows: await scanWslProcesses({ chromuxOnly: true }), scannedAt: new Date().toISOString() };
  }
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
  try { return fs.existsSync(hostPath(p)); } catch { return false; }
});
ipcMain.handle('project-html-index', (_e, opts = {}) => projectHtmlIndex(opts));
ipcMain.handle('resolve-project-html', (_e, opts = {}) => {
  if (process.platform !== 'win32') return resolveProjectHtml(opts);
  let reference = opts.reference;
  try {
    const distro = opts.distro || ptys.get(opts.sessionId)?.chromuxLocation?.distro || runtimeState.selectedDistro;
    if (typeof reference === 'string' && reference.startsWith('~/')) {
      reference = linuxPathToWindows(`${runtimeState.home}/${reference.slice(2)}`, distro);
    } else if (typeof reference === 'string' && reference.startsWith('/')) {
      reference = linuxPathToWindows(reference, distro);
    }
  } catch { /* resolver returns its normal invalid/missing result */ }
  return resolveProjectHtml({ ...opts, reference });
});

ipcMain.handle('pick-directory', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: os.homedir(),
  });
  if (res.canceled) return null;
  if (process.platform !== 'win32') return res.filePaths[0];
  return {
    ...workspaceFromWindowsPath(res.filePaths[0]),
  };
});

ipcMain.handle('wsl-list-distros', async () => {
  await initializeRuntime();
  return { distros: runtimeState.distros, selectedDistro: runtimeState.selectedDistro };
});
ipcMain.handle('wsl-refresh-readiness', async () => {
  if (process.platform !== 'win32' || !runtimeState.selectedDistro) return runtimeState.readiness;
  runtimeState.readiness = await wslRuntime.readiness(runtimeState.selectedDistro);
  await refreshWindowsSetupStatus();
  return runtimeState.readiness;
});
ipcMain.handle('wsl-select-distro', async (_e, distro) => {
  if (process.platform !== 'win32') throw new Error('WSL distribution selection is only available on Windows.');
  wslRuntime.select(distro);
  writePreference('wslDistro', distro);
  runtimeState.selectedDistro = distro;
  runtimeState.readiness = await wslRuntime.readiness(distro);
  try {
    const result = await wslRuntime.run(distro, ['bash', '-lc', 'printf %s \"$HOME\"']);
    if (result.stdout.trim().startsWith('/')) runtimeState.home = result.stdout.trim();
  } catch { /* readiness reports the runtime problem */ }
  try { await installWslHooks(); } catch (error) {
    windowsHookWarning = `Agent hooks are unavailable; sessions will run uninstrumented: ${error.message}`;
    runtimeState.readiness.warning = windowsHookWarning;
  }
  await refreshWindowsSetupStatus();
  return { selectedDistro: distro, readiness: runtimeState.readiness, setupStatus: windowsSetupStatus };
});
ipcMain.handle('windows-setup-status', async () => {
  if (process.platform !== 'win32') return null;
  return refreshWindowsSetupStatus();
});
ipcMain.handle('windows-setup-refresh', async () => {
  if (process.platform !== 'win32') return null;
  await initializeRuntime();
  return refreshWindowsSetupStatus();
});
ipcMain.handle('windows-setup-select-distro', async (_event, distro) => {
  if (process.platform !== 'win32') throw new Error('Windows Setup is only available on Windows.');
  wslRuntime.select(distro);
  writePreference('wslDistro', distro);
  runtimeState.selectedDistro = distro;
  runtimeState.readiness = await wslRuntime.readiness(distro);
  const homeResult = await wslRuntime.run(distro, ['bash', '-lc', 'printf %s "$HOME"']);
  if (homeResult.stdout.trim().startsWith('/')) runtimeState.home = homeResult.stdout.trim();
  return refreshWindowsSetupStatus();
});
ipcMain.handle('windows-setup-save-root', async (_event, { root, create = false } = {}) => {
  if (process.platform !== 'win32' || !runtimeState.selectedDistro) {
    throw new Error('Choose a ready WSL2 distribution first.');
  }
  const normalized = validateAbsoluteRoot(root, path.posix);
  const result = create
    ? await createWindowsProjectsRoot(wslRuntime, runtimeState.selectedDistro, normalized)
    : await inspectWindowsProjectsRoot(wslRuntime, runtimeState.selectedDistro, normalized);
  if (!result.ok) throw new Error(result.detail || 'Projects Root must be an existing writable directory.');
  persistProjectsRoot('wsl', runtimeState.selectedDistro, normalized);
  return refreshWindowsSetupStatus();
});
ipcMain.handle('windows-setup-complete', async () => {
  if (process.platform !== 'win32') return null;
  const status = await refreshWindowsSetupStatus();
  if (!status?.setupReady) throw new Error('Complete every required Windows Setup check first.');
  writePreference('windowsSetup', {
    schemaVersion: SETUP_SCHEMA_VERSION,
    completedAt: new Date().toISOString(),
  });
  return refreshWindowsSetupStatus();
});
ipcMain.handle('windows-setup-open-documentation', async (_event, key) => {
  if (process.platform !== 'win32' || !Object.hasOwn(WINDOWS_SETUP_DOCUMENTATION_URLS, key)) return false;
  await shell.openExternal(WINDOWS_SETUP_DOCUMENTATION_URLS[key]);
  return true;
});
ipcMain.handle('windows-setup-exit', () => {
  if (process.platform !== 'win32') return false;
  app.quit();
  return true;
});
ipcMain.handle('windows-setup-self-test', async () => {
  if (process.platform !== 'win32') throw new Error('Windows Setup self-test is only available on Windows.');
  const status = await refreshWindowsSetupStatus();
  if (!status?.capabilities?.canOpenSession || !status.projectsRoot) {
    throw new Error('A ready WSL2 runtime and Projects Root are required for the self-test.');
  }
  const spec = wslRuntime.ptySpec({
    runtime: 'wsl',
    distro: status.selectedDistro,
    cwd: status.projectsRoot,
  }, { ...process.env, CHROMUX: '1' });
  return new Promise((resolve, reject) => {
    const testPty = pty.spawn(spec.file, spec.args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: spec.cwd,
      env: spec.env,
    });
    let output = '';
    let finished = false;
    const finish = (error = null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { testPty.kill(); } catch { /* already exited */ }
      if (error) reject(error);
      else resolve({
        ok: true,
        distro: status.selectedDistro,
        projectsRoot: status.projectsRoot,
        detail: boundedSetupDiagnostic(output),
      });
    };
    const timer = setTimeout(() => finish(new Error('WSL PTY self-test timed out.')), 10000);
    testPty.onData((data) => {
      output += data;
      if (output.includes('__CHROMUX_SELF_TEST_OK__')) finish();
    });
    testPty.onExit(({ exitCode }) => {
      if (!finished) finish(new Error(`WSL PTY self-test exited with code ${exitCode}.`));
    });
    testPty.write(`test -d ${shellQuote(status.projectsRoot)} && test -w ${shellQuote(status.projectsRoot)} && printf '__CHROMUX_SELF_TEST_OK__\\n'\r`);
  });
});
ipcMain.handle('path-to-runtime', (_e, { path: input, distro } = {}) => ({
  ...(process.platform === 'win32'
    ? workspaceFromWindowsPath(input, distro)
    : { runtime: 'host', distro: null, cwd: path.resolve(input) }),
}));
ipcMain.handle('path-to-host', (_e, location) => hostPath(location));

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
  home: process.platform === 'win32' ? runtimeState.home : os.homedir(),
  hostHome: os.homedir(),
  chromuxHome: CHROMUX_HOME,
  capturesDir: CAPTURES_DIR,
  deliveryLog: DELIVERY_LOG,
  restoreSessions: readRestoreSnapshot(),
  // null when the hook install failed at startup: the renderer then launches
  // agents uninstrumented instead of pointing them at broken paths.
  hooksSettingsPath: hookInstall.claude ? runtimeHookPaths.claude : null,
  codexNotifyPath: hookInstall.codex ? runtimeHookPaths.codex : null,
  // Grok hooks install into ~/.grok/hooks (no launch flag). Expose path for
  // diagnostics/tests; launch always uses bare `grok` / `grok --resume`.
  grokHooksPath: hookInstall.grok ? runtimeHookPaths.grok : null,
  version: currentVersion(),
  devMode: DEV_MODE,
  hostPlatform: process.platform,
  isPackaged: app.isPackaged,
  primaryModifier: process.platform === 'win32' ? 'control' : 'meta',
  runtime: {
    kind: runtimeState.kind,
    selectedDistro: runtimeState.selectedDistro,
    distros: runtimeState.distros,
    readiness: runtimeState.readiness,
    setupStatus: windowsSetupStatus,
  },
  capabilities: capabilities(process.platform),
  preventSleep: preventSleepController ? preventSleepController.status() : {
    available: capabilities(process.platform).preventSleep, enabled: false, running: false, pid: null, error: null,
  },
  resourceBroker: { cooperativeComputerUse: true, socketPath: resourceClient.socketPath },
}));

ipcMain.handle('prevent-sleep-set', (event, enabled) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Prevent Sleep is only available to the active Chromux window');
  }
  if (!preventSleepController) throw new Error('Prevent Sleep is not initialized');
  return preventSleepController.setEnabled(enabled);
});

const restartWithDevMode = createDevModeRestart({
  persist: writeDevModePreference,
  snapshot: ({ reason, sessions, inboxTriage = [] }) => writeRestoreSnapshot({
    reason,
    inboxTriage,
    sessions: sessions.slice(0, 100).map(sanitizeRestoreSession).filter(Boolean),
  }),
  relaunch: (enabled) => app.relaunch({ args: restartArgs(process.argv.slice(1), enabled) }),
  quit: () => {
    closeConfirmed = true;
    for (const p of ptys.values()) p.kill();
    app.exit(0);
  },
});

ipcMain.handle('restart-with-dev-mode', (event, payload = {}) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Developer Mode restart is only available to the active Chromux window');
  }
  return restartWithDevMode(payload);
});

ipcMain.handle('resources-list', () => resourceClient.request('resources.list'));
ipcMain.handle('resources-cancel', (_e, requestId) => resourceClient.request('request.cancel', { requestId, force: true }));
ipcMain.handle('resources-force-release', (_e, leaseId) => resourceClient.request('lease.release', { leaseId, force: true }));
ipcMain.handle('resources-set-capacity', (_e, value) => resourceClient.request('capacity.set', { value }));

ipcMain.handle('favorites-read', () => readFavorites());
ipcMain.handle('favorites-replace', (_e, records) => replaceFavorites(records));
ipcMain.handle('projects-read', () => readProjects());
ipcMain.handle('projects-replace', (_e, records) => replaceProjects(records));
ipcMain.handle('project-scaffolder-config', async () => {
  const { config } = await projectScaffolderContext();
  return config;
});
ipcMain.handle('project-scaffolder-preview', async (_e, request = {}) => {
  const { adapter, config } = await projectScaffolderContext();
  return previewScaffoldProject({ adapter, config, request });
});
ipcMain.handle('project-scaffolder-root-set', async (_e, root) => {
  const adapter = await projectScaffolderAdapter();
  const normalized = validateAbsoluteRoot(root, adapter.path);
  if (process.platform === 'win32') {
    const result = await inspectWindowsProjectsRoot(wslRuntime, adapter.distro, normalized);
    if (!result.ok) throw new Error(result.detail || 'Projects Root must be an existing writable directory.');
  }
  persistProjectsRoot(adapter.kind, adapter.distro, normalized);
  if (process.platform === 'win32') await refreshWindowsSetupStatus();
  return (await projectScaffolderContext()).config;
});
ipcMain.handle('project-scaffolder-create', async (_e, request = {}) => {
  if (process.platform === 'win32' && !windowsSetupStatus?.capabilities?.canCreateProject) {
    throw new Error('Windows Setup requires a writable Projects Root before creating projects.');
  }
  const { adapter, config } = await projectScaffolderContext();
  return scaffoldProject({ adapter, config, request });
});
ipcMain.handle('prompt-history-read', (_e, cwd) => promptHistory.readProject(cwd));
ipcMain.handle('prompt-history-append', (_e, cwd, entry) => promptHistory.append(cwd, entry));
ipcMain.handle('prompt-history-delete', (_e, cwd, id) => promptHistory.remove(cwd, id));
ipcMain.handle('prompt-history-clear', (_e, cwd) => promptHistory.clear(cwd));
ipcMain.handle('clipboard-write-text', (_e, text) => {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_DRAFT_BYTES) return false;
  clipboard.writeText(text);
  return true;
});
if (SMOKE) ipcMain.handle('test-clipboard-read-text', () => clipboard.readText());
ipcMain.handle('project-config', (_e, cwd) => {
  const location = selectedWorkspace(cwd);
  const config = packageProjectConfig(location.runtime === 'wsl' ? linuxPathToWindows(location.cwd, location.distro) : location.cwd);
  return config.valid ? { ...config, ...location, location } : config;
});
ipcMain.handle('project-script-resolve', (_e, { cwd, location: inputLocation, script } = {}) => {
  const location = selectedWorkspace(inputLocation || cwd);
  const config = resolveProjectScript(location.runtime === 'wsl' ? linuxPathToWindows(location.cwd, location.distro) : location.cwd, script);
  return config.valid ? { ...config, ...location, location } : config;
});
ipcMain.handle('preview-probe', (_e, url) => previewProbe(url));
ipcMain.handle('browser-queue-validate', (event, request = {}) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('Browser queue validation is only available to the active Chromux window.');
  }
  return normalizeExplicitPreviewRequest(request);
});
ipcMain.handle('git-root', (_e, cwd) => gitRoot(cwd));
ipcMain.handle('git-diff-summary', (_e, cwd) => gitDiffSummary(cwd));
ipcMain.handle('git-repositories-read', () => gitWorktrees.catalog());
ipcMain.handle('git-repository-observe', (_e, request = {}) => gitWorktrees.observe(request));
ipcMain.handle('git-repository-forget', (_e, repositoryId) => gitWorktrees.forget(repositoryId));
ipcMain.handle('git-worktree-inventory', (_e, request = {}) => gitWorktrees.inventory(request));
ipcMain.handle('git-worktree-diff', (_e, request = {}) => gitWorktrees.diff(request));
ipcMain.handle('git-worktree-stage', (_e, request = {}) => gitWorktrees.stage(request));
ipcMain.handle('git-worktree-unstage', (_e, request = {}) => gitWorktrees.unstage(request));
ipcMain.handle('git-worktree-commit-preview', (_e, request = {}) => gitWorktrees.commitPreview(request));
ipcMain.handle('git-worktree-commit', (_e, request = {}) => gitWorktrees.commit(request));
for (const action of ['fetch', 'pull', 'publish', 'push', 'sync']) {
  ipcMain.handle(`git-worktree-${action}`, (_e, request = {}) => gitWorktrees[action](request));
}
ipcMain.handle('vercel-capability', (_e, location = {}) => vercel.capability(location));
ipcMain.handle('vercel-connections-read', () => vercel.connections());
ipcMain.handle('vercel-connect-cli', (_e, request = {}) => vercel.connectCli(request));
ipcMain.handle('vercel-connect-token', (_e, request = {}) => vercel.connectToken(request));
ipcMain.handle('vercel-connection-validate', (_e, request = {}) => (
  vercel.validateConnection(request.profileId, request.location)
));
ipcMain.handle('vercel-connection-remove', (_e, profileId) => vercel.removeConnection(profileId));
ipcMain.handle('vercel-project-discover', (_e, location = {}) => vercel.discoverProject(location));
ipcMain.handle('vercel-projects-read', () => vercel.projects());
ipcMain.handle('vercel-project-save', (_e, request = {}) => vercel.saveProject(request));
ipcMain.handle('vercel-project-remove', (_e, key) => vercel.removeProject(key));
ipcMain.handle('vercel-oauth-start', (event, request = {}) => (
  win && !win.isDestroyed() && event.sender.id === win.webContents.id
    ? vercelOAuth.start(event.sender, request)
    : { ok: false, error: { code: 'WINDOW_NOT_ACTIVE', message: 'Vercel sign-in must start from the active Chromux window.' } }
));
ipcMain.handle('vercel-oauth-cancel', (event) => {
  if (!win || win.isDestroyed() || event.sender.id !== win.webContents.id) {
    return { ok: false, error: { code: 'WINDOW_NOT_ACTIVE', message: 'Vercel sign-in must be canceled from the active Chromux window.' } };
  }
  vercelOAuth.cancel();
  return { ok: true, kind: 'oauth-canceled' };
});
ipcMain.handle('vercel-ship-preview', (_event, request = {}) => vercelShipping.shipPreview(request));
ipcMain.handle('vercel-ship-start', (event, request = {}) => (
  win && !win.isDestroyed() && event.sender.id === win.webContents.id
    ? vercelShipping.shipStart(request)
    : { ok: false, error: { code: 'WINDOW_NOT_ACTIVE', message: 'Shipping must start from the active Chromux window.' } }
));
ipcMain.handle('vercel-jobs-read', () => vercelShipping.jobsRead());
ipcMain.handle('vercel-job-cancel', (event, id) => (
  win && !win.isDestroyed() && event.sender.id === win.webContents.id
    ? vercelShipping.jobCancel(id)
    : { ok: false, error: { code: 'WINDOW_NOT_ACTIVE', message: 'Shipping controls belong to the active Chromux window.' } }
));
ipcMain.handle('vercel-job-retry', (event, id) => (
  win && !win.isDestroyed() && event.sender.id === win.webContents.id
    ? vercelShipping.jobRetry(id)
    : { ok: false, error: { code: 'WINDOW_NOT_ACTIVE', message: 'Shipping controls belong to the active Chromux window.' } }
));

ipcMain.handle('check-updates', (_e, opts = {}) => getUpdateStatus(opts));
ipcMain.handle('codex-update-check', (_e, opts = {}) => {
  if (SMOKE && process.env.CHROMUX_E2E_CODEX_UPDATE_ERROR === '1') {
    return Promise.resolve({
      currentVersion: null,
      latestVersion: null,
      updateAvailable: null,
      installKind: null,
      releaseUrl: 'https://github.com/openai/codex/releases/latest',
      checkedAt: new Date().toISOString(),
      error: 'Codex update check fixture is offline',
    });
  }
  return codexUpdateService.check({ force: Boolean(opts.force) });
});
ipcMain.handle('codex-update-install', (event) => codexUpdateService.install({
  onProgress: (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send('codex-update-progress', progress);
  },
}));

ipcMain.handle('save-restore-snapshot', (_e, { reason = 'manual', sessions = [], inboxTriage = [] } = {}) => (
  writeRestoreSnapshot({ reason, sessions, inboxTriage })
));

ipcMain.handle('get-restore-snapshot', () => readRestoreSnapshot());
if (SMOKE) ipcMain.handle('test-restore-payload', (_e, payload = {}) => {
  ensureDirs();
  fs.writeFileSync(RESTORE_SESSIONS, JSON.stringify(payload, null, 2) + '\n');
  return readRestoreSnapshot();
});

ipcMain.handle('mark-restore-snapshot-consumed', (_e, { restoreId, restoredSessions = [] } = {}) => (
  markRestoreSnapshotConsumed(restoreId, restoredSessions)
));

ipcMain.handle('resolve-restore-sessions', (_e, { sessions = [] } = {}) => (
  resolveRestoreSessions(sessions)
));

ipcMain.handle('confirm-app-close', (_e, { sessions = [], inboxTriage = [] } = {}) => {
  // An idle quit (no open sessions) must not clobber a pending restore
  // snapshot the user hasn't reopened yet.
  const incoming = Array.isArray(sessions) ? sessions : [];
  const existing = readRestoreSnapshot();
  const pendingOnDisk = existing && !existing.consumed && existing.sessions.length > 0;
  if (incoming.length > 0 || !pendingOnDisk) {
    writeRestoreSnapshot({ reason: 'app-close', sessions: incoming, inboxTriage });
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
  if (process.platform === 'win32') {
    if (!status.windows || !status.windows.complete) {
      return {
        ok: false,
        reason: 'missing-windows-assets',
        message: 'The GitHub Release is missing its Windows installer, full package, or RELEASES manifest.',
        releaseUrl: status.releaseUrl || null,
      };
    }
    try {
      autoUpdater.setFeedURL({ url: status.windows.feedUrl });
      autoUpdater.once('update-downloaded', () => {
        closeConfirmed = true;
        for (const p of ptys.values()) p.kill();
        autoUpdater.quitAndInstall();
      });
      autoUpdater.once('error', (error) => send('update-status', {
        ...status,
        reason: 'windows-update-error',
        message: `Windows update failed: ${error.message}`,
      }));
      autoUpdater.checkForUpdates();
      return { ok: true, command: 'Squirrel.Windows autoUpdater', releaseUrl: status.releaseUrl };
    } catch (error) {
      return {
        ok: false,
        reason: 'windows-update-error',
        message: `Could not start the Windows update: ${error.message}`,
        releaseUrl: status.releaseUrl || null,
      };
    }
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

app.whenReady().then(async () => {
  ensureDirs();
  await initializeRuntime();
  cleanupOrphanedStorage({
    userDataDir: app.getPath('userData'),
    chromuxHome: CHROMUX_HOME,
  });
  initializePreventSleep();
  if (!SMOKE) {
    resourceClient.connect().catch((err) => console.error('resource broker unavailable:', err.message));
  }
  installAppMenu();
  if (process.platform !== 'win32') {
    try { writeSignalClassifier(); hookInstall.helper = true; } catch (err) { console.error('signal classifier write failed; using legacy hooks:', err.message); }
    try { writeClaudeHooksSettings(); hookInstall.claude = true; } catch (err) { console.error('hooks settings write failed:', err.message); }
    try { writeCodexNotifyScript(); hookInstall.codex = true; } catch (err) { console.error('codex notify script write failed:', err.message); }
    try { writeGrokHooks(); hookInstall.grok = true; } catch (err) { console.error('grok hooks write failed:', err.message); }
  } else if (process.platform === 'win32') {
    try { await installWslHooks(); } catch (err) {
      windowsHookWarning = `Agent hooks are unavailable; sessions will run uninstrumented: ${err.message}`;
      runtimeState.readiness.warning = windowsHookWarning;
      console.error('WSL hook install failed:', err.message);
    }
    await refreshWindowsSetupStatus({ migrateExisting: true });
  }
  createWindow();
  if (!SMOKE || process.env.CHROMUX_CAPTURE_CONTROL_SMOKE === '1') {
    initializeCaptureControl().catch((error) => {
      console.error(`capture control unavailable: ${error.message}`);
    });
  }
  getUpdateStatus().then((status) => send('update-status', status)).catch(() => {});
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const p of ptys.values()) p.kill();
  app.quit();
});

app.on('before-quit', (event) => {
  vercelOAuth.cancel();
  if (captureCoordinator?.active && !captureShutdownComplete) {
    event.preventDefault();
    if (!captureShutdownPromise) {
      captureShutdownPromise = captureCoordinator.shutdown().catch((error) => {
        console.error(`recording stop before app shutdown failed: ${error.message}`);
      }).finally(() => {
        captureShutdownComplete = true;
        app.quit();
      });
    }
    return;
  }
  if (preventSleepController) preventSleepController.shutdown();
  resourceClient.close();
  captureCoordinator?.shutdown().catch(() => {});
  captureControlServer?.close().catch(() => {});
  for (const pending of captureRendererPending.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Chromux is shutting down.'));
  }
  captureRendererPending.clear();
  for (const pending of previewRendererPending.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Chromux is shutting down.'));
  }
  previewRendererPending.clear();
});
