'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { resolveCodexExecutable } = require('./codex-update-service');
const { version: CHROMUX_VERSION } = require('./package.json');

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_LINE_BYTES = 512 * 1024;
const DEFAULT_ITEM_PAGE_LIMIT = 50;
const DEFAULT_MAX_ITEM_PAGES = 5;
const DEFAULT_CLEANUP_GRACE_MS = 100;
const LABEL_CODE_POINTS = 80;
const AGENT_MESSAGE_CODE_POINTS = 160;
const RESUME_ID_RE = /^[0-9a-f][0-9a-f-]{15,127}$/i;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedSingleLine(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function truncateCodePoints(value, limit, { ellipsis = false } = {}) {
  const points = Array.from(value);
  if (points.length <= limit) return value;
  if (!ellipsis) return points.slice(0, limit).join('');
  if (limit <= 1) return '…'.slice(0, limit);
  return `${points.slice(0, limit - 1).join('')}…`;
}

function normalizeDetectLabel(value, fallback = 'Codex') {
  const normalized = normalizedSingleLine(value) || normalizedSingleLine(fallback) || 'Codex';
  return truncateCodePoints(normalized, LABEL_CODE_POINTS);
}

function normalizeAgentMessagePreview(value) {
  const normalized = normalizedSingleLine(value);
  return truncateCodePoints(normalized, AGENT_MESSAGE_CODE_POINTS, { ellipsis: true });
}

function boundedDelay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

class AppServerClient {
  constructor(child, {
    maxOutputBytes,
    maxLineBytes,
    cleanupGraceMs,
  }) {
    this.child = child;
    this.maxOutputBytes = maxOutputBytes;
    this.maxLineBytes = maxLineBytes;
    this.cleanupGraceMs = cleanupGraceMs;
    this.nextId = 1;
    this.outputBytes = 0;
    this.buffered = '';
    this.decoder = new StringDecoder('utf8');
    this.pending = new Map();
    this.failure = null;
    this.closing = false;
    this.closed = false;
    this.closePromise = new Promise((resolve) => {
      child.once('close', (code, signal) => {
        this.closed = true;
        if (!this.closing && !this.failure) {
          this.fail(new Error(`Codex app-server exited early (${signal || code})`));
        }
        resolve();
      });
    });

    child.once('error', (error) => this.fail(error));
    if (child.stdout) child.stdout.on('data', (chunk) => this.onStdout(chunk));
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        this.outputBytes += Buffer.byteLength(chunk);
        if (this.outputBytes > this.maxOutputBytes) {
          this.fail(new Error('Codex app-server output exceeded its bound'));
        }
      });
    }
  }

  fail(error) {
    if (this.failure) return;
    this.failure = error instanceof Error ? error : new Error(String(error || 'Codex app-server failed'));
    for (const pending of this.pending.values()) pending.reject(this.failure);
    this.pending.clear();
  }

  onStdout(chunk) {
    if (this.failure) return;
    this.outputBytes += Buffer.byteLength(chunk);
    if (this.outputBytes > this.maxOutputBytes) {
      this.fail(new Error('Codex app-server output exceeded its bound'));
      return;
    }
    this.buffered += this.decoder.write(chunk);
    while (true) {
      const newline = this.buffered.indexOf('\n');
      if (newline === -1) break;
      const line = this.buffered.slice(0, newline);
      this.buffered = this.buffered.slice(newline + 1);
      if (!line.trim()) continue;
      if (Buffer.byteLength(line, 'utf8') > this.maxLineBytes) {
        this.fail(new Error('Codex app-server response line exceeded its bound'));
        return;
      }
      this.onLine(line);
      if (this.failure) return;
    }
    if (Buffer.byteLength(this.buffered, 'utf8') > this.maxLineBytes) {
      this.fail(new Error('Codex app-server response line exceeded its bound'));
    }
  }

  onLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.fail(new Error('Codex app-server returned malformed JSON'));
      return;
    }
    if (!isRecord(message)) {
      this.fail(new Error('Codex app-server returned a malformed message'));
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(message, 'id')) return;
    if (!Number.isSafeInteger(message.id) || !this.pending.has(message.id)) {
      this.fail(new Error('Codex app-server returned an unexpected response id'));
      return;
    }
    const hasResult = Object.prototype.hasOwnProperty.call(message, 'result');
    const hasError = Object.prototype.hasOwnProperty.call(message, 'error');
    if (hasResult === hasError) {
      this.fail(new Error('Codex app-server returned a malformed response'));
      return;
    }
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (hasError) {
      const detail = isRecord(message.error) && typeof message.error.message === 'string'
        ? normalizedSingleLine(message.error.message)
        : 'Codex app-server request failed';
      pending.reject(new Error(detail || 'Codex app-server request failed'));
      return;
    }
    pending.resolve(message.result);
  }

  request(method, params) {
    if (this.failure) return Promise.reject(this.failure);
    if (!this.child.stdin || this.child.stdin.destroyed || !this.child.stdin.writable) {
      return Promise.reject(new Error('Codex app-server stdin is unavailable'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.reject(error);
      });
    });
  }

  notify(method, params) {
    if (this.failure || !this.child.stdin || this.child.stdin.destroyed || !this.child.stdin.writable) return false;
    const message = params === undefined ? { method } : { method, params };
    this.child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
      if (error) this.fail(error);
    });
    return true;
  }

  async close() {
    this.closing = true;
    this.fail(new Error('Codex app-server closed'));
    try {
      if (this.child.stdin && !this.child.stdin.destroyed && this.child.stdin.writable) {
        this.child.stdin.end();
      }
    } catch { /* best-effort cleanup */ }
    if (this.closed) return;
    await Promise.race([this.closePromise, boundedDelay(this.cleanupGraceMs)]);
    if (this.closed) return;
    try { this.child.kill('SIGTERM'); } catch { /* already exited */ }
    await Promise.race([this.closePromise, boundedDelay(this.cleanupGraceMs)]);
    if (this.closed) return;
    try { this.child.kill('SIGKILL'); } catch { /* already exited */ }
    await this.closePromise;
  }
}

