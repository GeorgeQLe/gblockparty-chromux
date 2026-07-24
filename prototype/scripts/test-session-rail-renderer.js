'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-session-rail-'));
const homeDir = path.join(tmpDir, 'home');
const repoDir = path.join(tmpDir, 'fleet-repo');
const repoAppDir = path.join(repoDir, 'apps', 'web');
const repoApiDir = path.join(repoDir, 'apps', 'api');
const looseDir = path.join(tmpDir, 'scratch');
const e2ePath = path.join(tmpDir, 'session-rail-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

for (const directory of [homeDir, repoAppDir, repoApiDir, looseDir]) fs.mkdirSync(directory, { recursive: true });
execFileSync('/usr/bin/git', ['init', '-q', repoDir]);
fs.writeFileSync(path.join(repoDir, 'tracked.txt'), 'staged\n');
execFileSync('/usr/bin/git', ['-C', repoDir, 'add', 'tracked.txt']);
fs.appendFileSync(path.join(repoDir, 'tracked.txt'), 'unstaged\n');
fs.writeFileSync(path.join(repoAppDir, 'new-file.js'), 'export default true;\n');
const canonicalRepoDir = fs.realpathSync(repoDir);

fs.writeFileSync(e2ePath, `
(async () => {
  const rail = window.chromuxTestRail;
  if (!rail) throw new Error('Missing session rail test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(100);

  const holder = rail.addTerminalSession({ name: 'holder', agent: '', cwd: ${JSON.stringify(looseDir)} });
  const web = rail.addTerminalSession({ name: 'web-agent', agent: 'codex', cwd: ${JSON.stringify(repoAppDir)}, cols: 72, rows: 18 });
  const api = rail.addSession({ name: 'api-agent', agent: 'claude', cwd: ${JSON.stringify(repoApiDir)} });
  const webTwo = rail.addTerminalSession({ name: 'web-review', agent: 'grok', cwd: ${JSON.stringify(repoAppDir)}, cols: 54, rows: 14 });
  rail.focus(holder);
  expect(rail.threadSort() === 'recent' && rail.storedThreadSort() === 'recent',
    'Recent should be the validated and persisted default thread order');
  expect(JSON.stringify(rail.migrateThreadSort('invalid')) === JSON.stringify({ mode: 'recent', stored: 'recent' }),
    'invalid thread order preferences should migrate to Recent');
  expect(rail.threadSortControl().text === 'RECENT' && !rail.threadSortControl().hidden
    && rail.threadSortControl().label === 'Thread order: Recent',
  'Threads should expose a compact accessible Recent sort control');
  rail.focusThreadSortControl();
  expect(rail.threadSortControl().focused, 'thread sort control should accept keyboard focus');

  rail.setActivity(holder, 1000);
  rail.setActivity(web, 3000);
  rail.setActivity(api, 2000);
  rail.setActivity(webTwo, 4000);
  let sortedGroups = rail.groups().filter((group) => group.key.startsWith('cwd:'));
  expect(sortedGroups.map((group) => group.label).join(',') === 'web,api,scratch',
    'Recent should order directory groups by their newest contained session');
  expect(sortedGroups[0].rows.map((row) => row.id).join(',') === [webTwo, web].join(','),
    'Recent should order rows within a directory newest first');
  rail.selectThreadSort('az');
  sortedGroups = rail.groups().filter((group) => group.key.startsWith('cwd:'));
  expect(rail.storedThreadSort() === 'az' && rail.threadSortControl().text === 'A–Z',
    'A–Z should update and persist the header control');
  expect(sortedGroups.map((group) => group.label).join(',') === 'api,scratch,web',
    'A–Z should alphabetize directory display labels');
  expect(sortedGroups.find((group) => group.label === 'web').rows.map((row) => row.name).join(',') === 'web-agent,web-review',
    'A–Z should alphabetize session display labels within a directory');
  rail.selectThreadSort('recent');

  const activityProbe = rail.addTerminalSession({
    name: 'activity-probe', agent: 'codex', cwd: ${JSON.stringify(looseDir)}, cols: 44, rows: 10,
  });
  rail.focus(holder);
  rail.setActivity(activityProbe, 5000);
  rail.ptyOutput(activityProbe, 'streaming output\\r\\n');
  expect(rail.activityAt(activityProbe) === 5000, 'streaming PTY output must not change recent activity');
  await wait(5);
  rail.focus(activityProbe);
  expect(rail.activityAt(activityProbe) > 5000, 'focusing a session should update recent activity');
  rail.focus(holder);
  rail.setActivity(activityProbe, 6000);
  await wait(5);
  rail.submit(activityProbe, 'terminal prompt\\r');
  const terminalSubmittedAt = rail.activityAt(activityProbe);
  expect(terminalSubmittedAt > 6000, 'submitted terminal input should update recent activity');
  rail.setActivity(activityProbe, 7000);
  await wait(5);
  expect(await rail.submitComposer(activityProbe, 'composer prompt'), 'composer fixture should submit');
  expect(rail.activityAt(activityProbe) > 7000, 'submitted composer input should update recent activity');
  rail.setActivity(activityProbe, 8000);
  await wait(5);
  rail.emit(activityProbe, 'turn-end');
  const transitionedAt = rail.activityAt(activityProbe);
  expect(transitionedAt > 8000, 'an actual turn-state transition should update recent activity');
  rail.emit(activityProbe, 'turn-end');
  expect(rail.activityAt(activityProbe) === transitionedAt, 'a duplicate turn signal must not change recent activity');
  rail.close(activityProbe);

  await rail.write(web, Array.from({ length: 340 }, (_, index) => 'older line ' + index + '\\r\\n').join('')
    + '\\x1b[31mRECENT RED\\x1b[0m\\r\\ninitial output');
  rail.sourceScroll(web, -9);

  rail.emit(web, 'turn-start');
  rail.emit(web, 'turn-end', 'First background completion');
  expect(rail.attentionCount() === 1, 'background completion should increment attention count');
  expect(rail.mode() === 'threads' && rail.storedMode() === 'threads', 'Threads should be the persisted default');
  expect(JSON.stringify(rail.migrateMode('attention')) === JSON.stringify({ mode: 'threads', stored: 'threads' }),
    'saved Attention preference should migrate to Threads');
  expect(JSON.stringify(rail.migrateMode('invalid')) === JSON.stringify({ mode: 'threads', stored: 'threads' }),
    'invalid rail preference should migrate to Threads');
  expect(rail.heading() === 'THREADS', 'Threads should set contextual heading');
  expect(rail.attentionCount() === 1, 'Threads badge should count individual outstanding items');

  const nav = rail.nav();
  expect(nav.length === 2 && nav.map((item) => item.mode).join(',') === 'threads,git'
    && nav.every((item) => item.label && item.title), 'rail should expose only accessible Threads and Git Changes controls');
  expect(nav.find((item) => item.mode === 'threads').pressed === 'true', 'selected rail control needs pressed state');
  const modeButtons = [...document.querySelectorAll('[data-rail-mode]')];
  for (const button of modeButtons) {
    button.focus();
    expect(document.activeElement === button, 'each icon control should accept keyboard focus');
  }
  const threadGroups = rail.groups();
  const webGroup = threadGroups.find((group) => group.title === ${JSON.stringify(repoAppDir)});
  const needsAttention = threadGroups.find((group) => group.key === 'attention:needs');
  expect(needsAttention && needsAttention.label === 'NEEDS ATTENTION' && needsAttention.count === 1 && needsAttention.open,
    'Threads should pin outstanding sessions in an expanded Needs Attention section');
  expect(webGroup && webGroup.label === 'web' && webGroup.count === 1 && webGroup.open,
    'attentive sessions should be deduplicated from their exact-cwd group');
  expect(threadGroups.some((group) => group.title === ${JSON.stringify(repoApiDir)} && group.count === 1),
    'different exact cwd should form another Threads group');
  expect(needsAttention.rows.find((row) => row.id === web).status === 'Completed', 'attentive row needs accessible status');

  const sourceBefore = rail.sourceState(web);
  expect(sourceBefore.baseY > sourceBefore.viewportY, 'source fixture should begin scrolled away from its latest output');
  rail.hoverRow(web);
  await wait(120);
  expect(!rail.preview() && rail.activeId() === holder,
    'hover preview should remain closed before the 250 ms delay');
  rail.unhoverRow(web);
  await wait(170);
  expect(!rail.preview(), 'leaving an inactive row before 250 ms should cancel its pending preview');
  rail.hoverRow(web);
  await wait(270);
  let preview = rail.preview();
  expect(preview && preview.sessionId === web && rail.activeId() === holder,
    '250 ms hover should open one anchored preview without changing the active session');
  expect(!preview.focused && preview.role === 'region',
    'preview should be a non-modal region that does not steal keyboard focus');
  expect(preview.ariaLabel.includes('web-agent') && preview.labelledBy === 'thread-terminal-preview-title'
    && preview.footer.includes('CLICK TO OPEN SESSION') && preview.footer.includes('ESC FROM ROW TO CLOSE'),
    'preview should expose its session and activation/dismissal instructions');
  expect(preview.cwdTitle === ${JSON.stringify(repoAppDir)}, 'preview should preserve the full cwd in its tooltip');
  expect(preview.text.includes('RECENT RED') && preview.coloredCells > 0, 'serialized mirror should preserve recent terminal text and ANSI colors');
  expect(preview.bufferLength <= 300 + preview.rows, 'serialized mirror should bound recent scrollback to 300 rows');
  expect(preview.cols === preview.sourceCols && preview.rows === preview.sourceRows,
    'preview should retain source terminal columns and rows while visually scaling');
  const sourceAfterPreview = rail.sourceState(web);
  expect(sourceAfterPreview.viewportY === sourceBefore.viewportY && sourceAfterPreview.baseY === sourceBefore.baseY,
    'opening and serializing a preview must not move the source terminal viewport');
  expect(rail.rowState(web).ariaExpanded === 'true' && rail.rowState(web).ariaControls === 'thread-terminal-preview',
    'inactive preview row should expose expanded and controls ARIA state');
  expect(rail.rowState(holder).ariaCurrent === 'true', 'active Threads row should expose aria-current');
  rail.unhoverRow(web);
  await wait(80);
  rail.hoverPreview();
  await wait(100);
  expect(rail.preview()?.sessionId === web,
    'moving from a row into its preview within the 150 ms grace period should keep it open');
  rail.focusRow(web);
  rail.unhoverPreview();
  await wait(170);
  expect(rail.preview()?.sessionId === web && rail.rowState(web).focused,
    'row focus should keep its preview open after the pointer leaves both surfaces');
  await rail.write(web, '\\r\\nLIVE UPDATE');
  await wait(80);
  preview = rail.preview();
  expect(preview.text.includes('LIVE UPDATE') && preview.refreshCount >= 2, 'subsequent terminal writes should refresh the live mirror');
  const previewRowBeforeTitle = document.querySelector('#thread-list .rail-session-row[data-session-id="' + CSS.escape(web) + '"]');
  rail.title(web, 'Live preview title');
  await wait(60);
  const previewRowAfterTitle = document.querySelector('#thread-list .rail-session-row[data-session-id="' + CSS.escape(web) + '"]');
  const synchronizedPreviewRow = rail.groups().flatMap((group) => group.rows).find((row) => row.id === web);
  expect(previewRowAfterTitle === previewRowBeforeTitle,
    'presentation-only title updates should preserve the exact Threads row DOM node');
  expect(rail.preview()?.title === 'Live preview title' && rail.preview()?.ariaLabel.includes('Live preview title')
    && rail.rowState(web).ariaExpanded === 'true',
  'title updates should synchronize the open preview heading without replacing its anchor');
  expect(synchronizedPreviewRow.name === 'Live preview title'
    && synchronizedPreviewRow.title.includes('Live preview title')
    && synchronizedPreviewRow.ariaLabel.includes('Live preview title')
    && synchronizedPreviewRow.status === 'Completed',
  'title updates should synchronize Threads text, tooltip, ARIA label, and status metadata');
  await rail.write(web, '\\x1b[?1049h\\x1b[HALTERNATE PREVIEW');
  await wait(80);
  expect(rail.preview()?.text.includes('ALTERNATE PREVIEW'), 'live mirror should reproduce alternate-screen content');
  await rail.write(web, '\\x1b[?1049l');
  await wait(80);
  expect(rail.preview()?.text.includes('LIVE UPDATE'), 'leaving alternate screen should restore the mirrored normal buffer');
  expect(rail.cue(web).ptyInput === '', 'preview rendering must never send PTY input');

  rail.rowKey(web, 'Escape');
  expect(!rail.preview() && rail.rowState(web).focused, 'Escape should dismiss preview and restore focus to its row');
  expect(rail.rowState(web).ariaExpanded === 'false', 'dismissal should reset expanded ARIA state');
  rail.focusThreadSortControl();
  rail.focusRow(web);
  expect(rail.preview()?.sessionId === web && rail.rowState(web).focused,
    'keyboard focus should open the inactive row preview immediately without moving focus');
  rail.unhoverRow(web);
  rail.unhoverPreview();
  rail.focusThreadSortControl();
  rail.clearPreviewPointerPresence();
  await wait(80);
  expect(rail.preview()?.sessionId === web,
    'focus departure should retain the preview during the 150 ms grace period');
  await wait(120);
  expect(!rail.preview(), 'preview should close after focus and pointer leave both surfaces for 150 ms');
  rail.setPreviewSize('compact');
  rail.focusRow(web);
  await wait(40);
  const compactWidth = rail.preview().width;
  rail.setPreviewSize('large');
  await wait(60);
  expect(rail.preview().width > compactWidth + 100, 'Large accessibility size should materially increase effective terminal text space');
  expect(rail.previewSize().value === 'large' && rail.previewSize().stored === 'large' && rail.previewSize().control === 'large',
    'preview size should update state, Settings, and local persistence together');
  rail.setPreviewSize('comfortable');
  await wait(40);
  expect(rail.clickRow(web) === web, 'one click on an inactive ordinary row should activate its session');
  await wait(80);
  expect(!rail.preview() && rail.sourceState(web).focused,
    'ordinary-row single-click activation should dismiss preview and restore terminal focus');
  expect(rail.turnState(web).state === 'idle', 'opening completed session should consume it to idle');

  rail.select('threads');
  const consumedWeb = rail.groups().flatMap((group) => group.rows).find((row) => row.id === web);
  expect(consumedWeb && consumedWeb.status === 'Idle', 'consumed completion should render Idle in Threads');
  expect(rail.groups().find((group) => group.title === ${JSON.stringify(repoAppDir)})?.count === 2,
    'session should return to its exact-cwd group immediately after its final attention item clears');
  rail.clickRow(web);
  await wait(40);
  expect(!rail.preview(), 'clicking the already-active row should skip preview');
  await wait(40);
  expect(rail.rowState(web).confirm && rail.cue(web).pane, 'active-row click should link row and terminal confirmation animations');
  rail.clickRow(web);
  await wait(40);
  expect(rail.rowState(web).confirm && rail.cue(web).pane, 'repeated active-row clicks should restart both confirmation cues');
  rail.setReducedMotion(true);
  rail.clickRow(web);
  await wait(40);
  expect(rail.rowState(web).staticConfirm && rail.cue(web).staticPane, 'reduced motion should use an immediate static row and pane highlight');
  rail.setReducedMotion(null);

  expect(!rail.attentionKinds().includes('COMPLETED'), 'seen completion should leave unified Threads attention');
  rail.focus(holder);
  expect(!rail.attentionKinds().includes('COMPLETED'), 'seen completion should stay removed after focus changes');
  rail.emit(web, 'turn-start');
  rail.emit(web, 'turn-end', 'Second background completion');
  expect(rail.attentionKinds().includes('COMPLETED'), 'a subsequent background turn should create new unseen completion');

  rail.focus(api);
  rail.emit(api, 'turn-start');
  rail.emit(api, 'turn-end');
  expect(rail.turnState(api).state === 'idle', 'active completion should transition directly to idle');
  rail.focus(holder);
  expect(rail.attentionKinds().filter((kind) => kind === 'COMPLETED').length === 1,
    'completion in active session should never appear later');
  rail.emit(api, 'permission-required', 'Approve command');
  expect(rail.attentionKinds().includes('PERMISSION'), 'background actionable state should appear');
  rail.queue(api, 'http://localhost:49151/api-preview');
  const apiCard = rail.attentionCards().find((card) => card.id === api);
  expect(apiCard && apiCard.reasons.map((reason) => reason.kind).join(',') === 'PERMISSION,QUEUE 1',
    'one attentive thread should aggregate simultaneous reasons in priority order');
  expect(rail.attentionCount() === 3, 'badge should continue to count individual reasons, not attentive sessions');
  const attentionOrder = rail.groups().find((group) => group.key === 'attention:needs').rows.map((row) => row.id);
  rail.selectThreadSort('az');
  expect(rail.groups().find((group) => group.key === 'attention:needs').rows.map((row) => row.id).join(',')
    === attentionOrder.join(','),
  'A–Z must leave Needs Attention urgency ordering unchanged');
  rail.selectThreadSort('recent');
  expect(rail.groups().find((group) => group.key === 'attention:needs').rows.map((row) => row.id).join(',')
    === attentionOrder.join(','),
  'Recent must leave Needs Attention urgency ordering unchanged');
  const initialAttentionGeometry = rail.attentionGeometry();
  expect(initialAttentionGeometry.cards.length >= 2 && initialAttentionGeometry.gaps.every((gap) => gap >= 5.9),
    'Needs Attention cards should have at least 6px of visual separation');
  expect(initialAttentionGeometry.firstInset >= 5.9 && initialAttentionGeometry.lastInset >= 5.9,
    'Needs Attention cards should remain inside the group padding');
  rail.hoverRow(web);
  await wait(270);
  expect(rail.preview()?.sessionId === web, 'ordinary row should still open a preview before inline action test');
  rail.clickAttentionAction(api, 'QUEUE 1', 'OPEN');
  expect(!rail.preview() && rail.activeId() === api, 'inline attention actions should act directly without opening a thread preview');
  rail.focus(holder);
  rail.focus(api);
  rail.focus(holder);
  expect(rail.turnState(api).state === 'permission' && rail.attentionKinds().includes('PERMISSION'),
    'opening actionable session must not clear its state or attention');

  rail.select('threads');
  rail.emit(webTwo, 'turn-start');
  const worker = rail.addSession({ name: 'api-worker', agent: 'claude', cwd: ${JSON.stringify(looseDir)} });
  rail.emit(worker, 'turn-start');
  rail.setActivity(webTwo, 3000);
  rail.setActivity(worker, 2000);
  let workingGroup = rail.groups().find((group) => group.key === 'status:working');
  expect(workingGroup && workingGroup.label === 'WORKING' && workingGroup.open && workingGroup.count === 2,
    'Threads should pin every actively working session in an expanded Working section');
  expect(workingGroup.rows.map((row) => row.id).sort().join(',') === [webTwo, worker].sort().join(','),
    'Working section membership should include all and only sessions with an agent turn in progress');
  expect(workingGroup.rows.map((row) => row.id).join(',') === [webTwo, worker].join(','),
    'Recent should order Working rows newest first');
  rail.selectThreadSort('az');
  workingGroup = rail.groups().find((group) => group.key === 'status:working');
  expect(workingGroup.rows.map((row) => row.id).join(',') === [worker, webTwo].join(','),
    'A–Z should alphabetize Working rows by session display label');
  rail.selectThreadSort('recent');
  expect(!rail.groups().filter((group) => group.key.startsWith('cwd:')).flatMap((group) => group.rows)
    .some((row) => row.id === webTwo || row.id === worker),
  'working sessions should be deduplicated from working-directory groups');

  const workingRowsHost = document.querySelector(
    '#thread-list .working-thread-group > .rail-group-rows',
  );
  const workingRowBeforeFrames = workingRowsHost.querySelector(
    '.rail-session-row[data-session-id="' + CSS.escape(webTwo) + '"]',
  );
  const spinnerBeforeFrames = workingRowBeforeFrames.querySelector('.rail-status');
  const spinnerAnimation = spinnerBeforeFrames.getAnimations()[0];
  expect(spinnerAnimation, 'working Threads status should expose a live CSS Animation object');
  await wait(35);
  let animationTime = Number(spinnerAnimation.currentTime) || 0;
  const recentOrderBeforeFrames = [...workingRowsHost.querySelectorAll(':scope > .rail-session-row')]
    .map((row) => row.dataset.sessionId);
  let mountedRowMovements = 0;
  const movementObserver = new MutationObserver((records) => {
    mountedRowMovements += records.filter((record) => record.type === 'childList'
      && (record.addedNodes.length || record.removedNodes.length)).length;
  });
  movementObserver.observe(workingRowsHost, { childList: true });
  for (const frame of ['\u2839 Dynamic review title', '\u2838 Dynamic review title', '\u283c Dynamic review title']) {
    rail.title(webTwo, frame);
    await wait(35);
    const frameRow = workingRowsHost.querySelector(
      '.rail-session-row[data-session-id="' + CSS.escape(webTwo) + '"]',
    );
    const frameSpinner = frameRow.querySelector('.rail-status');
    const frameAnimation = frameSpinner.getAnimations()[0];
    const nextAnimationTime = Number(frameAnimation?.currentTime) || 0;
    expect(frameRow === workingRowBeforeFrames && frameSpinner === spinnerBeforeFrames,
      'animated Codex title frames should preserve the exact Working row and spinner element');
    expect(frameAnimation === spinnerAnimation && nextAnimationTime >= animationTime,
      'animated Codex title frames should preserve the spinner Animation object and elapsed time');
    animationTime = nextAnimationTime;
  }
  movementObserver.disconnect();
  const recentOrderAfterFrames = [...workingRowsHost.querySelectorAll(':scope > .rail-session-row')]
    .map((row) => row.dataset.sessionId);
  expect(mountedRowMovements === 0
    && JSON.stringify(recentOrderAfterFrames) === JSON.stringify(recentOrderBeforeFrames),
  'animated Codex title frames must not move mounted rows or change Recent order');

  rail.selectThreadSort('az');
  const azRowsHost = document.querySelector('#thread-list .working-thread-group > .rail-group-rows');
  const azOrderBeforeRename = [...azRowsHost.querySelectorAll(':scope > .rail-session-row')]
    .map((row) => row.dataset.sessionId);
  rail.title(webTwo, '\u2839 Aardvark review');
  const azOrderAfterRename = [...azRowsHost.querySelectorAll(':scope > .rail-session-row')]
    .map((row) => row.dataset.sessionId);
  expect(azOrderBeforeRename[0] === worker && azOrderAfterRename[0] === webTwo,
    'A–Z should still reorder mounted Working rows when the normalized display label changes');
  rail.selectThreadSort('recent');

  rail.close(worker);
  workingGroup = rail.groups().find((group) => group.key === 'status:working');
  expect(workingGroup && workingGroup.count === 1 && workingGroup.rows[0].id === webTwo,
    'Working section should remove a session immediately when it closes');
  const workingRowBeforeTitle = document.querySelector('#thread-list .rail-session-row[data-session-id="' + CSS.escape(webTwo) + '"]');
  workingRowBeforeTitle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  rail.title(webTwo, '\u2839 Dynamic review title');
  const workingRowAfterTitle = document.querySelector('#thread-list .rail-session-row[data-session-id="' + CSS.escape(webTwo) + '"]');
  workingRowBeforeTitle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  rail.hoverRow(webTwo);
  await wait(270);
  expect(workingRowAfterTitle === workingRowBeforeTitle && rail.preview()?.sessionId === webTwo,
    'a pointer interaction spanning a working title update should retain its row and hover preview');
  rail.unhoverRow(webTwo);
  rail.outsideClick();
  expect(rail.groups().flatMap((group) => group.rows).some((row) => row.name === 'Dynamic review title'),
    'grouped rows should normalize Codex spinner prefixes in dynamic session titles');
  rail.emit(api, 'permission-required');
  let rows = rail.groups().flatMap((group) => group.rows);
  expect(rows.find((row) => row.id === webTwo).status === 'Working', 'working status should appear in Threads');
  expect(rows.find((row) => row.id === api).status === 'Action required', 'action-required status should appear in Threads');
  expect(rows.find((row) => row.id === webTwo).statusCount === 1 && rows.find((row) => row.id === api).statusCount === 1,
    'each Threads row should contain exactly one status element');
  expect(rows.find((row) => row.id === webTwo).animationName === 'tabActivitySpin',
    'Threads working spinner should use the same animation as tabs');

  rail.focus(holder);
  rail.hoverRow(web);
  await wait(270);
  rail.unhoverRow(web);
  rail.clearPreviewPointerPresence();
  rail.hoverRow(webTwo);
  await wait(170);
  expect(!rail.preview(), 'the prior row preview should close before a different row hover matures');
  await wait(100);
  expect(rail.preview()?.sessionId === webTwo,
    'closing the prior preview must not cancel a different row hover pending for 250 ms');
  rail.unhoverRow(webTwo);
  rail.outsideClick();
  rail.focusRow(web);
  rail.focusRow(webTwo);
  expect(rail.preview()?.sessionId === webTwo, 'focusing another row should replace the existing preview');
  rail.outsideClick();
  expect(!rail.preview(), 'outside click should dismiss the preview');
  rail.hoverRow(webTwo);
  await wait(270);
  rail.previewClick();
  await wait(80);
  expect(rail.activeId() === webTwo && !rail.preview(), 'clicking anywhere in the preview should activate its session');
  rail.emit(webTwo, 'turn-end');
  expect(!rail.groups().some((group) => group.key === 'status:working'),
    'Working section should disappear when its final active turn completes');
  const clearRailCodex = rail.addTerminalSession({
    name: 'clear-rail-codex', agent: 'codex', cwd: ${JSON.stringify(looseDir)},
  });
  rail.focus(holder);
  rail.submit(clearRailCodex, 'clearable Codex work\\r');
  expect(rail.groups().find((group) => group.key === 'status:working')
    ?.rows.some((row) => row.id === clearRailCodex),
  'submitted Codex work should enter the Working section');
  rail.submit(clearRailCodex, '  /clear  \\r');
  const clearedCodexRow = rail.groups().flatMap((group) => group.rows)
    .find((row) => row.id === clearRailCodex);
  expect(!rail.groups().find((group) => group.key === 'status:working')
    ?.rows.some((row) => row.id === clearRailCodex)
    && clearedCodexRow?.status === 'Idle',
  'exact Codex /clear should immediately leave Working and return to its cwd group as Idle');
  rail.close(clearRailCodex);
  rail.focus(holder);
  rail.hoverRow(webTwo);
  await wait(270);
  rail.select('git');
  expect(!rail.preview(), 'rail mode changes should dismiss the preview');
  rail.select('threads');
  rail.hoverRow(webTwo);
  await wait(270);
  rail.collapseAnchor(webTwo);
  await wait(60);
  expect(!rail.preview(), 'collapsing a group should dismiss a preview whose anchor becomes hidden');
  const webGroupDetails = [...document.querySelectorAll('#thread-list .rail-group')]
    .find((group) => group.dataset.groupKey === 'cwd:' + ${JSON.stringify(repoAppDir)});
  webGroupDetails.open = true;
  await wait(40);
  rail.hoverRow(webTwo);
  await wait(270);
  rail.close(webTwo);
  await wait(40);
  expect(!rail.preview(), 'closing the previewed session should dispose and dismiss its preview');

  const ordinaryDouble = rail.addTerminalSession({
    name: 'ordinary-activation',
    agent: 'codex',
    cwd: ${JSON.stringify(looseDir)},
  });
  const workingDouble = rail.addTerminalSession({
    name: 'working-activation',
    agent: 'claude',
    cwd: ${JSON.stringify(repoAppDir)},
  });
  const attentionDouble = rail.addTerminalSession({
    name: 'attention-activation',
    agent: 'grok',
    cwd: ${JSON.stringify(repoApiDir)},
  });
  rail.focus(holder);
  rail.emit(workingDouble, 'turn-start');
  rail.emit(attentionDouble, 'turn-start');
  rail.emit(attentionDouble, 'turn-end', 'Completed activation fixture');
  const doubleClickGroups = rail.groups();
  expect(doubleClickGroups.filter((group) => group.key.startsWith('cwd:'))
    .flatMap((group) => group.rows).some((row) => row.id === ordinaryDouble),
  'ordinary activation fixture should render in a working-directory section');
  expect(doubleClickGroups.find((group) => group.key === 'status:working')
    ?.rows.some((row) => row.id === workingDouble),
  'working activation fixture should render in the Working section');
  expect(doubleClickGroups.find((group) => group.key === 'attention:needs')
    ?.rows.some((row) => row.id === attentionDouble),
  'attention activation fixture should render in the Needs Attention section');

  rail.hoverRow(ordinaryDouble);
  await wait(270);
  expect(rail.preview()?.sessionId === ordinaryDouble,
    'hovering an ordinary row for 250 ms should open its preview');
  rail.unhoverRow(ordinaryDouble);
  rail.outsideClick();
  rail.hoverRow(ordinaryDouble);
  await wait(120);
  expect(rail.clickRow(ordinaryDouble) === ordinaryDouble,
    'one click on an inactive ordinary row should activate its session');
  await wait(280);
  expect(!rail.preview() && rail.sourceState(ordinaryDouble).focused,
    'ordinary-row single-click activation should cancel pending hover and focus the terminal');

  rail.focus(holder);
  rail.hoverRow(workingDouble);
  await wait(270);
  expect(rail.preview()?.sessionId === workingDouble,
    'hovering a Working row for 250 ms should open its preview');
  expect(rail.clickRow(workingDouble) === workingDouble,
    'one click on a Working row should activate its session');
  await wait(80);
  expect(!rail.preview() && rail.sourceState(workingDouble).focused,
    'Working-row single-click activation should dismiss preview and focus its terminal');

  rail.focus(holder);
  rail.hoverRow(attentionDouble);
  await wait(270);
  expect(rail.preview()?.sessionId === attentionDouble,
    'hovering a Needs Attention row for 250 ms should open its preview');
  expect(rail.clickRow(attentionDouble) === attentionDouble,
    'one click on a Needs Attention row should activate its session');
  await wait(80);
  expect(!rail.preview() && rail.sourceState(attentionDouble).focused,
    'Needs Attention single-click activation should dismiss preview and focus its terminal');

  rail.focus(holder);
  expect(rail.doubleClickRow(ordinaryDouble) === ordinaryDouble,
    'a redundant double-click should activate through its first ordinary-row click');
  await wait(80);
  expect(!rail.preview() && rail.sourceState(ordinaryDouble).focused,
    'redundant double-click should leave the activated terminal focused with no preview');

  rail.focus(holder);
  rail.emit(attentionDouble, 'turn-start');
  rail.emit(attentionDouble, 'turn-end', 'Completed inline-action fixture');
  expect(rail.doubleClickAttentionAction(attentionDouble, 'COMPLETED', 'DISMISS') === holder,
    'double-clicking an inline attention action should not activate its session row');
  expect(!rail.preview(), 'inline attention action double-clicks should not open a row preview');

  rail.select('git');
  expect(rail.threadSortControl().hidden, 'Git mode should hide the Threads sorting control');
  await rail.waitForGit();
  expect(rail.heading() === 'GIT CHANGES', 'Git should identify itself as a change tracker');
  expect(await rail.resolveGitRoot('relative/path') === null, 'gitRoot should reject relative cwd values');
  expect(await rail.resolveGitRoot('x'.repeat(5000)) === null, 'gitRoot should reject oversized cwd values');
  expect(await rail.resolveGitRoot(${JSON.stringify(looseDir)}) === null, 'gitRoot should return null outside a repository');
  expect(rail.gitCacheSize() === 3, 'renderer should cache Git lookup once per exact cwd');
  const gitDiffs = rail.gitDiffs();
  const repoDiff = gitDiffs.find((group) => group.title === ${JSON.stringify(canonicalRepoDir)});
  expect(repoDiff && repoDiff.count === 2, 'Git should count changed files rather than sessions');
  expect(repoDiff.files.some((file) => file.path === 'tracked.txt' && file.status === 'Modified' && file.staged),
    'Git should expose staged and unstaged state for a tracked file');
  expect(repoDiff.files.some((file) => file.path === 'apps/web/new-file.js' && file.status === 'Untracked'),
    'Git should expose untracked files relative to the repository');
  expect(repoDiff.totals === '1 staged · 2 unstaged', 'Git should summarize staged and unstaged diff counts');

  const themes = window.chromuxTestThemes;
  rail.select('threads');
  expect(!rail.threadSortControl().hidden, 'Threads mode should restore the sorting control');
  rail.focus(holder);
  for (const theme of themes.ids()) {
    themes.select(theme);
    for (const mode of themes.modes()) {
      themes.selectMode(mode);
      const railRect = document.querySelector('#rail').getBoundingClientRect();
      const navRect = document.querySelector('.rail-nav').getBoundingClientRect();
      const headRect = document.querySelector('.rail-head').getBoundingClientRect();
      expect(railRect.width >= 220 && railRect.width <= 260, theme + ' ' + mode + ' should keep narrow rail geometry');
      expect(navRect.bottom <= headRect.top + 1, theme + ' ' + mode + ' should keep two-row header order');
      expect(modeButtons.every((button) => button.getBoundingClientRect().right <= railRect.right + 1),
        theme + ' ' + mode + ' should keep icon controls inside rail');
      const attentionGeometry = rail.attentionGeometry();
      expect(attentionGeometry.cards.length >= 2 && attentionGeometry.gaps.every((gap) => gap >= 5.9)
        && attentionGeometry.firstInset >= 5.9 && attentionGeometry.lastInset >= 5.9,
      theme + ' ' + mode + ' should preserve separated, inset Needs Attention cards: ' + JSON.stringify(attentionGeometry));
      const rowBeforePointer = document.querySelector('#thread-list .rail-session-row[data-session-id="' + CSS.escape(web) + '"]');
      rowBeforePointer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      rail.title(web, theme + ' ' + mode + ' active title');
      const rowAfterTitle = document.querySelector('#thread-list .rail-session-row[data-session-id="' + CSS.escape(web) + '"]');
      rowBeforePointer.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      expect(rowAfterTitle === rowBeforePointer,
        theme + ' ' + mode + ' should preserve the pointer target across an animated title update');
      rail.hoverRow(web);
      await wait(270);
      const geometry = rail.preview();
      expect(geometry?.sessionId === web,
        theme + ' ' + mode + ' should open the expected hover preview after a title update');
      expect(geometry && geometry.left >= 0 && geometry.top >= 0 && geometry.right <= window.innerWidth + 1 && geometry.bottom <= window.innerHeight + 1,
        theme + ' ' + mode + ' should clamp the preview inside the viewport');
      expect(geometry.cols === geometry.sourceCols && geometry.rows === geometry.sourceRows,
        theme + ' ' + mode + ' should preserve terminal geometry');
      expect(geometry.surfaceBackgrounds.every((color) => color.startsWith('rgb(')),
        theme + ' ' + mode + ' should keep popover, header/footer, and terminal backing fully opaque: ' + geometry.surfaceBackgrounds.join(', '));
      expect(Math.abs(geometry.padding.headerLeft - geometry.padding.terminalLeft) <= 2
        && Math.abs(geometry.padding.footerLeft - geometry.padding.terminalLeft) <= 2,
      theme + ' ' + mode + ' should align header, terminal, and footer insets: ' + JSON.stringify(geometry.padding));
      expect(geometry.padding.terminalTop >= 9 && geometry.padding.terminalRight >= 9 && geometry.padding.terminalBottom >= 9,
        theme + ' ' + mode + ' should preserve terminal padding on every edge: ' + JSON.stringify(geometry.padding));
      rail.unhoverRow(web);
      rail.outsideClick();
    }
  }

  rail.select('git');
  expect(rail.gitDiffs().find((group) => group.title === ${JSON.stringify(canonicalRepoDir)}).count === 2,
    'Git diff counts should not mirror the number of live sessions');
  expect(rail.mode() === 'git', 'incoming attention and status changes must not auto-switch rail mode');

  return JSON.stringify({ ok: true, threadGroups, gitDiffs: rail.gitDiffs(), nav });
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
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !output.includes('"ok":true')) {
    console.error('SESSION_RAIL_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', output || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('SESSION_RAIL_RENDERER_OK');
});
