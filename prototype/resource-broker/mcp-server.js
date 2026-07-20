#!/usr/bin/env node
'use strict';

const readline = require('readline');
const { BrokerClient } = require('./client');

const client = new BrokerClient({ client: {
  clientId: process.env.CHROMUX_SESSION_ID
    ? `chromux:${process.env.CHROMUX_SESSION_ID}:${process.pid}`
    : `external:${process.ppid}:${process.pid}`,
  sessionId: process.env.CHROMUX_SESSION_ID || null,
  displayName: process.env.CHROMUX_CLIENT_NAME || `External Codex (${process.ppid})`,
  pid: process.ppid,
  cooperative: true,
} });

const tools = [
  ['chromux_resources_list', 'List host resources, owners, leases, queues, wait times, and simulator capacity.', {}],
  ['chromux_resources_acquire', 'Atomically acquire exclusive resources or enter their FIFO queues.', { resources: { type: 'array', items: { type: 'string' } }, ttlMs: { type: 'number' }, operationPid: { type: 'number' }, wait: { type: 'boolean' } }],
  ['chromux_request_wait', 'Check a queued request for automatic handoff.', { requestId: { type: 'string' } }],
  ['chromux_request_cancel', 'Cancel a queued resource request.', { requestId: { type: 'string' } }],
  ['chromux_lease_renew', 'Renew a lease TTL while work is active.', { leaseId: { type: 'string' }, ttlMs: { type: 'number' } }],
  ['chromux_lease_release', 'Release a completed resource lease.', { leaseId: { type: 'string' } }],
  ['chromux_simulator_execute', 'Execute a supported simctl operation after validating the simulator lease.', { leaseId: { type: 'string' }, udid: { type: 'string' }, action: { type: 'string', enum: ['boot', 'shutdown', 'install', 'launch', 'terminate', 'erase'] }, args: { type: 'array', items: { type: 'string' } } }],
  ['chromux_client_rename', 'Set the editable broker display name for this external session.', { displayName: { type: 'string' } }],
].map(([name, description, properties]) => ({
  name,
  description,
  inputSchema: { type: 'object', properties, required: Object.keys(properties).filter((key) => !['ttlMs', 'operationPid', 'wait', 'args'].includes(key)), additionalProperties: false },
  annotations: { openWorldHint: false, destructiveHint: name === 'chromux_simulator_execute' },
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

async function handle(message) {
  if (message.method === 'initialize') return { protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'chromux-resource-broker', version: '0.33.0' } };
  if (message.method === 'tools/list') return { tools };
  if (message.method === 'tools/call') {
    const route = routes[message.params?.name];
    if (!route) throw new Error('unknown tool');
    const value = await client.request(route[0], route[1](message.params.arguments || {}));
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
  }
  return {};
}

const input = readline.createInterface({ input: process.stdin, terminal: false });
input.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id === undefined) return;
  handle(message).then((result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`))
    .catch((error) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: error.message } })}\n`));
});
function shutdown() { client.close(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('exit', () => client.close());
