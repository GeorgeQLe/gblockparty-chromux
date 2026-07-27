'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { CaptureArtifactStore } = require('../capture/artifact-store');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromux-mcp-contract-'));
const chromuxHome = path.join(tmpDir, 'home');
const store = new CaptureArtifactStore({ root: path.join(chromuxHome, 'captures') });
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
const artifact = store.createScreenshot({
  kind: 'browser-screenshot',
  png,
  payload: {
    schema_version: 1,
    page: { url: 'http://localhost:3000/private-until-approved' },
    screenshot: { path: '(assigned on save)', mode: 'visible-viewport' },
  },
});
const screenshotLink = artifact.resources.find((resource) => resource.name === 'screenshot.png');
const payloadLink = artifact.resources.find((resource) => resource.name === 'payload.yaml');

process.env.CHROMUX_HOME_DIR = chromuxHome;
delete require.cache[require.resolve('../resource-broker/mcp-server')];
const { captureToolResult } = require('../resource-broker/mcp-server');
const directResult = captureToolResult('chromux_capture_screenshot', {
  ok: true,
  artifactId: artifact.artifactId,
  resources: artifact.resources,
});
assert.equal(directResult.structuredContent.artifactId, artifact.artifactId);
assert(directResult.content.some((entry) => entry.type === 'resource_link' && entry.uri === screenshotLink.uri));
assert(directResult.content.some((entry) => entry.type === 'image'
  && entry.mimeType === 'image/png'
  && entry.data === png.toString('base64')));

const child = spawn(process.execPath, [path.join(__dirname, '..', 'resource-broker', 'mcp-server.js')], {
  env: { ...process.env, CHROMUX_HOME_DIR: chromuxHome },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let output = '';
let errorOutput = '';
let finished = false;
child.stdout.on('data', (chunk) => {
  output += chunk;
  const lines = output.trim().split('\n').filter(Boolean);
  if (lines.length < 5 || finished) return;
  finished = true;
  try {
    const responses = lines.slice(0, 5).map(JSON.parse);
    const initialize = responses.find((response) => response.id === 1);
    const listed = responses.find((response) => response.id === 2);
    const imageRead = responses.find((response) => response.id === 3);
    const yamlRead = responses.find((response) => response.id === 4);
    const unavailable = responses.find((response) => response.id === 5);

    assert.equal(initialize.result.serverInfo.name, 'chromux-resource-broker');
    assert.equal(initialize.result.serverInfo.version, '0.65.0');
    assert.deepEqual(initialize.result.capabilities.resources, { subscribe: false, listChanged: false });
    const names = listed.result.tools.map((tool) => tool.name);
    for (const expected of [
      'chromux_resources_list',
      'chromux_resources_acquire',
      'chromux_request_wait',
      'chromux_request_cancel',
      'chromux_lease_renew',
      'chromux_lease_release',
      'chromux_simulator_execute',
      'chromux_client_rename',
      'chromux_capture_targets_list',
      'chromux_capture_screenshot',
      'chromux_record_start',
      'chromux_record_stop',
    ]) {
      assert(names.includes(expected), `missing ${expected}`);
    }
    const captureScreenshot = listed.result.tools.find((tool) => tool.name === 'chromux_capture_screenshot');
    assert.deepEqual(captureScreenshot.inputSchema.required, ['targetId']);
    assert.equal(captureScreenshot.inputSchema.properties.targetId.maxLength, 256);
    assert.equal(captureScreenshot.annotations.readOnlyHint, false);
    assert.equal(
      listed.result.tools.find((tool) => tool.name === 'chromux_record_stop')
        .inputSchema.properties.recordingId.pattern,
      '^recording-[0-9]{8}t[0-9]{6}-[a-f0-9]{12}$',
    );
    assert.equal(
      listed.result.tools.find((tool) => tool.name === 'chromux_capture_targets_list').annotations.readOnlyHint,
      true,
    );

    assert.equal(imageRead.result.contents[0].mimeType, 'image/png');
    assert.equal(imageRead.result.contents[0].blob, png.toString('base64'));
    assert.equal(yamlRead.result.contents[0].mimeType, 'application/yaml');
    assert(yamlRead.result.contents[0].text.includes(`chromux://capture/${artifact.artifactId}/screenshot.png`));
    assert(unavailable.error.message.includes('Chromux is not running'));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
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
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: screenshotLink.uri } })}\n`);
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: payloadLink.uri } })}\n`);
child.stdin.write(`${JSON.stringify({
  jsonrpc: '2.0',
  id: 5,
  method: 'tools/call',
  params: { name: 'chromux_capture_targets_list', arguments: {} },
})}\n`);