function validInitializeResult(result) {
  return isRecord(result)
    && typeof result.codexHome === 'string'
    && typeof result.platformFamily === 'string'
    && typeof result.platformOs === 'string'
    && typeof result.userAgent === 'string';
}

function validThreadCandidate(value, cwd) {
  if (!isRecord(value) || value.cwd !== cwd || value.source !== 'cli') return false;
  if (!RESUME_ID_RE.test(value.id || '') || !Number.isSafeInteger(value.recencyAt)
    || value.recencyAt < 0 || value.recencyAt > Number.MAX_SAFE_INTEGER / 1000) return false;
  if (value.name !== null && value.name !== undefined && typeof value.name !== 'string') return false;
  return typeof value.preview === 'string';
}

function selectThread(result, cwd) {
  if (!isRecord(result) || !Array.isArray(result.data)) {
    throw new Error('Codex thread/list returned malformed metadata');
  }
  const candidates = result.data
    .filter((candidate) => validThreadCandidate(candidate, cwd))
    .sort((left, right) => right.recencyAt - left.recencyAt);
  return candidates[0] || null;
}

function validateItemPage(result) {
  if (!isRecord(result) || !Array.isArray(result.data)) {
    throw new Error('Codex thread/items/list returned malformed metadata');
  }
  for (const entry of result.data) {
    if (!isRecord(entry) || typeof entry.turnId !== 'string'
      || !isRecord(entry.item) || typeof entry.item.type !== 'string') {
      throw new Error('Codex thread/items/list returned a malformed item');
    }
    if (entry.item.type === 'agentMessage' && typeof entry.item.text !== 'string') {
      throw new Error('Codex thread/items/list returned a malformed agent message');
    }
  }
  if (result.nextCursor !== null && result.nextCursor !== undefined && typeof result.nextCursor !== 'string') {
    throw new Error('Codex thread/items/list returned a malformed cursor');
  }
  return result;
}

