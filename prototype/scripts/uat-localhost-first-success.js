#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(appDir, '..');
const reportPath = path.join(repoDir, 'docs/testing/localhost-first-success-uat-0.69.2.md');

function parseAllowance(argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-model-turns') values.push(argv[++index]);
    else if (arg.startsWith('--allow-model-turns=')) values.push(arg.slice(arg.indexOf('=') + 1));
    else throw new Error(`unsupported argument: ${arg}`);
  }
  if (values.length !== 1 || values[0] !== '1') {
    throw new Error('refusing live UAT: pass exactly --allow-model-turns 1');
  }
  return 1;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function responseFields(value) {
  const clean = String(value || '')
    .replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, '')
    .replace(/\/Users\/[^\s]+/g, '<local-path>')
    .replace(/[A-Za-z]:\\[^\s]+/g, '<local-path>');
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const verdict = lines.filter((line) => /\bVERDICT:\s*(?:PASS|HOLD)\b/i.test(line)).at(-1) || '';
  const action = lines.filter((line) => /\bACTION:\s*\S+/i.test(line)).at(-1) || '';
  return [verdict, action].map((line) => line.slice(0, 300)).filter(Boolean).join(' ');
}

function markdown(report) {
  const response = responseFields(report.responseExcerpt);
  return `# Localhost first-success UAT — Chromux 0.69.2

- Schema: \`chromux.localhost-first-success.uat/v1\`
- Verdict: **${report.verdict}**
- Candidate SHA: \`${report.candidateSha}\`
- Command: \`npm run uat:localhost-first-success -- --allow-model-turns 1\`
- Started: ${report.startedAt}
- Finished: ${report.finishedAt}

## Fixture and approval

- Fixture: \`${report.fixtureUrl}\`
- Health: ${report.healthOk ? 'HTTP 200 / healthy' : 'failed'}
- Queue detected: ${report.queueDetectedAt}
- Explicit OPEN: ${report.openedAt}
- Automatic navigation before OPEN: ${report.autoNavigated ? 'yes (failure)' : 'no'}
- Loaded marker: \`${report.loadedMarker}\`

## Attachment and routing

- Source alias: \`fixture-shell\`
- Selected target alias: \`chosen-codex\`
- Decoy alias: \`decoy-codex\`
- Attached: ${report.attachedAt}
- Payload: exists=${report.payload.exists}, bytes=${report.payload.bytes}
- Screenshot: exists=${report.screenshot.exists}, bytes=${report.screenshot.bytes}
- Selected target Composer writes: ${report.targetWrites}
- Decoy Composer writes: ${report.decoyWrites}
- Submitted model turns: ${report.submittedTurns}
- Retry count after submission: ${report.retryCount}

## Bounded response and actionability

> ${response || '(no qualifying response captured)'}

- References a visible fixture marker: ${report.responseHasMarker ? 'yes' : 'no'}
- Recommends a concrete action: ${report.responseHasAction ? 'yes' : 'no'}

## Cleanup

- Managed sessions stopped: ${report.sessionsStopped ? 'yes' : 'no'}
- Fixture listener stopped: ${report.listenerStopped ? 'yes' : 'no'}
- Temporary Chromux profile removed: ${report.tempProfileRemoved ? 'yes' : 'no'}
- Temporary capture directory removed: ${report.tempCaptureRemoved ? 'yes' : 'no'}
- Failure reasons: ${report.failureReasons.length ? report.failureReasons.join('; ') : 'none'}
`;
}

