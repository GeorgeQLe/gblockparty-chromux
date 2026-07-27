'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('activityLab', {
  info: () => ipcRenderer.invoke('activity-lab-info'),
  run: (input) => ipcRenderer.invoke('activity-lab-run', input),
  cancel: (id) => ipcRenderer.invoke('activity-lab-cancel', id),
  exportReport: (report) => ipcRenderer.invoke('activity-lab-export', report),
  onTrace: (callback) => ipcRenderer.on('activity-lab-trace', (_event, row) => callback(row)),
  onFinished: (callback) => ipcRenderer.on('activity-lab-run-finished', (_event, row) => callback(row)),
  smokeResult: (result) => ipcRenderer.invoke('activity-lab-smoke-result', result),
});
