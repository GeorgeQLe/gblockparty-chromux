'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const pty = require('node-pty');
const attention = require('../renderer/attention');
const signals = require('../renderer/signals');
const {
  boundedAppend,
  extractTerminalTitles,
  parseJsonLines,
  structuredTransition,
  traceRecord,
} = require('./core');

const DEFAULT_TIMEOUT_MS = 90_000;

function makeWorkspace(fixture = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-activity-lab-'));
  for (const [name, value] of Object.entries(fixture)) {
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) continue;
    fs.writeFileSync(path.join(dir, name), String(value), { mode: 0o600 });
  }
  return dir;
}

function writeCodexNotifyScript(cwd) {
  const notifyPath = path.join(cwd, 'chromux-activity-lab-notify.sh');
  fs.writeFileSync(notifyPath, [
    '#!/bin/sh',
    '[ -n "$CHROMUX_SESSION_ID" ] || { : > "$(dirname "$0")/chromux-activity-lab-notify-env-missing"; : > "$(dirname "$0")/chromux-activity-lab-notify-invoked"; exit 0; }',
    'case "$1" in',
    '  *\'"type"\'*\'"agent-turn-complete"\'*) ;;',
    '  *) : > "$(dirname "$0")/chromux-activity-lab-notify-invoked"; exit 0 ;;',
    'esac',
    ': > "$(dirname "$0")/chromux-activity-lab-notify-matched"',
    'if printf \'\\033]777;chromux;v1;turn-end;%s\\007\' "$CHROMUX_SESSION_ID" > /dev/tty 2>/dev/null; then',
    '  : > "$(dirname "$0")/chromux-activity-lab-notify-delivered"',
    'else',
    '  : > "$(dirname "$0")/chromux-activity-lab-notify-delivery-failed"',
    'fi',
    ': > "$(dirname "$0")/chromux-activity-lab-notify-invoked"',
    '',
  ].join('\n'), { mode: 0o700 });
  fs.chmodSync(notifyPath, 0o700);
  return notifyPath;
}

