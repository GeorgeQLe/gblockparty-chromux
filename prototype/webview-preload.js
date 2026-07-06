// Chromux v1 — guest-page preload for browser panes.
// Exposes exactly one capability: reporting element-picker results to the host.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__chromux', {
  report: (channel, data) => {
    if (channel === 'chromux-pick' || channel === 'chromux-pick-cancel') {
      ipcRenderer.sendToHost(channel, data);
    }
  },
});
