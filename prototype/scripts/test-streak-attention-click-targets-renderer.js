'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-streak-attention-click-targets-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'streak-attention-click-targets-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const sig = window.chromuxTestSignals;
  const themes = window.chromuxTestThemes;
  const input = window.chromuxTest;
  if (!sig || !themes || !input) throw new Error('Missing signals, themes, or host-input test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rect = (element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  };
  const expectRect = (actual, expected, label) => {
    for (const key of ['x', 'y', 'width', 'height']) {
      expect(Math.abs(actual[key] - expected[key]) < .01,
        label + ' should preserve ' + key + '; before=' + JSON.stringify(expected) + ' after=' + JSON.stringify(actual));
    }
  };
  const attentionRow = (kind, name) => [...document.querySelectorAll('#attention-list .attention-item')]
    .find((row) => row.querySelector('.attention-kind')?.textContent === kind
      && row.querySelector('.attention-name')?.textContent === name);
  const attentionButton = (row, label) => [...row.querySelectorAll('.attention-actions .qi-btn')]
    .find((button) => button.textContent === label);
  const movePointer = async (x, y) => {
    await input.sendHostInput({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) });
    await wait(160);
  };
  const clickAt = async (x, y) => {
    const point = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
    await input.sendHostInput({ type: 'mouseMove', x: point.x, y: point.y });
    await wait(20);
    await input.sendHostInput({ type: 'mouseDown', ...point });
    await wait(20);
    await input.sendHostInput({ type: 'mouseUp', ...point });
    await wait(80);
    sig.flushRender();
  };

  await wait(100);
  themes.select('streak');
  themes.selectMode('light');

  const holder = await sig.addFakeSession({ name: 'holder', agent: '' });
  const viewId = await sig.addFakeSession({ name: 'view-target', agent: 'codex' });
  sig.emitSignal(viewId, 'turn-end');
  sig.focus(holder);
  await movePointer(500, 500);

  const viewRow = attentionRow('COMPLETED', 'view-target');
  expect(viewRow, 'background completed session should render an attention row');
  const viewButton = attentionButton(viewRow, 'VIEW');
  expect(viewButton, 'completed attention row should expose VIEW');
  const rowBefore = rect(viewRow);
  const viewBefore = rect(viewButton);
  await movePointer(viewBefore.x + (viewBefore.width / 2), viewBefore.y + viewBefore.height - 1);
  expect(viewButton.matches(':hover'), 'native boundary pointer should hover VIEW before geometry is checked');
  expectRect(rect(viewRow), rowBefore, 'Streak attention-card hover');
  expectRect(rect(viewButton), viewBefore, 'Streak attention-button hover');
  await clickAt(viewBefore.x + (viewBefore.width / 2), viewBefore.y + viewBefore.height - 1);
  expect(sig.activeId() === viewId, 'boundary VIEW click should activate the background session on the first click');

  const dismissId = await sig.addFakeSession({ name: 'dismiss-target', agent: 'codex' });
  sig.emitSignal(dismissId, 'turn-end');
  sig.focus(holder);
  await movePointer(500, 500);
  const dismissRow = attentionRow('COMPLETED', 'dismiss-target');
  expect(dismissRow, 'second completed session should render an attention row');
  const dismissButton = attentionButton(dismissRow, 'DISMISS');
  expect(dismissButton, 'completed attention row should expose DISMISS');
  const dismissBefore = rect(dismissButton);
  await movePointer(dismissBefore.x + (dismissBefore.width / 2), dismissBefore.y + dismissBefore.height - 1);
  expectRect(rect(dismissButton), dismissBefore, 'Streak dismiss-button hover');
  await clickAt(dismissBefore.x + (dismissBefore.width / 2), dismissBefore.y + dismissBefore.height - 1);
  expect(!attentionRow('COMPLETED', 'dismiss-target'),
    'boundary DISMISS click should remove the attention item on the first click');

  return JSON.stringify({ ok: true });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: {
    ...process.env,
    HOME: homeDir,
    CHROMUX_E2E: e2ePath,
    CHROMUX_E2E_OUT: e2eOutPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const out = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !out.includes('"ok":true')) {
    console.error('STREAK_ATTENTION_CLICK_TARGETS_RENDERER_FAIL', { code, signal, out, stdout, stderr });
    process.exit(1);
  }
  console.log('STREAK_ATTENTION_CLICK_TARGETS_RENDERER_OK');
});
