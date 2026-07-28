'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const MAX_LINE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const QUALIFIED_VERSION = /^codex-cli 0\.145\.\d+$/;

function qualifiedCodexVersion(value) {
  return QUALIFIED_VERSION.test(String(value || '').trim());
}

function sanitizeLifecycleNotification(message, expected = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  if (!['turn/started', 'turn/completed'].includes(message.method)) return null;
  const threadId = message.params?.threadId;
  const turn = message.params?.turn;
  const turnId = turn?.id;
  if (typeof threadId !== 'string' || typeof turnId !== 'string') return null;
  if (expected.threadId && threadId !== expected.threadId) return null;
  if (expected.turnId && turnId !== expected.turnId) return null;
  const status = typeof turn.status === 'string' ? turn.status.slice(0, 40) : null;
  return { method: message.method, threadId, turnId, status, at: Date.now() };
}

class JsonRpcObserver {
  constructor(child, { onLifecycle = () => {}, maxLineBytes = MAX_LINE_BYTES,
    maxTotalBytes = MAX_TOTAL_BYTES } = {}) {
    this.child = child;
    this.onLifecycle = onLifecycle;
    this.maxLineBytes = maxLineBytes;
    this.maxTotalBytes = maxTotalBytes;
    this.buffer = '';
    this.totalBytes = 0;
    this.nextId = 1;
    this.pending = new Map();
    this.failure = null;
    child.stdout.on('data', (chunk) => this.onData(chunk));
    child.on('error', (error) => this.fail(error));
    child.on('close', (code, signal) => {
      if (!this.failure && this.pending.size) {
        this.fail(new Error(`Codex app-server proxy disconnected (${signal || code})`));
      }
    });
  }

  onData(chunk) {
    if (this.failure) return;
    this.totalBytes += chunk.length;
    if (this.totalBytes > this.maxTotalBytes) return this.fail(new Error('Codex app-server output exceeded its bound'));
    this.buffer += chunk.toString('utf8');
    if (Buffer.byteLength(this.buffer) > this.maxLineBytes && !this.buffer.includes('\n')) {
      return this.fail(new Error('Codex app-server message exceeded its bound'));
    }
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > this.maxLineBytes) {
        this.fail(new Error('Codex app-server message exceeded its bound'));
        return;
      }
      let message;
      try { message = JSON.parse(line); } catch {
        this.fail(new Error('Codex app-server returned malformed JSON'));
        return;
      }
      if (Object.hasOwn(message, 'id')) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error('Codex app-server request failed'));
        else pending.resolve(message.result);
        continue;
      }
      const lifecycle = sanitizeLifecycleNotification(message);
      if (lifecycle) this.onLifecycle(lifecycle);
    }
  }

  fail(error) {
    if (this.failure) return;
    this.failure = error instanceof Error ? error : new Error(String(error));
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.failure);
    }
    this.pending.clear();
  }

  send(method, params, timeoutMs = 5000) {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  notify(method, params = {}) {
    if (this.failure || !this.child.stdin.writable) return false;
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
    return true;
  }
}

function websocketFrame(payload, opcode = 0x1) {
  const body = Buffer.from(payload || '');
  const mask = crypto.randomBytes(4);
  let header;
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | body.length]);
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  const masked = Buffer.alloc(body.length);
  for (let index = 0; index < body.length; index += 1) masked[index] = body[index] ^ mask[index % 4];
  return Buffer.concat([header, mask, masked]);
}

