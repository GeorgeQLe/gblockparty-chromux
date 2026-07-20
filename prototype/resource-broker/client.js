'use strict';

const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { brokerSocketPath } = require('./paths');

class BrokerClient {
  constructor(options = {}) {
    const chromuxHome = process.env.CHROMUX_HOME_DIR || path.join(os.homedir(), '.chromux');
    this.socketPath = brokerSocketPath(chromuxHome, options.socketPath || process.env.CHROMUX_BROKER_SOCKET);
    this.client = options.client || {};
    this.socket = null;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.startedDaemon = false;
  }

  async connect() {
    if (this.socket && !this.socket.destroyed) return;
    try { await this.open(); } catch (error) {
      if (this.startedDaemon) throw error;
      this.startedDaemon = true;
      const child = spawn(process.execPath, [path.join(__dirname, 'daemon.js')], {
        detached: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CHROMUX_BROKER_SOCKET: this.socketPath },
      });
      child.unref();
      let lastError = error;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        try { await this.open(); lastError = null; break; } catch (nextError) { lastError = nextError; }
      }
      if (lastError) throw lastError;
    }
    const registered = await this.request('client.register', this.client);
    this.client.clientId = registered.id;
  }

  open() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      const fail = (error) => { socket.destroy(); reject(error); };
      socket.once('error', fail);
      socket.once('connect', () => {
        socket.off('error', fail);
        socket.on('error', (error) => this.failPending(error));
        socket.on('close', () => { this.socket = null; this.failPending(new Error('broker disconnected')); });
        socket.on('data', (chunk) => this.onData(chunk));
        socket.setEncoding('utf8');
        this.socket = socket;
        resolve();
      });
    });
  }

  onData(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      const response = JSON.parse(line);
      const pending = this.pending.get(response.id);
      if (!pending) continue;
      this.pending.delete(response.id);
      if (response.error) pending.reject(Object.assign(new Error(response.error.message), response.error));
      else pending.resolve(response.result);
    }
  }

  failPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  async request(method, params = {}) {
    if (method !== 'client.register') await this.connect();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(`${JSON.stringify({ id, method, params: { ...params, clientId: params.clientId || this.client.clientId } })}\n`);
    });
  }

  close() {
    if (this.socket) this.socket.end();
  }
}

module.exports = { BrokerClient };
