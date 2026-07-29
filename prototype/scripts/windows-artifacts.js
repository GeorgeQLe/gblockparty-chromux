#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parseRelease } = require('../update-checker');
const packageJson = require('../package.json');

function names(version = packageJson.version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid package version: ${version}`);
  return {
    version,
    tag: `chromux-v${version}`,
    title: `GBlockParty Chromux v${version}`,
    setup: `GBlockParty-Chromux-Setup-${version}-x64.exe`,
    package: `GBlockPartyChromux-${version}-full.nupkg`,
    releases: 'RELEASES',
    checksums: 'SHA256SUMS',
    metadata: 'build-metadata.json',
  };
}

function hashFile(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function requireFile(file, label) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size <= 0) throw new Error(`${label} is missing or empty: ${file}`);
  return stat;
}

function prepare(sourceDirectory, outputDirectory) {
  const expected = names();
  fs.mkdirSync(outputDirectory, { recursive: true });
  const required = [expected.setup, expected.package, expected.releases];
  for (const name of required) {
    const source = path.join(sourceDirectory, name);
    requireFile(source, name);
    fs.copyFileSync(source, path.join(outputDirectory, name));
  }
  const releases = fs.readFileSync(path.join(outputDirectory, expected.releases), 'utf8');
  if (!releases.includes(expected.package)) {
    throw new Error(`RELEASES does not reference ${expected.package}.`);
  }
  const hashes = Object.fromEntries(required.map((name) => [name, hashFile(path.join(outputDirectory, name))]));
  fs.writeFileSync(
    path.join(outputDirectory, expected.checksums),
    required.map((name) => `${hashes[name]}  ${name}`).join('\n') + '\n',
  );
  const metadata = {
    schemaVersion: 1,
    version: expected.version,
    tag: expected.tag,
    commit: process.env.GITHUB_SHA || process.env.CHROMUX_BUILD_COMMIT || null,
    workflowRunId: process.env.GITHUB_RUN_ID || null,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    runner: process.env.RUNNER_NAME || null,
    signerPublisher: process.env.WINDOWS_SIGN_PUBLISHER || null,
    createdAt: new Date().toISOString(),
    files: Object.fromEntries(required.map((name) => {
      const stat = requireFile(path.join(outputDirectory, name), name);
      return [name, { bytes: stat.size, sha256: hashes[name] }];
    })),
  };
  fs.writeFileSync(path.join(outputDirectory, expected.metadata), JSON.stringify(metadata, null, 2) + '\n');
  return { ...expected, hashes };
}

function verify(directory) {
  const expected = names();
  const checksumPath = path.join(directory, expected.checksums);
  const metadataPath = path.join(directory, expected.metadata);
  const required = [expected.setup, expected.package, expected.releases, expected.checksums, expected.metadata];
  for (const name of required) requireFile(path.join(directory, name), name);
  const checksumRows = new Map(fs.readFileSync(checksumPath, 'utf8').trim().split(/\r?\n/).map((line) => {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Invalid checksum row: ${line}`);
    return [match[2], match[1]];
  }));
  for (const name of [expected.setup, expected.package, expected.releases]) {
    if (checksumRows.get(name) !== hashFile(path.join(directory, name))) {
      throw new Error(`SHA-256 mismatch for ${name}.`);
    }
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (metadata.version !== expected.version || metadata.tag !== expected.tag) {
    throw new Error('Build metadata version/tag does not match package.json.');
  }
  for (const name of [expected.setup, expected.package, expected.releases]) {
    if (metadata.files?.[name]?.sha256 !== checksumRows.get(name)
      || metadata.files?.[name]?.bytes !== requireFile(path.join(directory, name), name).size) {
      throw new Error(`Build metadata does not match ${name}.`);
    }
  }
  return { ...expected, metadata };
}

function verifyReleaseJson(file) {
  const expected = names();
  const release = JSON.parse(fs.readFileSync(file, 'utf8'));
  const parsed = parseRelease(release);
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.tag !== expected.tag || parsed.version !== expected.version) {
    throw new Error(`Latest release ${parsed.tag} does not match ${expected.tag}.`);
  }
  if (!parsed.windows?.complete) throw new Error(parsed.windows?.error || 'Windows update asset set is incomplete.');
  return parsed;
}

function printGithubOutput(values) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  fs.appendFileSync(output, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
}

function main(argv) {
  const command = argv[2] || 'names';
  if (command === 'names') {
    const expected = names();
    printGithubOutput(expected);
    process.stdout.write(JSON.stringify(expected, null, 2) + '\n');
    return;
  }
  if (command === 'prepare') {
    if (!argv[3] || !argv[4]) throw new Error('Usage: windows-artifacts.js prepare <source> <output>');
    const result = prepare(path.resolve(argv[3]), path.resolve(argv[4]));
    printGithubOutput(result);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  if (command === 'verify') {
    if (!argv[3]) throw new Error('Usage: windows-artifacts.js verify <directory>');
    process.stdout.write(JSON.stringify(verify(path.resolve(argv[3])), null, 2) + '\n');
    return;
  }
  if (command === 'verify-release-json') {
    if (!argv[3]) throw new Error('Usage: windows-artifacts.js verify-release-json <release.json>');
    process.stdout.write(JSON.stringify(verifyReleaseJson(path.resolve(argv[3])), null, 2) + '\n');
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { hashFile, names, prepare, verify, verifyReleaseJson };
