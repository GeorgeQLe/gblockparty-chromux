'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const {
  CAFFEINATE_ARGS,
  CAFFEINATE_PATH,
  createPreventSleepController,
} = require('../prevent-sleep');

function fakeChild(pid = 4321) {
  const child = new EventEmitter();
  child.pid = pid;
  child.killCalls = 0;
  child.kill = () => { child.killCalls += 1; return true; };
  return child;
}

const children = [];
const spawns = [];
const statuses = [];
const controller = createPreventSleepController({
  platform: 'darwin',
  parentPid: 9876,
  spawnProcess(command, args, options) {
    const child = fakeChild(4321 + children.length);
    children.push(child);
    spawns.push({ command, args, options });
    return child;
  },
  onStatus: (status) => statuses.push(status),
});

assert.deepStrictEqual(controller.status(), {
  available: true, enabled: false, running: false, pid: null, error: null,
});
assert.throws(() => controller.setEnabled('yes'), /boolean/);
assert.deepStrictEqual(controller.setEnabled(true), {
  available: true, enabled: true, running: true, pid: 4321, error: null,
});
assert.deepStrictEqual(spawns, [{
  command: CAFFEINATE_PATH,
  args: [...CAFFEINATE_ARGS, '-w', '9876'],
  options: { stdio: 'ignore' },
}]);
controller.setEnabled(true);
assert.strictEqual(spawns.length, 1, 'enabling twice must not spawn twice');
controller.setEnabled(false);
assert.strictEqual(children[0].killCalls, 1);
assert.strictEqual(controller.status().running, false);

controller.setEnabled(true);
children[1].emit('error', new Error('spawn failed'));
assert.deepStrictEqual(controller.status(), {
  available: true, enabled: false, running: false, pid: null, error: 'spawn failed',
});

controller.setEnabled(true);
controller.shutdown();
assert.strictEqual(children[2].killCalls, 1);
assert.strictEqual(controller.status().enabled, true, 'shutdown must preserve the persisted preference');

const unsupported = createPreventSleepController({ platform: 'linux' });
assert.deepStrictEqual(unsupported.setEnabled(true), {
  available: false,
  enabled: false,
  running: false,
  pid: null,
  error: 'Prevent Sleep is only available on macOS.',
});

assert.ok(statuses.length >= 5);
console.log('PREVENT_SLEEP_OK');
