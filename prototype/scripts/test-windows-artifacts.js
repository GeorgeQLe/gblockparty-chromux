#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const packageJson = require('../package.json');
const { names, prepare, verify, verifyReleaseJson } = require('./windows-artifacts');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-windows-artifacts-'));
const source = path.join(temporary, 'source');
const candidate = path.join(temporary, 'candidate');
fs.mkdirSync(source);
const expected = names();
assert.strictEqual(expected.version, packageJson.version);
assert.strictEqual(expected.tag, `chromux-v${packageJson.version}`);
fs.writeFileSync(path.join(source, expected.setup), 'signed setup fixture');
fs.writeFileSync(path.join(source, expected.package), 'signed package fixture');
fs.writeFileSync(path.join(source, expected.releases), `hash ${expected.package} 1\n`);
prepare(source, candidate);
const verified = verify(candidate);
assert.strictEqual(verified.metadata.version, packageJson.version);
assert.strictEqual(Object.keys(verified.metadata.files).length, 3);
assert.strictEqual(verified.metadata.signerPublisher, null);

fs.appendFileSync(path.join(candidate, expected.setup), 'tampered');
assert.throws(() => verify(candidate), /SHA-256 mismatch/);
fs.writeFileSync(path.join(candidate, expected.setup), 'signed setup fixture');
const metadataPath = path.join(candidate, expected.metadata);
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
metadata.files[expected.setup].bytes += 1;
fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
assert.throws(() => verify(candidate), /Build metadata does not match/);
prepare(source, candidate);

const tag = expected.tag;
const base = `https://github.com/GeorgeQLe/gblockparty-chromux/releases/download/${tag}`;
const releaseFile = path.join(temporary, 'release.json');
fs.writeFileSync(releaseFile, JSON.stringify({
  tag_name: tag,
  name: expected.title,
  html_url: `https://github.com/GeorgeQLe/gblockparty-chromux/releases/tag/${tag}`,
  assets: [
    { name: expected.setup, browser_download_url: `${base}/${expected.setup}` },
    { name: expected.package, browser_download_url: `${base}/${expected.package}` },
    { name: expected.releases, browser_download_url: `${base}/${expected.releases}` },
  ],
}));
assert.strictEqual(verifyReleaseJson(releaseFile).windows.complete, true);
fs.writeFileSync(releaseFile, JSON.stringify({
  tag_name: 'chromux-v0.0.1',
  assets: [],
}));
assert.throws(() => verifyReleaseJson(releaseFile), /does not match/);

fs.writeFileSync(path.join(source, expected.releases), 'wrong package\n');
assert.throws(() => prepare(source, path.join(temporary, 'bad')), /does not reference/);
console.log('windows artifact tests passed');
