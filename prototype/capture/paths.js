'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');

function captureControlSocketPath(chromuxHome, explicit = null, platform = process.platform) {
  if (explicit) return explicit;
  if (platform === 'win32') {
    const digest = crypto.createHash('sha256').update(String(chromuxHome)).digest('hex').slice(0, 20);
    return `\\\\.\\pipe\\chromux-capture-control-${digest}`;
  }
  const candidate = path.join(chromuxHome, 'capture-control.sock');
  if (Buffer.byteLength(candidate) < 100) return candidate;
  const digest = crypto.createHash('sha256').update(candidate).digest('hex').slice(0, 20);
  return path.join(os.tmpdir(), `chromux-capture-${digest}.sock`);
}

module.exports = { captureControlSocketPath };
