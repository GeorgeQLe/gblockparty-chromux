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

  const active = tabs.addSession({ name: 'active-agent', agent: 'codex' });
  const background = tabs.addSession({ name: 'background-agent', agent: 'claude' });
  tabs.focus(active);
  expect(tabs.state(active).indicator === 'live', 'unknown active turn should retain live dot');
  expect(tabs.state(background).indicator === 'live', 'unknown background turn should retain live dot');

  tabs.typeInput(active, 'build this\\r');
  tabs.emitSignal(background, 'turn-start');
  expect(tabs.state(active).indicator === 'working', 'inferred active working state should show spinner');
  expect(tabs.state(background).indicator === 'working', 'signaled background working state should show spinner');
  expect(tabs.state(active).ariaLabel.includes('Agent working'), 'working status should be accessible on the tab');

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
  tabs.typeInput(background, 'continue\\r');
  expect(tabs.state(background).indicator === 'working', 'submitted input should return completed tab to spinner');

  const grok = tabs.addSession({ name: 'grok-agent', agent: 'grok', turnState: 'completed' });
  tabs.emitSignal(grok, 'turn-start');
  expect(tabs.state(grok).indicator === 'working', 'Grok turn-start signal should activate the spinner');

  const input = tabs.addSession({ name: 'input-agent', agent: 'claude' });
  const permission = tabs.addSession({ name: 'permission-agent', agent: 'claude' });
  tabs.emitSignal(input, 'input-needed');
  tabs.emitSignal(permission, 'permission-required');
  tabs.focus(active);
  expect(tabs.state(input).indicator === 'live', 'input-required should retain lifecycle dot');
  expect(tabs.state(permission).indicator === 'live', 'permission-required should retain lifecycle dot');
  expect(tabs.attentionKinds().includes('INPUT NEEDED'), 'input-required attention handling should remain unchanged');
  expect(tabs.attentionKinds().includes('PERMISSION'), 'permission attention handling should remain unchanged');

  tabs.setActivityPreference(false);
  expect(tabs.activityPreference() === false, 'switch should disable activity indicators');
  expect(tabs.activityPreferenceStored() === 'false', 'disabled preference should persist');
  expect(tabs.activityToggleState() === false, 'settings switch should reflect disabled preference');
  expect(tabs.state(active).indicator === 'live', 'disabled setting should restore active lifecycle dot');
  expect(tabs.state(background).indicator === 'live', 'disabled setting should restore background lifecycle dot');

  tabs.setActivityPreference(true);
  expect(tabs.activityPreferenceStored() === 'true', 'enabled preference should persist');
  expect(tabs.state(active).indicator === 'idle', 're-enabled setting should restore idle state');
  expect(tabs.state(background).indicator === 'working', 're-enabled setting should restore working state');

  tabs.exit(background, 7);
  expect(tabs.state(background).indicator === 'dead', 'exited session should override working state');
  expect(tabs.state(background).ariaLabel.includes('Session exited'), 'exit status should be accessible');
  tabs.exit(active, 0);
  expect(tabs.state(active).indicator === 'dead', 'exited session should override idle state');

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
