#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { SCENARIOS } = require('../sidebar-lab/fixtures');
const { VARIANTS } = require('../sidebar-lab/variants');
const { sanitizeReport, seededOrder } = require('../sidebar-lab/core');

// Deterministic no-model baseline: one perfect synthetic pass across all
// scenarios and variants. It validates the study/report pipeline, not usability.
const order = seededOrder('chromux-sidebar-lab-uat').map((row) => row.id);
const trials = order.flatMap((variantId, variantIndex) => SCENARIOS.map((scenario, scenarioIndex) => ({
  variantId,
  scenarioId: scenario.id,
  durationMs: 900 + variantIndex * 75 + scenarioIndex * 40,
  completed: true,
  incorrectOpens: variantId === 'current' && scenario.id === 'remembered-after-churn' ? 1 : 0,
  clicks: scenario.targetSessionIds ? 2 : 1,
  keystrokes: 0,
  scrollDistance: variantIndex % 3 * 80,
  sessionSwitches: scenario.targetSessionIds ? 1 : 0,
  rowRelocations: variantId === 'current' && scenario.transition ? 7 : 0,
  ratings: {
    orientation: variantId === 'current' && scenario.transition ? 2 : 4,
    attentionClarity: ['linear', 'agmux', 'focus'].includes(variantId) ? 5 : 4,
    switchingEffort: ['claude', 'focus'].includes(variantId) ? 5 : 4,
  },
})));
const report = sanitizeReport({ variantOrder: order, trials });
const output = process.env.CHROMUX_SIDEBAR_LAB_UAT_OUT
  || path.resolve(__dirname, '..', 'docs', 'testing', 'sidebar-lab-uat-0.76.0.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
if (report.trials.length !== VARIANTS.length * SCENARIOS.length) throw new Error('Incomplete no-model UAT matrix.');
process.stdout.write(`SIDEBAR_LAB_UAT_OK ${output}\n`);
