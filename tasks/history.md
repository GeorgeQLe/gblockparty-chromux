# Session History

## 2026-07-07 — Chromux v0.12.1 update release completion

- Prepared `0.12.1` for publication so Settings update checks can converge on the running app version and GitHub Releases latest tag.
- Preserved the cache recomputation fix for stale latest-release metadata, the managed install flow, queue dismissal coverage, and release-process docs requiring actual tag and GitHub Release publication.
- Validation: `npm --prefix prototype run test:github-update-check`, `npm --prefix prototype run test:update-queue-renderer`, `npm --prefix prototype run smoke`, and `npm --prefix prototype run package` passed. Packaging still prints Electron Packager's existing `.icon` probe warning; accepted because the build completes and writes `prototype/dist/Chromux-darwin-arm64`.

## 2026-07-07 — Chromux GitHub release backfill for update checks

- Root cause: the updater was correctly reading `https://api.github.com/repos/GeorgeQLe/gblockparty-chromux/releases/latest`, but GitHub Releases were stale at `chromux-v0.9.0`, so installed `0.9.0` builds reported themselves current.
- Backfilled published GitHub Releases for `chromux-v0.10.0` at `12c7e9b2689fa112d81ac8a2ea2d5975e497e179`, `chromux-v0.10.1` at `64248a0561e627f51a9acb3c851533ecd09168f3`, and `chromux-v0.11.0` at `93b95fc6708e1399ca7f341ca1c76e11808f5970`; marked `v0.11.0` latest.
- Updated `AGENTS.md` and `CLAUDE.md` so future ships require the actual Git tag and GitHub Release, and explicitly call out that update checks depend on GitHub Releases `/releases/latest`.
- Validation: before backfill, `gh api repos/GeorgeQLe/gblockparty-chromux/releases/latest --jq '.tag_name'` returned `chromux-v0.9.0`; after backfill it returned `chromux-v0.11.0`, `gh api repos/GeorgeQLe/gblockparty-chromux/releases --jq '.[].tag_name'` listed `chromux-v0.11.0`, `chromux-v0.10.1`, `chromux-v0.10.0`, and `chromux-v0.9.0`, and `npm run test:github-update-check` passed from `prototype/`.

## 2026-07-07 — Chromux v0.11.0 paired-browser collapse

- Shipped per-session paired-browser collapse/restore behavior: collapsed sessions expand the terminal, keep a narrow restore rail visible, disable divider resizing, preserve browser URL/queue/webview/capture state, and restore to the previous split width.
- Made the browser header controls a single-row horizontal toolbar so Queue, Pick Element, Capture, and Collapse remain reachable when the browser pane is narrow.
- Added `test:browser-collapse-renderer` coverage for collapse/restore, per-session tab switching, terminal refit, disabled divider behavior, state preservation, and narrow-toolbar reachability.
- Bumped prototype metadata to `0.11.0` and added `GBlockParty Chromux v0.11.0` release notes with planned tag `chromux-v0.11.0`.
- Validation: `npm run test:browser-collapse-renderer` and `npm run test:shortcuts-renderer` passed from `prototype/`. No lint/typecheck/build scripts exist in `prototype/package.json`; full packaging was skipped because this change is renderer-layout scoped and Electron smoke tests exercise the mutated runtime path.
- Ship manifest: user goal was paired browser collapse plus scrollable narrow toolbar. Changed files: `prototype/renderer/renderer.js` for session browser UI state/layout/test API, `prototype/renderer/styles.css` for toolbar/rail layout, `prototype/scripts/test-browser-collapse-renderer.js` for renderer smoke coverage, `prototype/package.json`/`package-lock.json` for version and script metadata, `RELEASES.md` for v0.11.0 release notes, and `tasks/todo.md`/`tasks/history.md` for task bookkeeping. Adversarial review checked state preservation, divider disablement, split restore, toolbar reachability, and shortcut/queue regression; residual risk is untested real interactive drag/collapse behavior outside the smoke harness. Rollback is `git revert` of the v0.11.0 commit. Next command: `$exec` for `prototype/docs/privacy-and-local-data.md`.

## 2026-07-06 — Chromux troubleshooting guide

- Added `prototype/docs/troubleshooting.md` covering preview detection, file previews, queue behavior, screenshots, console logs, CLI auth and delivery, wrong-session routing, storage cleanup, and manual retry commands.
- Linked the troubleshooting guide from `prototype/README.md`.
- Marked the troubleshooting documentation task complete in `tasks/todo.md` and reflected the docs addition in the v0.10.1 release notes.
- Validation: documentation-only change; checked the task surfaces and release metadata. No executable validation was relevant because no source, scripts, packaging config, schemas, or runtime assets changed.

## 2026-07-06 — Chromux v0.10.1 restore, quoting, docs-audit, and audit-clean wrap-up

- Shipped v0.10.1 fixes for restore-snapshot preservation on idle quit, guarded Command+J behavior in editable focus, failed hook-install fallback, and shell-safe Claude/Codex launch command quoting.
- Added `test:agent-command-quoting` and expanded shortcut regression coverage for the guarded Command+J IPC path.
- Finalized the refreshed devtool docs audit artifact and alignment/interrogation pages, leaving `tasks/todo.md` unchanged; remaining active docs work is `prototype/docs/troubleshooting.md` and `prototype/docs/privacy-and-local-data.md`.
- Fixed the package metadata boundary: updated `prototype/package-lock.json`, moved the packaging icon option to the base icon path, and upgraded Electron to 43.0.0 plus `@electron/rebuild` 4.1.0 after npm audit surfaced high-severity advisories.
- Validation: `npm --prefix prototype run test:agent-command-quoting`, `test:shortcuts-renderer`, `test:update-queue-renderer`, `test:capture-records-renderer`, `test:turn-signals-renderer`, `test:detect-filter-renderer`, `test:github-update-check`, `test:osc-parser`, `smoke`, `package`, and `npm --prefix prototype audit` all passed. The package build still prints Electron Packager's `.icon` format probe warning, accepted because `prototype/build/icon.icns` is copied into the bundle as `Contents/Resources/electron.icns` with a matching SHA-256 hash.
- Ship manifest: user goal was session wrap-up; changed files map to app fixes/tests, release metadata, docs-audit artifacts, dependency security cleanup, and history. Adversarial review focused on stale lockfile metadata, npm audit findings, package warnings, and Electron 43 compatibility; residual risk is limited to untested real interactive GUI daily-driver use after the major Electron bump. Rollback is `git revert` of the v0.10.1 commit. Next command: `$devtool-docs-audit` or `$exec` for `prototype/docs/troubleshooting.md`.

## 2026-07-06 — Chromux guarded shortcuts and v0.10.0 wrap-up

- Implemented Electron shell-level guarded shortcuts: Command+1..9 session switching, Command+J queue reveal/focus, and Command+Q confirmation before quit.
- Added preload shortcut listener APIs and renderer queue-focus behavior that focuses the first queued preview OPEN button without opening or dequeuing it.
- Added `test:shortcuts-renderer` coverage and retained a compatibility alias for the renamed attention/turn-signal smoke test.
- Preserved v0.10.0 release metadata and updated release notes for guarded shortcuts.
- Verified shortcut, update queue, attention/turn signals, detect filter, GitHub update check, capture records, and OSC parser tests.
