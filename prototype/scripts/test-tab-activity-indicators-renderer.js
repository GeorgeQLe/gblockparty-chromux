'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-tab-activity-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'tab-activity-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

const styles = fs.readFileSync(path.join(appDir, 'renderer', 'styles.css'), 'utf8');
if (!/\.tab-dot\.working\s*\{[^}]*animation:\s*tabActivitySpin/.test(styles)
  || !/\.rail-status\.working\s*\{[^}]*animation:\s*tabActivitySpin/.test(styles)) {
  throw new Error('tab and Threads working indicators must use tabActivitySpin');
}
if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.tab-dot\.working,\s*\.rail-status\.working\s*\{\s*animation:\s*none/.test(styles)) {
  throw new Error('tab and Threads working indicators must stop under reduced motion');
}
if (!/\.tab-dot\.live,\s*\.tab-dot\.idle\s*\{[^}]*background:\s*var\(--faint\)[^}]*opacity:\s*\.7/.test(styles)
  || !/\.rail-status\.idle::before,\s*\.rail-status\.live::before\s*\{[^}]*background:\s*var\(--faint\)[^}]*opacity:\s*\.7/.test(styles)) {
  throw new Error('live and idle tabs and Threads rows must share the neutral indicator rules');
}

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const tabs = window.chromuxTestTabs;
  if (!tabs) throw new Error('Missing tab activity test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  await wait(100);

  expect(tabs.activityPreference() === true, 'missing preference should default enabled');
  expect(tabs.activityPreferenceStored() === null, 'default should not eagerly write local storage');
  expect(tabs.activityToggleState() === true, 'settings switch should reflect enabled default');

  const active = tabs.addSession({ name: 'active-agent', agent: 'codex', realTerminal: true });
  const background = tabs.addSession({ name: 'background-agent', agent: 'claude' });
  tabs.focus(active);
  expect(tabs.state(active).indicator === 'live', 'unknown active turn should retain live dot');
  expect(tabs.state(background).indicator === 'live', 'unknown background turn should retain live dot');
  expect(tabs.state(active).ariaLabel.includes('Session live'),
    'unknown state should retain live accessibility semantics');
  const liveTabPresentation = tabs.state(active).indicatorPresentation;

  tabs.typeInput(active, 'build this\\r');
  tabs.emitSignal(background, 'turn-start');
  expect(tabs.state(active).indicator === 'working'
    && tabs.state(active).ariaLabel.includes('Awaiting agent activity'),
  'pending Codex input should immediately show a spinner with awaiting semantics');
  const pendingSpinner = document.querySelector(
    '.session-tab[data-session-id="' + CSS.escape(active) + '"] .tab-dot',
  );
  tabs.feed(active, '\\x1b]0;\\u2839 active-agent\\x07');
  expect(tabs.state(active).indicator === 'working'
    && document.querySelector(
      '.session-tab[data-session-id="' + CSS.escape(active) + '"] .tab-dot',
    ) === pendingSpinner,
  'provider-confirmed Working should preserve the pending spinner node');
  expect(tabs.state(background).indicator === 'working', 'signaled background working state should show spinner');
  expect(tabs.state(active).ariaLabel.includes('Agent working'), 'working status should be accessible on the tab');

  tabs.typeInput(active, '/clear\\r');
  expect(tabs.state(active).indicator === 'working'
    && tabs.state(active).ariaLabel.includes('Awaiting agent activity'),
  'focused Codex commands should show the transient spinner while awaiting provider evidence');
  tabs.feed(active, '? for shortcuts\\r\\n› ');
  await wait(30); tabs.flushRender();
  expect(tabs.state(active).indicator === 'idle',
    'a focused composer redraw without activity should resolve pending to idle');
  expect(JSON.stringify(tabs.state(active).indicatorPresentation) === JSON.stringify(liveTabPresentation),
  'live and idle tab states should have the same neutral presentation');
  expect(tabs.state(active).ariaLabel.includes('Agent idle'),
    'idle state should retain idle accessibility semantics');
  tabs.emitSignal(active, 'turn-end');
  expect(tabs.state(active).indicator === 'idle',
    'a delayed completion signal after /clear redraw must not revive the spinner');
  tabs.typeInput(active, 'build this again\\r');
  expect(tabs.state(active).indicator === 'working'
    && tabs.state(active).ariaLabel.includes('Awaiting agent activity'),
  'ordinary input after a command-only turn should return to a pending spinner');
  tabs.feed(active, '\\x1b]0;\\u2839 active-agent\\x07');
  expect(tabs.state(active).indicator === 'working'
    && tabs.state(active).ariaLabel.includes('Agent working'),
  'provider evidence should confirm working without interrupting spinner continuity');

  const backgroundCodex = tabs.addSession({
    name: 'background-codex-clear', agent: 'codex', realTerminal: true,
  });
  tabs.focus(active);
  tabs.typeInput(backgroundCodex, 'background work\\r');
  expect(tabs.state(backgroundCodex).indicator === 'working'
    && tabs.state(backgroundCodex).ariaLabel.includes('Awaiting agent activity'),
  'background Codex fixture should begin with a pending spinner');
  tabs.feed(backgroundCodex, '\\x1b]0;\\u2839 background-codex-clear\\x07');
  expect(tabs.state(backgroundCodex).indicator === 'working',
    'background Codex fixture should begin working after title activity');
  tabs.typeInput(backgroundCodex, '  /clear  \\r');
  expect(tabs.state(backgroundCodex).indicator === 'working'
    && tabs.state(backgroundCodex).ariaLabel.includes('Awaiting agent activity'),
  'background command submission should retain a transient spinner while pending');
  tabs.feed(backgroundCodex, '? for shortcuts\\r\\n› ');
  await wait(30); tabs.flushRender();
  const clearedRow = document.querySelector('#thread-list .rail-session-row[data-session-id="'
    + CSS.escape(backgroundCodex) + '"]');
  expect(tabs.state(backgroundCodex).indicator === 'idle'
    && clearedRow?.querySelector('.rail-status')?.getAttribute('aria-label') === 'Idle',
  'background Codex /clear should project idle through both tabs and Threads');

  const liveRedrawCodex = tabs.addSession({
    name: 'live-redraw-codex', agent: 'codex', realTerminal: true,
  });
  tabs.focus(active);
  tabs.typeInput(liveRedrawCodex, 'keep the spinner mounted\\r');
  let liveRedrawSpinner = null;
  for (const frame of ['First live redraw...', 'Second live redraw...', 'Third live redraw...']) {
    tabs.feed(liveRedrawCodex, '\\x1b[2J\\x1b[H' + frame + '\\r\\n? for shortcuts\\r\\n› ');
    await wait(30); tabs.flushRender();
    const currentSpinner = document.querySelector(
      '.session-tab[data-session-id="' + CSS.escape(liveRedrawCodex) + '"] .tab-dot',
    );
    if (!liveRedrawSpinner) liveRedrawSpinner = currentSpinner;
    expect(tabs.state(liveRedrawCodex).indicator === 'working'
      && tabs.state(liveRedrawCodex).ariaLabel.includes('Agent working')
      && currentSpinner === liveRedrawSpinner,
    'meaningful composer redraws should preserve the mounted Codex tab spinner: ' + frame);
  }
  tabs.feed(liveRedrawCodex, '\\x1b[2J\\x1b[H? for shortcuts\\r\\n› ');
  await wait(30); tabs.flushRender();
  expect(tabs.state(liveRedrawCodex).indicator === 'completed',
    'a later composer-only redraw should replace the background spinner with completion');

  const workingRow = document.querySelector('#thread-list .rail-session-row[data-session-id="' + CSS.escape(background) + '"]');
  const workingStatus = workingRow?.querySelector('.rail-status');
  expect(workingStatus?.getAttribute('aria-label') === 'Working',
    'working background session should expose a Threads status node');
  for (const input of ['d', 'raft', '\\x1b[A', '\\x1b[B', '\\t', '\\x1b[<0;12;8M']) {
    tabs.typeInput(background, input);
    const currentStatus = document.querySelector('#thread-list .rail-session-row[data-session-id="'
      + CSS.escape(background) + '"] .rail-status');
    expect(currentStatus === workingStatus,
      'terminal control input and unsubmitted drafts must preserve the working Threads status node: '
        + JSON.stringify(input));
    expect(currentStatus?.getAttribute('aria-label') === 'Working'
      && tabs.state(background).indicator === 'working',
    'terminal control input and unsubmitted drafts must preserve working state: ' + JSON.stringify(input));
  }

  tabs.emitSignal(active, 'turn-end');
  tabs.emitSignal(background, 'turn-end');
  expect(tabs.state(active).indicator === 'idle', 'active completed turn should transition directly to idle');
  expect(tabs.state(active).ariaLabel.includes('Agent idle'), 'idle status should be accessible on the tab');
  expect(tabs.state(background).indicator === 'completed', 'background completed turn should show checkmark');
  expect(tabs.state(background).title.includes('Turn completed'), 'completed status should appear in tooltip');

  for (const input of ['\\x1b[I', '\\x1b[O', '\\x1b[A', '\\x1b[B', '\\t', '\\x1b[<0;12;8M', 'draft']) {
    tabs.typeInput(background, input);
    expect(tabs.state(background).indicator === 'completed',
      'control input and unsubmitted typing should not activate the spinner: ' + JSON.stringify(input));
  }
  const completedStatus = document.querySelector('#thread-list .rail-session-row[data-session-id="'
    + CSS.escape(background) + '"] .rail-status');
  tabs.typeInput(background, 'continue\\r');
  expect(tabs.state(background).indicator === 'working', 'submitted input should return completed tab to spinner');
  const submittedStatus = document.querySelector('#thread-list .rail-session-row[data-session-id="'
    + CSS.escape(background) + '"] .rail-status');
  expect(submittedStatus !== completedStatus && submittedStatus?.getAttribute('aria-label') === 'Working',
    'submitted input should render the completed-to-working Threads transition');

  const grok = tabs.addSession({ name: 'grok-agent', agent: 'grok', turnState: 'completed' });
  tabs.emitSignal(grok, 'turn-start');
  expect(tabs.state(grok).indicator === 'working', 'Grok turn-start signal should activate the spinner');

  for (const agent of ['codex', 'claude', 'grok']) {
    const id = tabs.addSession({ name: agent + '-projection', agent, turnState: 'idle' });
    tabs.focus(id);
    expect(tabs.state(id).indicator === 'idle', agent + ' active idle state should use the gray dot');
    tabs.focus(active);
    tabs.emitSignal(id, 'turn-start');
    const railRow = document.querySelector('#thread-list .rail-session-row[data-session-id="' + CSS.escape(id) + '"]');
    expect(tabs.state(id).indicator === 'working'
      && tabs.state(id).title.includes('Agent working')
      && tabs.state(id).ariaLabel.includes('Agent working'),
    agent + ' background working state should agree across class, tooltip, and ARIA');
    expect(railRow?.querySelectorAll('.rail-status').length === 1
      && railRow.querySelector('.rail-status').getAttribute('aria-label') === 'Working',
    agent + ' background working state should agree with its single Threads status');
  }

  const input = tabs.addSession({ name: 'input-agent', agent: 'claude' });
  const permission = tabs.addSession({ name: 'permission-agent', agent: 'claude' });
  tabs.emitSignal(input, 'input-needed');
  tabs.emitSignal(permission, 'permission-required');
  expect(tabs.attentionKinds().includes('INPUT NEEDED'), 'input-required attention handling should remain unchanged');
  expect(tabs.attentionKinds().includes('PERMISSION'), 'permission attention handling should remain unchanged');
  tabs.focus(permission);
  expect(tabs.attentionKinds().includes('PERMISSION'),
    'focused permission-required attention should remain visible');
  tabs.focus(active);

  expect(tabs.state(input).indicator === 'action', 'input-required should show the amber action indicator');
  expect(tabs.state(permission).indicator === 'action', 'permission-required should show the amber action indicator');
  expect(tabs.state(input).indicatorCount === 1 && tabs.state(permission).indicatorCount === 1,
    'each tab should contain exactly one status element');

  const disabledPending = tabs.addSession({
    name: 'disabled-pending-codex', agent: 'codex', realTerminal: true,
  });
  tabs.typeInput(disabledPending, 'pending while indicators toggle\\r');
  expect(tabs.state(disabledPending).indicator === 'working'
    && tabs.state(disabledPending).ariaLabel.includes('Awaiting agent activity'),
  'enabled activity indicators should project pending Codex work as a spinner');
  tabs.setActivityPreference(false);
  expect(tabs.activityPreference() === false, 'switch should disable activity indicators');
  expect(tabs.activityPreferenceStored() === 'false', 'disabled preference should persist');
  expect(tabs.activityToggleState() === false, 'settings switch should reflect disabled preference');
  expect(tabs.state(active).indicator === 'live', 'disabled setting should restore active lifecycle dot');
  expect(tabs.state(background).indicator === 'live', 'disabled setting should restore background lifecycle dot');
  expect(tabs.state(disabledPending).indicator === 'pending'
    && tabs.state(disabledPending).ariaLabel.includes('Awaiting agent activity'),
  'disabled setting should preserve the existing non-spinning pending presentation');
  expect(tabs.state(input).indicator === 'action' && tabs.state(permission).indicator === 'action',
    'disabled activity preference must preserve action-required indicators');
  const inputAttentionRow = document.querySelector(
    '#thread-list .rail-session-row[data-session-id="' + CSS.escape(input) + '"]',
  );
  expect(inputAttentionRow?.querySelectorAll('.rail-status').length === 0
    && inputAttentionRow.getAttribute('aria-label').includes('Action required'),
  'disabled activity preference must preserve accessible action-required status without a separate attention-card icon');

  tabs.setActivityPreference(true);
  expect(tabs.activityPreferenceStored() === 'true', 'enabled preference should persist');
  expect(tabs.state(active).indicator === 'idle', 're-enabled setting should restore idle state');
  expect(tabs.state(background).indicator === 'working', 're-enabled setting should restore working state');
  expect(tabs.state(disabledPending).indicator === 'working'
    && tabs.state(disabledPending).ariaLabel.includes('Awaiting agent activity'),
  're-enabled setting should restore the pending spinner without confirming provider activity');

  tabs.exit(background, 7);
  expect(tabs.state(background).indicator === 'dead', 'exited session should override working state');
  expect(tabs.state(background).ariaLabel.includes('Session exited'), 'exit status should be accessible');
  tabs.exit(active, 0);
  expect(tabs.state(active).indicator === 'dead', 'exited session should override idle state');
  tabs.setActivityPreference(false);
  expect(tabs.state(background).indicator === 'dead' && tabs.state(active).indicator === 'dead',
    'disabled activity preference must preserve exited indicators');

  return JSON.stringify({ ok: true, active: tabs.state(active), background: tabs.state(background) });
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
  const e2eOut = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !e2eOut.includes('"ok":true')) {
    console.error('TAB_ACTIVITY_INDICATORS_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('TAB_ACTIVITY_INDICATORS_RENDERER_OK');
});
