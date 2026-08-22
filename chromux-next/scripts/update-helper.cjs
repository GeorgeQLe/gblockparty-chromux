'use strict';

const path = require('node:path');
const { applyUpdate } = require('./update-helper-core.cjs');

const [, , pidText, current, staged, marker] = process.argv;
const pid = Number(pidText);
if (!Number.isInteger(pid) || pid <= 0 || !current?.endsWith('.app') || !staged?.endsWith('.app') || !path.isAbsolute(current) || !path.isAbsolute(staged) || !path.isAbsolute(marker)) process.exit(2);
try { applyUpdate({ pid, current, staged, marker }); } catch { process.exit(1); }
