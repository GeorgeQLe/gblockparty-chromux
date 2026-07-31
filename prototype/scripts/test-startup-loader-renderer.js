'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-startup-loader-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'startup-loader-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const startup = window.chromuxTestStartupLoader;
  const themes = window.chromuxTestThemes;
  if (!startup || !themes) throw new Error('Missing startup loader or theme test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const tick = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const settle = async () => { await tick(); await tick(); };

  expect(startup.timeoutMs() === 15000, 'production stall threshold must remain 15 seconds');

  const codex = startup.addSession({
    name: 'fresh-codex', agent: 'codex', cwd: '/work/fresh-codex',
  });
  let view = startup.state(codex);
  expect(view.phase === 'starting' && !view.hidden && view.busy === 'true',
    'fresh Codex should start behind a busy loader: ' + JSON.stringify(view));
  expect(view.title === 'Starting Codex' && view.cwd === '/work/fresh-codex',
    'loader should identify provider and working directory');
  expect(view.role === 'status' && view.live === 'polite',
    'loader should expose a polite live status');
  expect(!view.terminalFocused && view.terminalAriaHidden === 'true'
    && view.helperTabIndex === -1 && view.composeDisabled,
    'starting terminal must be hidden from accessibility and keyboard focus');
  startup.input(codex, 'blocked');
  expect(startup.ptyInputs(codex).length === 0, 'startup input must not reach the PTY');
  startup.write(codex, 'login shell startup output\\r\\n');
  await settle();
  expect(startup.state(codex).phase === 'starting', 'ordinary startup output must not reveal Codex');
  startup.write(codex, 'OpenAI Codex (v0.146.0)\\r\\n? for shortcuts\\r\\n› ');
  await settle();
  view = startup.state(codex);
  expect(view.phase === 'revealed' && view.hidden && view.busy === 'false' && !view.timerActive,
    'rendered Codex prompt should reveal the terminal: ' + JSON.stringify(view));
  expect(view.revealReason === 'prompt' && view.terminalFocused,
    'prompt reveal should restore focus to the active terminal');
  expect(view.terminalAriaHidden === 'false' && view.helperTabIndex === 0 && !view.composeDisabled,
    'prompt reveal should restore terminal accessibility');
  expect(view.bufferText.includes('login shell startup output') && view.bufferText.includes('? for shortcuts'),
    'startup output must remain in xterm scrollback after reveal');

  for (const fixture of [
    { agent: 'claude', brand: 'Claude Code v2.1.214', prompt: '❯ ', title: 'Starting Claude Code' },
    { agent: 'grok', brand: 'Grok Build v0.9.0', prompt: '> ', title: 'Starting Grok Build' },
  ]) {
    const id = startup.addSession({
      name: fixture.agent + '-fresh', agent: fixture.agent, cwd: '/work/' + fixture.agent,
    });
    startup.write(id, fixture.brand + '\\r\\n');
    await settle();
    expect(startup.state(id).phase === 'starting',
      fixture.agent + ' brand without its prompt must remain hidden');
    startup.write(id, '? for shortcuts\\r\\n' + fixture.prompt);
    await settle();
    const ready = startup.state(id);
    expect(ready.phase === 'revealed' && ready.title === fixture.title,
      fixture.agent + ' recognizable rendered prompt should reveal: ' + JSON.stringify(ready));
  }

  const background = startup.addSession({
    name: 'restored-background', agent: 'claude', cwd: '/work/restored',
  });
  const shellHolder = startup.addSession({
    name: 'shell-holder', agent: '', cwd: '/work/shell',
  });
  expect(startup.state(shellHolder).phase === 'revealed' && startup.state(shellHolder).hidden,
    'plain shells must bypass the loader');
  startup.input(shellHolder, 'echo ready\\r');
  expect(startup.ptyInputs(shellHolder).join('') === 'echo ready\\r',
    'shell input should remain immediate');
  startup.write(background, 'Claude Code v2.1.0\\r\\n❯ ');
  await settle();
  expect(startup.state(background).phase === 'revealed',
    'restored/background agent should reveal when its rendered prompt arrives');
  expect(!startup.state(background).terminalFocused && startup.state(shellHolder).terminalFocused,
    'background readiness must not steal focus from the active session');

  const verboseClaude = startup.addSession({
    name: 'verbose-claude', agent: 'claude', cwd: '/work/verbose',
  });
  startup.write(verboseClaude, 'Claude Code v2.1.214\\r\\n');
  startup.write(verboseClaude, Array.from({ length: 180 }, (_, index) => (
    'shell initialization row ' + String(index + 1)
  )).join('\\r\\n') + '\\r\\n❯ ');
  await settle();
  expect(startup.state(verboseClaude).phase === 'revealed',
    'Claude branding more than 120 rows before its prompt should remain recognizable');

  const stalled = startup.addSession({
    name: 'slow-codex', agent: 'codex', cwd: '/work/slow', timeoutMs: 30,
  });
  await wait(55);
  view = startup.state(stalled);
  expect(view.phase === 'stalled' && view.stalled && !view.revealHidden,
    'timeout should switch to Still starting with a reveal action: ' + JSON.stringify(view));
  expect(view.status.startsWith('Still starting') && view.revealLabel === 'SHOW TERMINAL',
    'stalled copy and action should be explicit');
  startup.write(stalled, '? for shortcuts\\r\\n› ');
  await settle();
  expect(startup.state(stalled).phase === 'revealed'
    && startup.state(stalled).revealReason === 'prompt'
    && startup.state(stalled).hidden && startup.state(stalled).busy === 'false'
    && !startup.state(stalled).timerActive
    && startup.state(stalled).terminalAriaHidden === 'false'
    && startup.state(stalled).helperTabIndex === 0
    && !startup.state(stalled).composeDisabled,
  'a prompt arriving after the warning should automatically reveal the terminal');

  const manual = startup.addSession({
    name: 'manual-codex', agent: 'codex', cwd: '/work/manual', timeoutMs: 30,
  });
  startup.write(manual, 'startup output without an interactive prompt\\r\\n');
  await wait(55);
  startup.reveal(manual);
  await settle();
  expect(startup.state(manual).phase === 'revealed'
    && startup.state(manual).revealReason === 'manual'
    && startup.state(manual).bufferText.includes('startup output without an interactive prompt'),
  'manual action should reveal retained output without prompt evidence');

  const exited = startup.addSession({
    name: 'failed-claude', agent: 'claude', cwd: '/work/failed',
  });
  startup.exit(exited, 7);
  view = startup.state(exited);
  expect(view.phase === 'stalled' && view.exited && view.exitCode === 7 && !view.revealHidden,
    'early exit should show an exited loader with reveal action: ' + JSON.stringify(view));
  expect(view.title === 'Claude Code exited' && view.status.includes('code 7'),
    'early-exit state should explain the failure');
  startup.write(exited, 'Claude Code v2.1.214\\r\\n❯ ');
  await settle();
  expect(startup.state(exited).phase === 'stalled'
    && startup.state(exited).exited && startup.state(exited).revealReason === null,
  'exited sessions must never auto-reveal when later output resembles a prompt');
  startup.reveal(exited);
  await settle();
  expect(startup.state(exited).bufferText.includes('session exited (7)'),
    'manual reveal should expose the retained exit output');

  const disposable = startup.addSession({
    name: 'close-cleanup', agent: 'grok', cwd: '/work/close', timeoutMs: 5000,
  });
  const cleanup = startup.close(disposable);
  expect(cleanup.timerWasActive && cleanup.timerCleared && !startup.exists(disposable),
    'closing a starting session should dispose its timer and session state');

  const themed = startup.addSession({
    name: 'theme-loader', agent: 'codex', cwd: '/work/theme',
  });
  for (const theme of themes.ids()) {
    themes.select(theme);
    for (const mode of themes.modes()) {
      themes.selectMode(mode);
      await tick();
      view = startup.state(themed);
      expect(view.phase === 'starting' && view.display !== 'none',
        theme + '/' + mode + ' should keep the loader visible');
      expect(view.background !== 'rgba(0, 0, 0, 0)' && view.color !== view.background,
        theme + '/' + mode + ' should provide an opaque themed surface');
    }
  }
  startup.close(themed);

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
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

const timeout = setTimeout(() => child.kill('SIGTERM'), 30000);

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const e2eOut = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !e2eOut.includes('"ok":true')) {
    console.error('STARTUP_LOADER_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('STARTUP_LOADER_RENDERER_OK');
});
