'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
assert(html.includes('id="btn-resources"'));
assert(html.includes('id="resource-list"'));
assert(renderer.includes('persist:chromux-${session.browser.partitionId}'), 'paired webviews use unique session-specific persistent partitions');
assert(renderer.includes('resourcesForceRelease'));
assert(renderer.includes('resourcesCancel'));
assert(preload.includes("ipcRenderer.invoke('resources-list')"));
assert(html.includes('Sessions that bypass the broker cannot be intercepted'));
assert(html.includes('Prefer Codex Browser'));

console.log('resource UI renderer contract tests: ok');
