'use strict';

const assert = require('assert');
const { automaticSimulatorLimit, simulatorAdmission, simulatorDrainCandidates } = require('../resource-broker/policy');

const gib = 1024 ** 3;
assert.equal(automaticSimulatorLimit(16 * gib), 1);
assert.equal(automaticSimulatorLimit(32 * gib), 2);
assert.equal(automaticSimulatorLimit(64 * gib), 3);

const healthy = { totalMemoryBytes: 64 * gib, freeMemoryBytes: 24 * gib, normalizedLoad: 0.2, swapGrowthBytes: 0, thermalState: 'nominal' };
assert.equal(simulatorAdmission(healthy, { booted: 2 }).admit, true);
assert.equal(simulatorAdmission(healthy, { booted: 3 }).admit, false);
assert.equal(simulatorAdmission({ ...healthy, freeMemoryBytes: 8 * gib }, { booted: 1 }).signals.memory, false);
assert.equal(simulatorAdmission({ ...healthy, normalizedLoad: 0.75 }, { booted: 1 }).signals.load, false);
assert.equal(simulatorAdmission({ ...healthy, swapGrowthBytes: 65 * 1024 * 1024 }, { booted: 1 }).signals.swap, false);
assert.equal(simulatorAdmission({ ...healthy, thermalState: 'serious' }, { booted: 1 }).signals.thermal, false);
assert.equal(simulatorAdmission({ ...healthy, thermalState: null }, { booted: 1 }).admit, true, 'unavailable thermal data does not block alone');
assert.equal(simulatorAdmission({ ...healthy, totalMemoryBytes: 16 * gib, freeMemoryBytes: 8 * gib }, { booted: 1 }).admit, false, '16 GiB Auto serializes simulator boot');
assert.equal(simulatorAdmission(healthy, { booted: 2, override: 2 }).admit, false);
const devices = [
  { udid: 'A', state: 'Booted' }, { udid: 'B', state: 'Booted' }, { udid: 'C', state: 'Booted' }, { udid: 'D', state: 'Shutdown' },
];
assert.deepEqual(simulatorDrainCandidates(devices, ['A'], 2).map((device) => device.udid), ['B']);
assert.deepEqual(simulatorDrainCandidates(devices, ['A', 'B', 'C'], 1), [], 'active leases are never drained');

console.log('simulator capacity policy tests: ok');