function websocketProxyAdapter(proxy, socketPath) {
  const adapter = new EventEmitter();
  adapter.stdout = new PassThrough();
  adapter.stderr = proxy.stderr;
  adapter.exitCode = null;
  adapter.stdin = {
    writable: true,
    write(value, callback) {
      if (!adapter.ready) {
        const error = new Error('Codex app-server websocket is not ready');
        if (callback) callback(error);
        return false;
      }
      const ok = proxy.stdin.write(websocketFrame(String(value).replace(/\r?\n$/, '')));
      if (callback) callback(null);
      return ok;
    },
  };
  adapter.kill = (signal) => proxy.kill(signal);
  let buffer = Buffer.alloc(0);
  let upgraded = false;
  const fail = (error) => adapter.emit('error', error);
  proxy.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!upgraded) {
      const boundary = buffer.indexOf('\r\n\r\n');
      if (boundary < 0) return;
      const header = buffer.subarray(0, boundary).toString('utf8');
      buffer = buffer.subarray(boundary + 4);
      if (!/^HTTP\/1\.[01] 101\b/m.test(header)) {
        fail(new Error('Codex app-server websocket upgrade failed'));
        return;
      }
      upgraded = true;
      adapter.ready = true;
      adapter.emit('ready');
    }
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f;
      const masked = Boolean(buffer[1] & 0x80);
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        const large = buffer.readBigUInt64BE(2);
        if (large > BigInt(MAX_LINE_BYTES)) {
          fail(new Error('Codex app-server websocket message exceeded its bound'));
          return;
        }
        length = Number(large);
        offset = 10;
      }
      const maskBytes = masked ? 4 : 0;
      if (buffer.length < offset + maskBytes + length) return;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      offset += maskBytes;
      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      buffer = buffer.subarray(offset + length);
      if (mask) for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
      if (opcode === 0x1) adapter.stdout.write(Buffer.concat([payload, Buffer.from('\n')]));
      else if (opcode === 0x8) proxy.kill('SIGTERM');
      else if (opcode === 0x9) proxy.stdin.write(websocketFrame(payload, 0xA));
    }
  });
  proxy.on('error', fail);
  proxy.on('close', (code, signal) => {
    adapter.exitCode = code;
    adapter.emit('close', code, signal);
  });
  const key = crypto.randomBytes(16).toString('base64');
  proxy.stdin.write([
    'GET / HTTP/1.1',
    'Host: localhost',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n'));
  return adapter;
}

function waitForReady(adapter, timeoutMs) {
  if (adapter.ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Codex app-server websocket timed out')), timeoutMs);
    adapter.once('ready', () => { clearTimeout(timer); resolve(); });
    adapter.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

function waitForSocket(socketPath, child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = () => {
      if (fs.existsSync(socketPath)) return resolve();
      if (child.exitCode !== null) return reject(new Error('Codex app-server exited before creating its socket'));
      if (Date.now() - startedAt >= timeoutMs) return reject(new Error('Codex app-server socket timed out'));
      setTimeout(poll, 20);
    };
    poll();
  });
}

function readCodexVersion(codexBin, timeoutMs = 3000) {
  return new Promise((resolve) => {
    execFile(codexBin, ['--version'], { timeout: timeoutMs, encoding: 'utf8' },
      (error, stdout) => resolve(error ? null : String(stdout || '').trim()));
  });
}

async function startLifecycleSidecar({
  codexBin = 'codex', cwd, onLifecycle = () => {}, timeoutMs = 5000,
  spawnProcess = spawn, version,
} = {}) {
  const cliVersion = version || await readCodexVersion(codexBin, timeoutMs);
  if (!qualifiedCodexVersion(cliVersion)) {
    return { ok: false, reason: 'unsupported-version', cliVersion };
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-codex-lifecycle-'));
  const socketPath = path.join(root, `app-${crypto.randomBytes(6).toString('hex')}.sock`);
  const server = spawnProcess(codexBin, ['app-server', '--listen', `unix://${socketPath}`], {
    cwd, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, NO_COLOR: '1' },
  });
  let observer;
  const cleanup = async () => {
    if (observer && observer.exitCode === null) observer.kill('SIGTERM');
    if (server.exitCode === null) server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 25));
    fs.rmSync(root, { recursive: true, force: true });
  };
  try {
    await waitForSocket(socketPath, server, timeoutMs);
    const proxy = spawnProcess(codexBin, ['app-server', 'proxy', '--sock', socketPath], {
      cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' },
    });
    observer = websocketProxyAdapter(proxy, socketPath);
    await waitForReady(observer, timeoutMs);
    const rpc = new JsonRpcObserver(observer, { onLifecycle });
    await rpc.send('initialize', {
      clientInfo: { name: 'chromux-lifecycle', title: 'Chromux lifecycle observer', version: '1' },
      capabilities: { experimentalApi: true },
    }, timeoutMs);
    rpc.notify('initialized');
    const started = await rpc.send('thread/start', {
      cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
    }, timeoutMs);
    const threadId = started?.thread?.id;
    if (typeof threadId !== 'string') throw new Error('Codex thread/start returned no thread id');
    return {
      ok: true, cliVersion, threadId, socketPath, rpc,
      remote: `unix://${socketPath}`, cleanup,
      readThread: () => rpc.send('thread/read', { threadId, includeTurns: true }, timeoutMs),
    };
  } catch (error) {
    await cleanup();
    return { ok: false, reason: 'handshake-failed', cliVersion, error: error.message };
  }
}

module.exports = {
  JsonRpcObserver,
  MAX_LINE_BYTES,
  MAX_TOTAL_BYTES,
  qualifiedCodexVersion,
  sanitizeLifecycleNotification,
  startLifecycleSidecar,
  websocketFrame,
  websocketProxyAdapter,
};
