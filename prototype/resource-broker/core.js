'use strict';

const crypto = require('crypto');

const DEFAULT_TTL_MS = 120000;
const MAX_TTL_MS = 10 * 60 * 1000;

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function cleanResources(resources) {
  if (!Array.isArray(resources) || resources.length === 0) throw new Error('resources must be a non-empty array');
  const result = [...new Set(resources.map((item) => String(item || '').trim()).filter(Boolean))].sort();
  if (!result.length || result.some((item) => item.length > 200 || !/^[a-z0-9][a-z0-9:._-]*$/i.test(item))) {
    throw new Error('invalid resource id');
  }
  return result;
}

class ResourceBroker {
  constructor({ now = () => Date.now(), recovered = [] } = {}) {
    this.now = now;
    this.clients = new Map();
    this.resources = new Map();
    this.leases = new Map();
    this.requests = [];
    this.sequence = 0;
    this.recovered = recovered;
  }

  registerClient({ clientId, displayName, sessionId = null, pid = null, cooperative = true } = {}) {
    const resolvedId = String(clientId || id('client'));
    const previous = this.clients.get(resolvedId);
    const client = {
      id: resolvedId,
      displayName: String(displayName || previous?.displayName || `Process ${pid || process.pid}`).slice(0, 100),
      sessionId: sessionId ? String(sessionId).slice(0, 200) : null,
      pid: Number.isInteger(pid) ? pid : null,
      cooperative: cooperative !== false,
      connectedAt: previous?.connectedAt || this.now(),
    };
    this.clients.set(resolvedId, client);
    return client;
  }

  renameClient(clientId, displayName) {
    const client = this.requireClient(clientId);
    client.displayName = String(displayName || '').trim().slice(0, 100) || client.displayName;
    return client;
  }

  requireClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) throw new Error('unknown client');
    return client;
  }

  registerResource(resourceId, details = {}) {
    const [resolved] = cleanResources([resourceId]);
    const previous = this.resources.get(resolved) || {};
    const { id: _ignoredId, ...safeDetails } = details && typeof details === 'object' ? details : {};
    const resource = { ...previous, ...safeDetails, id: resolved, kind: safeDetails.kind || previous.kind || resolved.split(':')[0] };
    this.resources.set(resolved, resource);
    return resource;
  }

  acquire({ clientId, resources, ttlMs = DEFAULT_TTL_MS, operationPid = null, wait = true } = {}) {
    this.requireClient(clientId);
    const resourceIds = cleanResources(resources);
    for (const resourceId of resourceIds) this.registerResource(resourceId);
    const request = {
      id: id('request'), clientId, resources: resourceIds,
      ttlMs: Math.max(1000, Math.min(MAX_TTL_MS, Number(ttlMs) || DEFAULT_TTL_MS)),
      operationPid: Number.isInteger(operationPid) ? operationPid : null,
      queuedAt: this.now(), sequence: this.sequence++, status: 'queued',
    };
    this.requests.push(request);
    if (this.requests.length > 5000) {
      const cutoff = this.now() - 10 * 60 * 1000;
      this.requests = this.requests.filter((item) => item.status === 'queued' || (item.grantedAt || item.cancelledAt || item.queuedAt) >= cutoff);
    }
    this.processQueue();
    if (request.status === 'queued' && wait === false) {
      this.cancel(request.id, clientId);
      return { status: 'busy', requestId: request.id };
    }
    return this.requestResult(request);
  }

  requestResult(request) {
    if (request.status === 'granted') return { status: 'granted', requestId: request.id, lease: this.leases.get(request.leaseId) };
    return { status: request.status, requestId: request.id, position: this.queuePosition(request.id) };
  }

  queuePosition(requestId) {
    const queued = this.requests.filter((item) => item.status === 'queued');
    const index = queued.findIndex((item) => item.id === requestId);
    return index === -1 ? null : index + 1;
  }

  conflicts(resourceIds, lease) {
    return lease.resources.some((resourceId) => resourceIds.includes(resourceId));
  }

  processQueue() {
    this.expire();
    for (const request of this.requests.filter((item) => item.status === 'queued').sort((a, b) => a.sequence - b.sequence)) {
      const blockedByLease = [...this.leases.values()].some((lease) => this.conflicts(request.resources, lease));
      const blockedByEarlier = this.requests.some((earlier) => earlier.status === 'queued'
        && earlier.sequence < request.sequence && earlier.resources.some((resourceId) => request.resources.includes(resourceId)));
      if (blockedByLease || blockedByEarlier) continue;
      const acquiredAt = this.now();
      const lease = {
        id: id('lease'), owner: request.clientId, resources: request.resources,
        acquiredAt, expiresAt: acquiredAt + request.ttlMs, operationPid: request.operationPid,
      };
      this.leases.set(lease.id, lease);
      request.status = 'granted';
      request.leaseId = lease.id;
      request.grantedAt = acquiredAt;
    }
  }

  wait(requestId, clientId) {
    this.expire();
    const request = this.requests.find((item) => item.id === requestId);
    if (!request || request.clientId !== clientId) throw new Error('unknown request');
    return this.requestResult(request);
  }

  cancel(requestId, clientId, force = false) {
    const request = this.requests.find((item) => item.id === requestId);
    if (!request || (!force && request.clientId !== clientId)) throw new Error('unknown request');
    if (request.status !== 'queued') return this.requestResult(request);
    request.status = 'cancelled';
    request.cancelledAt = this.now();
    this.processQueue();
    return { status: 'cancelled', requestId };
  }

  renew(leaseId, clientId, ttlMs = DEFAULT_TTL_MS) {
    this.expire();
    const lease = this.leases.get(leaseId);
    if (!lease || lease.owner !== clientId) throw new Error('unknown lease');
    lease.expiresAt = this.now() + Math.max(1000, Math.min(MAX_TTL_MS, Number(ttlMs) || DEFAULT_TTL_MS));
    return lease;
  }

  release(leaseId, clientId, force = false) {
    const lease = this.leases.get(leaseId);
    if (!lease || (!force && lease.owner !== clientId)) throw new Error('unknown lease');
    this.leases.delete(leaseId);
    this.processQueue();
    return { released: leaseId };
  }

  disconnect(clientId) {
    for (const request of this.requests) {
      if (request.clientId === clientId && request.status === 'queued') request.status = 'cancelled';
    }
    for (const [leaseId, lease] of this.leases) {
      if (lease.owner === clientId) this.leases.delete(leaseId);
    }
    this.clients.delete(clientId);
    this.processQueue();
  }

  expire() {
    const now = this.now();
    let changed = false;
    for (const [leaseId, lease] of this.leases) {
      if (lease.expiresAt <= now) {
        this.leases.delete(leaseId);
        changed = true;
      }
    }
    if (changed) this.processQueue();
  }

  assertLease(leaseId, clientId, resources) {
    this.expire();
    const lease = this.leases.get(leaseId);
    const needed = cleanResources(resources);
    if (!lease || lease.owner !== clientId || !needed.every((item) => lease.resources.includes(item))) {
      throw new Error('valid lease required');
    }
    return lease;
  }

  snapshot() {
    this.expire();
    const clients = Object.fromEntries(this.clients);
    const owner = (clientId) => clients[clientId] || { id: clientId, displayName: 'Disconnected client', cooperative: false };
    const resources = [...this.resources.values()].map((resource) => {
      const lease = [...this.leases.values()].find((item) => item.resources.includes(resource.id));
      const queue = this.requests.filter((item) => item.status === 'queued' && item.resources.includes(resource.id));
      return { ...resource, lease: lease ? { ...lease, owner: owner(lease.owner) } : null,
        queue: queue.map((item) => ({ ...item, owner: owner(item.clientId), waitMs: this.now() - item.queuedAt })) };
    });
    return { now: this.now(), clients: Object.values(clients), resources, leases: [...this.leases.values()], recovered: this.recovered };
  }
}

module.exports = { ResourceBroker, DEFAULT_TTL_MS, cleanResources };
