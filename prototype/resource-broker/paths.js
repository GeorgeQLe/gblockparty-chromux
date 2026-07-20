'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');

function brokerSocketPath(chromuxHome, explicit = null) {
  if (explicit) return explicit;
  const candidate = path.join(chromuxHome, 'resource-broker.sock');
  if (Buffer.byteLength(candidate) <= 96) return candidate;
  const identity = `${typeof process.getuid === 'function' ? process.getuid() : 'user'}:${chromuxHome}`;
  const digest = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 20);
  return path.join('/tmp', `chromux-rb-${digest}.sock`);
}

module.exports = { brokerSocketPath };
