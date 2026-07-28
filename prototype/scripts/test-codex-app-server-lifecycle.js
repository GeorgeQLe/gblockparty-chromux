'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const {
  JsonRpcObserver,
  qualifiedCodexVersion,
  sanitizeLifecycleNotification,
} = require('../codex-app-server-lifecycle');

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.kill = () => { child.exitCode = 0; child.emit('close', 0, null); };
  return child;
}

async function main() {
  assert.strictEqual(qualifiedCodexVersion('codex-cli 0.145.0'), true);
  assert.strictEqual(qualifiedCodexVersion('codex-cli 0.146.0'), false);
  assert.strictEqual(qualifiedCodexVersion('garbage'), false);

  const clean = sanitizeLifecycleNotification({
    method: 'turn/started',
    params: { threadId: 'thread-a', turn: { id: 'turn-a', status: 'inProgress', items: [{ text: 'secret' }] } },
  }, { threadId: 'thread-a' });
  assert.deepStrictEqual(Object.keys(clean).sort(), ['at', 'method', 'status', 'threadId', 'turnId']);
  assert.strictEqual(clean.turnId, 'turn-a');
  assert.strictEqual(sanitizeLifecycleNotification({
    method: 'turn/started', params: { threadId: 'wrong', turn: { id: 'turn-a' } },
  }, { threadId: 'thread-a' }), null);
  assert.strictEqual(sanitizeLifecycleNotification({ method: 'turn/started', params: {} }), null);
  assert.strictEqual(sanitizeLifecycleNotification({ method: 'item/started', params: {} }), null);

  const child = fakeChild();
  const lifecycle = [];
  const observer = new JsonRpcObserver(child, { onLifecycle: (event) => lifecycle.push(event) });
  let request = '';
  child.stdin.on('data', (chunk) => { request += chunk.toString(); });
  const response = observer.send('initialize', { clientInfo: { name: 'test', version: '1' } }, 1000);
  await new Promise((resolve) => setImmediate(resolve));
  const id = JSON.parse(request.trim()).id;
  child.stdout.write(`${JSON.stringify({ id, result: { userAgent: 'fake' } })}\n`);
  assert.deepStrictEqual(await response, { userAgent: 'fake' });

  child.stdout.write(`${JSON.stringify({
    method: 'turn/started', params: { threadId: 'thread-a', turn: { id: 'turn-a', status: 'inProgress', items: ['secret'] } },
  })}\n`);
  child.stdout.write(`${JSON.stringify({
    method: 'turn/started', params: { threadId: 'thread-a', turn: { id: 'turn-a', status: 'inProgress' } },
  })}\n`);
  child.stdout.write(`${JSON.stringify({
    method: 'turn/completed', params: { threadId: 'thread-a', turn: { id: 'turn-a', status: 'completed', items: ['secret'] } },
  })}\n`);
  assert.strictEqual(lifecycle.length, 3);
  assert.ok(lifecycle.every((event) => !Object.hasOwn(event, 'items')));

  const stale = sanitizeLifecycleNotification({
    method: 'turn/completed', params: { threadId: 'thread-a', turn: { id: 'turn-old', status: 'completed' } },
  }, { threadId: 'thread-a', turnId: 'turn-current' });
  assert.strictEqual(stale, null);

  const malformedChild = fakeChild();
  const malformed = new JsonRpcObserver(malformedChild);
  malformedChild.stdout.write('not-json\n');
  assert.match(malformed.failure.message, /malformed JSON/);

  const oversizedChild = fakeChild();
  const oversized = new JsonRpcObserver(oversizedChild, { maxLineBytes: 16 });
  oversizedChild.stdout.write('x'.repeat(17));
  assert.match(oversized.failure.message, /exceeded its bound/);

  const disconnectChild = fakeChild();
  const disconnect = new JsonRpcObserver(disconnectChild);
  const pending = disconnect.send('thread/read', {}, 1000);
  disconnectChild.emit('close', 1, null);
  await assert.rejects(pending, /disconnected/);

  const timeoutChild = fakeChild();
  const timeout = new JsonRpcObserver(timeoutChild);
  await assert.rejects(timeout.send('thread/read', {}, 10), /timed out/);
  timeoutChild.kill();

  child.kill();
  assert.strictEqual(observer.pending.size, 0);
  console.log('CODEX_APP_SERVER_LIFECYCLE_OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
