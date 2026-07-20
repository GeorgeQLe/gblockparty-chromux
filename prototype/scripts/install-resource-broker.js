#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const prototypeDir = path.resolve(__dirname, '..');
const home = os.homedir();
const chromuxHome = path.join(home, '.chromux');
const agentsPath = path.join(home, '.codex', 'AGENTS.md');
const launchAgents = path.join(home, 'Library', 'LaunchAgents');
const plistPath = path.join(launchAgents, 'dev.georgele.chromux-resource-broker.plist');
const instructionSource = path.join(prototypeDir, 'resources', 'codex-global-instructions.md');
const marker = '## Chromux host resources';

fs.mkdirSync(chromuxHome, { recursive: true, mode: 0o700 });
fs.mkdirSync(path.dirname(agentsPath), { recursive: true });
fs.mkdirSync(launchAgents, { recursive: true });

const existing = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
if (!existing.includes(marker)) {
  const guidance = fs.readFileSync(instructionSource, 'utf8').trim();
  fs.appendFileSync(agentsPath, `${existing.trim() ? '\n\n' : ''}${guidance}\n`);
}

const escapeXml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const daemonPath = path.join(prototypeDir, 'resource-broker', 'daemon.js');
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.georgele.chromux-resource-broker</string>
  <key>ProgramArguments</key><array><string>${escapeXml(process.execPath)}</string><string>${escapeXml(daemonPath)}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${escapeXml(path.join(chromuxHome, 'resource-broker.log'))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(path.join(chromuxHome, 'resource-broker.log'))}</string>
</dict></plist>\n`;
fs.writeFileSync(plistPath, plist, { mode: 0o600 });

console.log(`Installed global Codex guidance: ${agentsPath}`);
console.log(`Installed LaunchAgent: ${plistPath}`);
console.log('Load it now with: launchctl bootstrap gui/$(id -u) ' + JSON.stringify(plistPath));
console.log('Register MCP with: codex mcp add chromux -- node ' + JSON.stringify(path.join(prototypeDir, 'resource-broker', 'mcp-server.js')));
