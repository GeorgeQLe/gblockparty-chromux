# Task Queue

## Priority Documentation Todo

No active priority documentation items.

## Implementation And Documentation Todo

- [x] Run a `cmux` stack spike to validate embedded Chromium pane feasibility and capture hooks. _(source: `research/devtool-dx-journey.md`; evidence: Electron prototype under `prototype/` with paired webviews, capture modal, screenshots, and `node-pty` sessions)_
- [x] Prototype preview detection for `localhost`, loopback URLs, and local HTML paths from terminal output. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/renderer/renderer.js`, `prototype/scripts/test-shortcuts-renderer.js`, `prototype/scripts/test-update-queue-renderer.js`)_
- [x] Add per-session paired-browser collapse and narrow-toolbar scrolling for terminal-first workflows. _(source: user request; evidence: `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-browser-collapse-renderer.js`)_
- [x] Create `docs/capture-payload.md` with a versioned YAML schema, field bounds, retention notes, and one sample payload. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/docs/capture-payload.md`, `prototype/examples/captures/sample-capture.yaml`)_
- [x] Build an end-to-end capture-to-delivery proof using `claude -p` plus file-drop fallback. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/main.js`, `prototype/renderer/renderer.js`, `prototype/scripts/test-capture-records-renderer.js`)_
- [x] Write `README.md` with the first local loop quickstart after runnable commands exist. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/README.md`)_
- [x] Write `docs/troubleshooting.md` for preview detection, file previews, screenshots, console logs, CLI auth, wrong-session routing, and storage cleanup. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/docs/troubleshooting.md`)_
- [ ] Write `docs/privacy-and-local-data.md` before public privacy or local-first claims. _(source: `research/devtool-dx-journey.md`)_
- [x] Add proof artifacts under `examples/`: sample payload, sample screenshot path, and demo transcript. _(source: `research/devtool-dx-journey.md`; evidence: `prototype/examples/captures/`, `prototype/examples/transcripts/first-local-loop.md`)_
- [x] Add `examples/transcripts/first-local-loop.md` after the stack and payload spikes produce real commands. _(source: `research/devtool-adoption.md`; evidence: `prototype/examples/transcripts/first-local-loop.md`)_
- [x] Add `examples/captures/sample-capture.yaml` and matching screenshot fixture after the payload schema is proven. _(source: `research/devtool-adoption.md`; evidence: `prototype/examples/captures/sample-capture.yaml`, `prototype/examples/captures/sample-screenshot.png`)_
- [x] Add dynamic session tab titles from terminal OSC 0/1/2 sequences. _(source: user request; evidence: `prototype/renderer/signals.js`, `prototype/renderer/renderer.js`, `prototype/renderer/styles.css`, `prototype/scripts/test-osc-parser.js`, `prototype/scripts/test-tab-titles-renderer.js`)_
- [ ] Create `.github/ISSUE_TEMPLATE/first-success-report.yml` after the project is ready for controlled OSS preview. _(source: `research/devtool-adoption.md`)_
