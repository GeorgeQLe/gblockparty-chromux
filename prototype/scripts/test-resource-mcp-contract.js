'use strict';

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');

const child = spawn(process.execPath, [path.join(__dirname, '..', 'resource-broker', 'mcp-server.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
let output = '';
let errorOutput = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
  const lines = output.trim().split('\n');
  if (lines.length < 2) return;
  const responses = lines.slice(0, 2).map(JSON.parse);
  const initialize = responses.find((response) => response.id === 1);
  const listed = responses.find((response) => response.id === 2);
  assert.equal(initialize.result.serverInfo.name, 'chromux-resource-broker');
  assert.equal(initialize.result.serverInfo.version, '0.33.0');
  const names = listed.result.tools.map((tool) => tool.name);
  for (const expected of ['chromux_resources_list', 'chromux_resources_acquire', 'chromux_request_wait', 'chromux_request_cancel', 'chromux_lease_renew', 'chromux_lease_release', 'chromux_simulator_execute', 'chromux_client_rename']) {
    assert(names.includes(expected), `missing ${expected}`);
  }
  child.kill('SIGTERM');
});
child.stderr.on('data', (chunk) => { errorOutput += chunk; });
const timeout = setTimeout(() => {
  console.error(`MCP contract timed out: ${errorOutput}`);
  child.kill('SIGKILL');
  process.exitCode = 1;
}, 5000);
child.on('exit', () => {
  clearTimeout(timeout);
  if (!process.exitCode) console.log('resource MCP contract tests: ok');
});
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
