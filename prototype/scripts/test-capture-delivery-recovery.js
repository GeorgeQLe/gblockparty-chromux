#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const reportPath = path.resolve(appDir, '..', 'docs', 'testing', 'capture-delivery-recovery-uat-0.69.4.md');
const writeReport = process.argv.includes('--write-report');
const screenshotBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

if (process.platform === 'win32') {
  console.log('CAPTURE_DELIVERY_RECOVERY_OK (POSIX manual-retry fixture skipped on Windows)');
  process.exit(0);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function waitForChild(child, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('timed out waiting for recovery UAT Electron process'));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

function sanitizedCapturePath(file) {
  return `<isolated-chromux-home>/captures/<capture>/${path.basename(file)}`;
}

function renderReport(result) {
  return `# Capture Delivery Failure-Recovery UAT — v0.69.4

Date: ${new Date().toISOString().slice(0, 10)}

Result: **PASS**

## Scope

This deterministic UAT exercised Chromux's real Electron capture persistence
and \`claude -p\` delivery adapter with an isolated home directory. A controlled
local CLI fixture deliberately failed the first delivery, and the exact
documented manual retry form then delivered the same persisted YAML payload.
No real Claude account, credential, network request, or model turn was used.

## Sanitized transcript

| Step | Operator-visible action or result | Evidence |
| --- | --- | --- |
| 1 | Prepare capture before delivery | Payload and screenshot were written beneath the isolated Chromux capture directory. |
| 2 | Send through \`claude -p\` | Fixture exited ${result.failureExit}; delivery output reported \`${result.failureMarker}\`. |
| 3 | Inspect retained artifacts | Payload remained ${result.payloadBytes} bytes with SHA-256 \`${result.payloadSha256}\`; screenshot remained ${result.screenshotBytes} bytes with SHA-256 \`${result.screenshotSha256}\`. |
| 4 | Inspect delivery history | \`delivery-log.jsonl\` retained one failed \`claude -p\` attempt for the same payload path and exit ${result.failureExit}. |
| 5 | Follow documented retry route | Ran \`cd '<project>' && claude -p "$(cat '<payload>')"\` with no file edits or replacement. |
| 6 | Confirm recovery | Fixture exited 0 and reported the persisted YAML content SHA-256 \`${result.retryInputSha256}\` after shell-standard trailing-newline removal. |
| 7 | Recheck artifacts | Payload and screenshot hashes were unchanged after recovery. |

## Artifact boundary

- Payload: \`${sanitizedCapturePath(result.payloadPath)}\`
- Screenshot: \`${sanitizedCapturePath(result.screenshotPath)}\`
- Delivery log: \`<isolated-chromux-home>/delivery-log.jsonl\`
- Fixture invocation count: ${result.fixtureInvocations} (one induced failure,
  one documented retry)
- Temporary profile, capture files, fixture executable, and delivery log were
  removed after these bounded facts were recorded.

## What this proves

- Chromux persists capture artifacts before invoking its delivery adapter.
- A failed adapter attempt does not delete or rewrite the payload or screenshot.
- The failed attempt is recorded with the same payload path.
- The documented manual retry command can deliver the persisted payload content
  after a deliberately induced transient failure. Shell command substitution
  removes the file's trailing newline; it does not rewrite the artifact.
- Recovery required no hidden mutation or credential intervention.

This is a controlled recovery-mechanism proof, not evidence that an inactive
Claude subscription can authenticate successfully. Real account recovery would
still require valid Claude access.
`;
}

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-delivery-recovery-'));
  const homeDir = path.join(tmpDir, 'home');
  const chromuxHome = path.join(tmpDir, 'chromux-home');
  const projectDir = path.join(tmpDir, 'project');
  const fixtureBin = path.join(tmpDir, 'bin');
  const fixtureState = path.join(tmpDir, 'fixture-state.json');
  const fixtureShell = path.join(tmpDir, 'fixture-shell');
  const fakeClaude = path.join(fixtureBin, 'claude');
  const e2ePath = path.join(tmpDir, 'delivery-recovery-e2e.js');
  const e2eOutPath = path.join(tmpDir, 'e2e.out');
  const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
  const fixturePath = [fixtureBin, path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter);
  let child = null;
  let stdout = '';
  let stderr = '';

  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(fixtureBin, { recursive: true });
  fs.writeFileSync(fixtureShell, `#!/bin/sh
if [ "$1" = "-lc" ]; then
  shift
  exec /bin/sh -c "$1"
fi
exec /bin/sh "$@"
`, { mode: 0o755 });
  fs.writeFileSync(fakeClaude, `#!${process.execPath}
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const statePath = process.env.CHROMUX_RECOVERY_FIXTURE_STATE;
const args = process.argv.slice(2);
if (args[0] === '-p') args.shift();
let input = args.join(' ');
function finish() {
  let count = 0;
  try { count = JSON.parse(fs.readFileSync(statePath, 'utf8')).count || 0; } catch {}
  count += 1;
  fs.writeFileSync(statePath, JSON.stringify({ count }));
  if (count === 1) {
    process.stderr.write('FIXTURE_INDUCED_DELIVERY_FAILURE\\n');
    process.exit(23);
  }
  const digest = crypto.createHash('sha256').update(input).digest('hex');
  process.stdout.write(JSON.stringify({ status: 'RECOVERED', payloadSha256: digest }) + '\\n');
}
if (input) finish();
else {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', finish);
}
`, { mode: 0o755 });

  fs.writeFileSync(e2ePath, `
(async () => {
  const close = new Promise((resolve) => {
    window.chromux.onDeliverClose((event) => {
      if (event.deliveryId === 'recovery-fixture-delivery') resolve(event);
    });
  });
  let output = '';
  window.chromux.onDeliverOutput((event) => {
    if (event.deliveryId === 'recovery-fixture-delivery') output += event.chunk;
  });
  const prepared = await window.chromux.capturePrepare({
    schema_version: 1,
    captured_at: '2026-07-28T17:00:00.000Z',
    session: { id: 'recovery-fixture', name: 'recovery-fixture', project_path: ${JSON.stringify(projectDir)} },
    page: { url: 'http://127.0.0.1:5199/recovery', title: 'Recovery fixture' },
    selection: { selector: '#recovery-target', outer_html: '<button id="recovery-target">Retry</button>', truncated: false },
    console: { total_captured: 1, included: 1, truncated: false, entries: [{ ts: '2026-07-28T17:00:00.000Z', level: 'error', message: 'fixture delivery unavailable' }] },
    delivery: { adapter: 'claude -p', target: 'recovery-fixture', target_cwd: ${JSON.stringify(projectDir)} },
    notes: 'Verify persisted evidence survives an induced delivery failure.',
  }, ${JSON.stringify(screenshotBase64)});
  await window.chromux.deliverClaude({
    deliveryId: 'recovery-fixture-delivery',
    payloadPath: prepared.payloadPath,
    yamlText: prepared.yamlText,
    cwd: ${JSON.stringify(projectDir)},
    targetSession: 'recovery-fixture',
    notes: 'Verify persisted evidence survives an induced delivery failure.',
  });
  const outcome = await Promise.race([
    close,
    new Promise((_, reject) => setTimeout(() => reject(new Error('delivery close timeout')), 10000)),
  ]);
  return JSON.stringify({ ok: true, prepared, outcome, output });
})()
`);

  try {
    child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
      cwd: appDir,
      env: {
        ...process.env,
        HOME: homeDir,
        PATH: fixturePath,
        SHELL: fixtureShell,
        CHROMUX_HOME_DIR: chromuxHome,
        CHROMUX_RECOVERY_FIXTURE_STATE: fixtureState,
        CHROMUX_E2E: e2ePath,
        CHROMUX_E2E_OUT: e2eOutPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const exited = await waitForChild(child);
    assert.equal(exited.code, 0, `Electron recovery fixture exited ${exited.code}: ${stderr || stdout}`);
    assert.equal(exited.signal, null);
    assert(fs.existsSync(e2eOutPath), 'Electron recovery fixture did not write its result');

    const e2e = JSON.parse(fs.readFileSync(e2eOutPath, 'utf8'));
    assert.equal(e2e.ok, true);
    assert.equal(e2e.outcome.exitCode, 23, 'first delivery must be the induced failure');
    assert.match(e2e.output, /FIXTURE_INDUCED_DELIVERY_FAILURE/);

    const payloadPath = e2e.prepared.hostPayloadPath;
    const screenshotPath = e2e.prepared.hostScreenshotPath;
    const captureRoot = path.resolve(chromuxHome, 'captures') + path.sep;
    assert(path.resolve(payloadPath).startsWith(captureRoot), 'payload escaped isolated capture root');
    assert(path.resolve(screenshotPath).startsWith(captureRoot), 'screenshot escaped isolated capture root');
    const payloadBefore = fs.readFileSync(payloadPath);
    const screenshotBefore = fs.readFileSync(screenshotPath);
    const payloadSha256 = sha256(payloadBefore);
    const retryInputSha256 = sha256(payloadBefore.toString('utf8').replace(/\n+$/, ''));
    const screenshotSha256 = sha256(screenshotBefore);

    const deliveryLogPath = path.join(chromuxHome, 'delivery-log.jsonl');
    const deliveryLog = fs.readFileSync(deliveryLogPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(deliveryLog.length, 1, 'the induced app delivery should create one log entry');
    assert.equal(deliveryLog[0].adapter, 'claude -p');
    assert.equal(deliveryLog[0].payload_path, e2e.prepared.payloadPath);
    assert.equal(deliveryLog[0].exit_status, 23);

    const retryCommand = `cd ${shellQuote(projectDir)} && claude -p "$(cat ${shellQuote(e2e.prepared.payloadPath)})"`;
    const retry = spawnSync(fixtureShell, ['-lc', retryCommand], {
      cwd: projectDir,
      env: {
        ...process.env,
        PATH: fixturePath,
        CHROMUX_RECOVERY_FIXTURE_STATE: fixtureState,
      },
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.equal(retry.status, 0, `documented retry failed: ${retry.stderr}`);
    const retryResult = JSON.parse(retry.stdout.trim());
    assert.equal(retryResult.status, 'RECOVERED');
    assert.equal(
      retryResult.payloadSha256,
      retryInputSha256,
      'manual retry must receive the persisted YAML content except for shell-stripped trailing newlines',
    );
    assert.equal(sha256(fs.readFileSync(payloadPath)), payloadSha256, 'manual retry must not rewrite the payload');
    assert.equal(sha256(fs.readFileSync(screenshotPath)), screenshotSha256, 'manual retry must not rewrite the screenshot');

    const fixtureInvocations = JSON.parse(fs.readFileSync(fixtureState, 'utf8')).count;
    assert.equal(fixtureInvocations, 2, 'recovery must use exactly one failure and one retry');

    const result = {
      failureExit: e2e.outcome.exitCode,
      failureMarker: 'FIXTURE_INDUCED_DELIVERY_FAILURE',
      payloadPath,
      screenshotPath,
      payloadBytes: payloadBefore.length,
      screenshotBytes: screenshotBefore.length,
      payloadSha256,
      retryInputSha256,
      screenshotSha256,
      fixtureInvocations,
    };
    if (writeReport) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, renderReport(result));
    }
    console.log('CAPTURE_DELIVERY_RECOVERY_OK');
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('close', resolve));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error('CAPTURE_DELIVERY_RECOVERY_FAIL');
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
