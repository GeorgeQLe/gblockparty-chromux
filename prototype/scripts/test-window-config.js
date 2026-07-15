'use strict';

const fs = require('fs');
const path = require('path');

const mainPath = path.resolve(__dirname, '..', 'main.js');
const source = fs.readFileSync(mainPath, 'utf8');
const windowOptions = source.match(/new BrowserWindow\(\{([\s\S]*?)\n  \}\);/);

if (!windowOptions) throw new Error('Could not locate Chromux BrowserWindow options');
if (!/\bacceptFirstMouse:\s*true\b/.test(windowOptions[1])) {
  throw new Error('Chromux must accept the first click while its macOS window is inactive');
}

console.log(JSON.stringify({ ok: true, acceptFirstMouse: true }));
