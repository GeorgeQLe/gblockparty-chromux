'use strict';

const net = require('net');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DEFAULT_TIMEOUT_MS = 700;

function previewProbeTarget(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 4096) return null;
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!LOOPBACK_HOSTS.has(hostname)) return null;
  const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const hosts = hostname === 'localhost' ? ['127.0.0.1', '::1'] : [hostname];
  return { port, hosts };
}

function connectOnce(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function previewProbe(rawUrl, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const target = previewProbeTarget(rawUrl);
  if (!target) return { status: 'unsupported' };
  const boundedTimeout = Number.isFinite(timeoutMs)
    ? Math.max(25, Math.min(5000, Math.trunc(timeoutMs)))
    : DEFAULT_TIMEOUT_MS;
  const results = await Promise.all(target.hosts.map((host) => connectOnce(host, target.port, boundedTimeout)));
  return { status: results.some(Boolean) ? 'ready' : 'offline' };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  previewProbe,
  previewProbeTarget,
};
