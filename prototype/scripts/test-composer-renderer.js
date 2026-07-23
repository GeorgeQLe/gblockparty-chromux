'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-composer-'));
const homeDir = path.join(tmpDir, 'home');
const projectDir = path.join(homeDir, 'project');
const shellDir = path.join(homeDir, 'shell-project');
const chromuxDir = path.join(homeDir, '.chromux');
const e2ePath = path.join(tmpDir, 'composer-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');
fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(shellDir, { recursive: true });
fs.mkdirSync(chromuxDir, { recursive: true });

fs.writeFileSync(path.join(chromuxDir, 'prompt-history.json'), JSON.stringify({
  schemaVersion: 1,
  projects: [{
    cwd: projectDir,
    updatedAt: '2026-07-22T12:00:00.000Z',
    entries: [{
      id: 'seed_entry_0001',
      text: 'Seed prompt for history',
      submittedAt: '2026-07-22T12:00:00.000Z',
      agent: 'codex',
      sessionName: 'seed-session',
    }],
  }],
}, null, 2));

fs.writeFileSync(e2ePath, `
(async () => {
  const c = window.chromuxTestComposer;
  const themes = window.chromuxTestThemes;
  if (!c || !themes) throw new Error('Missing composer or theme test API');
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms = 35) => new Promise((resolve) => setTimeout(resolve, ms));
  const tick = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const first = c.addSession({ name: 'codex-one', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16 });
  await tick();
  c.nativeInput(first, 'native');
  expect(c.ptyInputs(first).join('') === 'native', 'native xterm input must work before opening the composer');
  c.clearPtyInputs(first);

  await window.chromuxTest.sendHostInput({ type: 'keyDown', keyCode: 'Enter', modifiers: ['meta', 'shift'] });
  await wait(80); await tick();
  const openRoutes = await window.chromuxTest.shortcutRouteLog();
  expect(c.state(first).open && c.state(first).focused, 'Command+Shift+Enter should open and focus the editor: ' + JSON.stringify(openRoutes.slice(-3)));
  expect(c.draft(first) === 'native' && c.ptyInputs(first).join('') === '\\x15\\x0b',
    'shortcut open should transfer pending terminal input and clear the live line exactly once');
  c.open(first); await tick();
  expect(c.ptyInputs(first).join('') === '\\x15\\x0b', 'opening an already-open composer must not retransmit or clear again');
  c.close(first); await tick(); c.clickOpen(first); await tick();
  expect(c.state(first).open && c.state(first).focused, 'COMPOSE button should open and focus the editor');
  c.setDraft(first, '   '); c.clearPtyInputs(first);
  expect(!(await c.submit(first)) && c.ptyInputs(first).length === 0, 'empty composer submissions should be rejected');
  c.setDraft(first, 'first line');
  c.enter(first);
  c.setDraft(first, c.draft(first) + 'second line');
  expect(c.draft(first) === 'first line\\nsecond line', 'Enter should produce a newline in the draft');
  await c.write(first, '\\x1b[?2004h');
  c.clearPtyInputs(first);
  await window.chromuxTest.sendHostInput({ type: 'keyDown', keyCode: 'Enter', modifiers: ['meta', 'shift'] });
  await wait(80);
  const submitInputs = c.ptyInputs(first);
  expect(submitInputs.join('') === '\\x1b[200~first line\\rsecond line\\x1b[201~\\r',
    'composer must send exact bracketed paste plus one final carriage return: ' + JSON.stringify(submitInputs));
  expect(submitInputs.filter((part) => part.includes('first line')).length === 1,
    'composer text must reach PTY input exactly once');
  expect(c.state(first).open && c.state(first).focused && c.draft(first) === '',
    'successful submission should clear, stay open, and retain editor focus');
  let history = await c.history(first);
  expect(history.filter((entry) => entry.text === 'first line\\nsecond line').length === 1,
    'successful submission should append history exactly once');

  c.setDraft(first, 'first-tab-draft');
  const second = c.addSession({ name: 'codex-two', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16 });
  c.open(second); await tick(); c.setDraft(second, 'second-tab-draft');
  c.focus(first); await tick();
  expect(c.draft(first) === 'first-tab-draft' && c.state(first).focused,
    'tab switching should preserve per-session draft and composer focus');
  c.focus(second); await tick();
  expect(c.draft(second) === 'second-tab-draft', 'second session should retain its independent draft');

  const snapshotRows = c.snapshot();
  const saved = await window.chromux.saveRestoreSnapshot({ reason: 'manual', sessions: snapshotRows });
  expect(saved.schemaVersion === 7, 'composer drafts should remain readable in restore snapshot schema v7');
  expect(saved.sessions.find((row) => row.name === 'codex-one').composerDraft === 'first-tab-draft',
    'first draft should round-trip through main-process snapshot validation');
  const restored = c.addSession({ name: 'restored', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, composerDraft: saved.sessions[0].composerDraft });
  await tick();
  expect(!c.state(restored).open && c.draft(restored) && c.state(restored).hasDraftIndicator,
    'restored draft should stay closed and mark the COMPOSE control');
  c.open(restored); c.setDraft(restored, '😀'.repeat(20000));
  expect(new TextEncoder().encode(c.draft(restored)).byteLength <= 65536 && !c.draft(restored).endsWith('�'),
    'renderer should enforce the 64 KiB UTF-8 bound without splitting a character');
  c.close(restored);

  const acceptedSkill = c.addSession({ name: 'accepted-skill', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16, cols: 42 });
  c.nativeInput(acceptedSkill, '$ski'); c.clearPtyInputs(acceptedSkill);
  await c.renderPromptFixture(acceptedSkill, '? for shortcuts\\r\\n› $skill-creator audit');
  c.open(acceptedSkill); await tick();
  expect(c.draft(acceptedSkill) === '$skill-creator audit' && c.ptyInputs(acceptedSkill).join('') === '\\x15\\x0b',
    'Compose should transfer the rendered value after a Codex skill autocomplete expansion');
  c.close(acceptedSkill); c.clearPtyInputs(acceptedSkill); c.open(acceptedSkill); await tick();
  expect(!c.state(acceptedSkill).conflictOpen && c.ptyInputs(acceptedSkill).length === 0,
    'an immediately reopened composer must not recover the stale pre-clear rendered row');

  const recalledPrompt = c.addSession({ name: 'recalled-prompt', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16, cols: 42 });
  c.nativeInput(recalledPrompt, '\\x1b[A'); c.clearPtyInputs(recalledPrompt);
  await c.renderPromptFixture(recalledPrompt, '? for shortcuts\\r\\n› recalled history value 😀');
  c.open(recalledPrompt); await tick();
  expect(c.draft(recalledPrompt) === 'recalled history value 😀',
    'Compose should use Codex-rendered history recall instead of literal navigation input');

  const wrappedPrompt = c.addSession({ name: 'wrapped-prompt', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16, cols: 20 });
  c.nativeInput(wrappedPrompt, 'shadow'); c.clearPtyInputs(wrappedPrompt);
  await c.renderPromptFixture(wrappedPrompt, '? for shortcuts\\r\\n› alpha beta gamma delta epsilon');
  c.open(wrappedPrompt); await tick();
  expect(c.draft(wrappedPrompt) === 'alpha beta gamma delta epsilon' && !c.draft(wrappedPrompt).includes('\\n'),
    'visual xterm wrapping must not become a prompt newline');

  const multilinePrompt = c.addSession({ name: 'multiline-prompt', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16, cols: 48 });
  c.nativeInput(multilinePrompt, 'stale shadow'); c.clearPtyInputs(multilinePrompt);
  await c.renderPromptFixture(multilinePrompt, '? for shortcuts\\r\\n› first line with › and │ symbols\\r\\n  second intentional line');
  c.open(multilinePrompt); await tick();
  expect(c.draft(multilinePrompt) === 'first line with › and │ symbols\\nsecond intentional line',
    'intentional prompt newlines should survive while decoration-like content remains intact');

  const menuPrompt = c.addSession({ name: 'menu-prompt', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16, cols: 52 });
  c.nativeInput(menuPrompt, 'menu-shadow'); c.clearPtyInputs(menuPrompt);
  await c.renderPromptFixture(menuPrompt, '? for shortcuts\\r\\n› expanded-token', [
    '  $skill-creator   Create a skill',
    '  $skill-installer Install a skill',
  ]);
  c.open(menuPrompt); await tick();
  expect(c.draft(menuPrompt) === 'expanded-token'
    && !c.draft(menuPrompt).includes('Create a skill') && !c.draft(menuPrompt).includes('Install a skill'),
  'autocomplete menu rows must not be scraped into the prompt');

  const framedPrompt = c.addSession({ name: 'framed-prompt', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16, cols: 52 });
  c.nativeInput(framedPrompt, 'frame-shadow'); c.clearPtyInputs(framedPrompt);
  await c.renderPromptFixture(framedPrompt, '╭────────────────────╮\\r\\n│ › bordered value │', ['╰────────────────────╯']);
  c.open(framedPrompt); await tick();
  expect(c.draft(framedPrompt) === 'bordered value',
    'Codex prompt borders should be removed without removing prompt content');

  const placeholderPrompt = c.addSession({ name: 'placeholder-prompt', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16 });
  await c.renderPromptFixture(placeholderPrompt, '? for shortcuts\\r\\n› Ask Codex anything…');
  c.open(placeholderPrompt); await tick();
  expect(c.draft(placeholderPrompt) === '' && c.ptyInputs(placeholderPrompt).length === 0,
    'Codex placeholder text must not transfer as user input');

  const submittedPrompt = c.addSession({ name: 'submitted-prompt', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16 });
  c.nativeInput(submittedPrompt, 'already submitted');
  await c.renderPromptFixture(submittedPrompt, '? for shortcuts\\r\\n› already submitted');
  c.nativeInput(submittedPrompt, '\\r'); c.clearPtyInputs(submittedPrompt);
  c.open(submittedPrompt); await tick();
  expect(c.draft(submittedPrompt) === '' && c.ptyInputs(submittedPrompt).length === 0,
    'a stale rendered row must not recover a prompt after submission');

  const ambiguousPrompt = c.addSession({ name: 'ambiguous-prompt', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16 });
  c.nativeInput(ambiguousPrompt, 'safe shadow'); c.clearPtyInputs(ambiguousPrompt);
  await c.renderPromptFixture(ambiguousPrompt, 'ordinary output\\r\\n› unrelated glyph without Codex chrome');
  c.open(ambiguousPrompt); await tick();
  expect(c.draft(ambiguousPrompt) === 'safe shadow' && c.ptyInputs(ambiguousPrompt).length === 0,
    'ambiguous rendered content should fall back to the shadow without clearing the live Codex prompt');

  const transfer = c.addSession({ name: 'transfer', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16 });
  c.nativeInput(transfer, 'abc'); c.nativeInput(transfer, '\\x1b[D'); c.nativeInput(transfer, 'Z');
  c.nativeInput(transfer, '\\x1b[3~'); c.nativeInput(transfer, '\\x1b[200~paste😀\\x1b[201~');
  c.clearPtyInputs(transfer); c.clickOpen(transfer); await tick();
  expect(c.draft(transfer) === 'abZpaste😀' && c.ptyInputs(transfer).join('') === '\\x15\\x0b',
    'edited lines and bracketed Unicode paste should transfer as the current editable line');
  c.close(transfer); c.nativeInput(transfer, 'cancelled'); c.nativeInput(transfer, '\\x03'); c.clearPtyInputs(transfer); c.open(transfer); await tick();
  expect(c.draft(transfer) === 'abZpaste😀' && c.ptyInputs(transfer).length === 0,
    'cancelled terminal input should not conflict with the preserved composer draft');

  const editing = c.addSession({ name: 'editing', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16 });
  c.nativeInput(editing, 'one two'); c.nativeInput(editing, '\\x1bb'); c.nativeInput(editing, 'X');
  c.nativeInput(editing, '\\x01'); c.nativeInput(editing, '\\x0b'); c.nativeInput(editing, 'done');
  c.nativeInput(editing, '\\x1b[H'); c.nativeInput(editing, 'Q'); c.nativeInput(editing, '\\x1b[F'); c.nativeInput(editing, 'Z');
  c.clearPtyInputs(editing); c.open(editing); await tick();
  expect(c.draft(editing) === 'QdoneZ' && c.ptyInputs(editing).join('') === '\\x15\\x0b',
    'word movement, Home/End, and line clearing controls should track the editable line');

  const bounded = c.addSession({ name: 'bounded', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16 });
  c.nativeInput(bounded, '😀'.repeat(20000)); c.clearPtyInputs(bounded); c.open(bounded); await tick();
  expect(new TextEncoder().encode(c.draft(bounded)).byteLength === 65536 && !c.draft(bounded).endsWith('�')
    && c.ptyInputs(bounded).join('') === '\\x15\\x0b', 'terminal input transfer should enforce the 64 KiB UTF-8 bound');
  expect(await window.chromux.clipboardWriteText('x'.repeat(65537)) === false,
    'clipboard preload bridge should reject text above the composer bound');

  const conflict = c.addSession({ name: 'conflict', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, composerDraft: 'draft', rows: 16 });
  c.nativeInput(conflict, 'literal'); c.clearPtyInputs(conflict);
  await c.renderPromptFixture(conflict, '? for shortcuts\\r\\n› terminal-expanded');
  c.open(conflict); await tick();
  expect(c.state(conflict).conflictOpen && c.draft(conflict) === 'draft', 'conflicting sources should open an accessible choice prompt');
  c.resolveConflict(conflict, 'append'); await tick();
  expect(c.draft(conflict) === 'draft\\nterminal-expanded' && c.ptyInputs(conflict).join('') === '\\x15\\x0b',
    'Append should merge the rendered value then clear the PTY line once');
  c.close(conflict); c.setDraft(conflict, 'keep'); c.nativeInput(conflict, 'replacement-shadow'); c.clearPtyInputs(conflict);
  await c.renderPromptFixture(conflict, '? for shortcuts\\r\\n› replacement-rendered');
  c.open(conflict); await tick();
  c.resolveConflict(conflict, 'replace'); await tick();
  expect(c.draft(conflict) === 'replacement-rendered' && c.ptyInputs(conflict).join('') === '\\x15\\x0b',
    'Replace should use the rendered terminal value then clear the PTY line once');
  c.close(conflict); c.setDraft(conflict, 'copy-draft'); c.nativeInput(conflict, 'copy-shadow'); c.clearPtyInputs(conflict);
  await c.renderPromptFixture(conflict, '? for shortcuts\\r\\n› copy-rendered');
  c.open(conflict); await tick();
  await c.resolveConflict(conflict, 'copy'); await tick();
  expect(c.draft(conflict) === 'copy-draft' && c.pendingInput(conflict) === 'copy-rendered' && c.ptyInputs(conflict).length === 0
    && await window.chromuxTest.clipboardReadText() === 'copy-rendered',
  'Copy should preserve both sources and copy exactly the rendered prompt through the preload bridge');
  c.close(conflict); c.open(conflict); await tick(); c.resolveConflict(conflict, 'dismiss'); await tick();
  expect(c.draft(conflict) === 'copy-draft' && c.pendingInput(conflict) === 'copy-rendered' && c.ptyInputs(conflict).length === 0,
    'dismissing the prompt should preserve both sources');

  const overflowConflict = c.addSession({
    name: 'overflow-conflict', agent: 'codex', cwd: ${JSON.stringify(projectDir)},
    composerDraft: 'x'.repeat(65530), rows: 16,
  });
  c.nativeInput(overflowConflict, 'shadow-overflow'); c.clearPtyInputs(overflowConflict);
  await c.renderPromptFixture(overflowConflict, '? for shortcuts\\r\\n› rendered-overflow');
  c.open(overflowConflict); await tick();
  expect(c.state(overflowConflict).appendConflictDisabled && !(await c.resolveConflict(overflowConflict, 'append'))
    && c.draft(overflowConflict) === 'x'.repeat(65530) && c.pendingInput(overflowConflict) === 'rendered-overflow'
    && c.ptyInputs(overflowConflict).length === 0,
  'overflowing Append should remain disabled and preserve the draft, rendered prompt, and live input');

  const independent = c.addSession({ name: 'independent', agent: 'codex', cwd: ${JSON.stringify(projectDir)}, rows: 16 });
  c.nativeInput(independent, 'separate');
  expect(c.pendingInput(independent) === 'separate' && c.pendingInput(conflict) === 'copy-rendered', 'pending input must remain session scoped');
  c.nativeInput(independent, '\\r'); c.clearPtyInputs(independent); c.open(independent); await tick();
  expect(c.draft(independent) === '' && c.ptyInputs(independent).length === 0, 'submitted lines should not transfer');
  c.close(independent); c.nativeInput(independent, 'dead'); c.exit(independent, 0); c.clearPtyInputs(independent); c.open(independent); await tick();
  expect(c.draft(independent) === '' && c.pendingInput(independent) === 'dead' && c.ptyInputs(independent).length === 0,
    'exited sessions should preserve pending input without attempting a transfer');

  c.focus(first); c.open(first); await tick();
  c.setDraft(first, 'scratch text');
  c.recall(first, 'ArrowUp'); await wait();
  expect(c.draft(first) === 'first line\\nsecond line', 'Option+Up should recall newest project prompt');
  c.recall(first, 'ArrowDown'); await wait();
  expect(c.draft(first) === 'scratch text', 'Option+Down past newest should restore scratch draft');

  await c.toggleHistory(first); await wait();
  c.search(first, 'seed prompt');
  expect(c.historyPreviews(first).length === 1 && c.historyPreviews(first)[0].includes('Seed prompt'),
    'history drawer search should be case-insensitive and bounded to matches');
  c.reuse(first, 0);
  expect(c.draft(first) === 'Seed prompt for history' && !c.state(first).drawerOpen,
    'history selection should reuse full prompt and close drawer');
  await c.toggleHistory(first); c.search(first, 'seed prompt'); await c.deleteHistory(first, 0);
  expect(!c.historyPreviews(first).some((text) => text.includes('Seed prompt')), 'individual history deletion should update drawer');
  window.confirm = () => true;
  await c.clearHistory(first);
  expect((await c.history(first)).length === 0, 'clear project history should remove all entries after confirmation');

  const shell = c.addSession({ name: 'shell', agent: '', cwd: ${JSON.stringify(shellDir)}, rows: 16 });
  c.nativeInput(shell, 'echo shadow'); c.clearPtyInputs(shell);
  await c.renderPromptFixture(shell, '? for shortcuts\\r\\n› rendered text belongs only to Codex');
  c.open(shell); await tick();
  expect(c.draft(shell) === 'echo shadow' && c.ptyInputs(shell).join('') === '\\x15\\x0b',
    'non-Codex sessions should retain shadow-model transfer behavior');
  c.setDraft(shell, '');
  c.close(shell);
  c.open(shell); await tick(); c.setDraft(shell, 'echo one\\necho two'); c.clearPtyInputs(shell);
  window.confirm = () => false;
  expect(!(await c.submit(shell)), 'cancelled shell multiline warning should reject submission');
  expect(c.draft(shell) === 'echo one\\necho two' && c.ptyInputs(shell).length === 0 && c.state(shell).focused,
    'shell cancellation should preserve draft, focus, and PTY silence');
  window.confirm = () => true;
  expect(await c.submit(shell), 'confirmed shell multiline prompt should submit');
  expect(c.ptyInputs(shell).join('') === 'echo one\\recho two\\r', 'shell submission should append exactly one final carriage return');

  c.setDraft(shell, 'preserve after exit'); c.exit(shell, 0);
  expect(c.state(shell).submitDisabled && c.draft(shell) === 'preserve after exit',
    'exited session should disable submit while preserving draft');
  c.escape(shell); await tick();
  expect(!c.state(shell).open && c.state(shell).terminalFocused, 'Escape should close without clearing and return focus to xterm');

  c.focus(first); c.close(first);
  await c.write(first, Array.from({ length: 80 }, (_, index) => 'viewport-' + index).join('\\r\\n'));
  c.scrollLines(first, -6); await tick();
  const viewportBeforeComposer = c.state(first).viewportY;
  c.open(first); await tick(); c.setBrowserCollapsed(first, false); await tick(); c.setBrowserCollapsed(first, true); await tick();
  c.close(first); await tick();
  expect(c.state(first).viewportY === viewportBeforeComposer,
    'composer and browser refits should preserve a scrolled-back terminal viewport');
  c.open(first); c.setDraft(first, Array(30).fill('long composer line').join('\\n')); await tick();
  const geometry = c.state(first);
  expect(geometry.textareaHeight <= geometry.paneHeight * 0.4 + 2,
    'composer textarea should cap at 40% of terminal pane height: ' + JSON.stringify(geometry));
  expect(c.state(first).toolbarActions.join(',') === 'HISTORY,EXPAND,CLOSE', 'Expand should appear between History and Close');
  const viewportBeforeExpand = c.state(first).viewportY;
  c.toggleExpand(first); await tick();
  const expanded = c.state(first);
  expect(expanded.expanded && expanded.expandLabel === 'COLLAPSE' && !expanded.termHostVisible
    && expanded.composerHeight > expanded.paneHeight * 0.75, 'expanded composer should replace the terminal body and fill the pane');
  await c.toggleHistory(first); await tick();
  expect(c.state(first).drawerOpen && c.state(first).expanded, 'history should remain available while expanded');
  c.focus(second); await tick(); c.focus(first); await tick();
  expect(c.state(first).expanded, 'expanded state should survive tab switching while open');
  c.toggleExpand(first); await tick();
  expect(!c.state(first).expanded && c.state(first).viewportY === viewportBeforeExpand,
    'collapse should restore xterm viewport: ' + JSON.stringify({ before: viewportBeforeExpand, after: c.state(first) }));
  c.toggleExpand(first); c.close(first); await tick(); c.open(first); await tick();
  expect(!c.state(first).expanded, 'Close should reset expansion to compact');
  c.toggleExpand(first); c.escape(first); await tick(); c.open(first); await tick();
  expect(!c.state(first).expanded, 'Escape should reset expansion to compact');
  for (const theme of ['blueprint', 'retro-os', 'streak', 'liquid-glass']) {
    themes.select(theme);
    for (const mode of ['light', 'dark']) {
      themes.selectMode(mode); await tick();
      expect(c.state(first).open && c.state(first).textareaHeight > 0, theme + ' ' + mode + ' should render open composer');
      c.close(first); await tick(); expect(!c.state(first).open, theme + ' ' + mode + ' should render closed composer');
      c.open(first); await tick();
    }
  }
  expect(c.state(first).helperCount === 1 && !c.state(first).helperInsideComposer
    && c.state(first).helperBackground === 'rgba(0, 0, 0, 0)',
    'composer must leave xterm helper textarea singular, transparent, and owned by xterm');

  return JSON.stringify({ ok: true, submitInputs, historyCount: history.length });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: { ...process.env, HOME: homeDir, PATH: '/usr/bin:/bin', CHROMUX_E2E: e2ePath, CHROMUX_E2E_OUT: e2eOutPath },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
const timeout = setTimeout(() => child.kill('SIGTERM'), 45000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  let report = null;
  try { report = JSON.parse(output); } catch { /* reported below */ }
  if (code !== 0 || signal || !report || report.ok !== true) {
    console.error('COMPOSER_RENDERER_FAIL');
    console.error({ code, signal, output, stdout, stderr });
    process.exit(1);
  }
  console.log('COMPOSER_RENDERER_OK');
});
