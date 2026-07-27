#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ActivityLabRunner } = require('../activity-lab/runner');
const scenarios = require('../activity-lab/scenarios');
const { compareLanes, sanitizeReport } = require('../activity-lab/core');
const pkg = require('../package.json');

if (process.env.CHROMUX_ACTIVITY_LAB_UAT !== '1') {
  console.error('Set CHROMUX_ACTIVITY_LAB_UAT=1 to acknowledge that this opt-in UAT consumes live model turns.');
  process.exit(2);
}

const trace = [];
const results = [];
const finishedResolvers = new Map();
const runner = new ActivityLabRunner({
  send(channel, payload) {
    if (channel === 'activity-lab-trace') trace.push(payload);
    if (channel === 'activity-lab-run-finished') {
      finishedResolvers.get(payload.id)?.();
      finishedResolvers.delete(payload.id);
    }
  },
});

function waitFor(id) {
  return new Promise((resolve) => finishedResolvers.set(id, resolve));
}

async function runScenario(scenario) {
  const startedAt = Date.now();
  if (scenario.control) {
    results.push({
      id: scenario.id, name: scenario.name, turns: 0, startedAt, endedAt: Date.now(),
      outcome: 'completed', mismatches: compareLanes([], 'control'),
    });
    return;
  }
  const ids = Array.from({ length: scenario.turns }, (_, index) => `${scenario.id}-${startedAt}-${index + 1}`);
  const waits = ids.map(waitFor);
  ids.forEach((id) => runner.start({ id, prompt: scenario.prompt, fixture: scenario.fixture || {} }));
  if (scenario.id === 'cancellation') setTimeout(() => ids.forEach((id) => runner.cancel(id)), 1500);
  await Promise.all(waits);
  const rows = trace.filter((row) => ids.includes(row.runId));
  results.push({
    id: scenario.id,
    name: scenario.name,
    turns: scenario.turns,
    startedAt,
    endedAt: Date.now(),
    outcome: rows.some((row) => row.state === 'failed') ? 'failed'
      : (rows.some((row) => row.state === 'cancelled') ? 'cancelled' : 'completed'),
    mismatches: compareLanes(rows),
  });
}

(async () => {
  for (const scenario of scenarios) {
    process.stdout.write(`Running ${scenario.name}…\n`);
    await runScenario(scenario);
  }
  const codexVersion = execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim();
  const report = sanitizeReport({
    chromuxVersion: pkg.version,
    codexVersion,
    scenarios: results,
    trace,
  });
  const output = process.env.CHROMUX_ACTIVITY_LAB_UAT_OUT
    || path.resolve(__dirname, '..', 'docs', 'activity-lab-uat-latest.json');
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`ACTIVITY_LAB_UAT_OK ${output}\n`);
})().catch((error) => {
  runner.shutdown();
  console.error(error);
  process.exitCode = 1;
});
