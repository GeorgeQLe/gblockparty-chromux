'use strict';

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { captureControlSocketPath } = require('./paths');

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 96 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;

function normalizeCaller(input = {}) {
  const clientId = String(input.clientId || '').trim();
  const displayName = String(input.displayName || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const pid = Number(input.pid);
  if (!/^[a-z0-9][a-z0-9:._-]{2,180}$/i.test(clientId)) throw new Error('invalid capture client id');
  if (!displayName || displayName.length > 200) throw new Error('invalid capture client display name');
  return {
    clientId,
    displayName,
    pid: Number.isSafeInteger(pid) && pid > 0 ? pid : null,
    sessionId: typeof input.sessionId === 'string' ? input.sessionId.slice(0, 200) : null,
  };
}

function listen(server, socketPath) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(socketPath);
  });
}

function probeSocket(socketPath, timeoutMs = 250) {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    const done = (live) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(live);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(timeoutMs, () => done(false));
  });
}

class CaptureControlServer {
  constructor(options = {}) {
    const chromuxHome = options.chromuxHome || process.env.CHROMUX_HOME_DIR || path.join(os.homedir(), '.chromux');
    this.socketPath = captureControlSocketPath(
      chromuxHome,
      options.socketPath || process.env.CHROMUX_CAPTURE_SOCKET,
      options.platform || process.platform,
    );
    this.platform = options.platform || process.platform;
    this.dispatch = options.dispatch;
    this.onDisconnect = options.onDisconnect || (() => {});
    this.server = null;
    this.sockets = new Set();
  }

  async start() {
    if (typeof this.dispatch !== 'function') throw new Error('capture control dispatch is required');
    if (this.server) return this.socketPath;
    if (this.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      if (await probeSocket(this.socketPath)) throw new Error('capture control socket is already active');
      try { fs.unlinkSync(this.socketPath); } catch (error) {
        throw new Error(`could not remove stale capture socket: ${error.message}`);
      }
    }
    if (this.platform !== 'win32') {
      fs.mkdirSync(path.dirname(this.socketPath), { recursive: true, mode: 0o700 });
    }
    this.server = net.createServer((socket) => this.accept(socket));
    await listen(this.server, this.socketPath);
    if (this.platform !== 'win32') fs.chmodSync(this.socketPath, 0o600);
    return this.socketPath;
  }

  accept(socket) {
    this.sockets.add(socket);
    let buffer = '';
    let caller = null;
    let closed = false;
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > MAX_REQUEST_BYTES) {
        socket.destroy(new Error('capture request exceeds 1 MiB'));
        return;
      }
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch {
          socket.write(`${JSON.stringify({ error: { message: 'invalid JSON' } })}\n`);
          continue;
        }
        if (message.method === 'client.register') {
          if (caller) {
            socket.write(`${JSON.stringify({
              id: message.id,
              error: { message: 'capture client identity is already registered' },
            })}\n`);
            continue;
          }
          try {
            caller = normalizeCaller(message.params);
            socket.write(`${JSON.stringify({ id: message.id, result: caller })}\n`);
          } catch (error) {
            socket.write(`${JSON.stringify({ id: message.id, error: { message: error.message } })}\n`);
          }
          continue;
        }
        if (!caller) {
          socket.write(`${JSON.stringify({ id: message.id, error: { message: 'capture client is not registered' } })}\n`);
          continue;
        }
        Promise.resolve(this.dispatch(message.method, message.params || {}, caller)).then((result) => {
          if (!socket.destroyed) socket.write(`${JSON.stringify({ id: message.id, result })}\n`);
        }).catch((error) => {
          if (!socket.destroyed) {
            socket.write(`${JSON.stringify({ id: message.id, error: { message: error.message, code: error.code || null } })}\n`);
          }
        });
      }
    });
    const disconnect = () => {
      if (closed) return;
      closed = true;
      this.sockets.delete(socket);
      if (caller) Promise.resolve(this.onDisconnect(caller)).catch(() => {});
    };
    socket.on('close', disconnect);
    socket.on('error', () => {});
  }

  async close() {
    const server = this.server;
    this.server = null;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
    if (this.platform !== 'win32') {
      try { fs.unlinkSync(this.socketPath); } catch { /* already removed */ }
    }
  }
}

class CaptureControlClient {
  constructor(options = {}) {
    const chromuxHome = options.chromuxHome || process.env.CHROMUX_HOME_DIR || path.join(os.homedir(), '.chromux');
    this.socketPath = captureControlSocketPath(
      chromuxHome,
      options.socketPath || process.env.CHROMUX_CAPTURE_SOCKET,
      options.platform || process.platform,
    );
    this.caller = normalizeCaller(options.caller);
    this.timeoutMs = options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
    this.socket = null;
    this.buffer = '';
    this.pending = new Map();
    this.nextId = 1;
    this.connecting = null;
  }

  async connect() {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      const fail = (error) => {
        socket.destroy();
        const unavailable = new Error('Chromux is not running. Open Chromux and try the capture again.');
        unavailable.code = error.code || 'CHROMUX_NOT_RUNNING';
        reject(unavailable);
      };
      socket.once('error', fail);
      socket.once('connect', () => {
        socket.off('error', fail);
        socket.setEncoding('utf8');
        socket.on('data', (chunk) => this.onData(chunk));
        socket.on('error', (error) => this.failPending(error));
        socket.on('close', () => {
          this.socket = null;
          this.failPending(new Error('Chromux capture connection closed'));
        });
        this.socket = socket;
        this.send('client.register', this.caller, this.timeoutMs).then(() => resolve(), reject);
      });
    }).finally(() => { this.connecting = null; });
    return this.connecting;
  }

  onData(chunk) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > MAX_RESPONSE_BYTES) {
      this.socket?.destroy(new Error('capture response exceeds the MCP bridge limit'));
      return;
    }
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let response;
      try { response = JSON.parse(line); } catch {
        this.failPending(new Error('invalid capture response'));
        continue;
      }
      const pending = this.pending.get(response.id);
      if (!pending) continue;
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      if (response.error) {
        const error = new Error(response.error.message);
        error.code = response.error.code || null;
        pending.reject(error);
      } else {
        pending.resolve(response.result);
      }
    }
  }

  failPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  send(method, params, timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`capture request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  async request(method, params = {}, options = {}) {
    await this.connect();
    return this.send(method, params, options.timeoutMs || this.timeoutMs);
  }

  close() {
    this.socket?.end();
    this.socket = null;
    this.failPending(new Error('capture client closed'));
  }
}

module.exports = {
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_REQUEST_BYTES,
  CaptureControlClient,
  CaptureControlServer,
  normalizeCaller,
  probeSocket,
};
