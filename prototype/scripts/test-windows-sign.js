#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { TIMESTAMP_SERVER, quoteSignToolArgument, windowsSignOptions } = require('../windows-sign');

assert.strictEqual(windowsSignOptions({}), null);
assert.throws(
  () => windowsSignOptions({ CHROMUX_REQUIRE_WINDOWS_SIGNING: '1' }),
  /AZURE_CODE_SIGNING_DLIB/,
);
assert.throws(() => quoteSignToolArgument('bad\npath'), /invalid/);
const options = windowsSignOptions({
  AZURE_CODE_SIGNING_DLIB: 'C:\\Program Files\\Artifact Signing\\Azure.CodeSigning.Dlib.dll',
  AZURE_CODE_SIGNING_METADATA: 'C:\\work\\metadata.json',
  SIGNTOOL_PATH: 'C:\\Windows Kits\\signtool.exe',
});
assert.match(options.signWithParams, /\/fd SHA256/);
assert.match(options.signWithParams, /\/td SHA256/);
assert.match(options.signWithParams, /\/dlib "/);
assert.match(options.signWithParams, /\/dmdf "/);
assert.match(options.signWithParams, /timestamp\.acs\.microsoft\.com/);
assert.strictEqual(options.timestampServer, TIMESTAMP_SERVER);
assert.deepStrictEqual(options.hashes, ['sha256']);
assert(Object.isFrozen(options));
console.log('windows signing configuration tests passed');
