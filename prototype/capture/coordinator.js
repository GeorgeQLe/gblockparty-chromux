'use strict';

const crypto = require('crypto');

const RECORDING_LIMIT_MS = 60_000;
const STOP_WAIT_MS = 15_000;
const RECORDING_ID_RE = /^recording-[0-9]{8}t[0-9]{6}-[a-f0-9]{12}$/;

function recordingId(now = new Date(), randomBytes = crypto.randomBytes) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').toLowerCase();
  return `recording-${stamp}-${randomBytes(6).toString('hex')}`;
}

function unsupported(platform, operation) {
  return {
    ok: false,
    unsupportedPlatform: true,
    platform,
    operation,
    message: 'Local MCP capture is supported on macOS only in Chromux 0.65.0.',
  };
}

function publicTarget(target) {
  return {
    targetId: target.targetId,
    kind: target.kind,
    label: target.label,
    supportsScreenshot: Boolean(target.supportsScreenshot),
    supportsRecording: Boolean(target.supportsRecording),
  };
}

class CaptureCoordinator {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.store = options.store;
    this.targetsProvider = options.targetsProvider;
    this.screenshotProvider = options.screenshotProvider;
    this.recordApprover = options.recordApprover || (async () => ({ approved: true }));
    this.recordStarter = options.recordStarter;
    this.recordStopper = options.recordStopper;
    this.now = options.now || (() => new Date());
    this.randomBytes = options.randomBytes || crypto.randomBytes;
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.recordingLimitMs = options.recordingLimitMs || RECORDING_LIMIT_MS;
    this.stopWaitMs = options.stopWaitMs || STOP_WAIT_MS;
    this.active = null;
    this.completed = new Map();
    this.waiters = new Map();
  }

  async targets() {
    const provided = await this.targetsProvider();
    return {
      platform: this.platform,
      supported: this.platform === 'darwin',
      targets: (Array.isArray(provided) ? provided : []).map(publicTarget),
    };
  }

  async target(targetId) {
    if (typeof targetId !== 'string' || !targetId || targetId.length > 256) {
      throw new Error('invalid capture target id');
    }
    const provided = await this.targetsProvider();
    const target = (Array.isArray(provided) ? provided : [])
      .find((candidate) => candidate?.targetId === targetId);
    if (!target) throw new Error('capture target is no longer available');
    return target;
  }

  async screenshot(params, caller) {
    if (this.platform !== 'darwin') return unsupported(this.platform, 'screenshot');
    const target = await this.target(params.targetId);
    if (!target.supportsScreenshot) throw new Error('target does not support screenshots');
    const capture = await this.screenshotProvider({ target, caller });
    if (!capture?.approved) {
      const error = new Error(capture?.reason || 'Capture denied in Chromux.');
      error.code = 'CAPTURE_DENIED';
      throw error;
    }
    const artifact = this.store.createScreenshot({
      kind: target.kind === 'browser' ? 'browser-screenshot' : 'window-screenshot',
      png: capture.png,
      payload: capture.payload || null,
      metadata: {
        targetId: target.targetId,
        targetKind: target.kind,
        requester: caller,
        capturedAt: capture.capturedAt || this.now().toISOString(),
        dimensions: capture.dimensions || null,
        ...(capture.metadata || {}),
      },
    });
    return {
      ok: true,
      targetId: target.targetId,
      targetKind: target.kind,
      capturedAt: artifact.metadata.capturedAt,
      dimensions: artifact.metadata.dimensions,
      ...(capture.result || {}),
      artifactId: artifact.artifactId,
      resources: artifact.resources,
    };
  }

  async start(params, caller) {
    if (this.platform !== 'darwin') return unsupported(this.platform, 'recording');
    if (this.active) throw new Error(`recording already active: ${this.active.recordingId}`);
    const target = await this.target(params.targetId);
    if (target.kind !== 'window' || !target.supportsRecording) {
      throw new Error('recording is only supported for the Chromux window');
    }
    const id = recordingId(this.now(), this.randomBytes);
    let resolveStartup;
    const active = {
      recordingId: id,
      artifactId: null,
      target,
      caller,
      startedAt: null,
      deadline: null,
      timer: null,
      stopping: false,
      cancelReason: null,
      startupDone: new Promise((resolve) => { resolveStartup = resolve; }),
      resolveStartup: () => resolveStartup(),
    };
    this.active = active;
    let streamStarted = false;
    try {
      const approval = await this.recordApprover({
        recordingId: id,
        target,
        caller,
      });
      if (!approval?.approved) {
        const error = new Error(approval?.reason || 'Recording denied in Chromux.');
        error.code = 'CAPTURE_DENIED';
        throw error;
      }
      if (active.cancelReason) {
        const error = new Error(`Recording was cancelled before startup (${active.cancelReason}).`);
        error.code = 'CAPTURE_CANCELLED';
        throw error;
      }
      const artifact = this.store.beginRecording({
        recordingId: id,
        metadata: {
          targetId: target.targetId,
          targetKind: target.kind,
          requester: caller,
        },
      });
      active.artifactId = artifact.artifactId;
      const started = await this.recordStarter({
        recordingId: id,
        artifactId: artifact.artifactId,
        target,
        caller,
      });
      if (!started?.approved) {
        const error = new Error(started?.reason || 'Recording denied in Chromux.');
        error.code = 'CAPTURE_DENIED';
        throw error;
      }
      streamStarted = true;
      active.startedAt = started.startedAt || this.now().toISOString();
      active.deadline = new Date(new Date(active.startedAt).getTime() + this.recordingLimitMs).toISOString();
      if (active.cancelReason) {
        await this.stopInternal(id, active.cancelReason);
        const error = new Error(`Recording was cancelled before startup completed (${active.cancelReason}).`);
        error.code = 'CAPTURE_CANCELLED';
        throw error;
      }
      if (!this.completed.has(id)) {
        active.timer = this.setTimer(() => {
          this.stopInternal(id, 'deadline').catch(() => {});
        }, this.recordingLimitMs);
      }
      return {
        ok: true,
        recordingId: id,
        artifactId: artifact.artifactId,
        targetId: target.targetId,
        startedAt: active.startedAt,
        deadline: active.deadline,
        audio: started.audio || 'unavailable',
        dimensions: started.dimensions || null,
        mimeType: started.mimeType || 'video/webm',
        codec: started.codec || 'webm',
      };
    } catch (error) {
      if (streamStarted && !this.completed.has(id) && !active.stopping) {
        active.stopping = true;
        try { await this.recordStopper({ recordingId: id, reason: 'persistence-failed' }); } catch { /* best effort */ }
      }
      if (this.active === active) this.active = null;
      if (active.artifactId && !this.completed.has(id)) {
        this.store.finalizeRecording(id, {
          metadata: {
            failed: true,
            error: error.message,
            stoppedAt: this.now().toISOString(),
          },
        });
      }
      throw error;
    } finally {
      active.resolveStartup();
    }
  }

  appendChunk(recordingIdValue, chunk) {
    if (!this.active || this.active.recordingId !== recordingIdValue) {
      throw new Error('recording is not active');
    }
    return this.store.appendRecordingChunk(recordingIdValue, chunk);
  }

  complete(recordingIdValue, completion = {}) {
    const existing = this.completed.get(recordingIdValue);
    if (existing) return existing;
    const active = this.active;
    if (!active || active.recordingId !== recordingIdValue) {
      return this.store.readRecordingResult(recordingIdValue);
    }
    if (active.timer) this.clearTimer(active.timer);
    const stoppedAt = completion.metadata?.stoppedAt || this.now().toISOString();
    const startedMs = new Date(active.startedAt || stoppedAt).getTime();
    const stoppedMs = new Date(stoppedAt).getTime();
    const result = this.store.finalizeRecording(recordingIdValue, {
      contactSheet: completion.contactSheet || null,
      metadata: {
        targetId: active.target.targetId,
        targetKind: active.target.kind,
        requester: active.caller,
        startedAt: active.startedAt,
        stoppedAt,
        durationMs: Number.isFinite(completion.metadata?.durationMs)
          ? completion.metadata.durationMs
          : Math.max(0, stoppedMs - startedMs),
        dimensions: completion.metadata?.dimensions || null,
        mimeType: completion.metadata?.mimeType || 'video/webm',
        codec: completion.metadata?.codec || 'webm',
        audio: completion.metadata?.audio || 'unavailable',
        stopReason: completion.metadata?.stopReason || 'requester',
      },
    });
    this.active = null;
    this.completed.set(recordingIdValue, result);
    const waiters = this.waiters.get(recordingIdValue) || [];
    this.waiters.delete(recordingIdValue);
    for (const waiter of waiters) waiter.resolve(result);
    return result;
  }

  waitForCompletion(recordingIdValue) {
    const existing = this.completed.get(recordingIdValue);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      let timer = null;
      const wrappedResolve = (value) => {
        if (timer) this.clearTimer(timer);
        resolve(value);
      };
      timer = this.setTimer(() => {
        const list = this.waiters.get(recordingIdValue) || [];
        this.waiters.set(recordingIdValue, list.filter((entry) => entry.resolve !== wrappedResolve));
        reject(new Error('recording stop timed out'));
      }, this.stopWaitMs);
      const list = this.waiters.get(recordingIdValue) || [];
      list.push({ resolve: wrappedResolve, reject });
      this.waiters.set(recordingIdValue, list);
    });
  }

  async stop(params, caller) {
    if (!RECORDING_ID_RE.test(String(params.recordingId || ''))) {
      throw new Error('invalid recording id');
    }
    const existing = this.completed.get(params.recordingId);
    if (existing) {
      if (existing.metadata?.requester?.clientId !== caller.clientId) {
        throw new Error('only the requesting MCP client may stop this recording');
      }
      return existing;
    }
    if (!this.active || this.active.recordingId !== params.recordingId) {
      const persisted = this.store.readRecordingResult(params.recordingId);
      if (persisted.metadata?.requester?.clientId !== caller.clientId) {
        throw new Error('only the requesting MCP client may stop this recording');
      }
      this.completed.set(params.recordingId, persisted);
      return persisted;
    }
    if (this.active.caller.clientId !== caller.clientId) {
      throw new Error('only the requesting MCP client may stop this recording');
    }
    return this.stopInternal(params.recordingId, 'requester');
  }

  async stopInternal(recordingIdValue, reason) {
    const existing = this.completed.get(recordingIdValue);
    if (existing) return existing;
    const active = this.active;
    if (!active || active.recordingId !== recordingIdValue) {
      return this.store.readRecordingResult(recordingIdValue);
    }
    if (!active.startedAt) {
      active.cancelReason = reason;
      try {
        await this.recordStopper({ recordingId: recordingIdValue, reason });
      } catch { /* startup may already be settling */ }
      await active.startupDone;
      const completed = this.completed.get(recordingIdValue);
      if (completed) return completed;
      if (!this.active || this.active.recordingId !== recordingIdValue) return null;
      return this.stopInternal(recordingIdValue, reason);
    }
    if (!active.stopping) {
      active.stopping = true;
      try {
        await this.recordStopper({ recordingId: recordingIdValue, reason });
      } catch (error) {
        active.stopping = false;
        throw error;
      }
    }
    return this.waitForCompletion(recordingIdValue);
  }

  stopByUser(recordingIdValue) {
    return this.stopInternal(recordingIdValue, 'user');
  }

  disconnect(caller) {
    if (!this.active || this.active.caller.clientId !== caller.clientId) return Promise.resolve(null);
    return this.stopInternal(this.active.recordingId, 'requester-disconnect');
  }

  shutdown() {
    if (!this.active) return Promise.resolve(null);
    return this.stopInternal(this.active.recordingId, 'app-shutdown');
  }

  async dispatch(method, params, caller) {
    switch (method) {
      case 'targets.list': return this.targets();
      case 'capture.screenshot': return this.screenshot(params, caller);
      case 'record.start': return this.start(params, caller);
      case 'record.stop': return this.stop(params, caller);
      default: throw new Error(`unknown capture method: ${method}`);
    }
  }
}

module.exports = {
  RECORDING_LIMIT_MS,
  RECORDING_ID_RE,
  CaptureCoordinator,
  publicTarget,
  recordingId,
  unsupported,
};
