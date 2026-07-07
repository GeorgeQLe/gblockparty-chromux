# Session History

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
