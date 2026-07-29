'use strict';

const http = require('http');

const REDIRECT_URI = 'http://127.0.0.1:47891/vercel/oauth/callback';

function createVercelOAuthLoopback({
  configured,
  begin,
  complete,
  openExternal,
  createServer = http.createServer,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  timeoutMs = 10 * 60 * 1000,
}) {
  let owner = null;

  function cancel(message = null) {
    const current = owner;
    owner = null;
    if (!current) return;
    clearTimer(current.timer);
    try { current.server.close(); } catch { /* already closed */ }
    if (message && !current.sender.isDestroyed()) {
      current.sender.send('vercel-oauth-update', {
        ok: false,
        error: { code: 'OAUTH_CANCELED', message },
      });
    }
  }

  async function start(sender, request = {}) {
    if (!configured) {
      return { ok: false, error: { code: 'OAUTH_NOT_CONFIGURED', message: 'This build has no Vercel public OAuth client ID.' } };
    }
    cancel();
    const started = begin({ id: request.id, label: request.label, redirectUri: REDIRECT_URI });
    if (!started.ok) return started;
    const server = createServer(async (req, res) => {
      if (!owner || owner.server !== server) {
        res.writeHead(410).end('Sign-in request expired.');
        return;
      }
      if (req.method !== 'GET' || !req.url || req.url.length > 8192) {
        res.writeHead(400).end('Invalid callback.');
        return;
      }
      if (req.headers.host !== '127.0.0.1:47891') {
        res.writeHead(400).end('Invalid callback host.');
        return;
      }
      let callback;
      try { callback = new URL(req.url, REDIRECT_URI); } catch {
        res.writeHead(400).end('Invalid callback.');
        return;
      }
      if (callback.hostname !== '127.0.0.1' || callback.pathname !== '/vercel/oauth/callback') {
        res.writeHead(404).end('Not found.');
        return;
      }
      const state = callback.searchParams.get('state') || '';
      const code = callback.searchParams.get('code') || '';
      if (state !== started.state || callback.searchParams.has('error') || !code || code.length > 4096) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          .end('Vercel sign-in could not be verified. You can close this window.');
        return;
      }
      const result = await complete({ state, code });
      res.writeHead(result.ok ? 200 : 400, { 'content-type': 'text/plain; charset=utf-8' })
        .end(result.ok ? 'Vercel sign-in complete. You can close this window.' : 'Vercel sign-in failed. You can close this window.');
      const target = owner?.sender;
      cancel();
      if (target && !target.isDestroyed()) target.send('vercel-oauth-update', result);
    });
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(47891, '127.0.0.1', resolve);
      });
    } catch (error) {
      try { server.close(); } catch { /* nothing */ }
      return { ok: false, error: { code: 'OAUTH_LISTENER_FAILED', message: `Could not own the Vercel callback: ${error.message}` } };
    }
    const timer = setTimer(() => cancel('Vercel sign-in timed out.'), timeoutMs);
    owner = { server, timer, sender };
    sender.once('destroyed', () => {
      if (owner?.sender === sender) cancel();
    });
    try { await openExternal(started.authorizationUrl); } catch (error) {
      cancel();
      return { ok: false, error: { code: 'OAUTH_BROWSER_FAILED', message: `Could not open Vercel sign-in: ${error.message}` } };
    }
    return { ok: true, kind: 'oauth-listening' };
  }

  return {
    start,
    cancel,
    active: () => Boolean(owner),
  };
}

module.exports = { REDIRECT_URI, createVercelOAuthLoopback };
