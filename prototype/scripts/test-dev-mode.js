'use strict';

const assert = require('assert');
const { createDevModeRestart, resolveDevMode, restartArgs } = require('../dev-mode');

assert.strictEqual(resolveDevMode({ isPackaged: false }), true);
assert.strictEqual(resolveDevMode({ isPackaged: true }), false);
assert.strictEqual(resolveDevMode({ isPackaged: true, persisted: true }), true);
assert.strictEqual(resolveDevMode({ isPackaged: false, persisted: false }), false);
assert.strictEqual(resolveDevMode({ argv: ['--dev-mode'], isPackaged: true, persisted: false }), true);
assert.strictEqual(resolveDevMode({ argv: ['--dev-mode', '--no-dev-mode'], persisted: true }), false);
assert.deepStrictEqual(restartArgs(['.', '--smoke', '--dev-mode'], false), ['.', '--smoke', '--no-dev-mode']);

const calls = [];
const restart = createDevModeRestart({
  persist: (enabled) => calls.push(['persist', enabled]),
  snapshot: (payload) => { calls.push(['snapshot', payload]); return { restoreId: 'restore-test' }; },
  relaunch: (enabled) => calls.push(['relaunch', enabled]),
  quit: () => calls.push(['quit']),
});
assert.throws(() => restart({ enabled: 'yes', sessions: [] }), /boolean/);
assert.throws(() => restart({ enabled: true, sessions: null }), /array/);
assert.deepStrictEqual(restart({ enabled: false, sessions: [{ name: 'one' }] }), {
  ok: true, enabled: false, restoreId: 'restore-test',
});
assert.deepStrictEqual(calls, [
  ['snapshot', { reason: 'dev-mode-restart', sessions: [{ name: 'one' }] }],
  ['persist', false],
  ['relaunch', false],
  ['quit'],
]);
console.log('DEV_MODE_OK');