function normalizedScreenText(value) {
  return String(value || '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)/g, '')
    .replace(/\x1b[PX^_][\s\S]*?(?:\x1b\\|$)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/[\x00-\x20\x7f]+/g, '');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

class ActivityLabRunner {
  constructor({ send, codexBin = process.env.CHROMUX_ACTIVITY_LAB_CODEX || 'codex',
    timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.send = typeof send === 'function' ? send : () => {};
    this.codexBin = codexBin;
    this.timeoutMs = timeoutMs;
    this.runs = new Map();
  }

  emit(run, lane, rawType, state, source, confidence, processStatus, detail) {
    const record = traceRecord({
      runId: run.id, lane, rawType, state, source, confidence, processStatus, detail,
    });
    this.send('activity-lab-trace', record);
    return record;
  }

  start({ id, prompt, fixture }) {
    if (this.runs.has(id)) throw new Error(`Run ${id} already exists`);
    const run = { id, cancelled: false, children: [], workspaces: [], timers: [] };
    this.runs.set(id, run);
    const interactiveCwd = makeWorkspace(fixture);
    const referenceCwd = makeWorkspace(fixture);
    run.workspaces.push(interactiveCwd, referenceCwd);
    this.startInteractive(run, interactiveCwd, prompt);
    this.startReference(run, referenceCwd, prompt);
    return { ok: true, id };
  }

  startInteractive(run, cwd, prompt) {
    this.emit(run, 'interactive', 'process-spawned', 'launching', 'process:spawn', 'high', 'running');
    const sessionId = String(run.id).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 120)
      || 'activity-lab';
    const notifyPath = writeCodexNotifyScript(cwd);
    const notifyMarker = path.join(cwd, 'chromux-activity-lab-notify-invoked');
    const notifyEnvMissingMarker = path.join(cwd, 'chromux-activity-lab-notify-env-missing');
    const notifyMatchedMarker = path.join(cwd, 'chromux-activity-lab-notify-matched');
    const notifyDeliveredMarker = path.join(cwd, 'chromux-activity-lab-notify-delivered');
    const notifyDeliveryFailedMarker = path.join(cwd, 'chromux-activity-lab-notify-delivery-failed');
    const notifyConfig = `notify=["${notifyPath.replace(/[\\"]/g, '\\$&')}"]`;
    const codexArgs = [
      '-c', 'tui.theme="ansi"',
      '-c', notifyConfig,
      '-c', 'check_for_update_on_startup=false',
      '-s', 'read-only',
      '-a', 'never',
      '-C', cwd,
    ];
    const useShell = process.platform !== 'win32';
    const command = [this.codexBin, ...codexArgs].map(shellQuote).join(' ');
    const child = pty.spawn(useShell ? '/bin/sh' : this.codexBin,
      useShell ? ['-c', command] : codexArgs, {
      name: 'xterm-color',
      cols: 100,
      rows: 32,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-color',
        NO_COLOR: '1',
        CHROMUX_SESSION_ID: sessionId,
      },
    });
    run.children.push({ lane: 'interactive', child, kill: () => child.kill() });
    let titleBuffer = '';
    let signalBuffer = '';
    let output = '';
    let completionObserved = false;
    let submitted = false;
    let trustHandled = false;
    let submitTimer = null;
    let completionKillTimer = null;
    const observeCompletion = (delayMs) => {
      completionObserved = true;
      if (!completionKillTimer) completionKillTimer = setTimeout(() => child.kill(), delayMs);
    };
    let notifyInvocationObserved = false;
    const notifyProbe = setInterval(() => {
      if (notifyInvocationObserved || !fs.existsSync(notifyMarker)) return;
      notifyInvocationObserved = true;
      const notifySource = fs.existsSync(notifyEnvMissingMarker) ? 'codex:notify-env-missing'
        : (!fs.existsSync(notifyMatchedMarker) ? 'codex:notify-payload-ignored'
          : (fs.existsSync(notifyDeliveryFailedMarker) ? 'codex:notify-delivery-failed'
            : (fs.existsSync(notifyDeliveredMarker) ? 'codex:notify-delivered' : 'codex:notify-invoked')));
      this.emit(run, 'interactive', 'codex-notify-invoked', null,
        notifySource, 'high', 'running');
    }, 100);
    const session = {
      agent: 'codex',
      turn: {
        state: 'idle',
        activityObserved: false,
        completionBlocked: false,
        attentionSeenAt: 0,
        eventIds: [],
      },
    };
    const submitPrompt = () => {
      submitTimer = null;
      if (submitted || run.cancelled
        || !run.children.some((entry) => entry.lane === 'interactive')) return;
      submitted = true;
      attention.applyUserInputTurnTransition(session, `${prompt}\r`, Date.now(), prompt);
      const projected = attention.projectSessionStatus({
        ...session,
        lifecycle: { alive: true },
      }, true);
      this.emit(run, 'interactive', 'submission-projection',
        projected.kind === 'working' ? 'working' : null,
        'chromux:submission-projection', 'high', 'running');
      child.write(`${prompt}\r`);
    };
    child.onData((data) => {
      const parsedSignals = signals.extractChromuxSignals(signalBuffer, data);
      signalBuffer = parsedSignals.buf;
      for (const signal of parsedSignals.signals) {
        if (signal.version !== 'v1' || signal.sessionId !== sessionId || signal.event !== 'turn-end') {
          this.emit(run, 'interactive', 'codex-notify-rejected', null,
            'chromux:osc-rejected', 'none', 'running');
          continue;
        }
        const previous = session.turn.state;
        if (attention.applyTurnSignal(session.turn, signal.event, signal.detail, Date.now())
          && session.turn.state !== previous) {
          if (session.turn.state === 'completed') observeCompletion(150);
          this.emit(run, 'interactive', 'codex-notify', session.turn.state,
            'codex:notify-v1', 'high', 'running');
        }
      }
      output = boundedAppend(output, parsedSignals.clean);
      const screenText = normalizedScreenText(output);
      if (!trustHandled && screenText.includes('Doyoutrustthecontentsofthisdirectory?')
        && screenText.includes('Yes,continue')) {
        trustHandled = true;
        output = '';
        this.emit(run, 'interactive', 'temporary-workspace-trust', 'launching',
          'codex:temporary-workspace-trust', 'high', 'running');
        child.write('1\r');
      } else if (!submitted && !submitTimer
        && (screenText.includes('?forshortcuts') || /Context\d+%left/i.test(screenText))
        && /[›❯]/u.test(screenText)) {
        submitTimer = setTimeout(submitPrompt, 50);
      }
      const parsed = extractTerminalTitles(titleBuffer, parsedSignals.clean);
      titleBuffer = parsed.remainder;
      for (const title of parsed.titles) {
        const previous = session.turn.state;
        const applied = attention.applyCodexTitleEvidence(session, title, Date.now(), false);
        if (applied && session.turn.state !== previous) {
          this.emit(run, 'interactive', 'terminal-title', session.turn.state,
            session.turn.source, session.turn.confidence, 'running');
          if (session.turn.state === 'completed') observeCompletion(500);
        }
        else this.emit(run, 'interactive', 'terminal-title', null, 'codex:title-unrecognized', 'none', 'running');
      }
      const previous = session.turn.state;
      if (attention.applyCodexRenderedCompletionFallback(session, {
        cursorLine: '',
        nearbyLines: [],
        output,
      }, Date.now()) && session.turn.state !== previous) {
        this.emit(run, 'interactive', 'rendered-terminal-fallback', session.turn.state,
          session.turn.source, session.turn.confidence, 'running');
        if (session.turn.state === 'completed') observeCompletion(500);
      }
    });
    child.onExit(({ exitCode, signal }) => {
      if (submitTimer) clearTimeout(submitTimer);
      if (completionKillTimer) clearTimeout(completionKillTimer);
      clearInterval(notifyProbe);
      const state = run.cancelled ? 'cancelled'
        : (completionObserved ? 'completed' : 'failed');
      this.emit(run, 'interactive', 'process-exit', state,
        completionObserved ? 'process:exit' : 'process:exit-before-notify', 'high', 'exited',
        `exit=${exitCode};signal=${signal || 0}`);
      this.finishChild(run, 'interactive');
    });
    this.armTimeout(run, 'interactive');
  }

  startReference(run, cwd, prompt) {
    this.emit(run, 'reference', 'process-spawned', 'launching', 'process:spawn', 'ground-truth', 'running');
    const args = ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules',
      '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never', '-C', cwd, prompt];
    const child = spawn(this.codexBin, args, {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    run.children.push({ lane: 'reference', child, kill: () => child.kill('SIGTERM') });
    let jsonBuffer = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const parsed = parseJsonLines(jsonBuffer, chunk);
      jsonBuffer = parsed.remainder;
      for (const record of parsed.records) {
        const transition = structuredTransition(record);
        this.emit(run, 'reference', record.rawType, transition.state, transition.source,
          transition.confidence, 'running');
      }
    });
    child.stderr.on('data', (chunk) => { stderr = boundedAppend(stderr, chunk); });
    child.on('error', (error) => {
      this.emit(run, 'reference', 'process-error', 'failed', 'process:error', 'ground-truth', 'exited',
        error.message);
    });
    child.on('close', (code, signal) => {
      if (jsonBuffer.trim()) {
        const parsed = parseJsonLines('', `${jsonBuffer}\n`);
        for (const record of parsed.records) {
          const transition = structuredTransition(record);
          this.emit(run, 'reference', record.rawType, transition.state, transition.source,
            transition.confidence, 'exiting');
        }
      }
      const state = run.cancelled ? 'cancelled' : (code === 0 ? 'completed' : 'failed');
      this.emit(run, 'reference', 'process-exit', state,
        code === 0 ? 'process:exit' : 'structured:non-zero-exit', 'ground-truth', 'exited',
        `exit=${code};signal=${signal || 'none'}${stderr ? ';stderr-present=true' : ''}`);
      this.finishChild(run, 'reference');
    });
    this.armTimeout(run, 'reference');
  }

  armTimeout(run, lane) {
    const timer = setTimeout(() => {
      const child = run.children.find((entry) => entry.lane === lane);
      if (!child) return;
      this.emit(run, lane, 'timeout', 'failed', 'process:timeout', 'high', 'terminating');
      child.kill();
    }, this.timeoutMs);
    run.timers.push({ lane, timer });
  }

  finishChild(run, lane) {
    const timer = run.timers.find((entry) => entry.lane === lane);
    if (timer) clearTimeout(timer.timer);
    run.children = run.children.filter((entry) => entry.lane !== lane);
    if (run.children.length) return;
    for (const dir of run.workspaces) fs.rmSync(dir, { recursive: true, force: true });
    this.runs.delete(run.id);
    this.send('activity-lab-run-finished', { id: run.id });
  }

  cancel(id) {
    const run = this.runs.get(id);
    if (!run) return { ok: false, reason: 'not-running' };
    run.cancelled = true;
    for (const entry of run.children) {
      this.emit(run, entry.lane, 'user-cancel', 'cancelled', 'user:cancel', 'high', 'terminating');
      entry.kill();
    }
    return { ok: true };
  }

  shutdown() {
    for (const run of this.runs.values()) this.cancel(run.id);
  }
}

module.exports = {
  ActivityLabRunner,
  DEFAULT_TIMEOUT_MS,
  makeWorkspace,
  normalizedScreenText,
  shellQuote,
  writeCodexNotifyScript,
};
