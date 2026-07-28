#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createFixtureServer } = require('../examples/localhost-first-success/server');

function closeChild(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  child.kill('SIGTERM');
  return new Promise((resolve) => child.once('close', resolve));
}

(async () => {
  const fixture = createFixtureServer({ port: 0, log: () => {} });
  const ready = await fixture.ready;
  const appDir = path.resolve(__dirname, '..');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-localhost-first-success-'));
  const homeDir = path.join(tmpDir, 'home');
  const chromuxHome = path.join(tmpDir, 'chromux-home');
  const e2ePath = path.join(tmpDir, 'e2e.js');
  const outPath = path.join(tmpDir, 'e2e.json');
  fs.mkdirSync(homeDir, { recursive: true });

  fs.writeFileSync(e2ePath, `
(async () => {
  const q = window.chromuxTestPreviews;
  const c = window.chromuxTestFullBrowserComposer;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const waitFor = async (predicate, timeoutMs, label) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('timeout waiting for ' + label);
  };
  const url = ${JSON.stringify(ready.localUrl)};
  const source = c.addLiveBrowserSession({ name: 'fixture-shell', agent: '', cwd: ${JSON.stringify(appDir)} });
  const target = c.addSession({ name: 'chosen-codex', agent: 'codex', cwd: ${JSON.stringify(appDir)} });
  const decoy = c.addSession({ name: 'decoy-codex', agent: 'codex', cwd: ${JSON.stringify(appDir)} });

  q.focus(source);
  q.feed(source, 'Local: ' + url + '\\r\\n');
  await waitFor(() => q.queueUrls(source).includes(url), 3000, 'queued fixture URL');
  expect(q.currentUrl(source) === null, 'detected URL navigated without approval');
  const queuedAt = new Date().toISOString();
  q.openQueued(source, url);
  const openedAt = new Date().toISOString();
  const page = await waitFor(async () => {
    const candidate = await c.livePage(source);
    return candidate && !candidate.loading
      && candidate.visibleText.includes('Release status: candidate ready for review')
      ? candidate : null;
  }, 15000, 'real fixture page load');
  expect(page.visibleText.includes('Visible blocker: approval transcript is not archived'), 'missing blocker marker');
  expect(page.visibleText.includes('Copy/action target: archive the approved UAT transcript'), 'missing action marker');

  await new Promise((resolve) => setTimeout(resolve, 250));
  let context = await c.attachCurrentPage(source);
  for (let attempt = 0; context && !context.screenshotPath && attempt < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    context = await c.refreshContext(source, context.captureId);
  }
  expect(context && context.payloadPath && context.screenshotPath, 'page attachment did not persist both artifacts');
  expect(c.contexts(source).length === 1, 'page attachment was not staged');
  const attachedAt = new Date().toISOString();

  c.selectTarget(source, target);
  c.setDraft(source, 'Return VERDICT: and ACTION: for the attached fixture.');
  c.clearPtyInputs(target);
  c.clearPtyInputs(decoy);
  expect(await c.submit(source), 'routed Composer submit failed');
  const targetInput = c.ptyInputs(target).join('');
  const decoyInput = c.ptyInputs(decoy).join('');
  expect(targetInput.includes('Return VERDICT: and ACTION:'), 'chosen target did not receive prompt');
  expect(targetInput.includes('Attached browser evidence:'), 'chosen target did not receive attachment references');
  expect(targetInput.includes('Payload: ' + context.payloadPath), 'chosen target did not receive payload path');
  expect(targetInput.includes('Screenshot: ' + context.screenshotPath), 'chosen target did not receive screenshot path');
  expect(decoyInput === '', 'decoy target received routed input');

  q.feed(target, 'VERDICT: HOLD — Visible blocker remains.\\r\\nACTION: Archive the approved UAT transcript.\\r\\n');
  const response = await waitFor(() => {
    const text = c.ptyInputs(target).join('') + ' VERDICT: HOLD — Visible blocker remains. ACTION: Archive the approved UAT transcript.';
    return text.includes('VERDICT:') && text.includes('ACTION:') ? text : null;
  }, 1000, 'fake actionable response');

  let timedOut = false;
  try { await waitFor(() => false, 60, 'intentional timeout'); } catch { timedOut = true; }
  expect(timedOut, 'timeout path did not reject');

  return JSON.stringify({
    ok: true,
    url,
    queuedAt,
    openedAt,
    attachedAt,
    pageTitle: page.title,
    payloadPath: context.payloadPath,
    screenshotPath: context.screenshotPath,
    payloadBytes: 0,
    screenshotBytes: 0,
    targetWrites: c.ptyInputs(target).length,
    decoyWrites: c.ptyInputs(decoy).length,
    responseHasMarker: response.includes('Visible blocker'),
    responseHasAction: response.includes('Archive the approved UAT transcript'),
    timedOut
  });
})()
`);

  const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
  const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
    cwd: appDir,
    env: {
      ...process.env,
      HOME: homeDir,
      PATH: '/usr/bin:/bin',
      CHROMUX_HOME_DIR: chromuxHome,
      CHROMUX_E2E: e2ePath,
      CHROMUX_E2E_OUT: outPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill('SIGTERM'), 45_000);

  try {
    const exit = await new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
    clearTimeout(timeout);
    const raw = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    let report;
    try { report = JSON.parse(raw); } catch { report = null; }
    assert.deepEqual(exit, { code: 0, signal: null }, `stdout=${stdout}\nstderr=${stderr}`);
    assert(report?.ok, `missing E2E report: ${raw}\nstdout=${stdout}\nstderr=${stderr}`);
    const payload = fs.statSync(report.payloadPath);
    const screenshot = fs.statSync(report.screenshotPath);
    assert(payload.size > 0 && payload.size <= 128 * 1024, `payload bytes: ${payload.size}`);
    assert(screenshot.size > 0 && screenshot.size <= 8 * 1024 * 1024, `screenshot bytes: ${screenshot.size}`);
    assert(fs.readFileSync(report.payloadPath, 'utf8').includes(ready.localUrl));
    assert.equal(report.targetWrites, 2, 'prompt and Enter must be the only chosen-target writes');
    assert.equal(report.decoyWrites, 0);
    assert(report.responseHasMarker && report.responseHasAction && report.timedOut);
  } finally {
    clearTimeout(timeout);
    await closeChild(child);
    await fixture.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  assert.equal(fixture.server.listening, false);
  console.log('localhost first-success Electron tests: ok');
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
