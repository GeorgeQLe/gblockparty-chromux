'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-full-browser-composer-'));
const homeDir = path.join(tmpDir, 'home');
const projectDir = path.join(homeDir, 'project');
const e2ePath = path.join(tmpDir, 'full-browser-composer-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(projectDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const composer = window.chromuxTestFullBrowserComposer;
  const themes = window.chromuxTestThemes;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const tick = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  expect(composer && themes, 'missing full-browser Composer or theme test API');

  const first = composer.addSession({
    name: 'source',
    agent: 'codex',
    cwd: ${JSON.stringify(projectDir)},
    url: 'https://example.test/current',
    title: 'Current page',
    visibleText: 'Visible browser evidence',
    consoleEntries: Array.from({ length: 55 }, (_, index) => ({
      ts: new Date().toISOString(),
      level: index % 7 === 0 ? 'error' : 'info',
      message: 'console-' + index,
    })),
  });
  const second = composer.addSession({
    name: 'background',
    agent: 'claude',
    cwd: ${JSON.stringify(projectDir)},
    url: 'https://example.test/background',
    title: 'Background page',
  });
  const shell = composer.addSession({
    name: 'shell-target',
    agent: '',
    cwd: ${JSON.stringify(projectDir)},
    url: 'https://example.test/shell',
  });
  const firstPartition = composer.state(first).partitionId;

  composer.focus(first);
  composer.enterFull(first);
  await tick();
  expect(!composer.state(first).composerToggleHidden
    && composer.state(first).toggleText === 'COMPOSE',
  'full-browser rail should expose COMPOSE and no CHAT control');
  composer.clickToggle(first);
  await tick();

  for (const theme of ['blueprint', 'retro-os', 'streak', 'liquid-glass']) {
    themes.select(theme);
    await tick();
    const current = composer.state(first);
    expect(current.open && current.layoutMode === 'browserChromux' && current.composerOpen,
      theme + ' should retain the routed Composer drawer');
    expect(Math.abs(current.browserBounds.left) <= 1
      && Math.abs(current.browserBounds.right - window.innerWidth) <= 1,
    theme + ' browser should stay full width');
    expect(Math.abs(current.composerBounds.left) <= 1
      && Math.abs(current.composerBounds.right - window.innerWidth) <= 1,
    theme + ' Composer drawer should span the renderer');
    expect(Math.abs(current.browserBounds.bottom - current.composerBounds.top) <= 1,
      theme + ' browser should end at the Composer dock');
    expect(Math.abs(current.browserBounds.top - current.titlebarBottom) <= 1,
      theme + ' browser should remain below the titlebar');
    expect(current.browserRailUsable && current.webviewIdentity
      && current.currentUrl === 'https://example.test/current'
      && current.consoleTotal === 55,
    theme + ' should preserve the mounted browser and usable rail');
    expect(!document.querySelector('.chat-timeline, .chat-messages'),
      theme + ' should not render a chat timeline');
  }

  const targetOptions = composer.targetOptions(first);
  expect(targetOptions.filter((option) => option.value !== composer.newSessionTarget).length === 3
    && targetOptions.at(-1).value === composer.newSessionTarget,
  'target picker should list every live session plus New session');
  expect(composer.selectedTarget(first) === first,
    'opening should default routing to the browser paired session');

  composer.setDraft(first, 'paired prompt');
  composer.clearPtyInputs(first);
  const pairedActivity = composer.activityAt(first);
  expect(await composer.submit(first), 'paired routed send should succeed');
  expect(composer.ptyInputs(first).join('').includes('paired prompt')
    && composer.activityAt(first) >= pairedActivity
    && composer.activeId() === first
    && composer.routeStatus(first) === 'Sent to source.',
  'paired send should use recipient PTY state while retaining source focus and feedback');
  expect((await composer.history(first))[0].text === 'paired prompt',
    'paired prompt history should belong to the recipient session');

  composer.escape(first);
  composer.setDraft(first, 'paired source draft');
  composer.rawInput(first, 'paired pending input');
  composer.shortcutOpen(first);
  expect(!(await composer.submit(first))
    && composer.draft(first) === 'paired source draft'
    && composer.routeError(first).includes('pending terminal input'),
  'paired routing should block unresolved terminal input without discarding its draft');
  expect(await composer.resolveConflict(first, 'replace'),
    'paired pending input should remain resolvable through the existing Composer choice');
  composer.setDraft(first, '');

  composer.selectTarget(first, second);
  composer.setTurnState(second, 'working');
  composer.setDraft(first, 'steer the working agent');
  composer.clearPtyInputs(second);
  const sourceActivity = composer.activityAt(first);
  const recipientActivity = composer.activityAt(second);
  expect(await composer.submit(first), 'working agents should accept steering');
  expect(composer.ptyInputs(second).join('').includes('steer the working agent')
    && composer.turnState(second) === 'working'
    && composer.activityAt(second) >= recipientActivity
    && composer.activityAt(first) === sourceActivity
    && composer.activeId() === first,
  'background routing should attribute input, activity, and turn transition to the recipient');
  expect((await composer.history(second))[0].text === 'steer the working agent',
    'background prompt history should be stored under the recipient');

  composer.setDraft(second, 'target-owned draft');
  composer.selectTarget(first, second);
  composer.setDraft(first, 'source draft survives');
  composer.clearPtyInputs(second);
  expect(!(await composer.submit(first))
    && composer.draft(first) === 'source draft survives'
    && composer.ptyInputs(second).length === 0
    && composer.routeError(first).includes('already has a Composer draft')
    && composer.switchOffered(first),
  'routing should block a target-owned Composer draft and preserve the source');
  composer.switchToTarget(first);
  expect(composer.activeId() === second, 'blocked route should offer direct target switching');
  composer.setDraft(second, '');

  composer.focus(first);
  composer.rawInput(second, 'pending terminal input');
  composer.selectTarget(first, second);
  composer.setDraft(first, 'still preserved');
  expect(!(await composer.submit(first))
    && composer.draft(first) === 'still preserved'
    && composer.routeError(first).includes('pending terminal input'),
  'routing should block pending terminal input');
  composer.rawInput(second, '\\x15\\x0b');

  const missing = composer.addSession({
    name: 'soon-missing',
    agent: 'claude',
    cwd: ${JSON.stringify(projectDir)},
  });
  composer.focus(first);
  composer.selectTarget(first, missing);
  composer.close(missing);
  composer.setDraft(first, 'missing target draft');
  expect(!(await composer.submit(first))
    && composer.draft(first) === 'missing target draft'
    && composer.routeError(first).includes('no longer exists'),
  'routing should block a target removed after selection: ' + JSON.stringify({
    target: composer.selectedTarget(first),
    draft: composer.draft(first),
    error: composer.routeError(first),
  }));

  composer.selectTarget(first, shell);
  composer.setDraft(first, 'line one\\nline two');
  composer.clearPtyInputs(shell);
  const originalConfirm = window.confirm;
  window.confirm = () => false;
  expect(!(await composer.submit(first))
    && composer.draft(first) === 'line one\\nline two'
    && composer.ptyInputs(shell).length === 0,
  'recipient shell multiline warning should preserve a cancelled send');
  window.confirm = () => true;
  expect(await composer.submit(first)
    && composer.ptyInputs(shell).join('') === 'line one\\rline two\\r',
  'recipient shell confirmation should allow the exact routed multiline prompt');
  window.confirm = originalConfirm;

  composer.focus(first);
  composer.escape(first);
  await tick();
  expect(!composer.state(first).open, 'Escape should close the full-browser Composer');
  composer.shortcutOpen(first);
  expect(composer.selectedTarget(first) === first,
    'reopening should reset the ephemeral target to the paired session');
  composer.selectTarget(first, second);
  composer.escape(first);
  composer.shortcutOpen(first);
  expect(composer.selectedTarget(first) === first,
    'the previously selected routing target must not persist');

  const evidence = await composer.collectEvidence(first, {
    selector: '#hero',
    outerHTML: '<section id="hero">' + 'z'.repeat(9000) + '</section>',
    pageUrl: 'https://example.test/current',
    pageTitle: 'Current page',
  });
  expect(evidence.visibleTextBytes <= 24576
    && evidence.payload.page.visible_text_truncated === false
    && evidence.payload.console.included === 50
    && evidence.payload.console.total_captured === 55
    && evidence.payload.selection.outer_html.length === 8000,
  'page evidence should preserve existing bounds, console tail, and element truncation');

  const context = await composer.attachCurrentPage(first);
  expect(context && context.payloadPath.endsWith('/payload.yaml')
    && context.screenshotPath.endsWith('/screenshot.png')
    && composer.contexts(first).length === 1,
  'Attach current page should persist evidence before staging a chip');
  const maximumReferences = composer.payloadWithContexts('😀'.repeat(40000),
    Array.from({ length: 5 }, (_, index) => ({
      captureId: 'maximum-' + index,
      payloadPath: '/' + 'p'.repeat(8190),
      screenshotPath: '/' + 's'.repeat(8190),
      url: 'https://example.test/' + 'u'.repeat(1900) + index,
      title: 't'.repeat(500),
      capturedAt: new Date().toISOString(),
    })));
  expect(new TextEncoder().encode(maximumReferences).byteLength <= 65536
    && maximumReferences.includes('1. Payload:')
    && maximumReferences.includes('5. Payload:')
    && maximumReferences.includes('Screenshot:')
    && maximumReferences.includes('URL:')
    && maximumReferences.includes('Title:'),
  'maximum-size attachments should retain bounded references for every staged context');
  const refreshed = await composer.refreshContext(first, context.captureId);
  expect(refreshed && refreshed.captureId !== context.captureId
    && refreshed.payloadPath !== context.payloadPath,
  'refresh should replace a staged evidence record with a newly persisted capture');

  composer.selectTarget(first, second);
  composer.setDraft(first, 'Review the attached page.');
  composer.clearPtyInputs(second);
  expect(await composer.submit(first), 'attached routed send should succeed');
  const deliveredWithEvidence = composer.ptyInputs(second).join('');
  expect(deliveredWithEvidence.includes('Review the attached page.')
    && deliveredWithEvidence.includes('Attached browser evidence:')
    && deliveredWithEvidence.includes('Payload: ' + refreshed.payloadPath)
    && deliveredWithEvidence.includes('Screenshot: ' + refreshed.screenshotPath)
    && deliveredWithEvidence.includes('URL: ' + refreshed.url)
    && deliveredWithEvidence.includes('Title: ' + refreshed.title)
    && composer.contexts(first).length === 0,
  'successful send should append bounded evidence references and clear attachments');

  const failedContext = await composer.attachCurrentPage(first);
  composer.selectTarget(first, second);
  composer.setDraft(second, 'blocking target draft');
  composer.setDraft(first, 'failure preserves everything');
  expect(!(await composer.submit(first))
    && composer.draft(first) === 'failure preserves everything'
    && composer.contexts(first)[0].captureId === failedContext.captureId,
  'failed routing should preserve source draft and staged attachments');
  composer.setDraft(second, '');
  expect(composer.removeFirstContext(first) === 0, 'attachment chips should be removable');

  composer.selectTarget(first, composer.newSessionTarget);
  expect(composer.selectedAgent(first) === 'codex'
    && composer.state(first).agentSelectorVisible,
  'New session should reveal an agent selector defaulted from the source');
  expect(composer.selectAgent(first, 'claude') === 'claude',
    'new-session agent selector should be editable');
  const movedContext = await composer.attachCurrentPage(first);
  composer.setDraft(first, 'Review before sending.');
  const beforeCount = composer.sessionCount();
  const created = await composer.createFromPage(first);
  await tick();
  expect(created && composer.sessionCount() === beforeCount + 1
    && composer.tabCount() === composer.sessionCount()
    && composer.activeId() === created.id,
  'canonical creation should add one normal session tab and activate it: ' + JSON.stringify({
    created, beforeCount, count: composer.sessionCount(), tabs: composer.tabCount(), active: composer.activeId(),
  }));
  expect(created.cwd === ${JSON.stringify(projectDir)}
    && created.runtime === 'host'
    && created.agent === 'claude'
    && created.layoutMode === 'browserChromux'
    && created.fullBrowserComposerOpen
    && created.url === 'https://example.test/current'
    && created.partitionId !== firstPartition,
  'new session should inherit workspace/page while receiving a fresh partition');
  expect(created.draft.includes('Review before sending.')
    && created.draft.includes('Payload: ' + movedContext.payloadPath)
    && created.contexts.length === 1
    && composer.ptyInputs(created.id).length === 0,
  'new session should receive moved attachments and an unsent review draft');
  expect(composer.draft(first) === '' && composer.contexts(first).length === 0,
    'source state should clear only after successful canonical creation');
  composer.leaveFull(created.id, 'terminal');
  expect(composer.sessionCount() === 4
    && composer.tabCount() === 4
    && composer.threadSessionCount() === 4
    && composer.sessionNames().includes(created.name),
  'collapsing the new browser should retain four canonical tabs and Threads entries');

  composer.focus(first);
  composer.enterFull(first);
  composer.shortcutOpen(first);
  composer.selectTarget(first, shell);
  composer.exit(shell, 0);
  composer.setDraft(first, 'exited target draft');
  expect(!(await composer.submit(first))
    && composer.draft(first) === 'exited target draft'
    && composer.routeError(first).includes('has exited'),
  'routing should block a target that exits after selection');

  const snapshot = await window.chromux.saveRestoreSnapshot({
    reason: 'manual',
    sessions: composer.snapshot(),
  });
  const createdRow = snapshot.sessions.find((row) => row.name === created.name);
  expect(snapshot.schemaVersion === 11
    && createdRow.fullBrowserComposerOpen === false
    && createdRow.stagedBrowserContexts.length === 1
    && !Object.prototype.hasOwnProperty.call(createdRow, 'chatMessages')
    && !Object.prototype.hasOwnProperty.call(createdRow, 'chatOpen'),
  'schema v11 should persist staged evidence while discarding chat ledger fields');

  composer.ptyOutput(created.id, 'Claude Code v2.1.0\\r\\n? for shortcuts\\r\\n❯ ');
  await tick();
  composer.enterFull(created.id);
  composer.clickToggle(created.id);
  composer.expand(created.id);
  await tick();
  expect(composer.state(created.id).expanded, 'expanded routed Composer should remain available');
  composer.expand(created.id);

  await wait(20);
  return JSON.stringify({ ok: true });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: {
    ...process.env,
    HOME: homeDir,
    PATH: '/usr/bin:/bin',
    CHROMUX_E2E: e2ePath,
    CHROMUX_E2E_OUT: e2eOutPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGTERM'), 60000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  let report = null;
  try { report = JSON.parse(output); } catch { /* reported below */ }
  if (code !== 0 || signal || !report || report.ok !== true) {
    console.error('FULL_BROWSER_COMPOSER_RENDERER_FAIL');
    console.error({ code, signal, output, stdout, stderr });
    process.exit(1);
  }
  console.log('FULL_BROWSER_COMPOSER_RENDERER_OK');
});
