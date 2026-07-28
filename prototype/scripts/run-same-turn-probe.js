#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pty = require('node-pty');
const {
  startLifecycleSidecar,
} = require('../codex-app-server-lifecycle');

function parseArgs(argv) {
  const valueAt = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : null;
  };
  const rawAllowed = valueAt('--allow-model-turns');
  const allowed = Number(rawAllowed);
  if (rawAllowed === null || rawAllowed === '' || !Number.isSafeInteger(allowed) || allowed < 0) {
    throw new Error('Refusing live execution without --allow-model-turns <count>');
  }
  const scenario = valueAt('--scenario') || 'gate1';
  const output = valueAt('--out') || null;
  return { allowed, scenario, output };
}

function liveScenarios(name) {
  const response = {
    id: 'response-only',
    prompt: 'Reply with exactly: CHROMUX_PROBE_OK',
    cancel: false,
  };
  const cancellation = {
    id: 'cancellation',
    prompt: 'Think carefully for at least 20 seconds, then reply with exactly: CHROMUX_PROBE_CANCEL.',
    cancel: true,
  };
  const filesystem = {
    id: 'read-only-filesystem',
    prompt: 'Read marker.txt and reply with only its single-line contents.',
    fixture: { 'marker.txt': 'CHROMUX_READ_ONLY_OK\n' },
    cancel: false,
  };
  const concurrentA = {
    id: 'concurrent-a',
    prompt: 'Reply with exactly: CHROMUX_CONCURRENT_A',
    cancel: false,
  };
  const concurrentB = {
    id: 'concurrent-b',
    prompt: 'Reply with exactly: CHROMUX_CONCURRENT_B',
    cancel: false,
  };
  if (name === 'gate1') return [response, cancellation];
  if (name === 'gate2') return [filesystem, concurrentA, concurrentB];
  if (name === 'idle') return [];
  throw new Error(`Unknown scenario set: ${name}`);
}

function processTableRows() {
  return execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n');
}

function codexExecPids(rows = processTableRows()) {
  return new Set(rows.flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+.*(?:^|\s)codex\s+exec(?:\s|$)/);
    return match ? [Number(match[1])] : [];
  }));
}

function makeWorkspace(fixture = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-same-turn-'));
  for (const [name, contents] of Object.entries(fixture)) {
    fs.writeFileSync(path.join(dir, name), contents, { mode: 0o444 });
  }
  fs.chmodSync(dir, 0o555);
  return dir;
}

