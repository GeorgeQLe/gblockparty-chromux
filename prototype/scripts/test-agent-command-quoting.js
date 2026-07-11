// Agent launch commands must survive shell metacharacters in HOME: the hooks
// settings / codex notify paths are interpolated into shell strings by both
// main (claudeCommand/codexCommand/grokCommand via resolve-restore-sessions)
// and the renderer (agentCommand). Run the smoke app with a HOME containing a
// space, a single quote, a double quote, and a backslash, collect the commands
// built by both sides, and verify each one parses under zsh and delivers the
// exact path back as a single argument.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-quoting-'));
const homeDir = path.join(tmpDir, 'home it\'s "quoted" back\\slash');
const e2ePath = path.join(tmpDir, 'quoting-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

const projClaude = path.join(homeDir, 'proj-claude');
const projCodex = path.join(homeDir, 'proj-codex');
const projGrok = path.join(homeDir, 'proj-grok');
const claudeResumeId = '11111111-2222-3333-4444-555555555555';
const codexResumeId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const grokResumeId = '019f4ef1-dcd0-7440-beef-aec69c74a111';

fs.mkdirSync(homeDir, { recursive: true });

// Seed a resumable claude session (~/.claude/projects/<munged-cwd>/<uuid>.jsonl)
// and a codex rollout so resolve-restore-sessions builds main-process commands.
const mungedClaude = projClaude.replace(/[^a-zA-Z0-9]/g, '-');
const claudeSessionDir = path.join(homeDir, '.claude', 'projects', mungedClaude);
fs.mkdirSync(claudeSessionDir, { recursive: true });
fs.writeFileSync(path.join(claudeSessionDir, `${claudeResumeId}.jsonl`), '{}\n');

const codexDayDir = path.join(homeDir, '.codex', 'sessions', '2026', '01', '01');
fs.mkdirSync(codexDayDir, { recursive: true });
fs.writeFileSync(
  path.join(codexDayDir, `rollout-2026-01-01T00-00-00-${codexResumeId}.jsonl`),
  JSON.stringify({
    type: 'session_meta',
    timestamp: '2026-01-01T00:00:00Z',
    payload: { id: codexResumeId, cwd: projCodex },
  }) + '\n',
);

// Grok sessions: ~/.grok/sessions/<encodeURIComponent(cwd)>/<id>/summary.json
const grokSessionDir = path.join(homeDir, '.grok', 'sessions', encodeURIComponent(projGrok), grokResumeId);
fs.mkdirSync(grokSessionDir, { recursive: true });
fs.writeFileSync(path.join(grokSessionDir, 'summary.json'), JSON.stringify({
  info: { id: grokResumeId, cwd: projGrok },
  last_active_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}) + '\n');

fs.writeFileSync(e2ePath, `
(async () => {
  const api = window.chromuxTestAgentCommand;
  if (!api) throw new Error('Missing agent command test API');
  for (let i = 0; i < 100 && !(api.env() && api.env().home); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const env = api.env();
  const resolved = await window.chromux.resolveRestoreSessions({
    sessions: [
      { name: 'claude-restore', cwd: ${JSON.stringify(projClaude)}, agent: 'claude' },
      { name: 'codex-restore', cwd: ${JSON.stringify(projCodex)}, agent: 'codex' },
      { name: 'grok-restore', cwd: ${JSON.stringify(projGrok)}, agent: 'grok' },
    ],
  });
  const main = {};
  for (const s of resolved.sessions) main[s.agent] = s.command;
  return JSON.stringify({
    ok: true,
    env: {
      hooksSettingsPath: env.hooksSettingsPath,
      codexNotifyPath: env.codexNotifyPath,
      grokHooksPath: env.grokHooksPath,
    },
    renderer: {
      claude: api.build('claude'),
      claudeResume: api.build('claude', 'resume-id-1234'),
      codex: api.build('codex'),
      codexResume: api.build('codex', 'resume-id-1234'),
      grok: api.build('grok'),
      grokResume: api.build('grok', 'resume-id-1234'),
    },
    main,
    unresolved: resolved.unresolved,
  });
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

let failures = 0;
function expect(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  }
}

// Run the command with claude/codex/grok replaced by shims that echo their argv
// NUL-separated — proves the command both parses and delivers exact args.
function shellArgs(cmd) {
  const shim = [
    'claude() { printf "%s\\0" "$@" }',
    'codex() { printf "%s\\0" "$@" }',
    'grok() { printf "%s\\0" "$@" }',
    '',
  ].join('\n');
  const run = spawnSync('/bin/zsh', ['-c', shim + cmd], { encoding: 'utf8' });
  if (run.status !== 0) return { error: (run.stderr || '').trim() || `exit ${run.status}` };
  // zsh `printf '%s\0' "$@"` with no args still emits a trailing NUL (empty
  // field). Drop empty trailing segments so bare `grok` yields [] not [''].
  const parts = run.stdout.split('\0');
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  return { args: parts };
}

function checkCommand(label, cmd, expectedArgs) {
  expect(typeof cmd === 'string' && cmd.length > 0, `${label}: no command was built`);
  if (typeof cmd !== 'string') return;
  const parse = spawnSync('/bin/zsh', ['-n', '-c', cmd], { encoding: 'utf8' });
  expect(parse.status === 0, `${label}: zsh cannot parse: ${cmd} — ${(parse.stderr || '').trim()}`);
  const { args, error } = shellArgs(cmd);
  expect(!error, `${label}: command failed under zsh: ${error}`);
  if (!args) return;
  expect(
    JSON.stringify(args) === JSON.stringify(expectedArgs),
    `${label}: argv mismatch\n  got:      ${JSON.stringify(args)}\n  expected: ${JSON.stringify(expectedArgs)}`,
  );
}

// The codex notify path rides inside a TOML string: round-trip the TOML
// escaping to recover the raw path.
function notifyTomlArg(rawPath) {
  return `notify=["${rawPath.replace(/[\\"]/g, '\\$&')}"]`;
}

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const e2eOut = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  let report = null;
  try { report = JSON.parse(e2eOut); } catch { /* handled below */ }
  if (code !== 0 || signal || !report || report.ok !== true) {
    console.error('AGENT_COMMAND_QUOTING_FAIL');
    console.error('exit:', code, 'signal:', signal || '');
    console.error('e2e:', e2eOut || 'missing');
    console.error('stdout:', stdout.trim());
    console.error('stderr:', stderr.trim());
    process.exit(1);
  }

  const hooksPath = path.join(homeDir, '.chromux', 'hooks-claude.json');
  const notifyPath = path.join(homeDir, '.chromux', 'codex-notify.sh');
  const grokHooksPath = path.join(homeDir, '.chromux', 'hooks-grok.json');
  const grokInstallPath = path.join(homeDir, '.grok', 'hooks', 'chromux-turn-signals.json');
  const grokScriptPath = path.join(homeDir, '.chromux', 'grok-hook.sh');
  const tomlArg = notifyTomlArg(notifyPath);
  const tomlInner = (tomlArg.match(/^notify=\["(.*)"\]$/s) || [])[1];
  expect(
    typeof tomlInner === 'string' && tomlInner.replace(/\\(["\\])/g, '$1') === notifyPath,
    `TOML escaping does not round-trip to the raw notify path: ${tomlArg}`,
  );

  expect(report.env.hooksSettingsPath === hooksPath, `get-env hooksSettingsPath: ${report.env.hooksSettingsPath}`);
  expect(report.env.codexNotifyPath === notifyPath, `get-env codexNotifyPath: ${report.env.codexNotifyPath}`);
  expect(report.env.grokHooksPath === grokHooksPath, `get-env grokHooksPath: ${report.env.grokHooksPath}`);
  expect(fs.existsSync(grokInstallPath), `expected Grok hook install at ${grokInstallPath}`);
  expect(fs.existsSync(grokScriptPath), `expected Grok hook script at ${grokScriptPath}`);
  expect(Array.isArray(report.unresolved) && report.unresolved.length === 0,
    `resolve-restore-sessions left sessions unresolved: ${JSON.stringify(report.unresolved)}`);

  checkCommand('renderer claude', report.renderer.claude, ['--settings', hooksPath]);
  checkCommand('renderer claude --resume', report.renderer.claudeResume, ['--settings', hooksPath, '--resume', 'resume-id-1234']);
  checkCommand('renderer codex', report.renderer.codex, ['-c', tomlArg]);
  checkCommand('renderer codex resume', report.renderer.codexResume, ['-c', tomlArg, 'resume', 'resume-id-1234']);
  checkCommand('renderer grok', report.renderer.grok, []);
  checkCommand('renderer grok --resume', report.renderer.grokResume, ['--resume', 'resume-id-1234']);
  checkCommand('main claude resume', report.main.claude, ['--settings', hooksPath, '--resume', claudeResumeId]);
  checkCommand('main codex resume', report.main.codex, ['-c', tomlArg, 'resume', codexResumeId]);
  checkCommand('main grok resume', report.main.grok, ['--resume', grokResumeId]);

  if (failures > 0) {
    console.error('AGENT_COMMAND_QUOTING_FAIL');
    process.exit(1);
  }
  console.log('AGENT_COMMAND_QUOTING_OK');
});
