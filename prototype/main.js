// Chromux v1 — main process.
// Owns: window, PTY sessions (node-pty), capture payload persistence (~/.chromux),
// claude -p delivery adapter, and webview popup interception (review-queue routing).
'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const pty = require('node-pty');
const yaml = require('js-yaml');
const { checkForUpdates } = require('./update-checker');

const SMOKE = process.argv.includes('--smoke');

const CHROMUX_HOME = path.join(os.homedir(), '.chromux');
const CAPTURES_DIR = path.join(CHROMUX_HOME, 'captures');
const DELIVERY_LOG = path.join(CHROMUX_HOME, 'delivery-log.jsonl');
const UPDATE_CACHE = path.join(CHROMUX_HOME, 'update-cache.json');
const RESTORE_SESSIONS = path.join(CHROMUX_HOME, 'restore-sessions.json');
const HOOKS_CLAUDE = path.join(CHROMUX_HOME, 'hooks-claude.json');
const CODEX_NOTIFY = path.join(CHROMUX_HOME, 'codex-notify.sh');
const PACKAGE_PATH = path.join(__dirname, 'package.json');

let win = null;
const ptys = new Map(); // sessionId -> IPty
const deliveries = new Map(); // deliveryId -> ChildProcess
let closeConfirmed = false;

if (SMOKE && !process.env.CHROMUX_KEEP_USER_DATA) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-smoke-user-data-')));
}
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

function ensureDirs() {
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function requestGuardedQuit(reason = 'app-quit') {
  send('lifecycle-confirm-close', {
    reason,
    liveCount: ptys.size,
    alwaysConfirm: reason === 'app-quit',
  });
}

function installAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        {
          label: 'Quit Chromux',
          accelerator: 'Command+Q',
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
  return `printf '{"terminalSequence":"\\\\u001b]777;chromux;v1;${event};%s\\\\u0007"}' "$CHROMUX_SESSION_ID"`;
}

function writeClaudeHooksSettings() {
  ensureDirs();
  const hook = (event) => [{ hooks: [{ type: 'command', command: chromuxHookCommand(event) }] }];
  const settings = {
    hooks: {
      // No SubagentStop on purpose: a subagent finishing must not read as
      // session-level turn completion.
      UserPromptSubmit: hook('turn-start'),
      Notification: hook('input-needed'),
      Stop: hook('turn-end'),
    },
  };
  fs.writeFileSync(HOOKS_CLAUDE, JSON.stringify(settings, null, 2) + '\n');
  return HOOKS_CLAUDE;
}

// Set in app.whenReady: true only after the corresponding hook file was
// written successfully. When false, agents launch uninstrumented instead of
// pointing --settings/notify at a path that was never written.
const hookInstall = { claude: false, codex: false };

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
    'case "$1" in',
    '  *\'"type":"agent-turn-complete"\'*) ;;',
    '  *) exit 0 ;; # only turn completion may signal turn-end',
    'esac',
    'printf \'\\033]777;chromux;v1;turn-end;%s\\007\' "$CHROMUX_SESSION_ID" > /dev/tty 2>/dev/null || true',
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

function sanitizeRestoreSession(session) {
  if (!session || typeof session !== 'object') return null;
  const cwd = typeof session.cwd === 'string' && session.cwd ? session.cwd : os.homedir();
  const agent = ['claude', 'codex', ''].includes(session.agent) ? session.agent : '';
  const queue = Array.isArray(session.queue)
    ? session.queue.map((item) => ({
      url: typeof item.url === 'string' ? item.url : '',
      source: typeof item.source === 'string' ? item.source : 'RESTORE',
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
    const command = resume && session.agent === 'claude'
      ? claudeCommand(resume.id)
      : (resume && session.agent === 'codex' ? codexCommand(resume.id) : null);
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

function getUpdateStatus(opts = {}) {
  return checkForUpdates({
    currentVersion: currentVersion(),
    cacheFile: UPDATE_CACHE,
    manual: Boolean(opts.manual),
    releasesUrl: process.env.CHROMUX_RELEASES_URL,
  });
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
    if (!input.meta || input.alt || input.control) return;
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    if (/^[1-9]$/.test(key)) {
      event.preventDefault();
      send('shortcut-activate-session-index', { index: Number(key) - 1 });
      return;
    }
    if (key === 'j') {
      event.preventDefault();
      send('shortcut-focus-next-queue-item');
      return;
    }
    if (key === 'q') {
      event.preventDefault();
      requestGuardedQuit('app-quit');
    }
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
  const p = pty.spawn(shellPath, ['-l'], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd && fs.existsSync(cwd) ? cwd : os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', CHROMUX: '1', CHROMUX_SESSION_ID: id },
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
  return { ok: true };
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
// claude/codex sessions running inside them, so they can be adopted into
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

// 'claude' | 'codex' | null. Matches the CLI entrypoints only ('claude',
// 'node …/codex'), not helpers like codex's SkyComputerUseClient, and skips
// one-off `claude -p` deliveries (including our own adapter's).
function classifyAgentCommand(command) {
  const tokens = command.split(/\s+/);
  let head = tokens.shift() || '';
  if (path.basename(head) === 'node' && tokens.length) head = tokens.shift();
  const name = path.basename(head);
  if (name === 'claude') return tokens[0] === '-p' ? null : 'claude';
  if (name === 'codex') return 'codex';
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
  }

  const agentRank = { claude: 0, codex: 1, '': 2 };
  rows.sort((a, b) =>
    (agentRank[a.agent] - agentRank[b.agent])
    || (parseInt(a.tty.slice(4), 10) - parseInt(b.tty.slice(4), 10)));
  // tabs empty with rows present ⇒ Chromux lacks macOS Automation permission
  // for Terminal/iTerm2 (or neither is scriptable) — titles are best-effort.
  return { rows, tabTitles: tabs.size > 0, scannedAt: new Date().toISOString() };
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
  version: currentVersion(),
}));

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

app.whenReady().then(() => {
  ensureDirs();
  installAppMenu();
  try { writeClaudeHooksSettings(); hookInstall.claude = true; } catch (err) { console.error('hooks settings write failed:', err.message); }
  try { writeCodexNotifyScript(); hookInstall.codex = true; } catch (err) { console.error('codex notify script write failed:', err.message); }
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
