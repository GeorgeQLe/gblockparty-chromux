#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  WslRuntime,
  linuxPathToWindows,
  parseWslList,
  validateDistroName,
  windowsPathToLinux,
  workspaceLocation,
} = require('../platform/runtime');
const { capabilities, resourceIds, windowOptions, windowsSupport } = require('../platform/host');
const { brokerSocketPath } = require('../resource-broker/paths');
const { chromuxShortcutAction } = require('../shortcut-input');
const { createPreventSleepController } = require('../prevent-sleep');
const { parseRelease } = require('../update-checker');

async function run() {
  const wslOutput = '  NAME          STATE     VERSION\r\n* Ubuntu        Running   2\r\n  Debian Test   Stopped   2';
  const listed = parseWslList(wslOutput.split('').join('\0'));
  assert.deepStrictEqual(listed.map((row) => [row.name, row.version, row.default]), [
    ['Ubuntu', 2, true],
    ['Debian Test', 2, false],
  ]);
  assert.strictEqual(validateDistroName('Debian Test', listed).name, 'Debian Test');
  assert.throws(() => validateDistroName('Ubuntu; touch bad', listed), /no longer installed/);
  assert.throws(
    () => validateDistroName('Legacy Fixture', [...listed, { name: 'Legacy Fixture', version: 1 }]),
    /uses WSL1; Chromux requires WSL2/,
  );
  assert.strictEqual(windowsPathToLinux("C:\\Users\\Zoë Smith\\say 'quoted'"), "/mnt/c/Users/Zoë Smith/say 'quoted'");
  assert.strictEqual(linuxPathToWindows('/mnt/c/Users/Zoë Smith', 'Ubuntu'), 'C:\\Users\\Zoë Smith');
  assert.strictEqual(linuxPathToWindows('/home/zoë/My Project', 'Debian Test'), '\\\\wsl.localhost\\Debian Test\\home\\zoë\\My Project');
  assert.deepStrictEqual(workspaceLocation('/home/me', { platform: 'win32', selectedDistro: 'Ubuntu' }), {
    runtime: 'wsl', distro: 'Ubuntu', cwd: '/home/me',
  });

  const runtime = new WslRuntime({ platform: 'win32' });
  runtime.distros = listed;
  const spec = runtime.ptySpec({ runtime: 'wsl', distro: 'Debian Test', cwd: "/home/zoë/a 'quote'" }, {
    SystemRoot: 'C:\\Windows',
    WSLENV: 'EXISTING',
    CHROMUX: '1',
  });
  assert.deepStrictEqual(spec.args, ['--distribution', 'Debian Test', '--cd', "/home/zoë/a 'quote'", '--exec', 'bash', '-l']);
  assert.match(spec.env.WSLENV, /CHROMUX_SESSION_ID/);
  assert.deepStrictEqual(capabilities('win32'), { preventSleep: true, foregroundInputBroker: true, iosSimulator: false });
  assert.strictEqual(resourceIds('win32').foregroundInput, 'windows:foreground-input');
  assert.strictEqual(windowOptions('win32').titleBarStyle, 'hidden');
  assert.strictEqual(windowsSupport({ platform: 'win32', arch: 'x64', release: '10.0.19045' }).supported, true);
  assert.strictEqual(windowsSupport({ platform: 'win32', arch: 'x64', release: '10.0.22621' }).supported, true);
  assert.strictEqual(windowsSupport({ platform: 'win32', arch: 'x64', release: '10.0.26100.1' }).supported, true);
  assert.match(windowsSupport({ platform: 'win32', arch: 'arm64', release: '10.0.26100' }).error, /x64/);
  assert.match(windowsSupport({ platform: 'win32', arch: 'ia32', release: '10.0.26100' }).error, /x64/);
  assert.match(windowsSupport({ platform: 'win32', arch: 'x64', release: '10.0.19044' }).error, /build 19045/);
  assert.match(windowsSupport({ platform: 'win32', arch: 'x64', release: 'not-a-version' }).error, /build 19045/);
  assert.match(windowsSupport({ platform: 'win32', arch: 'x64', release: '10.0.19045-preview' }).error, /build 19045/);
  assert.match(brokerSocketPath('C:\\Users\\Me\\.chromux', null, 'win32'), /^\\\\\.\\pipe\\chromux-resource-broker-/);

  const shortcut = chromuxShortcutAction({ type: 'keyDown', key: 'B', control: true, shift: true }, 'win32');
  assert.strictEqual(shortcut.label, 'Ctrl+Shift+B');
  assert.strictEqual(chromuxShortcutAction({ type: 'keyDown', key: 'B', meta: true, shift: true }, 'win32'), null);
  const browserFullscreen = chromuxShortcutAction({ type: 'keyDown', key: 'F', control: true, shift: true }, 'win32');
  assert.strictEqual(browserFullscreen.id, 'browser-fullscreen');
  assert.strictEqual(browserFullscreen.label, 'Ctrl+Shift+F');
  const createProject = chromuxShortcutAction({ type: 'keyDown', key: 'N', control: true }, 'win32');
  assert.strictEqual(createProject.id, 'create-project');
  assert.strictEqual(createProject.label, 'Ctrl+N');

  const blockers = new Set();
  const controller = createPreventSleepController({
    platform: 'win32',
    powerSaveBlocker: {
      start() { blockers.add(7); return 7; },
      stop(id) { blockers.delete(id); },
    },
  });
  assert.strictEqual(controller.setEnabled(true).running, true);
  controller.shutdown();
  assert.strictEqual(blockers.size, 0);

  const release = parseRelease({
    tag_name: 'chromux-v0.69.2',
    html_url: 'https://github.com/GeorgeQLe/gblockparty-chromux/releases/tag/chromux-v0.69.2',
    assets: [
      { name: 'GBlockParty-Chromux-Setup-0.69.2-x64.exe', browser_download_url: 'https://example/setup' },
      { name: 'GBlockPartyChromux-0.69.2-full.nupkg', browser_download_url: 'https://example/package' },
      { name: 'RELEASES', browser_download_url: 'https://example/releases' },
    ],
  });
  assert.strictEqual(release.windows.complete, true);
  console.log('windows platform tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
