'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ActivityLabRunner } = require('../activity-lab/runner');

const fake = path.join(__dirname, 'fixtures', 'fake-codex-activity.js');
fs.chmodSync(fake, 0o755);

async function run() {
  const events = [];
  let resolveFinished;
  const finished = new Promise((resolve) => { resolveFinished = resolve; });
  const runner = new ActivityLabRunner({
    codexBin: fake,
    timeoutMs: 3000,
    send(channel, payload) {
      events.push({ channel, payload });
      if (channel === 'activity-lab-run-finished') resolveFinished(payload);
    },
  });
  runner.start({ id: 'isolated-a', prompt: 'fixture', fixture: { 'marker.txt': 'marker' } });
  await finished;
  const trace = events.filter((row) => row.channel === 'activity-lab-trace').map((row) => row.payload);
  assert.ok(trace.some((row) => row.lane === 'interactive' && row.state === 'launching'));
  assert.ok(trace.some((row) => row.lane === 'interactive'
    && row.rawType === 'submission-projection' && row.state === 'working'));
  assert.ok(trace.some((row) => row.lane === 'interactive'
    && row.rawType === 'codex-notify-invoked' && row.source === 'codex:notify-delivered'));
  assert.ok(trace.some((row) => row.lane === 'interactive'
    && row.rawType === 'codex-notify' && row.state === 'completed'));
  assert.ok(trace.some((row) => row.lane === 'reference' && row.source === 'structured:turn.started'));
  assert.ok(trace.some((row) => row.lane === 'reference' && row.source === 'structured:turn.completed'));
  assert.ok(trace.filter((row) => row.rawType === 'process-exit').every((row) => row.state === 'completed'));

  const cancelEvents = [];
  let resolveCancelled;
  const cancelled = new Promise((resolve) => { resolveCancelled = resolve; });
  process.env.FAKE_CODEX_DELAY_MS = '1000';
  const cancelRunner = new ActivityLabRunner({
    codexBin: fake,
    timeoutMs: 3000,
    send(channel, payload) {
      cancelEvents.push({ channel, payload });
      if (channel === 'activity-lab-run-finished') resolveCancelled(payload);
    },
  });
  cancelRunner.start({ id: 'cancel-a', prompt: 'fixture' });
  setTimeout(() => cancelRunner.cancel('cancel-a'), 60);
  await cancelled;
  delete process.env.FAKE_CODEX_DELAY_MS;
  assert.ok(cancelEvents.some((row) => row.payload.state === 'cancelled'));
  assert.strictEqual(cancelRunner.runs.size, 0);

  const timeoutEvents = [];
  let resolveTimedOut;
  const timedOut = new Promise((resolve) => { resolveTimedOut = resolve; });
  process.env.FAKE_CODEX_DELAY_MS = '1000';
  const timeoutRunner = new ActivityLabRunner({
    codexBin: fake,
    timeoutMs: 50,
    send(channel, payload) {
      timeoutEvents.push({ channel, payload });
      if (channel === 'activity-lab-run-finished') resolveTimedOut(payload);
    },
  });
  timeoutRunner.start({ id: 'timeout-a', prompt: 'fixture' });
  await timedOut;
  delete process.env.FAKE_CODEX_DELAY_MS;
  assert.ok(timeoutEvents.some((row) => row.payload.rawType === 'timeout' && row.payload.state === 'failed'));
  assert.ok(timeoutEvents.filter((row) => row.channel === 'activity-lab-trace')
    .every((row) => row.payload.runId === 'timeout-a'));
  assert.strictEqual(timeoutRunner.runs.size, 0);
  console.log('ACTIVITY_LAB_RUNNER_OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
