'use strict';

const assert = require('assert');
const http = require('http');
const { EventEmitter } = require('events');
const { createVercelOAuthLoopback, REDIRECT_URI } = require('../vercel-oauth-loopback');

class Sender extends EventEmitter {
  constructor() {
    super();
    this.messages = [];
    this.destroyed = false;
  }
  send(channel, value) { this.messages.push({ channel, value }); }
  isDestroyed() { return this.destroyed; }
  destroy() {
    this.destroyed = true;
    this.emit('destroyed');
  }
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: 47891, path: pathname }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

(async () => {
  let opened = null;
  let completed = null;
  const sender = new Sender();
  const owner = createVercelOAuthLoopback({
    configured: true,
    begin: ({ redirectUri }) => {
      assert.strictEqual(redirectUri, REDIRECT_URI);
      return {
        ok: true,
        state: 'bounded-state',
        authorizationUrl: 'https://vercel.com/oauth/authorize?fixture=1',
      };
    },
    complete: async (payload) => {
      completed = payload;
      return { ok: true, profile: { id: 'oauth-fixture', kind: 'oauth' } };
    },
    openExternal: async (url) => {
      // The listener must already own the exact port before a browser opens.
      const probe = await request('/wrong');
      assert.strictEqual(probe.status, 404);
      opened = url;
    },
  });
  const started = await owner.start(sender, { id: 'oauth-fixture', label: 'Fixture' });
  assert.strictEqual(started.ok, true, JSON.stringify(started));
  assert.strictEqual(owner.active(), true);
  assert.strictEqual(opened, 'https://vercel.com/oauth/authorize?fixture=1');
  const wrongState = await request('/vercel/oauth/callback?state=wrong&code=code');
  assert.strictEqual(wrongState.status, 400);
  assert.strictEqual(completed, null);
  assert.strictEqual(owner.active(), true);
  const correct = await request('/vercel/oauth/callback?state=bounded-state&code=short-code');
  assert.strictEqual(correct.status, 200);
  assert.deepStrictEqual(completed, { state: 'bounded-state', code: 'short-code' });
  assert.strictEqual(owner.active(), false);
  assert.strictEqual(sender.messages.length, 1);
  assert.strictEqual(sender.messages[0].value.ok, true);

  const owner2 = createVercelOAuthLoopback({
    configured: true,
    begin: () => ({ ok: true, state: 'second', authorizationUrl: 'https://vercel.com/' }),
    complete: async () => ({ ok: true }),
    openExternal: async () => {},
  });
  const secondSender = new Sender();
  assert.strictEqual((await owner2.start(secondSender, {})).ok, true);
  secondSender.destroy();
  assert.strictEqual(owner2.active(), false);

  const unconfigured = createVercelOAuthLoopback({
    configured: false,
    begin: () => { throw new Error('must not start'); },
    complete: async () => ({}),
    openExternal: async () => {},
  });
  const unavailable = await unconfigured.start(new Sender(), {});
  assert.strictEqual(unavailable.error.code, 'OAUTH_NOT_CONFIGURED');
  console.log('VERCEL_OAUTH_LOOPBACK_OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
