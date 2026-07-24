'use strict';

const fs = require('fs');

const scenarioPath = process.argv[2];
const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));

function append(file, value) {
  if (!file) return;
  fs.appendFileSync(file, `${value}\n`);
}

function mark(value) {
  append(scenario.cleanupPath, value);
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

if (scenario.pidPath) fs.writeFileSync(scenario.pidPath, String(process.pid));

process.on('SIGTERM', () => {
  mark('sigterm');
  process.exit(0);
});

process.stdin.setEncoding('utf8');
let buffered = '';

function handle(message) {
  append(scenario.logPath, JSON.stringify(message));
  if (scenario.behavior === 'timeout') return;
  if (scenario.behavior === 'malformed-json') {
    process.stdout.write('{broken json\n');
    return;
  }
  if (scenario.behavior === 'oversized-output') {
    process.stdout.write('x'.repeat(scenario.outputBytes || 4096));
    return;
  }
  if (!message || !Number.isSafeInteger(message.id) || typeof message.method !== 'string') return;

  if (message.method === 'initialize') {
    send({
      id: scenario.behavior === 'wrong-response-id' ? message.id + 100 : message.id,
      result: {
        codexHome: '/tmp/fake-codex-home',
        platformFamily: 'unix',
        platformOs: 'macos',
        userAgent: 'fake-codex-app-server/1.0',
      },
    });
    return;
  }

  if (message.method === 'thread/list') {
    if (scenario.behavior === 'malformed-thread-list') {
      send({ id: message.id, result: { data: 'not-an-array' } });
      return;
    }
    const cwd = message.params && message.params.cwd;
    const data = scenario.threadLists && Array.isArray(scenario.threadLists[cwd])
      ? scenario.threadLists[cwd]
      : [];
    send({ id: message.id, result: { data, nextCursor: null } });
    return;
  }

  if (message.method === 'thread/items/list') {
    const threadId = message.params && message.params.threadId;
    if (scenario.behavior === 'items-unsupported') {
      send({ id: message.id, error: { code: -32601, message: 'thread/items/list is not supported yet' } });
      return;
    }
    if (Array.isArray(scenario.malformedItemsThreadIds)
      && scenario.malformedItemsThreadIds.includes(threadId)) {
      send({ id: message.id, result: { data: [{ turnId: 'bad', item: null }] } });
      return;
    }
    const data = scenario.items && Array.isArray(scenario.items[threadId])
      ? scenario.items[threadId]
      : [];
    send({ id: message.id, result: { data, nextCursor: null } });
    return;
  }

  send({ id: message.id, error: { code: -32601, message: 'Method not found' } });
}

process.stdin.on('data', (chunk) => {
  buffered += chunk;
  while (true) {
    const newline = buffered.indexOf('\n');
    if (newline === -1) break;
    const line = buffered.slice(0, newline);
    buffered = buffered.slice(newline + 1);
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    handle(message);
  }
});

process.stdin.on('end', () => {
  mark('stdin-end');
  process.exit(0);
});

if (scenario.behavior === 'early-exit') {
  setImmediate(() => {
    mark('early-exit');
    process.exit(17);
  });
}
