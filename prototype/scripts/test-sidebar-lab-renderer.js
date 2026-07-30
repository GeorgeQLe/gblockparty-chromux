'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createFixture } = require('../sidebar-lab/fixtures');
const { VARIANTS, buildLayout } = require('../sidebar-lab/variants');

const appDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(appDir, 'sidebar-lab', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(appDir, 'sidebar-lab', 'renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(appDir, 'sidebar-lab', 'styles.css'), 'utf8');
const browserModel = fs.readFileSync(path.join(appDir, 'sidebar-lab', 'model-browser.js'), 'utf8');

for (const required of [
  'id="gallery"', 'id="study"', 'id="search"', 'id="status-filter"', 'id="project-filter"',
  'id="include-history"', 'data-rating="orientation"', 'data-rating="attentionClarity"',
  'data-rating="switchingEffort"', 'model-browser.js', 'renderer.js',
]) assert.ok(html.includes(required), `missing renderer contract ${required}`);
for (const required of [
  "event.key === 'ArrowDown'", "event.key === 'ArrowUp'", "event.key === '/'",
  'data-session-id', 'scrollDistance', 'incorrectOpens', 'sessionSwitches', 'rowRelocations',
]) assert.ok(renderer.includes(required), `missing interaction contract ${required}`);
assert.ok(styles.includes('@media (max-width:820px)'));
assert.ok(styles.includes('@media (prefers-reduced-motion:reduce)'));
assert.ok(!renderer.includes('window.chromux.'));
assert.ok(!browserModel.includes('require('));

const fixture = createFixture();
for (const variant of VARIANTS) {
  const live = fixture.sessions.filter((row) => !row.history);
  const visible = buildLayout(variant.id, fixture).groups.flatMap((group) => group.sessions);
  assert.deepStrictEqual(visible.map((row) => row.id).sort(), live.map((row) => row.id).sort());
}

const sandbox = { window: {}, structuredClone };
vm.runInNewContext(browserModel, sandbox);
assert.ok(sandbox.window.sidebarLabModel);
for (const variant of VARIANTS) {
  const ids = sandbox.window.sidebarLabModel.buildLayout(variant.id, fixture, { includeHistory: true })
    .groups.flatMap((group) => group.sessions.map((row) => row.id));
  assert.strictEqual(new Set(ids).size, 18);
}
console.log('SIDEBAR_LAB_RENDERER_OK');
