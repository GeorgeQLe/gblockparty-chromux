// Chromux v1 — guest-page preload for browser panes.
// Exposes exactly one capability: reporting element-picker results to the host.
// Also reports focused-editable state so shell shortcuts can keep host guards.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function deepActiveElement() {
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}

function isEditableElement(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

let lastEditable = null;

function reportFocusedEditable() {
  const editable = isEditableElement(deepActiveElement());
  if (editable === lastEditable) return;
  lastEditable = editable;
  ipcRenderer.sendToHost('chromux-focused-editable', { editable });
}

function scheduleFocusedEditableReport() {
  setTimeout(reportFocusedEditable, 0);
}

addEventListener('focusin', scheduleFocusedEditableReport, true);
addEventListener('focusout', scheduleFocusedEditableReport, true);
addEventListener('pageshow', scheduleFocusedEditableReport, true);
setInterval(reportFocusedEditable, 250);

if (document.readyState === 'loading') {
  addEventListener('DOMContentLoaded', reportFocusedEditable, { once: true });
} else {
  reportFocusedEditable();
}

contextBridge.exposeInMainWorld('__chromux', {
  report: (channel, data) => {
    if (channel === 'chromux-pick' || channel === 'chromux-pick-cancel') {
      ipcRenderer.sendToHost(channel, data);
    }
  },
});
