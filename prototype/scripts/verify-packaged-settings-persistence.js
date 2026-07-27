#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const packagedExecutable = process.argv[2]
  || path.join(appDir, 'dist', 'Chromux-darwin-arm64', 'Chromux.app', 'Contents', 'MacOS', 'Chromux');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-packaged-settings-'));
const profileDir = path.join(fixtureRoot, 'legacy-chromux-profile');
const homeDir = path.join(fixtureRoot, 'home');
const seedScript = path.join(fixtureRoot, 'seed.js');
const verifyScript = path.join(fixtureRoot, 'verify.js');
const seedOutput = path.join(fixtureRoot, 'seed.out');
const verifyOutput = path.join(fixtureRoot, 'verify.out');

fs.mkdirSync(homeDir, { recursive: true });
fs.writeFileSync(seedScript, `
(() => {
  localStorage.setItem('chromux.theme', 'retro-os');
  localStorage.setItem('chromux.themeMode', 'dark');
  localStorage.setItem('chromux.railMode', 'git');
  localStorage.setItem('chromux.threadSort', 'az');
  localStorage.setItem('chromux.threadPreviewSize', 'large');
  localStorage.setItem('chromux.tabActivityIndicators', 'false');
  localStorage.setItem('chromux.browserFullscreenBehavior', 'cycle');
  localStorage.setItem('chromux.sessionTabGroups', JSON.stringify({
    schemaVersion: 1,
    enabled: true,
    groups: [{ id: 'group-release-smoke', name: 'Release Smoke' }],
  }));
  return JSON.stringify({ ok: true });
})()
`);
fs.writeFileSync(verifyScript, `
(() => {
  const groups = window.chromuxTestTabs && window.chromuxTestTabs.grouping;
  const themes = window.chromuxTestThemes;
  return JSON.stringify({
    ok: true,
    theme: themes && themes.current(),
    themeMode: themes && themes.currentMode(),
    railMode: localStorage.getItem('chromux.railMode'),
    threadSort: localStorage.getItem('chromux.threadSort'),
    threadPreviewSize: localStorage.getItem('chromux.threadPreviewSize'),
    tabActivityIndicators: localStorage.getItem('chromux.tabActivityIndicators'),
    browserFullscreenBehavior: localStorage.getItem('chromux.browserFullscreenBehavior'),
    groupingEnabled: groups && groups.enabled(),
    groupDefinitions: groups && groups.definitions(),
  });
})()
`);

function launch({ command, args, e2ePath, outputPath, label }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: appDir,
      env: {
        ...process.env,
        HOME: homeDir,
        CHROMUX_E2E: e2ePath,
        CHROMUX_E2E_OUT: outputPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const timeout = setTimeout(() => child.kill('SIGTERM'), 60000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
      if (code !== 0 || signal || !output) {
        reject(new Error(`${label} failed: ${JSON.stringify({
          code, signal, output, stdout, stderr,
        })}`));
        return;
      }
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error(`${label} returned invalid JSON: ${output}`));
      }
    });
  });
}

async function main() {
  assert(fs.existsSync(packagedExecutable), `packaged executable is missing: ${packagedExecutable}`);
  const userDataArg = `--user-data-dir=${profileDir}`;
  const seeded = await launch({
    command: process.execPath,
    args: [electronCli, '.', '--smoke', userDataArg],
    e2ePath: seedScript,
    outputPath: seedOutput,
    label: 'source profile seed',
  });
  assert.strictEqual(seeded.ok, true, 'source app should seed the profile');

  const restored = await launch({
    command: packagedExecutable,
    args: ['--smoke', userDataArg],
    e2ePath: verifyScript,
    outputPath: verifyOutput,
    label: 'packaged profile restore',
  });
  assert.deepStrictEqual(restored, {
    ok: true,
    theme: 'retro-os',
    themeMode: 'dark',
    railMode: 'git',
    threadSort: 'az',
    threadPreviewSize: 'large',
    tabActivityIndicators: 'false',
    browserFullscreenBehavior: 'cycle',
    groupingEnabled: true,
    groupDefinitions: [{ id: 'group-release-smoke', name: 'Release Smoke' }],
  });
  console.log('PACKAGED_SETTINGS_PERSISTENCE_OK');
}

main()
  .finally(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error('PACKAGED_SETTINGS_PERSISTENCE_FAIL', error.message);
    process.exit(1);
  });
