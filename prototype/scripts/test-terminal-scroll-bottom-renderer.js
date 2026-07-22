'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-terminal-scroll-bottom-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'terminal-scroll-bottom-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const terminal = window.chromuxTestTerminalScroll;
  const themes = window.chromuxTestThemes;
  if (!terminal) throw new Error('Missing terminal scroll test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const tick = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const first = terminal.addSession({ name: 'scroll-first', rows: 10, scrollback: 200 });
  await terminal.writeLines(first, 45, 'first');
  await tick();
  let firstState = terminal.state(first);
  expect(firstState.baseY > 10, 'real xterm should have scrollback');
  expect(firstState.viewportY === firstState.baseY, 'terminal should begin at its latest output');
  expect(firstState.hidden, 'control should stay hidden at the bottom');

  terminal.scrollLines(first, -9);
  await tick();
  firstState = terminal.state(first);
  expect(firstState.behind === 9, 'fixture should be nine rows behind, got ' + firstState.behind);
  expect(firstState.hidden, 'control should stay hidden below the one-page threshold');

  terminal.scrollLines(first, -1);
  await tick();
  firstState = terminal.state(first);
  expect(firstState.behind === firstState.rows, 'fixture should be exactly one page behind');
  expect(!firstState.hidden && firstState.visible, 'control should appear at exactly one visible page');
  expect(firstState.label === '↓ SKIP TO BOTTOM', 'control should expose the requested label');
  expect(firstState.title === 'Skip to latest terminal output', 'control should have a useful title');
  expect(firstState.ariaLabel === 'Skip to latest terminal output', 'control should have an accessible name');
  expect(Math.abs(firstState.bottomInset - 14) < 1, 'control should sit 14px above the host bottom, got ' + firstState.bottomInset);
  expect(Math.abs(firstState.centerOffset) < 1, 'control should be horizontally centered, got ' + firstState.centerOffset);

  for (const theme of ['blueprint', 'retro-os', 'streak', 'liquid-glass']) {
    themes.select(theme);
    for (const mode of ['light', 'dark']) {
      themes.selectMode(mode);
      terminal.setViewWidth(first, mode === 'light' ? 360 : null);
      await tick();
      firstState = terminal.state(first);
      expect(!firstState.hidden, theme + ' ' + mode + ' should keep the control visible');
      expect(Math.abs(firstState.bottomInset - 14) < 1, theme + ' ' + mode + ' bottom inset drifted');
      expect(Math.abs(firstState.centerOffset) < 1, theme + ' ' + mode + ' centering drifted');
      expect(firstState.color !== 'rgba(0, 0, 0, 0)', theme + ' ' + mode + ' should have visible text');
      expect(firstState.background !== 'rgba(0, 0, 0, 0)', theme + ' ' + mode + ' should have a visible surface');
    }
  }
  terminal.setViewWidth(first, null);

  const geometryFirst = terminal.addGeometrySession({ name: 'geometry-first' });
  const geometrySecond = terminal.addGeometrySession({ name: 'geometry-second' });
  const assertBottomGeometry = (id, context) => {
    const geometry = terminal.state(id);
    expect(geometry.screenHeight > 0, context + ' should render a real xterm screen');
    expect(geometry.screenBottomInset >= 5.5,
      context + ' crossed the intended 6px bottom inset: ' + JSON.stringify(geometry));
    expect(geometry.screenBottomInset <= 20,
      context + ' should not lose an extra terminal row: ' + JSON.stringify(geometry));
  };
  for (let height = 112; height <= 172; height += 1) {
    terminal.setHostHeight(geometryFirst, height);
    await tick();
    assertBottomGeometry(geometryFirst, 'height ' + height);
  }
  terminal.setHostHeight(geometryFirst, 112);
  await tick();
  await terminal.writeLines(geometryFirst, 80, 'geometry-scrollback');
  terminal.scrollToBottom(geometryFirst);
  await tick();
  assertBottomGeometry(geometryFirst, 'after scrolling to bottom');
  for (let switchCount = 0; switchCount < 3; switchCount += 1) {
    terminal.focus(geometrySecond);
    await tick();
    terminal.focus(geometryFirst);
    await tick();
  }
  assertBottomGeometry(geometryFirst, 'after repeated tab activation fits');
  terminal.setBrowserCollapsed(geometryFirst, false);
  await tick();
  terminal.setBrowserCollapsed(geometryFirst, true);
  await tick();
  terminal.refit(geometryFirst);
  await tick();
  assertBottomGeometry(geometryFirst, 'after browser layout and explicit refits');
  terminal.focus(first);
  await tick();

  terminal.resize(first, 60, 12);
  await tick();
  firstState = terminal.state(first);
  expect(firstState.hidden === !(firstState.behind >= firstState.rows),
    'resize should recompute the page threshold: ' + JSON.stringify(firstState));
  terminal.resize(first, 60, 8);
  await tick();
  firstState = terminal.state(first);
  expect(firstState.hidden === !(firstState.behind >= firstState.rows),
    'second resize should recompute the page threshold: ' + JSON.stringify(firstState));

  terminal.scrollToBottom(first);
  terminal.scrollLines(first, -24);
  await tick();
  const animationStartEvents = terminal.state(first).scrollEvents;
  terminal.click(first);
  firstState = terminal.state(first);
  expect(firstState.hidden && firstState.animating, 'activation should immediately hide the animating control');
  await wait(65);
  await terminal.writeLines(first, 5, 'arrived-during-animation');
  await wait(260);
  await tick();
  firstState = terminal.state(first);
  expect(firstState.viewportY === firstState.baseY, 'animation should finish at the newest output');
  expect(firstState.hidden && !firstState.animating, 'control should remain hidden after completion');
  expect(firstState.focused, 'animation completion should restore terminal input focus');
  expect(firstState.scrollEvents - animationStartEvents > 1, 'normal motion should move through multiple xterm scroll positions');

  const second = terminal.addSession({ name: 'scroll-second', rows: 10, scrollback: 200 });
  await terminal.writeLines(second, 40, 'second');
  const inactiveBottomBefore = terminal.state(first);
  await terminal.writeLines(first, 3, 'inactive-following-bottom');
  await tick();
  firstState = terminal.state(first);
  expect(firstState.baseY > inactiveBottomBefore.baseY && firstState.viewportY === firstState.baseY,
    'an inactive tab following the bottom should continue following new output');

  terminal.scrollLines(first, -15);
  await tick();
  const firstSavedViewport = terminal.state(first).viewportY;
  terminal.scrollLines(second, -10);
  await tick();
  const secondBeforeOutput = terminal.state(second);
  expect(!secondBeforeOutput.hidden, 'second session should independently show its control');
  const secondSavedViewport = secondBeforeOutput.viewportY;
  terminal.focus(first);
  await tick();
  await terminal.writeLines(second, 4, 'continued-output');
  await tick();
  let secondState = terminal.state(second);
  expect(secondState.viewportY === secondSavedViewport,
    'output arriving while inactive must preserve a scrolled-back viewport');
  expect(secondState.viewportY < secondState.baseY, 'inactive output must not force a scrolled-back session to bottom');
  expect(!secondState.hidden, 'new output should remain reachable through the control');
  expect(terminal.state(first).viewportY === firstSavedViewport,
    'the first tab should retain its distinct viewport after activation fit');
  expect(terminal.state(second).viewportY === secondSavedViewport, 'switching away should preserve the inactive viewport');
  terminal.focus(second);
  await tick();
  secondState = terminal.state(second);
  expect(secondState.viewportY === secondSavedViewport,
    'switching back should restore the exact session-local viewport after fit');
  expect(secondState.fitCalls > 1 && secondState.fitViewportMoves > 0,
    'activation fixture must exercise a viewport-moving fit');
  terminal.focus(first);
  await tick();
  terminal.focus(second);
  await tick();
  expect(terminal.state(second).viewportY === secondSavedViewport,
    'repeated switching should keep the second tab at its saved content');
  terminal.setBrowserCollapsed(second, false);
  await tick();
  expect(terminal.state(second).viewportY === secondSavedViewport,
    'restoring the browser should preserve the terminal viewport through layout fit');
  terminal.setBrowserCollapsed(second, true);
  await tick();
  expect(terminal.state(second).viewportY === secondSavedViewport,
    'collapsing the browser should preserve the terminal viewport through layout fit');

  terminal.focus(first);
  await tick();
  terminal.scrollLines(first, -18);
  terminal.click(first);
  terminal.focus(second);
  await tick();
  await wait(260);
  await tick();
  expect(terminal.state(first).viewportY === terminal.state(first).baseY,
    'an inactive session animation should still reach its own bottom');
  expect(!terminal.state(first).focused && terminal.state(second).focused,
    'an offstage animation must not steal focus from the newly active terminal');

  terminal.setReducedMotion(second, true);
  terminal.click(second);
  secondState = terminal.state(second);
  expect(secondState.viewportY === secondState.baseY, 'reduced motion should jump immediately to bottom');
  expect(!secondState.animating && secondState.hidden, 'reduced-motion activation should not animate');
  expect(secondState.focused, 'reduced-motion activation should restore focus');

  terminal.scrollLines(first, -24);
  terminal.click(first);
  await wait(25);
  terminal.wheel(first);
  await tick();
  firstState = terminal.state(first);
  expect(!firstState.animating && firstState.viewportY < firstState.baseY, 'wheel input should cancel an active animation');
  terminal.click(first);
  await wait(25);
  terminal.pointer(first);
  await tick();
  firstState = terminal.state(first);
  expect(!firstState.animating && firstState.viewportY < firstState.baseY, 'pointer input should cancel an active animation');

  const normalViewportBeforeAlternate = terminal.state(first).viewportY;
  await terminal.setAlternate(first, true);
  await tick();
  firstState = terminal.state(first);
  expect(firstState.alternate && firstState.hidden, 'alternate screen should suppress the control');
  terminal.focus(second);
  await tick();
  terminal.focus(first);
  await tick();
  await terminal.setAlternate(first, false);
  await tick();
  expect(terminal.state(first).viewportY === normalViewportBeforeAlternate,
    'alternate-screen fits must not overwrite the saved normal-buffer viewport');
  terminal.scrollLines(first, -10);
  await tick();
  expect(!terminal.state(first).hidden, 'returning to normal scrollback should restore threshold behavior');

  const noScrollback = terminal.addSession({ name: 'no-scrollback', rows: 8, scrollback: 0 });
  await terminal.writeLines(noScrollback, 30, 'no-scrollback');
  terminal.scrollLines(noScrollback, -20);
  await tick();
  const noScrollbackState = terminal.state(noScrollback);
  expect(noScrollbackState.baseY === 0 && noScrollbackState.hidden,
    'sessions without scrollback should never show the control: ' + JSON.stringify(noScrollbackState));

  terminal.scrollLines(first, -20);
  terminal.click(first);
  expect(terminal.state(first).animating, 'disposal fixture should begin an animation');
  terminal.dispose(first);
  terminal.dispose(second);
  terminal.dispose(noScrollback);
  terminal.dispose(geometryFirst);
  terminal.dispose(geometrySecond);

  return JSON.stringify({ ok: true, smoothScrollEvents: firstState.scrollEvents - animationStartEvents });
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
    console.error('TERMINAL_SCROLL_BOTTOM_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('TERMINAL_SCROLL_BOTTOM_RENDERER_OK');
});
