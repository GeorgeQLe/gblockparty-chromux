#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write('codex-cli 0.145.0-fake\n');
  process.exit(0);
}
if (args[0] === 'exec') {
  process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: 'fake-thread' })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'turn.started' })}\n`);
  if (process.env.FAKE_CODEX_MALFORMED === '1') process.stdout.write('{broken json\n');
  setTimeout(() => {
    process.stdout.write(`${JSON.stringify({ type: 'turn.completed', usage: {} })}\n`);
    process.exit(0);
  }, Number(process.env.FAKE_CODEX_DELAY_MS) || 40);
} else {
  process.stdout.write('\u001b]0;Codex\u0007› Write tests for @filename\r\ngpt-test · Context 100% left\r\n');
  let submitted = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data) => {
    if (submitted || !/[\r\n]/.test(data)) return;
    submitted = true;
    process.stdout.write('\u001b]0;⠋ Working\u0007');
    process.stdout.write('Thinking about the isolated fixture.\r\n');
    setTimeout(() => {
      const config = args.find((arg) => String(arg).startsWith('notify=[')) || '';
      const match = /^notify=\["((?:\\.|[^"])*)"\]$/.exec(config || '');
      const notifyPath = match ? match[1].replace(/\\(["\\])/g, '$1') : '';
      if (notifyPath) {
        spawnSync(notifyPath, [JSON.stringify({
          type: 'agent-turn-complete',
          turn_id: 'fake-turn',
          last_assistant_message: 'fixture complete',
        }, null, 2)], { stdio: 'inherit' });
        setInterval(() => {}, 1000);
      } else {
        process.stdout.write('\u001b]0;Codex\u0007');
        process.exit(0);
      }
    }, Number(process.env.FAKE_CODEX_DELAY_MS) || 40);
  });
  process.stdin.resume();
}
