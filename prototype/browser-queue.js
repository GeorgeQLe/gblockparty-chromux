'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { fileURLToPath, pathToFileURL } = require('url');

const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
const URL_MAX = 4096;
const REASON_MAX = 240;

function normalizeReason(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('Browser queue reason must be text.');
  const reason = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (reason.length > REASON_MAX) throw new Error(`Browser queue reason must be at most ${REASON_MAX} characters.`);
  return reason || null;
}

function normalizeBrowserQueueRequest(params = {}, options = {}) {
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId.trim() : '';
  const token = typeof params.token === 'string' ? params.token : '';
  if (!SESSION_ID_RE.test(sessionId)) throw new Error('A valid Chromux session is required.');
  if (!token || token.length > 256) throw new Error('Chromux browser queue authentication is required.');
  const session = options.sessionForId && options.sessionForId(sessionId);
  if (!session) throw new Error('The originating Chromux session is missing or has exited.');
  const suppliedToken = Buffer.from(token);
  const expectedToken = Buffer.from(session.chromuxSignalToken || '');
  if (!expectedToken.length || suppliedToken.length !== expectedToken.length
    || !crypto.timingSafeEqual(suppliedToken, expectedToken)) {
    throw new Error('Chromux browser queue authentication failed.');
  }

  const rawUrl = typeof params.url === 'string' ? params.url.trim() : '';
  if (!rawUrl || rawUrl.length > URL_MAX) {
    throw new Error(`Browser queue URL must be between 1 and ${URL_MAX} characters.`);
  }
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('Browser queue URL is invalid.'); }
  if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
    throw new Error('Browser queue URL must use http, https, or file.');
  }
  if (parsed.username || parsed.password) throw new Error('Browser queue URLs cannot include credentials.');
  parsed.hash = '';
  if (parsed.protocol === 'file:') {
    let localPath;
    try { localPath = fileURLToPath(parsed); } catch { throw new Error('Local browser queue target is invalid.'); }
    if (session.chromuxLocation?.runtime === 'wsl' && options.platform === 'win32') {
      localPath = options.linuxPathToWindows(localPath, session.chromuxLocation.distro);
      parsed = new URL((options.pathToFileURL || pathToFileURL)(localPath).href);
    }
    let stat;
    try { stat = (options.statSync || fs.statSync)(localPath); } catch {
      throw new Error('Local browser queue target does not exist.');
    }
    if (!stat.isFile()) throw new Error('Local browser queue target must be an existing file.');
  }
  return { sessionId, url: parsed.href, reason: normalizeReason(params.reason) };
}

module.exports = {
  REASON_MAX,
  SESSION_ID_RE,
  URL_MAX,
  normalizeBrowserQueueRequest,
  normalizeReason,
};