function removeWorkspace(dir) {
  try { fs.chmodSync(dir, 0o700); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
}

async function runOne(scenario, codexBin) {
  const cwd = makeWorkspace(scenario.fixture);
  const events = [];
  let turnStarted = false;
  let tui;
  let completionResolve;
  let completionReject;
  const completion = new Promise((resolve, reject) => {
    completionResolve = resolve;
    completionReject = reject;
  });
  const timeout = setTimeout(() => completionReject(new Error(`${scenario.id} timed out`)), 90_000);
  const sidecar = await startLifecycleSidecar({
    codexBin, cwd,
    onLifecycle(event) {
      const clean = { ...event };
      events.push(clean);
      if (clean.method === 'turn/started') {
        turnStarted = true;
        if (scenario.cancel && tui) setTimeout(() => tui.write('\x03'), 250);
      }
      if (clean.method === 'turn/completed') completionResolve(clean);
    },
  });
  if (!sidecar.ok) {
    clearTimeout(timeout);
    removeWorkspace(cwd);
    return { id: scenario.id, ok: false, billable: false, reason: sidecar.reason, cliVersion: sidecar.cliVersion };
  }
  let outputBytes = 0;
  let exit = null;
  try {
    tui = pty.spawn(codexBin, [
      'resume', sidecar.threadId, scenario.prompt, '--remote', sidecar.remote,
      '-s', 'read-only', '-a', 'never', '-C', cwd, '--no-alt-screen',
    ], {
      name: 'xterm-color', cols: 100, rows: 32, cwd,
      env: { ...process.env, TERM: 'xterm-color', NO_COLOR: '1' },
    });
    tui.onData((chunk) => { outputBytes = Math.min(256 * 1024, outputBytes + Buffer.byteLength(chunk)); });
    tui.onExit((status) => { exit = { exitCode: status.exitCode, signal: status.signal || 0 }; });
    const completed = await completion;
    const read = await sidecar.readThread();
    const readThreadId = read?.thread?.id;
    const readTurnIds = (read?.thread?.turns || []).map((turn) => turn?.id).filter((id) => typeof id === 'string');
    const started = events.filter((event) => event.method === 'turn/started');
    const completedRows = events.filter((event) => event.method === 'turn/completed');
    const uniqueTurnIds = [...new Set(events.map((event) => event.turnId))];
    const stoppedWithinMs = Math.max(0, Date.now() - completed.at);
    return {
      id: scenario.id,
      ok: started.length === 1 && completedRows.length === 1
        && uniqueTurnIds.length === 1
        && sidecar.threadId === completed.threadId
        && readThreadId === sidecar.threadId
        && readTurnIds.includes(completed.turnId)
        && stoppedWithinMs <= 250,
      billable: turnStarted,
      cliVersion: sidecar.cliVersion,
      threadId: sidecar.threadId,
      turnId: completed.turnId,
      status: completed.status,
      eventCounts: { started: started.length, completed: completedRows.length },
      threadReadConsistent: readThreadId === sidecar.threadId && readTurnIds.includes(completed.turnId),
      stoppedWithinMs,
      outputBytesObserved: outputBytes,
      tuiProcess: exit || { exitCode: null, signal: null },
    };
  } catch (error) {
    return {
      id: scenario.id, ok: false, billable: turnStarted, cliVersion: sidecar.cliVersion,
      reason: error.message,
    };
  } finally {
    clearTimeout(timeout);
    if (tui) {
      try { tui.kill(); } catch {}
    }
    await sidecar.cleanup();
    removeWorkspace(cwd);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenarios = liveScenarios(args.scenario);
  if (scenarios.length > args.allowed) {
    throw new Error(`Scenario ${args.scenario} requires ${scenarios.length} turns; allowance is ${args.allowed}`);
  }
  const beforeExec = codexExecPids();
  const results = args.scenario === 'gate2'
    ? [await runOne(scenarios[0], 'codex'), ...(await Promise.all(scenarios.slice(1).map((row) => runOne(row, 'codex'))))]
    : await (async () => {
      const rows = [];
      for (const scenario of scenarios) rows.push(await runOne(scenario, 'codex'));
      return rows;
    })();
  const afterExec = codexExecPids();
  const finalProcessRows = processTableRows();
  const spawnedExecPids = [...afterExec].filter((pid) => !beforeExec.has(pid));
  const billedTurns = results.filter((row) => row.billable).length;
  const uniqueTurnIds = [...new Set(results.map((row) => row.turnId).filter(Boolean))];
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scenario: args.scenario,
    allowance: args.allowed,
    billedTurns,
    uniqueTurnCount: uniqueTurnIds.length,
    noCodexExecSpawned: spawnedExecPids.length === 0,
    results,
    cleanup: {
      workspacePrefixRemaining: fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('chromux-same-turn-')).length,
      lifecyclePrefixRemaining: fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('chromux-codex-lifecycle-')).length,
      childProcessCount: finalProcessRows.filter((line) => (
        line.includes('chromux-same-turn-') || line.includes('chromux-codex-lifecycle-')
      )).length,
    },
  };
  report.ok = results.every((row) => row.ok)
    && billedTurns <= args.allowed
    && uniqueTurnIds.length === billedTurns
    && report.noCodexExecSpawned
    && report.cleanup.workspacePrefixRemaining === 0
    && report.cleanup.lifecyclePrefixRemaining === 0
    && report.cleanup.childProcessCount === 0;
  if (args.output) fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});
