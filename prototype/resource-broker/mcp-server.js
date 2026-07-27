#!/usr/bin/env node
'use strict';

const readline = require('readline');
const os = require('os');
const path = require('path');
const { BrokerClient } = require('./client');
const { CaptureArtifactStore } = require('../capture/artifact-store');
const { CaptureControlClient } = require('../capture/control');

const caller = {
  clientId: process.env.CHROMUX_SESSION_ID
    ? `chromux:${process.env.CHROMUX_SESSION_ID}:${process.pid}`
    : `external:${process.ppid}:${process.pid}`,
  sessionId: process.env.CHROMUX_SESSION_ID || null,
  displayName: process.env.CHROMUX_CLIENT_NAME || `External Codex (${process.ppid})`,
  pid: process.ppid,
  cooperative: true,
};
const client = new BrokerClient({ client: caller });
const captureClient = new CaptureControlClient({ caller });
const chromuxHome = process.env.CHROMUX_HOME_DIR || path.join(os.homedir(), '.chromux');
const captureArtifacts = new CaptureArtifactStore({ root: path.join(chromuxHome, 'captures') });

const tools = [
  ['chromux_resources_list', 'List host resources, owners, leases, queues, wait times, and simulator capacity.', {}],
  ['chromux_resources_acquire', 'Atomically acquire exclusive resources or enter their FIFO queues.', { resources: { type: 'array', items: { type: 'string' } }, ttlMs: { type: 'number' }, operationPid: { type: 'number' }, wait: { type: 'boolean' } }],
  ['chromux_request_wait', 'Check a queued request for automatic handoff.', { requestId: { type: 'string' } }],
  ['chromux_request_cancel', 'Cancel a queued resource request.', { requestId: { type: 'string' } }],
  ['chromux_lease_renew', 'Renew a lease TTL while work is active.', { leaseId: { type: 'string' }, ttlMs: { type: 'number' } }],
  ['chromux_lease_release', 'Release a completed resource lease.', { leaseId: { type: 'string' } }],
  ['chromux_simulator_execute', 'Execute a supported simctl operation after validating the simulator lease.', { leaseId: { type: 'string' }, udid: { type: 'string' }, action: { type: 'string', enum: ['boot', 'shutdown', 'install', 'launch', 'terminate', 'erase'] }, args: { type: 'array', items: { type: 'string' } } }],
  ['chromux_client_rename', 'Set the editable broker display name for this external session.', { displayName: { type: 'string' } }],
  ['chromux_capture_targets_list', 'List active Chromux window and paired-browser capture targets without exposing page URLs.', {}],
  ['chromux_capture_screenshot', 'Request one-time in-app approval, then capture a paired browser evidence bundle or the Chromux window.', { targetId: { type: 'string', minLength: 1, maxLength: 256 } }],
  ['chromux_record_start', 'Request one-time in-app approval, then start a bounded Chromux-window recording.', { targetId: { type: 'string', minLength: 1, maxLength: 256 } }],
  ['chromux_record_stop', 'Stop a recording owned by this MCP client and return its completed artifact.', { recordingId: { type: 'string', pattern: '^recording-[0-9]{8}t[0-9]{6}-[a-f0-9]{12}$' } }],
].map(([name, description, properties]) => ({
  name,
  description,
  inputSchema: { type: 'object', properties, required: Object.keys(properties).filter((key) => !['ttlMs', 'operationPid', 'wait', 'args'].includes(key)), additionalProperties: false },
  annotations: {
    openWorldHint: false,
    destructiveHint: name === 'chromux_simulator_execute',
    readOnlyHint: name === 'chromux_resources_list' || name === 'chromux_capture_targets_list',
  },
}));

const routes = {
  chromux_resources_list: ['resources.list', () => ({})],
  chromux_resources_acquire: ['resources.acquire', (args) => args],
  chromux_request_wait: ['request.wait', (args) => args],
  chromux_request_cancel: ['request.cancel', (args) => args],
  chromux_lease_renew: ['lease.renew', (args) => args],
  chromux_lease_release: ['lease.release', (args) => args],
  chromux_simulator_execute: ['simulator.execute', (args) => args],
  chromux_client_rename: ['client.rename', (args) => args],
};

const captureRoutes = {
  chromux_capture_targets_list: ['targets.list', () => ({})],
  chromux_capture_screenshot: ['capture.screenshot', (args) => args],
  chromux_record_start: ['record.start', (args) => args],
  chromux_record_stop: ['record.stop', (args) => args],
};

function resourceContent(link) {
  return {
    type: 'resource_link',
    uri: link.uri,
    name: link.name,
    mimeType: link.mimeType,
    description: link.description,
  };
}

function captureToolResult(name, value) {
  const content = [{ type: 'text', text: JSON.stringify(value, null, 2) }];
  for (const link of value.resources || []) content.push(resourceContent(link));
  const imageName = name === 'chromux_capture_screenshot'
    ? 'screenshot.png'
    : (name === 'chromux_record_stop' ? 'contact-sheet.png' : null);
  const imageLink = imageName && (value.resources || []).find((link) => link.name === imageName);
  if (imageLink) {
    const image = captureArtifacts.readResource(imageLink.uri, { maxBytes: 8 * 1024 * 1024 });
    content.push({ type: 'image', data: image.bytes.toString('base64'), mimeType: image.mimeType });
  }
  return { content, structuredContent: value };
}

async function handle(message) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: '2025-06-18',
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
      },
      serverInfo: { name: 'chromux-resource-broker', version: '0.65.0' },
    };
  }
  if (message.method === 'tools/list') return { tools };
  if (message.method === 'resources/list') return { resources: [] };
  if (message.method === 'resources/read') {
    const resource = captureArtifacts.readResource(message.params?.uri);
    const textual = resource.mimeType.startsWith('text/')
      || ['application/json', 'application/yaml', 'application/x-yaml'].includes(resource.mimeType);
    return {
      contents: [{
        uri: resource.uri,
        mimeType: resource.mimeType,
        ...(textual
          ? { text: resource.bytes.toString('utf8') }
          : { blob: resource.bytes.toString('base64') }),
      }],
    };
  }
  if (message.method === 'tools/call') {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    const route = routes[name];
    if (route) {
      const value = await client.request(route[0], route[1](args));
      return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
    }
    const captureRoute = captureRoutes[name];
    if (!captureRoute) throw new Error('unknown tool');
    const value = await captureClient.request(captureRoute[0], captureRoute[1](args), {
      timeoutMs: name === 'chromux_record_start' ? 90_000 : 45_000,
    });
    return captureToolResult(name, value);
  }
  return {};
}

function start() {
  const input = readline.createInterface({ input: process.stdin, terminal: false });
  input.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id === undefined) return;
    handle(message).then((result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`))
      .catch((error) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: error.message } })}\n`));
  });
  function shutdown() {
    client.close();
    captureClient.close();
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('exit', () => {
    client.close();
    captureClient.close();
  });
}

if (require.main === module) start();

module.exports = { captureToolResult, handle, start, tools };
