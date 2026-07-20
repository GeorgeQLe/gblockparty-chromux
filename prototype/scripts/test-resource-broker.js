'use strict';

const assert = require('assert');
const { ResourceBroker } = require('../resource-broker/core');
const { brokerSocketPath } = require('../resource-broker/paths');
assert(brokerSocketPath('/a'.repeat(100)).startsWith('/tmp/chromux-rb-'), 'long Unix socket paths use a bounded fallback');

let now = 1000;
const broker = new ResourceBroker({ now: () => now });
broker.registerClient({ clientId: 'a', displayName: 'Agent A', pid: 10 });
broker.registerClient({ clientId: 'b', displayName: 'Agent B', pid: 20 });
broker.registerClient({ clientId: 'c', displayName: 'Agent C', pid: 30 });

const first = broker.acquire({ clientId: 'a', resources: ['macos:foreground-input'], ttlMs: 5000 });
assert.equal(first.status, 'granted');
assert.throws(() => broker.assertLease(first.lease.id, 'b', ['macos:foreground-input']), /valid lease required/);
assert.equal(broker.assertLease(first.lease.id, 'a', ['macos:foreground-input']).id, first.lease.id);
const second = broker.acquire({ clientId: 'b', resources: ['macos:foreground-input', 'ios-simulator:AAAA-BBBB'], ttlMs: 5000 });
const third = broker.acquire({ clientId: 'c', resources: ['macos:foreground-input'], ttlMs: 5000 });
assert.equal(second.status, 'queued');
assert.equal(third.position, 2, 'conflicting requests retain FIFO order');
assert.equal(broker.snapshot().leases.length, 1, 'multi-resource request is not partially granted');

const independent = broker.acquire({ clientId: 'c', resources: ['ios-simulator:CCCC-DDDD'], ttlMs: 5000 });
assert.equal(independent.status, 'granted', 'disjoint resource can proceed without violating per-resource FIFO');

broker.release(first.lease.id, 'a');
assert.equal(broker.wait(second.requestId, 'b').status, 'granted', 'queue head receives automatic handoff');
assert.equal(broker.wait(third.requestId, 'c').status, 'queued');
broker.cancel(third.requestId, 'c');
assert.equal(broker.wait(third.requestId, 'c').status, 'cancelled');

const renewed = broker.renew(second.requestId ? broker.wait(second.requestId, 'b').lease.id : '', 'b', 9000);
assert.equal(renewed.expiresAt, now + 9000);
now += 9001;
broker.expire();
assert(!broker.snapshot().leases.some((lease) => lease.owner === 'b'), 'expired lease recovers automatically');

const disconnectLease = broker.acquire({ clientId: 'a', resources: ['macos:foreground-input'] });
const disconnectWait = broker.acquire({ clientId: 'b', resources: ['macos:foreground-input'] });
assert.equal(disconnectWait.status, 'queued');
broker.disconnect('a');
assert.equal(broker.wait(disconnectWait.requestId, 'b').status, 'granted', 'disconnect releases and hands off');
assert(!broker.snapshot().clients.some((client) => client.id === 'a'));

const recovered = new ResourceBroker({ recovered: [{ id: 'old', resources: ['macos:foreground-input'] }] });
assert.equal(recovered.snapshot().leases.length, 0, 'restart never resurrects unverifiable leases');
assert.equal(recovered.snapshot().recovered[0].id, 'old', 'restart reconciliation remains auditable');

console.log('resource broker unit tests: ok');
