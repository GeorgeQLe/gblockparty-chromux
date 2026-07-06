'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const home = path.join(os.homedir(), '.chromux');
const manifest = {
  sourceDir: root,
  installedAt: new Date().toISOString(),
};

fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(path.join(home, 'update-source.json'), JSON.stringify(manifest, null, 2) + '\n');
