'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { normalizeBrowserQueueRequest } = require('../browser-queue');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-browser-queue-'));
const localFile = path.join(root, 'preview.html');
fs.writeFileSync(localFile, '<!doctype html>');
const token = 'signal-token';
const sessions = new Map([['session-1', {
  chromuxSignalToken: token,
  chromuxLocation: { runtime: 'host', distro: null },
}]]);
const options = {
  sessionForId: (id) => sessions.get(id),
  platform: 'darwin',
};
const request = (overrides = {}) => normalizeBrowserQueueRequest({
  sessionId: 'session-1',
  token,
  url: 'https://example.com/path#fragment',
  reason: '  inspect\nthis  ',
  ...overrides,
}, options);

assert.deepEqual(request(), {
  sessionId: 'session-1',
  url: 'https://example.com/path',
  reason: 'inspect this',
});
assert.equal(request({ url: pathToFileURL(localFile).href }).url, pathToFileURL(localFile).href);
assert.throws(() => request({ sessionId: 'missing' }), /missing or has exited/);
assert.throws(() => request({ token: 'wrong' }), /authentication failed/);
assert.throws(() => request({ token: '' }), /authentication is required/);
assert.throws(() => request({ url: 'ftp://example.com/file' }), /http, https, or file/);
assert.throws(() => request({ url: 'https://user:pass@example.com/' }), /credentials/);
assert.throws(() => request({ url: pathToFileURL(path.join(root, 'missing.html')).href }), /does not exist/);
assert.throws(() => request({ url: pathToFileURL(root).href }), /existing file/);
assert.throws(() => request({ reason: 'x'.repeat(241) }), /at most 240/);
assert.throws(() => request({ url: 'https://example.com/' + 'x'.repeat(4096) }), /between 1 and 4096/);

let bridged = null;
const wsl = normalizeBrowserQueueRequest({
  sessionId: 'wsl-session',
  token,
  url: 'file:///home/me/page.html',
}, {
  sessionForId: () => ({
    chromuxSignalToken: token,
    chromuxLocation: { runtime: 'wsl', distro: 'Ubuntu' },
  }),
  platform: 'win32',
  linuxPathToWindows: (value, distro) => {
    bridged = { value, distro };
    return 'C:\\preview.html';
  },
  pathToFileURL: () => new URL('file:///C:/preview.html'),
  statSync: () => ({ isFile: () => true }),
});
assert.deepEqual(bridged, { value: '/home/me/page.html', distro: 'Ubuntu' });
assert.equal(wsl.url, 'file:///C:/preview.html');

console.log('browser queue validation tests: ok');