function createCodexDetectMetadata({
  resolveExecutable = resolveCodexExecutable,
  spawnProcess = spawn,
  appServerArgs = ['app-server', '--stdio'],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  maxLineBytes = DEFAULT_MAX_LINE_BYTES,
  itemPageLimit = DEFAULT_ITEM_PAGE_LIMIT,
  maxItemPages = DEFAULT_MAX_ITEM_PAGES,
  cleanupGraceMs = DEFAULT_CLEANUP_GRACE_MS,
  clientVersion = CHROMUX_VERSION,
} = {}) {
  async function latestAgentMessage(client, threadId) {
    let cursor = null;
    const seenCursors = new Set();
    for (let page = 0; page < maxItemPages; page += 1) {
      const response = validateItemPage(await client.request('thread/items/list', {
        threadId,
        cursor,
        limit: itemPageLimit,
        sortDirection: 'desc',
      }));
      for (const entry of response.data) {
        if (entry.item.type !== 'agentMessage') continue;
        const preview = normalizeAgentMessagePreview(entry.item.text);
        if (preview) return preview;
      }
      if (!response.nextCursor || seenCursors.has(response.nextCursor)) return '';
      cursor = response.nextCursor;
      seenCursors.add(cursor);
    }
    return '';
  }

  async function metadataForCwd(client, cwd) {
    const response = await client.request('thread/list', {
      archived: false,
      cwd,
      limit: 20,
      sourceKinds: ['cli'],
      sortDirection: 'desc',
      sortKey: 'recency_at',
      useStateDbOnly: true,
    });
    const thread = selectThread(response, cwd);
    if (!thread) return null;
    const agentMessagePreview = await latestAgentMessage(client, thread.id);
    const basename = path.basename(cwd) || cwd;
    const name = normalizeDetectLabel(
      normalizedSingleLine(thread.name) || normalizedSingleLine(thread.preview),
      basename,
    );
    return {
      id: thread.id,
      ts: thread.recencyAt * 1000,
      name,
      agentMessagePreview,
    };
  }

  async function scan(cwds) {
    const uniqueCwds = [...new Set(
      (Array.isArray(cwds) ? cwds : [])
        .filter((cwd) => typeof cwd === 'string' && path.isAbsolute(cwd)),
    )];
    if (uniqueCwds.length === 0) return new Map();

    let executable;
    try { executable = resolveExecutable(); } catch { return new Map(); }
    if (!executable) return new Map();

    let child;
    try {
      child = spawnProcess(executable, appServerArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      return new Map();
    }
    const client = new AppServerClient(child, {
      maxOutputBytes,
      maxLineBytes,
      cleanupGraceMs,
    });
    const deadline = setTimeout(() => {
      client.fail(new Error('Codex DETECT enrichment timed out'));
    }, timeoutMs);
    if (typeof deadline.unref === 'function') deadline.unref();

    try {
      const initialized = await client.request('initialize', {
        clientInfo: {
          name: 'chromux',
          title: 'Chromux DETECT',
          version: clientVersion,
        },
        capabilities: { experimentalApi: true },
      });
      if (!validInitializeResult(initialized)) throw new Error('Codex app-server initialization was malformed');
      if (!client.notify('initialized')) throw new Error('Codex app-server initialization could not complete');
      const entries = await Promise.all(uniqueCwds.map(async (cwd) => {
        try {
          const metadata = await metadataForCwd(client, cwd);
          return metadata ? [cwd, metadata] : null;
        } catch {
          return null;
        }
      }));
      return new Map(entries.filter(Boolean));
    } catch {
      return new Map();
    } finally {
      clearTimeout(deadline);
      await client.close();
    }
  }

  return { scan };
}

module.exports = {
  AGENT_MESSAGE_CODE_POINTS,
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_TIMEOUT_MS,
  LABEL_CODE_POINTS,
  createCodexDetectMetadata,
  normalizeAgentMessagePreview,
  normalizeDetectLabel,
};
