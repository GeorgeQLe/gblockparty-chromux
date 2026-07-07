// Chromux v1 — main-window preload. Narrow, explicit bridge; no node in the page.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const yaml = require('js-yaml');

contextBridge.exposeInMainWorld('chromux', {
  // pty
  ptyCreate: (opts) => ipcRenderer.invoke('pty-create', opts),
  ptyInput: (id, data) => ipcRenderer.send('pty-input', { id, data }),
  ptyResize: (id, cols, rows) => ipcRenderer.send('pty-resize', { id, cols, rows }),
  ptyKill: (id) => ipcRenderer.send('pty-kill', { id }),
  onPtyData: (cb) => ipcRenderer.on('pty-data', (_e, m) => cb(m)),
  onPtyExit: (cb) => ipcRenderer.on('pty-exit', (_e, m) => cb(m)),

  // capture + delivery
  capturePrepare: (payload, pngBase64) => ipcRenderer.invoke('capture-prepare', { payload, pngBase64 }),
  deliverClaude: (opts) => ipcRenderer.invoke('deliver-claude', opts),
  deliverCancel: (deliveryId) => ipcRenderer.send('deliver-cancel', { deliveryId }),
  onDeliverOutput: (cb) => ipcRenderer.on('deliver-output', (_e, m) => cb(m)),
  onDeliverClose: (cb) => ipcRenderer.on('deliver-close', (_e, m) => cb(m)),
  logFiledrop: (opts) => ipcRenderer.send('log-filedrop', opts),
  readDeliveryLog: () => ipcRenderer.invoke('read-delivery-log'),

  // popups intercepted in main → review queue
  onWebviewPopup: (cb) => ipcRenderer.on('webview-popup', (_e, m) => cb(m)),

  // external terminal/agent-session detection
  detectExternal: () => ipcRenderer.invoke('detect-external'),

  // utilities
  toYaml: (obj) => yaml.dump(obj, { lineWidth: 120, noRefs: true }),
  fileExists: (p) => ipcRenderer.invoke('file-exists', p),
  pickDirectory: () => ipcRenderer.invoke('pick-directory'),
  revealPath: (p) => ipcRenderer.send('reveal-path', { p }),
  getEnv: () => ipcRenderer.invoke('get-env'),
  checkUpdates: (opts) => ipcRenderer.invoke('check-updates', opts || {}),
  openUpdateRelease: (opts) => ipcRenderer.invoke('open-update-release', opts || {}),
  installUpdate: (opts) => ipcRenderer.invoke('install-update', opts || {}),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, m) => cb(m)),
  saveRestoreSnapshot: (opts) => ipcRenderer.invoke('save-restore-snapshot', opts || {}),
  getRestoreSnapshot: () => ipcRenderer.invoke('get-restore-snapshot'),
  markRestoreSnapshotConsumed: (opts) => ipcRenderer.invoke('mark-restore-snapshot-consumed', opts || {}),
  resolveRestoreSessions: (opts) => ipcRenderer.invoke('resolve-restore-sessions', opts || {}),
  confirmAppClose: (opts) => ipcRenderer.invoke('confirm-app-close', opts || {}),
  onLifecycleConfirmClose: (cb) => ipcRenderer.on('lifecycle-confirm-close', (_e, m) => cb(m)),
  onShortcutActivateSessionIndex: (cb) => ipcRenderer.on('shortcut-activate-session-index', (_e, m) => cb(m)),
  onShortcutFocusNextQueueItem: (cb) => ipcRenderer.on('shortcut-focus-next-queue-item', () => cb()),
  webviewPreloadPath: 'file://' + path.join(__dirname, 'webview-preload.js'),
});

if (process.env.CHROMUX_E2E) {
  contextBridge.exposeInMainWorld('chromuxTest', {});
}