(async () => {
  parseAllowance(process.argv.slice(2));
  const candidateSha = git('rev-parse', 'HEAD');
  const port = await reservePort();
  const fixtureUrl = `http://localhost:${port}/`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-localhost-first-success-uat-'));
  const chromuxHome = path.join(tmpDir, 'chromux-home');
  const e2ePath = path.join(tmpDir, 'uat.js');
  const outPath = path.join(tmpDir, 'uat.json');
  const startedAt = new Date().toISOString();
  const serverPath = path.join(appDir, 'examples/localhost-first-success/server.js');

  fs.writeFileSync(e2ePath, `
(async () => {
  const u = window.chromuxTestLocalhostFirstSuccess;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const waitFor = async (predicate, timeoutMs, label) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('timeout waiting for ' + label);
  };
  const fixtureUrl = ${JSON.stringify(fixtureUrl)};
  const events = {};
  let submittedTurns = 0;
  let source = null;
  let target = null;
  let decoy = null;
  try {
    source = await u.createManagedSession({
      name: 'fixture-shell',
      cwd: ${JSON.stringify(appDir)},
      agent: '',
      command: ${JSON.stringify(`PORT=${port} node '${serverPath.replace(/'/g, `'\\''`)}'`)},
      activate: true
    });
    await waitFor(() => u.queueUrls(source).includes(fixtureUrl), 15000, 'fixture URL queue detection');
    events.queueDetectedAt = new Date().toISOString();
    events.autoNavigated = u.currentUrl(source) !== null;
    expect(!events.autoNavigated, 'fixture auto-navigated before approval');
    u.openQueued(source, fixtureUrl);
    events.openedAt = new Date().toISOString();
    const page = await waitFor(async () => {
      const candidate = await u.page(source);
      return candidate && !candidate.loading
        && candidate.visibleText.includes('Release status: candidate ready for review')
        ? candidate : null;
    }, 15000, 'fixture page load');

    await new Promise((resolve) => setTimeout(resolve, 250));
    let context = await u.attach(source);
    for (let attempt = 0; context && !context.screenshotPath && attempt < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      context = await u.refresh(source, context.captureId);
    }
    expect(context?.payloadPath && context?.screenshotPath, 'attachment artifacts missing');
    events.attachedAt = new Date().toISOString();

    target = await u.createManagedSession({
      name: 'chosen-codex', cwd: ${JSON.stringify(repoDir)}, agent: 'codex', activate: false
    });
    decoy = await u.createManagedSession({
      name: 'decoy-codex', cwd: ${JSON.stringify(repoDir)}, agent: 'codex', activate: false
    });
    await waitFor(() => /OpenAI Codex/i.test(u.terminalText(target)), 20000, 'chosen Codex readiness');
    await waitFor(() => /OpenAI Codex/i.test(u.terminalText(decoy)), 20000, 'decoy Codex readiness');

    u.selectTarget(source, target);
    u.setDraft(source,
      'Review only the attached localhost fixture evidence. Return exactly two short fields: ' +
      'VERDICT: PASS or HOLD, citing one visible fixture marker; ACTION: one concrete next action.'
    );
    expect(await u.submit(source), 'Composer rejected the bounded prompt');
    submittedTurns += 1;
    events.submittedAt = new Date().toISOString();
    const targetInput = u.ptyInputs(target).join('');
    const decoyInput = u.ptyInputs(decoy).join('');
    expect(targetInput.includes('Review only the attached localhost fixture evidence.'),
      'chosen target did not receive the bounded prompt');
    expect(targetInput.includes('Attached browser evidence:')
      && targetInput.includes('Payload: ' + context.payloadPath)
      && targetInput.includes('Screenshot: ' + context.screenshotPath),
    'chosen target did not receive attachment references');
    expect(decoyInput === '', 'decoy target received input');

    const responseText = await waitFor(() => {
      const text = u.terminalText(target, 30000);
      return /VERDICT:\\s*(?:PASS|HOLD)/i.test(text)
        && /ACTION:\\s*\\S+/i.test(text)
        && /Release status|Visible blocker|Copy\\/action target/i.test(text)
        ? text : null;
    }, 120000, 'one Codex response');
    const marker = /Release status|Visible blocker|Copy\\/action target/i.test(responseText);
    const action = /ACTION:\\s*[^\\r\\n]{8,}/i.test(responseText);
    expect(marker, 'response did not cite a visible fixture marker');
    expect(action, 'response did not recommend a concrete action');
    const writes = {
      target: u.ptyInputs(target).length,
      decoy: u.ptyInputs(decoy).length
    };
    expect(writes.target === 2, 'chosen target must receive one prompt plus Enter');
    expect(writes.decoy === 0, 'decoy target received input');
    const paths = { payload: context.payloadPath, screenshot: context.screenshotPath };
    u.closeAll();
    return JSON.stringify({
      ok: true,
      events,
      submittedTurns,
      retryCount: 0,
      pageMarker: 'Release status: candidate ready for review',
      paths,
      writes,
      responseExcerpt: responseText.slice(-4000)
    });
  } catch (error) {
    u.closeAll();
    return JSON.stringify({
      ok: false,
      events,
      submittedTurns,
      retryCount: 0,
      error: error.message
    });
  }
})()
`);

  const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
  const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
    cwd: appDir,
    env: {
      ...process.env,
      CHROMUX_HOME_DIR: chromuxHome,
      CHROMUX_E2E: e2ePath,
      CHROMUX_E2E_OUT: outPath,
      CHROMUX_E2E_SHOW_WINDOW: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const healthPromise = (async () => {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${fixtureUrl}healthz`, { signal: AbortSignal.timeout(500) });
        if (response.status === 200 && (await response.json()).ok === true) return true;
      } catch { /* fixture session may still be starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  })();
  const killTimer = setTimeout(() => child.kill('SIGTERM'), 180_000);
  const exit = await new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  clearTimeout(killTimer);
  const healthOk = await healthPromise;

  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch { raw = { ok: false, error: 'missing UAT result' }; }
  const failureReasons = [];
  if (exit.code !== 0 || exit.signal) failureReasons.push(`Electron exit ${exit.code ?? exit.signal}`);
  if (!raw.ok) failureReasons.push(raw.error || 'UAT assertion failed');
  if (raw.submittedTurns > 1) failureReasons.push('model-turn allowance exceeded');
  if (!healthOk) failureReasons.push('fixture health endpoint failed');

  const artifact = (name) => {
    const artifactPath = raw.paths?.[name];
    try { return { exists: true, bytes: fs.statSync(artifactPath).size }; }
    catch { return { exists: false, bytes: 0 }; }
  };
  const payload = artifact('payload');
  const screenshot = artifact('screenshot');
  if (!payload.exists || !screenshot.exists) failureReasons.push('attachment artifacts missing');

  let listenerStopped = false;
  try {
    await fetch(`${fixtureUrl}healthz`, { signal: AbortSignal.timeout(500) });
  } catch { listenerStopped = true; }
  if (!listenerStopped) failureReasons.push('fixture listener remains reachable');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  const report = {
    verdict: failureReasons.length ? 'HOLD' : 'PASS',
    candidateSha,
    startedAt,
    finishedAt: new Date().toISOString(),
    fixtureUrl,
    healthOk,
    queueDetectedAt: raw.events?.queueDetectedAt || 'not observed',
    openedAt: raw.events?.openedAt || 'not observed',
    autoNavigated: Boolean(raw.events?.autoNavigated),
    loadedMarker: raw.pageMarker || 'not observed',
    attachedAt: raw.events?.attachedAt || 'not observed',
    payload,
    screenshot,
    targetWrites: raw.writes?.target ?? 0,
    decoyWrites: raw.writes?.decoy ?? 0,
    submittedTurns: raw.submittedTurns || 0,
    retryCount: raw.retryCount || 0,
    responseExcerpt: raw.responseExcerpt || '',
    responseHasMarker: /Release status|Visible blocker|Copy\/action target/i.test(responseFields(raw.responseExcerpt)),
    responseHasAction: /ACTION:\s*\S+/i.test(responseFields(raw.responseExcerpt)),
    sessionsStopped: exit.code === 0 && !exit.signal,
    listenerStopped,
    tempProfileRemoved: !fs.existsSync(chromuxHome),
    tempCaptureRemoved: !fs.existsSync(path.join(chromuxHome, 'captures')),
    failureReasons,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, markdown(report));
  if (report.verdict !== 'PASS') {
    console.error(`localhost first-success UAT: HOLD (${failureReasons.join('; ')})`);
    if (stderr.trim()) console.error(stderr.trim().slice(-2000));
    process.exitCode = 1;
    return;
  }
  assert.equal(report.submittedTurns, 1);
  console.log(`localhost first-success UAT: PASS (${candidateSha.slice(0, 12)})`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
