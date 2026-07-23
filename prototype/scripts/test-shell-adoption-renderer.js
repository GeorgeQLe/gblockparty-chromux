'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-shell-adoption-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'shell-adoption-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });

fs.writeFileSync(e2ePath, `
(async () => {
  const adopt = window.chromuxTestShellAdoption;
  const commands = window.chromuxTestAgentCommand;
  const gate = window.chromuxTestCodexGate;
  if (!adopt || !commands || !gate) throw new Error('Missing shell adoption test API');
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const ctrlU = '\\x15';

  for (let i = 0; i < 100 && !(commands.env() && commands.env().home); i += 1) {
    await wait(50);
  }
  await gate.resumeAnyway();

  const codexBase = commands.build('codex');
  const claudeBase = commands.build('claude');
  const grokBase = commands.build('grok');
  expect(/codex/.test(codexBase), 'expected codex base command');
  expect(/claude/.test(claudeBase), 'expected claude base command');
  expect(grokBase === 'grok', 'expected bare grok base command: ' + grokBase);

  const typed = adopt.addShellSession({ name: 'typed-codex' });
  expect(adopt.agent(typed) === '', 'typed session should start as shell');
  adopt.type(typed, 'codex');
  const typedRewrite = adopt.type(typed, '\\r');
  expect(typedRewrite && typedRewrite.agent === 'codex', 'typed codex should rewrite on enter');
  expect(typedRewrite.command === codexBase, 'typed codex command mismatch: ' + typedRewrite.command);
  expect(
    adopt.ptyInputs(typed) === 'codex' + ctrlU + codexBase + '\\r',
    'typed codex should send previous chars plus Ctrl-U and instrumented command: ' + JSON.stringify(adopt.ptyInputs(typed)),
  );
  expect(adopt.agent(typed) === 'codex', 'typed codex should adopt session identity');
  expect(adopt.header(typed).includes('CODEX'), 'terminal header should update to CODEX');
  expect(adopt.turnState(typed).state === 'working', 'typed codex submit should mark Codex working');
  expect(adopt.snapshot().find((row) => row.name === 'typed-codex').agent === 'codex',
    'snapshot should persist adopted codex agent');

  const resume = adopt.addShellSession({ name: 'pasted-resume' });
  const resumeRewrite = adopt.type(resume, 'codex resume 123e4567-e89b-12d3-a456-426614174000\\r');
  expect(resumeRewrite && resumeRewrite.agent === 'codex', 'pasted codex resume should rewrite');
  expect(
    resumeRewrite.command === codexBase + ' resume 123e4567-e89b-12d3-a456-426614174000',
    'codex resume args should be preserved: ' + resumeRewrite.command,
  );
  expect(
    adopt.ptyInputs(resume) === ctrlU + codexBase + ' resume 123e4567-e89b-12d3-a456-426614174000\\r',
    'pasted codex resume should send one rewritten command',
  );

  const claude = adopt.addShellSession({ name: 'claude-model' });
  const claudeRewrite = adopt.type(claude, 'claude --model sonnet\\r');
  expect(claudeRewrite && claudeRewrite.agent === 'claude', 'claude --model should rewrite');
  expect(claudeRewrite.command === claudeBase + ' --model sonnet',
    'claude args should follow Chromux settings command: ' + claudeRewrite.command);
  expect(adopt.agent(claude) === 'claude', 'claude rewrite should adopt identity');

  const grok = adopt.addShellSession({ name: 'typed-grok' });
  const grokRewrite = adopt.type(grok, 'grok --resume 019f4ef1-dcd0-7440-beef-aec69c74a111\\r');
  expect(grokRewrite && grokRewrite.agent === 'grok', 'typed grok should rewrite');
  expect(
    grokRewrite.command === grokBase + ' --resume 019f4ef1-dcd0-7440-beef-aec69c74a111',
    'grok resume args should be preserved: ' + grokRewrite.command,
  );
  expect(adopt.agent(grok) === 'grok', 'grok rewrite should adopt identity');
  expect(adopt.header(grok).includes('GROK'), 'terminal header should update to GROK');

  const existingNotifyLines = [
    "codex -c 'notify=[\\"/tmp/codex-notify.sh\\"]'\\r",
    'codex --config=notify=[\\"/tmp/codex-notify.sh\\"]\\r',
  ];
  for (const line of existingNotifyLines) {
    const id = adopt.addShellSession({ name: 'managed-' + line.slice(0, 10) });
    const rewrite = adopt.type(id, line);
    expect(rewrite && rewrite.agent === 'codex', 'existing notify should gain the update override: ' + line);
    expect(rewrite.command.includes('check_for_update_on_startup=false'), 'update override missing: ' + rewrite.command);
    expect(rewrite.command.includes('notify='), 'existing notify config should be preserved: ' + rewrite.command);
  }

  const guardLines = [
    "codex -c 'notify=[\\"/tmp/codex-notify.sh\\"]' -c 'check_for_update_on_startup=false'\\r",
    'claude --settings /tmp/hooks-claude.json\\r',
    'codex | cat\\r',
    'codex > out.txt\\r',
    'codex && echo done\\r',
    'FOO=1 codex\\r',
    'env FOO=1 codex\\r',
    'sudo codex\\r',
    'command codex\\r',
    'nohup codex\\r',
    'grok | cat\\r',
    'sudo grok\\r',
  ];
  for (const line of guardLines) {
    const id = adopt.addShellSession({ name: 'guard-' + line.slice(0, 10) });
    const rewrite = adopt.type(id, line);
    expect(rewrite === null, 'guarded line should not rewrite: ' + line);
    expect(adopt.agent(id) === '', 'guarded line should remain shell: ' + line);
    expect(adopt.ptyInputs(id) === line, 'guarded line should pass through unchanged: ' + JSON.stringify(line));
  }

  const fallback = adopt.addShellSession({ name: 'fallback-codex' });
  expect(adopt.adoptRows([{ id: fallback, agent: 'codex', pid: 1200, command: 'codex' }]) === 1,
    'fallback codex descendant should adopt');
  expect(adopt.agent(fallback) === 'codex', 'fallback session should be codex');
  expect(adopt.snapshot().find((row) => row.name === 'fallback-codex').agent === 'codex',
    'fallback snapshot should persist adopted codex agent');

  const fallbackGrok = adopt.addShellSession({ name: 'fallback-grok' });
  expect(adopt.adoptRows([{ id: fallbackGrok, agent: 'grok', pid: 1400, command: 'grok' }]) === 1,
    'fallback grok descendant should adopt');
  expect(adopt.agent(fallbackGrok) === 'grok', 'fallback session should be grok');

  const noAgent = adopt.addShellSession({ name: 'fallback-none' });
  expect(adopt.adoptRows([{ id: noAgent, agent: '', pid: null }]) === 0,
    'empty fallback row should not adopt');
  expect(adopt.agent(noAgent) === '', 'empty fallback row should remain shell');

  const duplicate = adopt.addShellSession({ name: 'fallback-duplicate' });
  expect(adopt.adoptRows([
    { id: duplicate, agent: 'codex', pid: 1300, command: 'codex' },
    { id: duplicate, agent: 'codex', pid: 1301, command: 'codex helper' },
  ]) === 1, 'duplicate fallback rows should adopt once');
  expect(adopt.adoptRows([{ id: duplicate, agent: 'claude', pid: 1302, command: 'claude' }]) === 0,
    'already adopted session should not flip to a conflicting agent');
  expect(adopt.agent(duplicate) === 'codex', 'duplicate fallback session should stay codex');

  const classified = await window.chromuxTest.classifyPtyAgentDescendants({
    roots: [
      { id: 'pty-codex', pid: 10 },
      { id: 'pty-shell', pid: 20 },
      { id: 'pty-conflict', pid: 30 },
      { id: 'pty-grok', pid: 40 },
    ],
    procs: [
      { pid: 10, ppid: 1, tty: 'ttys010', etime: '00:10', command: '-zsh' },
      { pid: 11, ppid: 10, tty: 'ttys010', etime: '00:08', command: 'node /usr/local/bin/codex' },
      { pid: 12, ppid: 11, tty: 'ttys010', etime: '00:07', command: '/usr/local/bin/codex helper' },
      { pid: 20, ppid: 1, tty: 'ttys020', etime: '00:05', command: '-zsh' },
      { pid: 30, ppid: 1, tty: 'ttys030', etime: '00:04', command: '-zsh' },
      { pid: 31, ppid: 30, tty: 'ttys030', etime: '00:03', command: 'codex' },
      { pid: 32, ppid: 30, tty: 'ttys030', etime: '00:02', command: 'claude' },
      { pid: 40, ppid: 1, tty: 'ttys040', etime: '00:06', command: '-zsh' },
      { pid: 41, ppid: 40, tty: 'ttys040', etime: '00:05', command: '/Users/me/.grok/bin/grok' },
    ],
  });
  const byId = Object.fromEntries(classified.rows.map((row) => [row.id, row]));
  expect(byId['pty-codex'].agent === 'codex', 'classifier should detect top-level codex descendant');
  expect(byId['pty-codex'].pid === 11, 'classifier should keep the codex parent, not helper child');
  expect(byId['pty-codex'].candidates.length === 1, 'classifier should not duplicate same-agent helper children');
  expect(byId['pty-shell'].agent === '', 'classifier should leave PTY with no agent as shell');
  expect(byId['pty-conflict'].agent === '' && byId['pty-conflict'].conflict === true,
    'classifier should report conflicting descendant agents without adopting');
  expect(byId['pty-grok'].agent === 'grok', 'classifier should detect grok descendant');
  expect(byId['pty-grok'].pid === 41, 'classifier should keep the grok process');

  const adoptedEvents = adopt.events().filter((event) => event.type === 'session-adopted');
  expect(adoptedEvents.length >= 6, 'expected session-adopted events to be recorded');

  return JSON.stringify({ ok: true, adoptedEvents: adoptedEvents.length });
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

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
}, 30000);

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const e2eOut = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  if (code !== 0 || signal || !e2eOut.includes('"ok":true')) {
    console.error('SHELL_ADOPTION_RENDERER_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }
  console.log('SHELL_ADOPTION_RENDERER_OK');
});
