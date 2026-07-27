'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const pty = require('node-pty');
const attention = require('../renderer/attention');
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
    const child = pty.spawn(this.codexBin, ['-s', 'read-only', '-a', 'never', '-C', cwd, prompt], {
      name: 'xterm-color',
      cols: 100,
      rows: 32,
      cwd,
      env: { ...process.env, TERM: 'xterm-color', NO_COLOR: '1' },
    });
    run.children.push({ lane: 'interactive', child, kill: () => child.kill() });
    let titleBuffer = '';
    let output = '';
    const session = {
      agent: 'codex',
      turn: {
        state: 'pending',
        activityObserved: false,
        completionBlocked: false,
        attentionSeenAt: 0,
      },
    };
    child.onData((data) => {
      output = boundedAppend(output, data);
      const parsed = extractTerminalTitles(titleBuffer, data);
      titleBuffer = parsed.remainder;
      for (const title of parsed.titles) {
        const previous = session.turn.state;
        const applied = attention.applyCodexTitleEvidence(session, title, Date.now(), false);
        if (applied && session.turn.state !== previous) {
          this.emit(run, 'interactive', 'terminal-title', session.turn.state,
            session.turn.source, session.turn.confidence, 'running');
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
      }
    });
    child.onExit(({ exitCode, signal }) => {
      const state = run.cancelled ? 'cancelled' : (exitCode === 0 ? 'completed' : 'failed');
      this.emit(run, 'interactive', 'process-exit', state, 'process:exit', 'high', 'exited',
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

module.exports = { ActivityLabRunner, DEFAULT_TIMEOUT_MS, makeWorkspace };
