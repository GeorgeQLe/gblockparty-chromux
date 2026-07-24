'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-session-tab-groups-'));
const homeDir = path.join(tmpDir, 'home');
const e2ePath = path.join(tmpDir, 'session-tab-groups-e2e.js');
const e2eOutPath = path.join(tmpDir, 'e2e.out');

fs.mkdirSync(homeDir, { recursive: true });
fs.writeFileSync(e2ePath, `
(async () => {
  const tabs = window.chromuxTestTabs;
  const groups = tabs && tabs.grouping;
  if (!groups) throw new Error('Missing session-tab-group test API');
  const expect = (value, message) => { if (!value) throw new Error(message); };
  const tick = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

  expect(groups.enabled() === false, 'grouping must be disabled by default');
  expect(document.querySelector('#group-tab-list').classList.contains('hidden'),
    'upper group strip must be hidden in flat mode');
  expect(groups.storageProbe('{bad json').enabled === false,
    'corrupt local storage must fall back to grouping disabled');
  expect(groups.storageProbe(JSON.stringify({ schemaVersion: 1, enabled: true,
    groups: [{ id: 'bad/id', name: 'Bad' }] })).enabled === false,
  'invalid stored group definitions must disable grouping safely');

  const apiA = tabs.addSession({ name: 'api-a', cwd: '/work/apps/api///', agent: 'claude' });
  const apiB = tabs.addSession({ name: 'api-b', cwd: '/work/apps/api', agent: 'codex' });
  const alpha = tabs.addSession({ name: 'alpha-client', cwd: '/alpha/client', agent: 'codex' });
  const beta = tabs.addSession({ name: 'beta-client', cwd: '/beta/client/', agent: 'codex' });
  expect(document.querySelector('#tab-list').children.length === 5,
    'flat mode must preserve all session tabs plus sticky actions');

  const invalid = groups.create('   ');
  expect(Boolean(invalid.error), 'blank custom group name must be rejected');
  const customOne = groups.create('Review');
  const duplicate = groups.create(' review ');
  expect(customOne.id && duplicate.error, 'custom names must reject case-insensitive duplicates');
  const customTwo = groups.create('Deploy');
  expect(groups.rename(customTwo.id, '  Shipping  ').name === 'Shipping',
    'renaming must trim a valid custom name');
  expect(groups.rename(customTwo.id, 'REVIEW').error,
    'renaming must reject case-insensitive duplicates');

  groups.setEnabled(true);
  await tick();
  let effective = groups.groups();
  expect(effective.length === 3, 'normalized exact cwd should merge redundant trailing separators');
  expect(effective[0].sessions.join(',') === [apiA, apiB].join(','),
    'directory group must preserve session-open order');
  expect(effective[1].name === 'client — alpha' && effective[2].name === 'client — beta',
    'duplicate basenames must use the shortest unique parent suffix');
  expect(effective[1].tooltip === '/alpha/client' && effective[2].tooltip === '/beta/client',
    'directory group tooltip must expose the full normalized path');
  expect(!document.querySelector('#group-session-list').classList.contains('hidden'),
    'lower session strip must always render while grouped sessions exist');
  expect(groups.lower().length >= 1, 'single-session groups must still render the lower strip');

  groups.move(beta, customTwo.id);
  tabs.focus(alpha);
  groups.move(alpha, customOne.id);
  effective = groups.groups();
  expect(effective[0].id === customOne.id && effective[1].id === customTwo.id,
    'nonempty custom groups must lead in creation order');
  expect(groups.focused() === customOne.id && groups.active() === alpha,
    'moving the active session must follow it into the destination group');

  const directory = effective.find((group) => group.sessions.includes(apiA));
  groups.select(directory.id);
  tabs.focus(apiB);
  groups.select(customOne.id);
  groups.select(directory.id);
  expect(groups.active() === apiB, 'group selection must restore its last-active session');

  const snapshot = groups.snapshot();
  expect(snapshot.find((row) => row.name === 'api-b').wasActive === true,
    'snapshot must preserve the exact active session');
  expect(snapshot.find((row) => row.name === 'api-b').wasLastActiveInGroup === true,
    'snapshot must preserve group last-active state');
  expect(snapshot.find((row) => row.name === 'alpha-client').customTabGroupId === customOne.id,
    'snapshot must preserve custom membership');

  groups.select(customOne.id);
  const alphaTab = document.querySelector('#group-session-list > .session-tab');
  alphaTab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 80 }));
  const moveItem = [...document.querySelectorAll('.session-menu-item')]
    .find((item) => item.textContent.includes('Move to group'));
  expect(moveItem, 'session context menu must include Move to group');
  moveItem.click();
  await tick();
  const picker = document.querySelector('.session-menu.group-picker');
  expect(picker && picker.querySelectorAll('.session-menu-item').length === groups.definitions().length + 2,
    'move picker must include automatic grouping, every custom group, and create-and-move');
  expect(document.activeElement === picker.querySelector('.session-menu-item'),
    'move picker must focus its first option');
  picker.querySelector('.session-menu-item').click();
  expect(groups.groups().some((group) => group.kind === 'directory' && group.sessions.includes(alpha)),
    'automatic picker option must return a session to its directory group');
  groups.move(alpha, customOne.id);

  groups.move(alpha, null);
  expect(groups.definitions().some((group) => group.id === customOne.id),
    'empty custom groups must remain in Settings');
  expect(!groups.groups().some((group) => group.id === customOne.id),
    'empty custom groups must be omitted from the upper strip');
  groups.move(alpha, customOne.id);
  expect(groups.delete(customOne.id, false) === false,
    'deleting a nonempty custom group must require confirmation');
  expect(groups.delete(customOne.id, true) === true,
    'confirmed deletion must remove a nonempty custom group');
  expect(groups.groups().some((group) => group.sessions.includes(alpha) && group.kind === 'directory'),
    'deleted-group sessions must return to automatic directory grouping');

  groups.move(beta, customTwo.id);
  tabs.emitSignal(beta, 'permission-required', 'Approve deployment');
  groups.setQueue(beta, ['https://localhost:3000', 'https://localhost:3001']);
  let shipping = groups.upper().find((group) => group.id === customTwo.id);
  expect(shipping.indicator === 'action', 'group must project the highest-priority session status');
  expect(Number(shipping.badge) >= 3, 'group badge must total attention and queued items');
  tabs.emitSignal(beta, 'turn-started');
  shipping = groups.upper().find((group) => group.id === customTwo.id);
  expect(shipping.indicator === 'working', 'group status must update when a hidden session starts working');
  tabs.emitSignal(beta, 'turn-completed');
  shipping = groups.upper().find((group) => group.id === customTwo.id);
  expect(shipping.indicator === 'completed', 'group status must update when a hidden session completes');
  tabs.exit(beta, 1);
  shipping = groups.upper().find((group) => group.id === customTwo.id);
  expect(shipping.indicator === 'dead', 'group status must update when a hidden session exits');

  const search = document.querySelector('#btn-search-sessions');
  search.click();
  const input = document.querySelector('#session-search-input');
  input.value = 'alpha-client';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('.session-search-result').click();
  expect(groups.active() === alpha && groups.focused() === groups.groups()
    .find((group) => group.sessions.includes(alpha)).id,
  'global search must reveal and activate a session across groups');

  const shortcut = groups.shortcut(3);
  expect(shortcut && shortcut.sessionId === beta && groups.focused() === customTwo.id,
    'numeric session shortcuts must focus the destination group');

  const workspace = document.querySelector('#workspace');
  for (let index = 0; index < 8; index += 1) {
    tabs.addSession({ name: 'overflow-' + index, cwd: '/overflow/project-' + index, agent: 'codex' });
  }
  const sameCwd = [];
  for (let index = 0; index < 7; index += 1) {
    sameCwd.push(tabs.addSession({ name: 'lower-' + index, cwd: '/overflow/shared', agent: 'codex' }));
  }
  workspace.style.flex = '0 0 390px';
  workspace.style.width = '390px';
  await tick();
  tabs.focus(sameCwd[sameCwd.length - 1]);
  await tick();
  expect(document.querySelector('#group-tab-list').scrollWidth > document.querySelector('#group-tab-list').clientWidth,
    'upper group strip must overflow horizontally');
  expect(document.querySelector('#group-session-list').scrollWidth > document.querySelector('#group-session-list').clientWidth,
    'lower session strip must overflow horizontally');
  expect(document.querySelector('#group-tab-list').scrollLeft > 0,
    'activating a far group must scroll its upper tab into view');
  expect(document.querySelector('#group-session-list').scrollLeft > 0,
    'activating a far session must scroll its lower tab into view');

  groups.setEnabled(false);
  expect(document.querySelector('#group-tab-list').classList.contains('hidden')
    && !document.querySelector('#tab-list').classList.contains('hidden'),
  'disabling grouping must restore the unchanged flat strip');

  return JSON.stringify({ ok: true });
})()
`);

const electronCli = path.join(appDir, 'node_modules', '.bin', 'electron');
const child = spawn(process.execPath, [electronCli, '.', '--smoke'], {
  cwd: appDir,
  env: {
    ...process.env,
    HOME: homeDir,
    PATH: '/usr/bin:/bin',
    CHROMUX_E2E: e2ePath,
    CHROMUX_E2E_OUT: e2eOutPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
const timeout = setTimeout(() => child.kill('SIGTERM'), 40000);
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const output = fs.existsSync(e2eOutPath) ? fs.readFileSync(e2eOutPath, 'utf8') : '';
  let report = null;
  try { report = JSON.parse(output); } catch { /* reported below */ }
  if (code !== 0 || signal || !report || report.ok !== true) {
    console.error('SESSION_TAB_GROUPS_RENDERER_FAIL');
    console.error({ code, signal, output, stdout, stderr });
    process.exit(1);
  }
  console.log('SESSION_TAB_GROUPS_RENDERER_OK');
});
