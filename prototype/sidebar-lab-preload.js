'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sidebarLab', Object.freeze({
  config: () => ipcRenderer.invoke('sidebar-lab-config'),
  exportReport: (report) => ipcRenderer.invoke('sidebar-lab-export', report),
  smokeResult: (result) => ipcRenderer.invoke('sidebar-lab-smoke-result', result),
}));
