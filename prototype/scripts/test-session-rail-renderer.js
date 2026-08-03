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
const longProjectDir = path.join(repoDir, 'packages', 'an-extraordinarily-long-project-folder-name');
const looseDir = path.join(tmpDir, 'scratch');
const e2ePath = path.join(tmpDir, 'session-rail-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

for (const directory of [homeDir, repoAppDir, repoApiDir, longProjectDir, looseDir]) fs.mkdirSync(directory, { recursive: true });
execFileSync('/usr/bin/git', ['init', '-q', repoDir]);
fs.writeFileSync(path.join(repoDir, 'tracked.txt'), 'staged\n');
execFileSync('/usr/bin/git', ['-C', repoDir, 'add', 'tracked.txt']);
fs.appendFileSync(path.join(repoDir, 'tracked.txt'), 'unstaged\n');
fs.writeFileSync(path.join(repoAppDir, 'new-file.js'), 'export default true;\n');
const canonicalRepoDir = fs.realpathSync(repoDir);

fs.writeFileSync(e2ePath, `
(async () => {
  window.addEventListener('error', (event) => {
    if (event.error?.stack) console.error('E2E_WINDOW_ERROR_STACK ' + event.error.stack);
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason?.stack) console.error('E2E_REJECTION_STACK ' + event.reason.stack);
  });
  const rail = window.chromuxTestRail;
  if (!rail) throw new Error('Missing session rail test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const hostPlatform = (await window.chromux.getEnv()).hostPlatform;
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const samplePreviewFrames = async (count) => {
    const frames = [];
    for (let index = 0; index < count; index += 1) {
      await nextFrame();
      frames.push(rail.preview());
    }
    return frames;
  };
  const waitFor = async (predicate, timeoutMs = 2000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await nextFrame();
    }
    return predicate();
  };
  const expectNoAttentionPreview = (preview, context) => {
    const popover = document.querySelector('#thread-terminal-preview');
    const headerRect = popover?.querySelector('.thread-preview-header')?.getBoundingClientRect();
    const attention = popover?.querySelector('.thread-preview-attention');
    const viewportRect = popover?.querySelector('.thread-preview-viewport')?.getBoundingClientRect();
    const screenRect = popover?.querySelector('.xterm-screen')?.getBoundingClientRect();
    const footerRect = popover?.querySelector('.thread-preview-footer')?.getBoundingClientRect();
    const popoverRect = popover?.getBoundingClientRect();
    expect(preview?.attention.hidden && attention?.hidden,
      context + ' should hide the empty attention panel');
    expect(preview?.terminalHeight >= 120 && preview.text.includes('NO ATTENTION PREVIEW'),
      context + ' should preserve a visible terminal with serialized content: '
        + JSON.stringify({ terminalHeight: preview?.terminalHeight, text: preview?.text }));
    expect(headerRect && viewportRect && screenRect && footerRect && popoverRect
      && viewportRect.top >= headerRect.bottom - 1
      && viewportRect.bottom <= footerRect.top + 1
      && screenRect.top >= viewportRect.top
      && screenRect.bottom <= viewportRect.bottom
      && footerRect.top >= viewportRect.bottom - 1
      && footerRect.bottom <= popoverRect.bottom + 1,
    context + ' should keep the terminal between the header and footer: '
      + JSON.stringify({
        headerBottom: headerRect?.bottom,
        viewportTop: viewportRect?.top,
        viewportBottom: viewportRect?.bottom,
        screenTop: screenRect?.top,
        screenBottom: screenRect?.bottom,
        footerTop: footerRect?.top,
        footerBottom: footerRect?.bottom,
        popoverBottom: popoverRect?.bottom,
      }));
  };
  const expectThreadSortLeftInset = (context) => {
    const toolbarRect = document.querySelector('#thread-toolbar')?.getBoundingClientRect();
    const controlRect = document.querySelector('#thread-sort-toggle')?.getBoundingClientRect();
    const inset = toolbarRect && controlRect ? controlRect.left - toolbarRect.left : null;
    expect(inset !== null && Math.abs(inset - 8) <= 0.5,
      context + ' should align the thread filter to the toolbar\\'s 8px left inset: '
        + JSON.stringify({ inset, toolbarLeft: toolbarRect?.left, controlLeft: controlRect?.left }));
  };
  const actionRequiredCardSnapshot = (sessionId) => {
    const card = document.querySelector(
      '.attention-thread[data-session-id="' + CSS.escape(sessionId) + '"]',
    );
    const cardRect = card?.getBoundingClientRect();
    const actionRects = [...(card?.querySelectorAll('[data-inbox-action]') || [])]
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          action: button.dataset.inboxAction,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          focused: document.activeElement === button,
        };
      });
    return {
      card,
      cardRect,
      name: card?.querySelector('.attention-context-name')?.textContent || '',
      agent: card?.querySelector('.attention-context-agent')?.textContent || '',
      project: card?.querySelector('.attention-context-project')?.textContent || '',
      projectTitle: card?.querySelector('.attention-context-project')?.title || '',
      kinds: [...(card?.querySelectorAll('.attention-reason > .attention-reason-copy > .attention-kind') || [])]
        .map((node) => node.textContent),
      details: [...(card?.querySelectorAll('.attention-detail') || [])].map((node) => node.textContent),
      actionRects,
      actionRows: [...new Set(actionRects.map((rect) => Math.round(rect.top)))],
    };
  };
  const expectActionRequiredCardLayout = (sessionId, context) => {
    const snapshot = actionRequiredCardSnapshot(sessionId);
    expect(snapshot.card && snapshot.cardRect,
      context + ' should render the session-scoped Action Required card');
    expect(snapshot.actionRects.length >= 1 && snapshot.actionRects.length <= 3,
      context + ' should expose only the compact actions supported by its currently visible reasons: '
        + JSON.stringify(snapshot.actionRects));
    expect(snapshot.actionRows.length >= 1 && snapshot.actionRows.length <= 2,
      context + ' should keep each reason\\'s compact icons in one row: ' + JSON.stringify(snapshot.actionRects));
    expect(snapshot.actionRects.every((rect) => (
      Math.abs(rect.right - rect.left - 24) < .01 && Math.abs(rect.bottom - rect.top - 24) < .01
    )), context + ' should render square 24px icon controls: ' + JSON.stringify(snapshot.actionRects));
    expect(snapshot.actionRects.every((rect) => (
      rect.left >= snapshot.cardRect.left - 1
      && rect.right <= snapshot.cardRect.right + 1
      && rect.top >= snapshot.cardRect.top - 1
      && rect.bottom <= snapshot.cardRect.bottom + 1
    )), context + ' should keep every action inside the card: '
      + JSON.stringify({ card: snapshot.cardRect.toJSON(), actions: snapshot.actionRects }));
    return snapshot;
  };
  await wait(100);

  const holder = rail.addTerminalSession({ name: 'holder', agent: '', cwd: ${JSON.stringify(looseDir)} });
  const web = rail.addTerminalSession({ name: 'web-agent', agent: 'codex', cwd: ${JSON.stringify(repoAppDir)}, cols: 220, rows: 60 });
  const api = rail.addTerminalSession({ name: 'api-agent', agent: 'claude', cwd: ${JSON.stringify(repoApiDir)} });
  const webTwo = rail.addTerminalSession({ name: 'web-review', agent: 'grok', cwd: ${JSON.stringify(repoAppDir)}, cols: 54, rows: 14 });
  rail.focus(holder);
  const contextMenuRow = document.querySelector(
    '#thread-list .rail-session-row[data-session-id="' + CSS.escape(api) + '"]',
  );
  contextMenuRow.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 72,
    clientY: 96,
  }));
  const threadContextMenu = document.querySelector('.session-menu');
  const threadContextLabels = [...(threadContextMenu?.querySelectorAll('.smi-label') || [])]
    .map((label) => label.textContent.trim());
  expect(threadContextMenu && rail.activeId() === api,
    'right-clicking an inactive Threads session should activate it and open its session menu');
  expect(threadContextLabels.includes('Duplicate session')
    && threadContextLabels.some((label) => label.includes('Open in CODEX'))
    && threadContextLabels.includes('Move to group…')
    && threadContextLabels.includes('Close session'),
  'Threads context menu should expose the same session actions as a tab context menu: '
    + JSON.stringify(threadContextLabels));
  document.body.click();
  expect(!document.querySelector('.session-menu'),
    'clicking outside should dismiss a Threads session context menu');
  rail.focus(holder);
  expect(rail.threadSort() === 'recent' && rail.storedThreadSort() === 'recent',
    'Recent should be the validated and persisted default thread order');
  expect(JSON.stringify(rail.migrateThreadSort('invalid')) === JSON.stringify({ mode: 'recent', stored: 'recent' }),
    'invalid thread order preferences should migrate to Recent');
  const recentControl = rail.threadSortControl();
  const railHeaderControls = rail.railHeaderControls();
  expect(recentControl.text.trim() === '' && recentControl.hasIcon && recentControl.order === 'recent'
    && recentControl.pressed === 'false' && !recentControl.hidden
    && recentControl.label === 'Thread order: Recent',
  'Threads should expose an icon-only accessible Recent sort control');
  expect(railHeaderControls.detect.height === recentControl.geometry.height
    && railHeaderControls.detect.width <= 52.5
    && railHeaderControls.detect.top >= railHeaderControls.head.top
    && railHeaderControls.detect.bottom <= railHeaderControls.head.bottom
    && recentControl.geometry.top >= railHeaderControls.header.bottom,
  'Detect should match the compact control height while the filter moves below the Threads header');
  expectThreadSortLeftInset('Initial Threads layout');
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
  expect(rail.storedThreadSort() === 'az' && rail.threadSortControl().order === 'az'
    && rail.threadSortControl().pressed === 'true'
    && rail.threadSortControl().label === 'Thread order: A–Z',
    'A–Z should update and persist the filter control');
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
  const ordinaryOrderBeforeFocus = rail.groups()
    .filter((group) => group.key.startsWith('cwd:'))
    .map((group) => [group.key, group.rows.map((row) => row.id)]);
  await wait(5);
  rail.focus(activityProbe);
  const ordinaryOrderAfterFocus = rail.groups()
    .filter((group) => group.key.startsWith('cwd:'))
    .map((group) => [group.key, group.rows.map((row) => row.id)]);
  expect(rail.activityAt(activityProbe) === 5000,
    'ordinary session navigation must not change recent activity');
  expect(JSON.stringify(ordinaryOrderAfterFocus) === JSON.stringify(ordinaryOrderBeforeFocus),
    'ordinary session navigation must not move Recent rows or directory groups');
  rail.focus(holder);
  rail.setActivity(activityProbe, 6000);
  rail.setActivity(holder, 7000);
  expect(rail.groups().find((group) => group.title === ${JSON.stringify(looseDir)})
    ?.rows[0]?.id === holder,
  'activity fixture should begin with the holder first in its Recent directory group');
  await wait(5);
  rail.submit(activityProbe, 'terminal prompt\\r');
  const terminalSubmittedAt = rail.activityAt(activityProbe);
  expect(terminalSubmittedAt > 7000, 'submitted terminal input should update recent activity');
  expect(rail.groups().find((group) => group.title === ${JSON.stringify(looseDir)})
    ?.rows[0]?.id === activityProbe,
  'submitted terminal input should reorder its Recent directory group');
  rail.setActivity(activityProbe, 7000);
  rail.setActivity(holder, 8000);
  await wait(5);
  expect(await rail.submitComposer(activityProbe, 'composer prompt'), 'composer fixture should submit');
  expect(rail.activityAt(activityProbe) > 8000, 'submitted composer input should update recent activity');
  expect(rail.groups().find((group) => group.title === ${JSON.stringify(looseDir)})
    ?.rows[0]?.id === activityProbe,
  'submitted composer input should reorder its Recent directory group');
  rail.emit(activityProbe, 'turn-start');
  rail.setActivity(activityProbe, 8000);
  await wait(5);
  rail.emit(activityProbe, 'turn-end');
  const transitionedAt = rail.activityAt(activityProbe);
  expect(transitionedAt > 8000, 'an actual turn-state transition should update recent activity');
  rail.emit(activityProbe, 'turn-end');
  expect(rail.activityAt(activityProbe) === transitionedAt, 'a duplicate turn signal must not change recent activity');
  rail.close(activityProbe);

  const atomicPreview = rail.addTerminalSession({
    name: 'atomic-preview', agent: 'codex', cwd: ${JSON.stringify(looseDir)}, cols: 220, rows: 60,
  });
  rail.focus(holder);
  const densePreviewLines = (prefix, start, count) => Array.from({ length: count }, (_, offset) => {
    const line = String(start + offset).padStart(3, '0');
    return '\\x1b[3' + ((offset % 6) + 1) + 'm' + prefix + ' ' + line + ' '
      + '#'.repeat(170) + '\\x1b[0m\\r\\n';
  }).join('');
  await rail.write(atomicPreview, densePreviewLines('ATOMIC BASE', 0, 340) + 'ATOMIC BASE COMPLETE');
  rail.focusRow(atomicPreview);
  rail.hoverRow(atomicPreview);
  let atomicState = await waitFor(() => {
    const candidate = rail.preview();
    return candidate?.refreshCount >= 1 && candidate;
  });
  expect(atomicState?.layerCount === 2 && atomicState.visibleLayerCount === 1,
    'terminal previews should keep exactly one visible layer and one reusable staging layer: '
      + JSON.stringify(atomicState));
  expect(atomicState.layerStyles.map((style) => style.opacity).sort().join(',') === '0,1'
    && atomicState.layerStyles.every((style) => style.transitionDuration === '0s'
      && style.ariaHidden === 'true'),
  'preview layers should swap with explicit instant opacity and remain aria-hidden: '
    + JSON.stringify(atomicState.layerStyles));
  expect(atomicState.text.includes('ATOMIC BASE COMPLETE')
    && atomicState.nonEmptyLines >= 300 && atomicState.paintedRows === atomicState.rows,
    'the seeded atomic preview should begin with one complete rendered frame: '
      + JSON.stringify({
        nonEmptyLines: atomicState?.nonEmptyLines,
        paintedRows: atomicState?.paintedRows,
        rows: atomicState?.rows,
      }));
  const refreshStartsBeforeBurst = atomicState.refreshStarts;
  await rail.write(atomicPreview, densePreviewLines('ATOMIC BURST A', 340, 170));
  const sampledFramesPromise = samplePreviewFrames(30);
  await wait(4);
  await rail.write(atomicPreview, densePreviewLines('ATOMIC BURST B', 510, 170));
  await wait(4);
  await rail.write(atomicPreview, densePreviewLines('ATOMIC LATEST', 680, 170) + 'ATOMIC NEWEST COMPLETE');
  const sampledFrames = await sampledFramesPromise;
  expect(sampledFrames.every((frame) => frame
    && frame.layerCount === 2
    && frame.visibleLayerCount === 1
    && frame.nonEmptyLines >= 300
    && frame.paintedRows === frame.rows),
  'every animation-frame sample during sustained output should retain one complete visible terminal frame: '
    + JSON.stringify(sampledFrames.map((frame) => frame && ({
      visibleLayer: frame.visibleLayer,
      nonEmptyLines: frame.nonEmptyLines,
      paintedRows: frame.paintedRows,
      rows: frame.rows,
      refreshInFlight: frame.refreshInFlight,
      refreshPending: frame.refreshPending,
    }))));
  atomicState = await waitFor(() => {
    const candidate = rail.preview();
    return candidate?.text.includes('ATOMIC NEWEST COMPLETE') && !candidate.refreshInFlight && candidate;
  }, 4000);
  expect(atomicState?.text.includes('ATOMIC NEWEST COMPLETE'),
    'coalesced preview replay should eventually expose the newest terminal snapshot');
  expect(atomicState.maxConcurrentRefreshes === 1
    && atomicState.refreshStarts - refreshStartsBeforeBurst <= 3,
  'rapid source writes should coalesce without overlapping preview replays: '
    + JSON.stringify({
      maxConcurrentRefreshes: atomicState?.maxConcurrentRefreshes,
      refreshStarts: atomicState?.refreshStarts,
      refreshStartsBeforeBurst,
    }));

  await rail.write(atomicPreview, densePreviewLines('ATOMIC DISMISS', 850, 300));
  const replayingBeforeDismiss = await waitFor(() => rail.preview()?.refreshInFlight && rail.preview());
  expect(replayingBeforeDismiss, 'dismissal fixture should catch a preview replay in flight');
  rail.outsideClick();
  expect(!rail.preview() && !document.querySelector('#thread-terminal-preview'),
    'dismissing during replay should remove the preview immediately');
  await samplePreviewFrames(8);
  expect(!rail.preview() && !document.querySelector('#thread-terminal-preview'),
    'disposed replay callbacks must not remount or swap preview content');
  rail.focusThreadSortControl();
  rail.focusRow(atomicPreview);
  rail.hoverRow(atomicPreview);
  const reopenedAtomicPreview = await waitFor(() => rail.preview()?.refreshCount >= 1 && rail.preview());
  expect(reopenedAtomicPreview, 'session-close fixture should reopen a complete atomic preview');
  await rail.write(atomicPreview, densePreviewLines('ATOMIC SESSION CLOSE', 1150, 300));
  const replayingBeforeSessionClose = await waitFor(() => rail.preview()?.refreshInFlight && rail.preview());
  expect(replayingBeforeSessionClose, 'session-close fixture should catch a preview replay in flight');
  rail.close(atomicPreview);
  await samplePreviewFrames(8);
  expect(!rail.preview() && !document.querySelector('#thread-terminal-preview'),
    'closing a previewed session during replay should invalidate every pending callback');

  await rail.write(web, Array.from({ length: 340 }, (_, index) => 'older line ' + index + '\\r\\n').join('')
    + '\\x1b[31mRECENT RED\\x1b[0m\\r\\ninitial output');
  rail.sourceScroll(web, -9);

  rail.emit(web, 'turn-start');
  rail.emit(web, 'turn-end', 'First background completion');
  expect(rail.attentionCount() >= 1, 'background completion should increment the actionable plus ready-to-finish count');
  expect(rail.mode() === 'threads' && rail.storedMode() === 'threads', 'Threads should be the persisted default');
  expect(JSON.stringify(rail.migrateMode('attention')) === JSON.stringify({ mode: 'threads', stored: 'threads' }),
    'saved Attention preference should migrate to Threads');
  expect(JSON.stringify(rail.migrateMode('invalid')) === JSON.stringify({ mode: 'threads', stored: 'threads' }),
    'invalid rail preference should migrate to Threads');
  expect(rail.heading() === 'THREADS', 'Threads should set contextual heading');
  expect(rail.attentionCount() >= 1, 'Threads badge should count actionable and ready-to-finish items');

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
  const readyToFinish = threadGroups.find((group) => group.key === 'ready:finish');
  expect(readyToFinish && readyToFinish.label === 'READY TO FINISH' && readyToFinish.count >= 1 && readyToFinish.open,
    'Threads should pin completed sessions in an expanded Ready to Finish section');
  expect(webGroup && webGroup.label === 'web' && webGroup.count === 1 && webGroup.open
    && webGroup.rows[0].id === webTwo,
  'All Sessions should exclude sessions already ranked into Ready to Finish');
  expect(threadGroups.some((group) => group.title === ${JSON.stringify(repoApiDir)} && group.count === 1),
    'different exact cwd should form another Threads group');
  expect(readyToFinish.rows.find((row) => row.id === web).status === 'Completed', 'ready-to-finish row needs accessible status');
  expect(document.querySelectorAll('.rail-session-row[data-session-id="' + CSS.escape(web) + '"]').length === 1,
    'a Ready to Finish session must render exactly once across Threads');
  const completionCard = document.querySelector('.attention-thread[data-session-id="' + CSS.escape(web) + '"]');
  const completionHeader = completionCard.querySelector('.rail-session-row');
  const completionPrimary = completionCard.querySelector('.attention-reason:first-child');
  const completionVisibleKinds = [...completionCard.querySelectorAll('.attention-kind')].map((node) => node.textContent);
  expect(completionHeader.querySelectorAll('.rail-status').length === 0,
    'completion-only card should omit the separate green session-status check');
  expect(!completionHeader.querySelector('.attention-row-reason')
    && completionVisibleKinds.join(',') === 'COMPLETE',
  'completion-only card should visibly contain exactly one COMPLETE status');
  expect(completionPrimary.querySelector('.attention-kind')?.textContent === 'COMPLETE',
    'the primary completion summary should place its status beneath the session context');
  const completionTitleStyle = getComputedStyle(completionHeader.querySelector('.rail-session-name'));
  expect(completionTitleStyle.whiteSpace === 'nowrap' && completionTitleStyle.textOverflow === 'ellipsis',
    'attention-card titles should remain single-line and ellipsized');
  expect(completionHeader.getAttribute('aria-label').includes('Completed'),
    'completion card should retain its natural-language accessible status');

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
  await wait(350);
  let preview = rail.preview();
  expect(preview && preview.sessionId === web && rail.activeId() === holder,
    '250 ms hover should open one anchored preview without changing the active session');
  expect(!preview.focused && preview.role === 'region',
    'preview should be a non-modal region that does not steal keyboard focus');
  expect(preview.ariaLabel.includes('web-agent') && preview.labelledBy === 'thread-terminal-preview-title'
    && preview.footer.includes('CLICK TO OPEN SESSION') && preview.footer.includes('ESC FROM ROW TO CLOSE'),
    'preview should expose its session and activation/dismissal instructions');
  expect(preview.describedBy === 'thread-terminal-preview-description'
    && preview.description.includes('COMPLETED: First background completion')
    && !preview.attention.hidden
    && preview.attention.heading === 'NEEDS ATTENTION'
    && preview.attention.rows.map((row) => row.label).join(',') === 'COMPLETED'
    && preview.attention.rows[0].detail === 'First background completion',
  'preview should expose a single attention reason visibly and in its accessible description');
  expect(preview.attention.rows[0].actions === 0,
    'preview attention summaries should not contain inline actions');
  expect(preview.cwdTitle === ${JSON.stringify(repoAppDir)}, 'preview should preserve the full cwd in its tooltip');
  expect(preview.text.includes('RECENT RED') && preview.coloredCells > 0, 'serialized mirror should preserve recent terminal text and ANSI colors');
  expect(preview.bufferLength <= 300 + preview.rows, 'serialized mirror should bound recent scrollback to 300 rows');
  expect(preview.cols === preview.sourceCols && preview.rows === preview.sourceRows,
    'preview should retain source terminal columns and rows while visually scaling');
  expect(preview.paintCount >= 1 && preview.paintedRows === preview.rows,
    'scaled preview should visibly repaint every xterm row: ' + JSON.stringify({
      paintCount: preview.paintCount, paintedRows: preview.paintedRows, rows: preview.rows,
    }));
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
  const syncBegin = '\\x1b[?2026h';
  const syncEnd = '\\x1b[?2026l';
  rail.ptyOutput(web, syncBegin
    + '\\x1b[?1049h\\x1b[2J\\x1b[H'
    + '\\x1b[36m╭─ Codex ─────────────────────────────────────────────────────────────────────────────────────────────────────────────╮\\x1b[0m\\r\\n'
    + '│ production-width synchronized alternate-screen preview                                                              │\\r\\n'
    + '\\x1b[32m› CODEX ALTERNATE PREVIEW\\x1b[0m'
    + syncEnd);
  await wait(120);
  preview = rail.preview();
  expect(preview?.text.includes('CODEX ALTERNATE PREVIEW'),
    'live mirror should reproduce Codex alternate-screen content from a synchronized redraw');
  expect(preview?.paintedRows === preview?.rows,
    'Codex alternate-screen preview should visibly repaint every scaled xterm row');
  rail.ptyOutput(web, syncBegin + '\\x1b[?1049l\\r\\n\\x1b[33muser@host web %\\x1b[0m ' + syncEnd);
  await wait(120);
  preview = rail.preview();
  expect(preview?.text.includes('LIVE UPDATE') && preview.text.includes('user@host web %'),
    'leaving Codex alternate screen should restore the mirrored normal buffer and shell prompt');
  expect(preview?.paintedRows === preview?.rows,
    'post-Codex shell preview should visibly repaint every scaled xterm row');
  expect(rail.cue(web).ptyInput === '', 'preview rendering must never send PTY input');

  rail.rowKey(web, 'Escape');
  expect(!rail.preview() && rail.rowState(web).focused, 'Escape should dismiss preview and restore focus to its row');
  expect(rail.rowState(web).ariaExpanded === 'false', 'dismissal should reset expanded ARIA state');
  rail.focusThreadSortControl();
  expect(rail.threadSortControl().focused,
    'thread sort control should receive focus before keyboard preview reopening');
  rail.focusRow(web);
  expect(rail.preview()?.sessionId === web && rail.rowState(web).focused,
    'keyboard focus should open the inactive row preview immediately without moving focus: '
      + JSON.stringify({ preview: rail.preview()?.sessionId, row: rail.rowState(web) }));
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
  await wait(80);
  const compactPreview = rail.preview();
  const compactWidth = compactPreview.width;
  rail.setPreviewSize('large');
  await wait(80);
  expect(rail.preview().width > compactWidth + 100, 'Large accessibility size should materially increase effective terminal text space');
  expect(rail.preview().paintCount > compactPreview.paintCount && rail.preview().paintedRows === rail.preview().rows,
    'preview size changes should repaint every visibly scaled xterm row');
  expect(rail.previewSize().value === 'large' && rail.previewSize().stored === 'large' && rail.previewSize().control === 'large',
    'preview size should update state, Settings, and local persistence together');
  const previewThemes = window.chromuxTestThemes;
  const originalTheme = previewThemes.current();
  const alternateTheme = previewThemes.ids().find((theme) => theme !== originalTheme);
  const themedPaintCount = rail.preview().paintCount;
  previewThemes.select(alternateTheme);
  await wait(100);
  expect(rail.preview().paintCount > themedPaintCount && rail.preview().paintedRows === rail.preview().rows,
    'theme changes should serialize and visibly repaint every scaled preview row');
  previewThemes.select(originalTheme);
  await wait(100);
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
  rail.focusRow(api);
  let apiPreview = rail.preview();
  expect(apiPreview?.sessionId === api
    && apiPreview.attention.rows.map((row) => row.label).join(',') === 'PERMISSION'
    && apiPreview.attention.rows[0].detail === 'Approve command',
  'keyboard focus should open a single-reason attention preview without activating the session');
  const longQueueSummary = 'Detected a deliberately long browser preview request that should wrap across no more than two compact summary lines';
  rail.queue(api, 'http://localhost:49151/api-preview', longQueueSummary);
  apiPreview = rail.preview();
  expect(apiPreview?.sessionId === api
    && apiPreview.attention.rows.map((row) => row.label).join(',') === 'PERMISSION,QUEUE 1'
    && apiPreview.attention.rows[1].detail === longQueueSummary + ': http://localhost:49151/api-preview'
    && apiPreview.description.includes('QUEUE 1: ' + longQueueSummary + ': http://localhost:49151/api-preview')
    && apiPreview.attention.rows.every((row) => row.actions === 0),
  'open preview should live-synchronize multiple projected reasons, priority order, full detail, and queued URL');
  rail.emit(api, 'turn-start');
  expect(rail.preview()?.attention.rows.map((row) => row.label).join(',') === 'QUEUE 1',
    'open preview should remove a resolved reason without closing');
  rail.emit(api, 'permission-required', 'Approve command');
  expect(rail.preview()?.attention.rows.map((row) => row.label).join(',') === 'PERMISSION,QUEUE 1',
    'open preview should restore projection priority order when attention changes');
  const apiCards = rail.attentionCards().filter((card) => card.id === api);
  const apiCard = apiCards.find((card) => card.primaryKind === 'PERMISSION');
  expect(apiCards.length === 1 && apiCard
    && apiCard.reasons.map((reason) => reason.kind).join(',') === 'PERMISSION,QUEUE 1',
  'one session should combine all reasons into its highest-priority section');
  expect(apiCard.reasons[0].visibleKind === 'PERMISSION' && apiCard.reasons[1].visibleKind === 'QUEUE 1',
    'every reason should keep its action type visible beneath the card context');
  expect(apiCard.reasons[0].actions.join(',') === 'snooze'
    && apiCard.reasons[1].actions.join(',') === 'open,snooze',
  'ordinary reasons should avoid duplicate Open actions while Queue retains its specialized action');
  expect(apiCard.reasons.every((reason) => reason.actionDetails.every((action) => (
    action.text === ''
      && action.ariaLabel
      && action.title
      && action.svgAriaHidden === 'true'
      && action.svgFocusable === 'false'
      && action.width === 24
      && action.height === 24
  ))), 'icon actions should expose accessible labels, visible tooltips, decorative SVGs, and square geometry: '
    + JSON.stringify(apiCard.reasons));
  expect(apiCard.reasons[1].summaryLines <= 2 && apiCard.reasons[1].summaryLines > 1,
    'long attention summaries should wrap to no more than two lines before truncation: ' + JSON.stringify(apiCard.reasons[1]));
  expect(rail.attentionCount() >= 2, 'badge should count ranked Threads cards, not ordinary Git obligations');
  const longContextSession = rail.addSession({
    name: 'extremely-long-session-display-name-that-must-stay-inside-the-action-required-card',
    agent: 'codex',
    cwd: ${JSON.stringify(longProjectDir)},
    attentionRecords: [
      {
        id: 'permission-long-context',
        type: 'permission',
        detail: 'Approve a deliberately long historical action reason without losing the project or agent context',
        occurredAt: 30,
      },
      {
        id: 'completed-long-context',
        type: 'completed',
        detail: 'A second grouped reason keeps its action type and detail visible',
        occurredAt: 20,
      },
    ],
  });
  rail.focus(holder);
  let longContextSnapshot = expectActionRequiredCardLayout(longContextSession, 'Default rail');
  expect(longContextSnapshot.name === 'extremely-long-session-display-name-that-must-stay-inside-the-action-required-card'
    && longContextSnapshot.agent === 'CODEX'
    && longContextSnapshot.project === 'an-extraordinarily-long-project-folder-name'
    && longContextSnapshot.projectTitle === ${JSON.stringify(longProjectDir)},
  'Action Required context should expose the session name, agent, and full project/folder identity: '
    + JSON.stringify(longContextSnapshot));
  expect(longContextSnapshot.kinds.join(',') === 'PERMISSION,COMPLETED'
    && longContextSnapshot.details.some((detail) => detail.includes('deliberately long historical action reason'))
    && longContextSnapshot.details.some((detail) => detail.includes('second grouped reason')),
  'Action Required reasons should keep every action type and reason detail visible beneath the context');
  const longContextNameStyle = getComputedStyle(
    longContextSnapshot.card.querySelector('.attention-context-name'),
  );
  expect(longContextNameStyle.whiteSpace === 'nowrap' && longContextNameStyle.textOverflow === 'ellipsis',
    'long Action Required session labels should remain single-line and ellipsized');
  rail.focusRow(longContextSession);
  rail.pressInboxKey('Enter');
  expect(rail.activeId() === longContextSession,
    'keyboard Enter on the Action Required card should preserve session activation');
  rail.focus(holder);
  rail.focusRow(longContextSession);
  rail.pressInboxKey('o');
  expect(rail.activeId() === longContextSession,
    'keyboard o on the Action Required card should preserve session activation');
  rail.focus(holder);
  const semanticReasons = rail.addSession({
    name: 'semantic-reasons',
    agent: 'codex',
    cwd: ${JSON.stringify(looseDir)},
    attentionRecords: [
      { id: 'permission-semantic', type: 'permission', detail: 'Approve historical action', occurredAt: 10 },
      { id: 'completed-semantic', type: 'completed', detail: 'Historical turn finished', occurredAt: 20 },
    ],
  });
  rail.focus(holder);
  const semanticCards = rail.attentionCards().filter((card) => card.id === semanticReasons);
  const semanticCard = semanticCards.find((card) => card.primaryKind === 'PERMISSION');
  expect(semanticCards.length === 1 && semanticCard
    && semanticCard.reasons.map((reason) => reason.kind).join(',') === 'PERMISSION,COMPLETED',
  'mixed semantic reasons should combine into the highest-priority Action Required card: '
    + JSON.stringify(semanticCards));
  expect(semanticCard.reasons[0].actions.join(',') === 'snooze'
    && semanticCard.reasons[1].actions.join(',') === 'dismiss,snooze'
    && semanticCard.reasons[1].color !== semanticCard.primaryColor,
  'combined completion should retain Dismiss and Snooze icons without duplicate Open and keep its green semantic color');
  const previewOverflow = rail.addTerminalSession({
    name: 'preview-overflow',
    agent: 'codex',
    cwd: ${JSON.stringify(looseDir)},
    attentionRecords: Array.from({ length: 10 }, (_, index) => ({
      id: 'preview-overflow-' + index,
      type: index % 2 ? 'completed' : 'permission',
      detail: 'Expanded historical attention detail ' + index,
      occurredAt: index + 1,
    })),
  });
  rail.focus(holder);
  const expectedAttentionCaps = { compact: 100, comfortable: 140, large: 180 };
  for (const [size, cap] of Object.entries(expectedAttentionCaps)) {
    rail.setPreviewSize(size);
    rail.focusThreadSortControl();
    rail.focusRow(previewOverflow);
    await wait(50);
    const overflowPreview = rail.preview();
    expect(overflowPreview.attention.maxHeight === cap
      && overflowPreview.attention.height <= cap + 1
      && overflowPreview.attention.scrollHeight > overflowPreview.attention.height,
    size + ' preview should independently scroll attention at its ' + cap + 'px cap: '
      + JSON.stringify(overflowPreview.attention));
    expect(overflowPreview.terminalHeight >= 120,
      size + ' preview should preserve at least 120px for the terminal');
    rail.outsideClick();
  }
  rail.setPreviewSize('comfortable');
  rail.close(previewOverflow);
  rail.close(semanticReasons);
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
  expect(initialAttentionGeometry.cards.length >= 1 && initialAttentionGeometry.gaps.every((gap) => gap >= 5.9),
    'Needs Attention cards should have at least 6px of visual separation: ' + JSON.stringify(initialAttentionGeometry));
  expect(initialAttentionGeometry.firstInset >= 5.9 && initialAttentionGeometry.lastInset >= 5.9,
    'Needs Attention cards should remain inside the group padding');
  rail.hoverRow(web);
  await wait(270);
  expect(rail.preview()?.sessionId === web, 'ordinary row should still open a preview before inline action test');
  const queuedUrlBeforeOpen = 'http://localhost:49151/api-preview';
  expect(rail.browserCollapsed(api) && rail.queuePanelHidden(api) && rail.queueCount(api) === 1,
    'queue attention fixture should begin collapsed, hidden, and unconsumed');
  rail.clickAttentionAction(api, 'QUEUE 1', 'open');
  expect(!rail.preview() && rail.activeId() === api && !rail.browserCollapsed(api)
    && !rail.queuePanelHidden(api) && rail.queueCount(api) === 1
    && rail.queueUrls(api).join(',') === queuedUrlBeforeOpen,
  'queue OPEN should activate its session, restore the browser, reveal the queue, and leave its URL unconsumed');
  rail.focus(holder);
  rail.focus(api);
  rail.focus(holder);
  expect(rail.turnState(api).state === 'permission' && rail.attentionKinds().includes('PERMISSION'),
    'opening actionable session must not clear its state or attention');

  rail.select('threads');
  rail.emit(webTwo, 'turn-start');
  const worker = rail.addSession({ name: 'api-worker', agent: 'claude', cwd: ${JSON.stringify(looseDir)} });
  const pendingWorker = rail.addSession({
    name: 'pending-codex', agent: 'codex', cwd: ${JSON.stringify(looseDir)}, turnState: 'pending',
  });
  rail.emit(worker, 'turn-start');
  rail.setActivity(webTwo, 3000);
  rail.setActivity(worker, 2000);
  let workingGroup = rail.groups().find((group) => group.key === 'status:working');
  expect(workingGroup && workingGroup.label === 'WORKING' && workingGroup.open && workingGroup.count === 2,
    'Threads should pin every actively working session in an expanded Working section');
  expect(workingGroup.rows.map((row) => row.id).sort().join(',') === [webTwo, worker].sort().join(','),
    'Working section membership should include all and only sessions with an agent turn in progress');
  const pendingRow = rail.groups().filter((group) => group.key.startsWith('cwd:'))
    .flatMap((group) => group.rows).find((row) => row.id === pendingWorker);
  expect(pendingRow?.status === 'Awaiting agent activity'
    && pendingRow.animationName === 'tabActivitySpin'
    && !workingGroup.rows.some((row) => row.id === pendingWorker),
  'pending Codex sessions should spin in their directory row without joining the Working section');
  expect(workingGroup.rows.map((row) => row.id).join(',') === [webTwo, worker].join(','),
    'Recent should order Working rows newest first');
  const workingActivityBeforeFocus = rail.activityAt(worker);
  const workingOrderBeforeFocus = workingGroup.rows.map((row) => row.id);
  rail.focus(worker);
  workingGroup = rail.groups().find((group) => group.key === 'status:working');
  expect(rail.activityAt(worker) === workingActivityBeforeFocus,
    'Working session navigation must not change recent activity');
  expect(JSON.stringify(workingGroup.rows.map((row) => row.id)) === JSON.stringify(workingOrderBeforeFocus),
    'Working session navigation must not move Recent rows');
  rail.focus(holder);
  const pendingActivityBeforeTransition = rail.activityAt(pendingWorker);
  await wait(5);
  rail.emit(pendingWorker, 'turn-start');
  workingGroup = rail.groups().find((group) => group.key === 'status:working');
  expect(rail.activityAt(pendingWorker) > pendingActivityBeforeTransition,
    'a genuine turn-state transition should update recent activity');
  expect(workingGroup.rows[0]?.id === pendingWorker,
    'a genuine turn-state transition should reorder Recent Working rows');
  rail.close(pendingWorker);

  const focusedAction = rail.addTerminalSession({
    name: 'focused-action-required',
    agent: 'claude',
    cwd: ${JSON.stringify(looseDir)},
  });
  rail.emit(focusedAction, 'permission-required', 'Approve focused command');
  let focusedAttention = rail.groups().find((group) => group.key === 'attention:needs');
  expect(focusedAttention?.rows.some((row) => row.id === focusedAction),
    'focused action-required session should appear in Needs Attention');
  expect(!rail.groups().find((group) => group.key === 'status:working')?.rows.some((row) => row.id === focusedAction)
    && !rail.groups().filter((group) => group.key.startsWith('cwd:')).flatMap((group) => group.rows)
      .some((row) => row.id === focusedAction),
  'focused action-required session should appear only in Action Required');
  const focusedActionRow = focusedAttention.rows.find((row) => row.id === focusedAction);
  expect(focusedActionRow.status === 'Action required'
    && rail.rowState(focusedAction).ariaCurrent === 'true'
    && rail.attentionCount() >= 1,
  'focused attention row should retain amber status, aria-current, and attention count');
  rail.clickRow(focusedAction);
  await wait(40);
  expect(rail.rowState(focusedAction).confirm && rail.sourceState(focusedAction).focused,
    'focused attention row should retain active-row confirmation and terminal focus behavior');
  rail.emit(focusedAction, 'turn-start');
  focusedAttention = rail.groups().find((group) => group.key === 'attention:needs');
  expect(!focusedAttention?.rows.some((row) => row.id === focusedAction)
    && rail.groups().find((group) => group.key === 'status:working')?.rows.some((row) => row.id === focusedAction),
  'focused session should move from Needs Attention to Working when its turn resumes');
  rail.close(focusedAction);

  rail.selectThreadSort('az');
  workingGroup = rail.groups().find((group) => group.key === 'status:working');
  expect(workingGroup.rows.map((row) => row.id).join(',') === [worker, webTwo].join(','),
    'A–Z should alphabetize Working rows by session display label');
  rail.selectThreadSort('recent');
  expect(!rail.groups().filter((group) => group.key.startsWith('cwd:')).flatMap((group) => group.rows)
    .some((row) => row.id === webTwo || row.id === worker),
  'working sessions should be excluded from All Sessions while ranked in Working');

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
  expect(rows.find((row) => row.id === webTwo).statusCount === 1 && rows.find((row) => row.id === api).statusCount === 0,
    'ordinary and Working rows should retain one status element while attention cards omit it');
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
  expect(rail.preview()?.sessionId === webTwo
    && rail.preview().attention.hidden
    && rail.preview().attention.rows.length === 0
    && !rail.preview().description.includes('Needs attention:'),
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
  expect(rail.activeId() === webTwo && !rail.preview(), 'clicking anywhere in the preview should activate its session: '
    + JSON.stringify({ active: rail.activeId(), expected: webTwo, preview: rail.preview()?.sessionId }));
  rail.emit(webTwo, 'turn-end');
  expect(!rail.groups().find((group) => group.key === 'status:working'),
    'Working section should disappear when its final active turn completes');
  const clearRailCodex = rail.addTerminalSession({
    name: 'clear-rail-codex', agent: 'codex', cwd: ${JSON.stringify(looseDir)},
  });
  rail.focus(holder);
  rail.submit(clearRailCodex, 'clearable Codex work\\r');
  expect(!rail.groups().find((group) => group.key === 'status:working')
    ?.rows.some((row) => row.id === clearRailCodex),
  'pending Codex work should not enter the Working section before activity');
  rail.title(clearRailCodex, '\u2839 clear-rail-codex');
  expect(rail.groups().find((group) => group.key === 'status:working')
    ?.rows.some((row) => row.id === clearRailCodex),
  'title-confirmed Codex work should enter the Working section');
  const codexWorkingRow = document.querySelector(
    '#thread-list .working-thread-group .rail-session-row[data-session-id="'
      + CSS.escape(clearRailCodex) + '"]',
  );
  const codexWorkingSpinner = codexWorkingRow?.querySelector('.rail-status');
  rail.title(clearRailCodex, '\u2838 clear-rail-codex');
  rail.title(clearRailCodex, '\u283c clear-rail-codex');
  const codexWorkingRowAfterFrames = document.querySelector(
    '#thread-list .working-thread-group .rail-session-row[data-session-id="'
      + CSS.escape(clearRailCodex) + '"]',
  );
  expect(codexWorkingRowAfterFrames === codexWorkingRow
    && codexWorkingRowAfterFrames?.querySelector('.rail-status') === codexWorkingSpinner,
  'Codex animated title evidence should preserve its mounted Working row and spinner');
  rail.submit(clearRailCodex, '  /clear  \\r');
  expect(!rail.groups().find((group) => group.key === 'status:working')
    ?.rows.some((row) => row.id === clearRailCodex),
  'pending command submission should immediately leave the Working section');
  rail.ptyOutput(clearRailCodex, '? for shortcuts\\r\\n› ');
  await wait(30); rail.flushRender();
  const clearedCodexRow = rail.groups().flatMap((group) => group.rows)
    .find((row) => row.id === clearRailCodex);
  expect(!rail.groups().find((group) => group.key === 'status:working')
    ?.rows.some((row) => row.id === clearRailCodex)
    && clearedCodexRow?.status === 'Idle',
  'a command-only composer redraw should return Codex to its cwd group as Idle');
  rail.close(clearRailCodex);

  const liveRedrawRailCodex = rail.addTerminalSession({
    name: 'live-redraw-rail-codex', agent: 'codex', cwd: ${JSON.stringify(looseDir)},
  });
  rail.focus(holder);
  rail.submit(liveRedrawRailCodex, 'keep Working membership stable\\r');
  let liveRedrawWorkingRow = null;
  let liveRedrawWorkingSpinner = null;
  for (const frame of ['First rail redraw...', 'Second rail redraw...', 'Third rail redraw...']) {
    rail.ptyOutput(
      liveRedrawRailCodex,
      '\\x1b[2J\\x1b[H' + frame + '\\r\\n? for shortcuts\\r\\n› ',
    );
    await wait(30); rail.flushRender();
    const currentRow = document.querySelector(
      '#thread-list .working-thread-group .rail-session-row[data-session-id="'
        + CSS.escape(liveRedrawRailCodex) + '"]',
    );
    const currentSpinner = currentRow?.querySelector('.rail-status');
    if (!liveRedrawWorkingRow) {
      liveRedrawWorkingRow = currentRow;
      liveRedrawWorkingSpinner = currentSpinner;
    }
    expect(rail.turnState(liveRedrawRailCodex).state === 'working'
      && currentRow === liveRedrawWorkingRow
      && currentSpinner === liveRedrawWorkingSpinner,
    'meaningful composer redraws should preserve Threads Working membership and spinner: ' + frame);
  }
  rail.ptyOutput(liveRedrawRailCodex, '\\x1b[2J\\x1b[H? for shortcuts\\r\\n› ');
  await wait(30); rail.flushRender();
  expect(rail.turnState(liveRedrawRailCodex).state === 'completed'
    && !rail.groups().find((group) => group.key === 'status:working')
      ?.rows.some((row) => row.id === liveRedrawRailCodex)
    && rail.groups().find((group) => group.key === 'ready:finish')
      ?.rows.some((row) => row.id === liveRedrawRailCodex),
  'a later composer-only redraw should move the background Codex session from Working to completed attention');
  rail.close(liveRedrawRailCodex);

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
  expect(doubleClickGroups.find((group) => group.key === 'ready:finish')
    ?.rows.some((row) => row.id === attentionDouble),
  'completed activation fixture should render in the Ready to Finish section');

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

  const attentionUnder = rail.addTerminalSession({
    name: 'attention-under-second-click',
    agent: 'claude',
    cwd: ${JSON.stringify(repoApiDir)},
  });
  rail.focus(holder);
  rail.emit(attentionDouble, 'turn-start');
  rail.emit(attentionDouble, 'turn-end', 'Completed first click fixture');
  rail.emit(attentionUnder, 'turn-start');
  rail.emit(attentionUnder, 'turn-end', 'Completed exposed-row fixture');
  const attentionActivityBeforeActivation = rail.activityAt(attentionDouble);
  const postRenderClick = rail.doubleClickRowsAcrossRender(attentionDouble, attentionUnder);
  expect(postRenderClick.firstLeftAttention && postRenderClick.secondStayedAttention,
    'opening a completed row should rebuild Threads with that session outside Needs Attention');
  expect(rail.activityAt(attentionDouble) === attentionActivityBeforeActivation,
    'Needs Attention navigation must not change recent activity');
  expect(postRenderClick.activeId === attentionDouble,
    'a detail-2 click dispatched after the Threads rebuild must not activate the newly exposed row');

  rail.focus(holder);
  rail.emit(attentionDouble, 'turn-start');
  rail.emit(attentionDouble, 'turn-end', 'Completed inline-action fixture');
  expect(rail.doubleClickAttentionAction(attentionDouble, 'COMPLETED', 'dismiss') === holder,
    'double-clicking an inline attention action should not activate its session row');
  expect(!rail.preview(), 'inline attention action double-clicks should not open a row preview');

  rail.select('git');
  expect(rail.threadSortControl().hidden && !rail.railHeaderControls().toolbarHidden
    && !document.querySelector('#git-toolbar').classList.contains('hidden'),
  'Git mode should replace the Threads sorting control with its search and filters');
  await rail.waitForGit();
  expect(rail.heading() === 'GIT CHANGES', 'Git should identify itself as a change tracker');
  expect(await rail.resolveGitRoot('relative/path') === null, 'gitRoot should reject relative cwd values');
  expect(await rail.resolveGitRoot('x'.repeat(5000)) === null, 'gitRoot should reject oversized cwd values');
  expect(await rail.resolveGitRoot(${JSON.stringify(looseDir)}) === null, 'gitRoot should return null outside a repository');
  expect(rail.gitCacheSize() === 4, 'renderer should cache Git lookup once per exact cwd');
  const gitDiffs = rail.gitDiffs();
  const repoDiff = gitDiffs.find((group) => group.title === ${JSON.stringify(canonicalRepoDir)});
  expect(repoDiff && repoDiff.count === 2, 'Git should count changed files rather than sessions');
  expect(repoDiff.files.some((file) => file.path === 'tracked.txt' && file.status === 'Modified' && file.staged),
    'Git should expose staged and unstaged state for a tracked file');
  expect(repoDiff.files.some((file) => file.path === 'apps/web/new-file.js' && file.status === 'Untracked'),
    'Git should expose untracked files relative to the repository');
  expect(repoDiff.totals === '1 staged · 2 unstaged', 'Git should summarize staged and unstaged diff counts');
  const noAttentionPreview = rail.addTerminalSession({
    name: 'no-attention-preview', agent: 'codex', cwd: ${JSON.stringify(looseDir)}, cols: 80, rows: 24,
  });
  await rail.write(noAttentionPreview, '\\x1b[32mNO ATTENTION PREVIEW\\x1b[0m\\r\\nvisible terminal content');

  const themes = window.chromuxTestThemes;
  rail.select('threads');
  expect(!rail.threadSortControl().hidden && !rail.railHeaderControls().toolbarHidden,
    'Threads mode should restore the sorting control and toolbar');
  rail.focus(holder);
  for (const theme of themes.ids()) {
    themes.select(theme);
    for (const mode of themes.modes()) {
      themes.selectMode(mode);
      const railRect = document.querySelector('#rail').getBoundingClientRect();
      const navRect = document.querySelector('.rail-nav').getBoundingClientRect();
      const headRect = document.querySelector('.rail-head').getBoundingClientRect();
      const themedFilter = rail.threadSortControl();
      const themedHeader = rail.railHeaderControls();
      expect(railRect.width >= 220 && railRect.width <= 260, theme + ' ' + mode + ' should keep narrow rail geometry');
      expect(navRect.bottom <= headRect.top + 1, theme + ' ' + mode + ' should keep two-row header order');
      expect(modeButtons.every((button) => button.getBoundingClientRect().right <= railRect.right + 1),
        theme + ' ' + mode + ' should keep icon controls inside rail');
      expect(themedHeader.detect.height === themedFilter.geometry.height
        && themedHeader.detect.width <= 52.5
        && themedFilter.geometry.top >= themedHeader.header.bottom
        && themedFilter.geometry.right <= railRect.right,
      theme + ' ' + mode + ' should preserve compact Detect and the lower filter-icon layout');
      expectThreadSortLeftInset(theme + ' ' + mode);
      if (theme === 'streak') {
        longContextSnapshot = expectActionRequiredCardLayout(
          longContextSession,
          'Streak ' + mode + ' alternate-width rail',
        );
      }
      const attentionGeometry = rail.attentionGeometry();
      expect(attentionGeometry.cards.length >= 1 && attentionGeometry.gaps.every((gap) => gap >= 5.9)
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
      if (hostPlatform !== 'linux') {
        expect(geometry.padding.terminalTop >= 9 && geometry.padding.terminalRight >= 9 && geometry.padding.terminalBottom >= 9,
          theme + ' ' + mode + ' should preserve terminal padding on every edge: ' + JSON.stringify(geometry.padding));
      }
      rail.unhoverRow(web);
      rail.outsideClick();
      for (const size of ['compact', 'comfortable', 'large']) {
        rail.setPreviewSize(size);
        rail.focusThreadSortControl();
        rail.focusRow(noAttentionPreview);
        const paintedNoAttentionPreview = await waitFor(() => {
          const candidate = rail.preview();
          return candidate?.text.includes('NO ATTENTION PREVIEW') ? candidate : null;
        });
        expectNoAttentionPreview(
          paintedNoAttentionPreview,
          theme + ' ' + mode + ' ' + size + ' no-attention preview',
        );
        rail.outsideClick();
      }
    }
  }
  rail.setPreviewSize('comfortable');
  rail.close(noAttentionPreview);

  rail.select('git');
  expect(rail.gitDiffs().find((group) => group.title === ${JSON.stringify(canonicalRepoDir)}).count === 2,
    'Git diff counts should not mirror the number of live sessions');
  expect(rail.mode() === 'git', 'incoming attention and status changes must not auto-switch rail mode');

  const knownRepository = rail.gitRepositories().find((repository) => repository.root === ${JSON.stringify(canonicalRepoDir)});
  expect(knownRepository && knownRepository.worktrees.length === 1,
    'Git inventory should expose the catalog repository and its worktree');
  rail.setActivity(api, Date.now() + 1_000_000);
  const gitSession = await rail.openGitSession(knownRepository.id, knownRepository.worktrees[0].id);
  expect(gitSession && gitSession.purpose === 'git-worktree'
    && gitSession.agent === 'claude'
    && gitSession.worktreeIdentity.path === ${JSON.stringify(canonicalRepoDir)}
    && gitSession.draft.includes('Review the current Git status')
    && !gitSession.composerOpen,
  'selecting a worktree should create an active loading Git session with inherited agent and unsent review draft: '
    + JSON.stringify(gitSession));
  rail.ptyOutput(gitSession.id, 'Claude Code v2.1.0\\r\\n? for shortcuts\\r\\n❯ ');
  await nextFrame();
  await nextFrame();
  expect(rail.gitSessions().find((session) => session.id === gitSession.id)?.composerOpen,
    'the deferred Git Composer should open after the rendered Claude prompt is ready');
  const insertedGitPrompt = rail.insertGitPrompt(gitSession.id, 'commit');
  expect(insertedGitPrompt.inserted && insertedGitPrompt.draft.includes('prepare a commit plan'),
    'Git Composer inserts should remain editable and unsent');
  const reusedGitSession = await rail.openGitSession(knownRepository.id, knownRepository.worktrees[0].id);
  expect(reusedGitSession.id === gitSession.id && reusedGitSession.draft === insertedGitPrompt.draft,
    'selecting the same canonical worktree should reuse its session and preserve the existing draft');
  expect(!rail.insertGitPrompt(gitSession.id, 'vercel').inserted,
    'Vercel insert should remain hidden when no saved mapping matches');
  expect(rail.gitFilter().filter === 'action', 'Git mode should default to reviewable Action worktrees');
  expect(rail.setGitFilter('all', 'no-such-worktree').visible.length === 0,
    'Git search should filter branch and path matches without changing repository state');
  rail.setGitFilter('action', '');

  const largeCatalog = {
    ok: true,
    kind: 'inventory',
    repositories: [{
      id: 'repository-large',
      label: 'large-catalog',
      root: ${JSON.stringify(repoDir)},
      runtime: 'host',
      distro: null,
      lastSeenAt: new Date().toISOString(),
      worktrees: Array.from({ length: 80 }, (_, index) => ({
        id: 'large-' + index,
        repositoryId: 'repository-large',
        path: index === 79 ? ${JSON.stringify(looseDir)} : ${JSON.stringify(repoDir)} + '/worktree-' + index,
        branch: 'catalog-' + index,
        head: 'head-' + index,
        upstream: index % 2 ? 'origin/catalog-' + index : null,
        dirty: true,
        unpublished: index % 2 === 0,
        conflicted: index === 0 || index === 1,
        stale: index > 60,
        prunable: false,
        locked: false,
        ahead: index % 3,
        behind: index % 5 === 0 ? 1 : 0,
        latestRelevantAt: new Date(Date.now() - index * 86400000).toISOString(),
        associatedSessionIds: index === 1 ? [api] : [],
        totals: {
          files: 2, staged: 1, unstaged: 1, untracked: 0,
          conflicted: index === 0 || index === 1 ? 1 : 0,
        },
      })),
    }],
  };
  rail.setGitInventory(largeCatalog);
  await window.chromuxTestCodexGate.resumeAnyway();
  const fallbackGitSession = await rail.openGitSession('repository-large', 'large-79');
  expect(fallbackGitSession.agent === 'codex'
    && fallbackGitSession.purpose === 'git-worktree'
    && fallbackGitSession.worktreeIdentity.path === ${JSON.stringify(looseDir)},
  'an unassociated worktree should create a dedicated Codex Git session');
  rail.setVercelProjects([{
    key: 'saved-loose-mapping',
    location: { runtime: 'host', distro: null },
    deployRoot: ${JSON.stringify(looseDir)},
    repositoryRoot: ${JSON.stringify(looseDir)},
  }]);
  expect(rail.insertGitPrompt(fallbackGitSession.id, 'vercel').inserted,
    'Vercel insert should appear only after a saved mapping matches the selected worktree');
  rail.setGitDraft(fallbackGitSession.id, 'AA placeholder ZZ', 3, 14);
  const selectionInsert = rail.insertGitPrompt(fallbackGitSession.id, 'conflicts');
  expect(selectionInsert.inserted
    && selectionInsert.draft.startsWith('AA \\n\\nInspect the current merge')
    && selectionInsert.draft.endsWith(' ZZ'),
  'Git inserts should replace the current Composer selection without submitting');
  rail.setGitDraft(fallbackGitSession.id, 'x'.repeat(65530));
  const boundedInsert = rail.insertGitPrompt(fallbackGitSession.id, 'review');
  expect(!boundedInsert.inserted && new TextEncoder().encode(boundedInsert.draft).byteLength <= 65536,
    'Git prompt insertion should remain within the Composer byte bound');
  expect(rail.nav().find((item) => item.mode === 'git').count === 80
    && rail.nav().find((item) => item.mode === 'git').conflict,
  'Git navigation should own the review count and emphasize conflicts');
  const staleFilterButton = document.querySelector('[data-git-filter="stale"]');
  staleFilterButton.focus();
  const narrowGitRow = document.querySelector('.git-worktree-row');
  const narrowRailRect = document.querySelector('#rail').getBoundingClientRect();
  const narrowGitRect = narrowGitRow.getBoundingClientRect();
  expect(document.activeElement === staleFilterButton
    && narrowGitRect.left >= narrowRailRect.left
    && narrowGitRect.right <= narrowRailRect.right + 1,
  'Git filters should be keyboard-focusable and worktree rows should remain inside the narrow sidebar');

  rail.select('threads');
  const visibleSections = rail.inboxSections().map((section) => section.label);
  expect(visibleSections[visibleSections.length - 1] === 'ALL SESSIONS'
    && visibleSections.every((label, index) => (
      ['ACTION REQUIRED', 'READY TO FINISH', 'WORKING', 'ALL SESSIONS'].indexOf(label)
      > (index ? ['ACTION REQUIRED', 'READY TO FINISH', 'WORKING', 'ALL SESSIONS'].indexOf(visibleSections[index - 1]) : -1)
    )),
  'Threads should hide empty priority sections while preserving priority order');
  const apiConflictCards = rail.attentionCards().filter((card) => card.id === api);
  expect(apiConflictCards.length === 1
    && apiConflictCards[0].reasons.some((reason) => reason.kind === 'CONFLICT'),
  'only a conflict associated with a live session should enter its single highest-priority Threads card');
  const conflictCardElement = document.querySelector(
    '.attention-thread[data-session-id="' + CSS.escape(api) + '"]',
  );
  const conflictReasonElement = [...conflictCardElement.querySelectorAll('.attention-reason')]
    .find((reason) => reason.dataset.attentionKind === 'CONFLICT');
  const longActionButton = conflictReasonElement.querySelector('[data-inbox-action="open"]');
  const conflictCardRect = conflictCardElement.getBoundingClientRect();
  const longActionRect = longActionButton.getBoundingClientRect();
  expect(longActionRect.left >= conflictCardRect.left - 1
    && longActionRect.right <= conflictCardRect.right + 1
    && longActionRect.bottom <= conflictCardRect.bottom + 1,
  'specialized Git action icons should remain fully inside the narrow Action Required card');
  const triageBeforeConflictShortcut = rail.inboxTriage().length;
  rail.focusRow(api);
  rail.pressInboxKey('d');
  expect(rail.attentionCards().find((card) => card.id === api)?.reasons
    .some((reason) => reason.kind === 'CONFLICT')
    && rail.inboxTriage().length === triageBeforeConflictShortcut,
  'd should do nothing for non-dismissible conflict cards and must not create Done triage');
  expect(!rail.inboxSections().some((section) => section.items.some((item) => item.id?.startsWith('git:')))
    && !document.querySelector('#thread-list .git-repository-card'),
  'ordinary Git obligations and large catalogs must remain entirely in Git mode');
  expect([...document.querySelectorAll('.rail-session-row')].every((row, index, rows) => (
    rows.findIndex((candidate) => candidate.dataset.sessionId === row.dataset.sessionId) === index
  )), 'every live session should render exactly once in Threads');
  const triageSession = rail.addTerminalSession({
    name: 'triage-session', agent: 'claude', cwd: ${JSON.stringify(looseDir)},
  });
  rail.focus(holder);
  rail.emit(triageSession, 'turn-start');
  rail.emit(triageSession, 'turn-end', 'Ready for explicit triage');
  let triageItem = rail.inboxSections().find((section) => section.key === 'ready-finish')
    .items.find((item) => item.sessionId === triageSession);
  expect(triageItem, 'new completion should enter Ready to Finish');
  const triageCountBeforeDismiss = rail.inboxTriage().length;
  rail.focusRow(triageSession);
  rail.pressInboxKey('d');
  expect(!rail.inboxSections().find((section) => section.key === 'ready-finish')
    .items.some((item) => item.sessionId === triageSession)
    && rail.inboxTriage().length === triageCountBeforeDismiss,
  'd should Dismiss a supported completion without creating a Done triage record');
  rail.emit(triageSession, 'turn-start');
  rail.emit(triageSession, 'turn-end', 'A newer completion reopens the item');
  triageItem = rail.inboxSections().find((section) => section.key === 'ready-finish')
    .items.find((item) => item.sessionId === triageSession);
  expect(triageItem, 'a newer turn should reopen a dismissed completion');
  rail.seedLegacyDone(triageItem.id);
  expect(!rail.inboxSections().find((section) => section.key === 'ready-finish')
    .items.some((item) => item.sessionId === triageSession)
    && rail.inboxTriage().some((record) => record.id === triageItem.id && record.state === 'done'),
  'existing persisted Done records should remain readable and hide their matching obligation');
  rail.emit(triageSession, 'turn-start');
  rail.emit(triageSession, 'turn-end', 'A newer completion changes the legacy reopen token');
  triageItem = rail.inboxSections().find((section) => section.key === 'ready-finish')
    .items.find((item) => item.sessionId === triageSession);
  expect(triageItem, 'a changed reopen token should reopen an item hidden by a legacy Done record');
  rail.clickInboxAction(triageItem.id, 'snooze');
  rail.clickInboxAction(triageItem.id, 'hour');
  expect(!rail.inboxSections().find((section) => section.key === 'ready-finish')
    .items.some((item) => item.sessionId === triageSession)
    && rail.inboxTriage().some((record) => record.id === triageItem.id && record.state === 'snoozed'),
  'Snooze should persist and temporarily remove the item');
  rail.expireInbox(triageItem.id);
  expect(rail.inboxSections().find((section) => section.key === 'ready-finish')
    .items.some((item) => item.sessionId === triageSession),
  'an expired snooze should reopen the item');
  rail.focusThreadSortControl();
  const keyboardItem = rail.pressInboxKey('ArrowDown');
  expect(keyboardItem, 'keyboard queue navigation should focus the next inbox item');
  rail.pressInboxKey('s');
  const keyboardSnoozeMenu = document.querySelector('.inbox-item.queue-focused .inbox-snooze-menu:not(.hidden)');
  expect(keyboardSnoozeMenu
    && [...keyboardSnoozeMenu.querySelectorAll('[data-inbox-snooze-preset]')]
      .map((button) => button.dataset.inboxSnoozePreset).join(',') === 'hour,tomorrow,week,custom',
  'keyboard Snooze should open every stable preset for the focused item');
  rail.close(triageSession);

  return JSON.stringify({ ok: true, threadGroups, gitDiffs: rail.gitDiffs(), nav });
})().catch((error) => {
  console.error('E2E_CAUGHT_STACK ' + (error?.stack || error));
  throw error;
})
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
