# GBlockParty Chromux Next

Chromux Next is an experimental, local-first alignment workspace. It is a
separate Electron app from legacy Chromux in `../prototype/`: it has a distinct
package, bundle identifier, user-data directory, architecture, and release
line.

## Current prerelease: v0.4.0

This runner-first prerelease includes:

- A complete structured Alignment workspace with canonical JSON open/save,
  kind-aware editing for every schema-v1 item, human review/status controls,
  revision-safe insert/remove/reorder operations, session-local undo, and
  Deck/Canvas projections from the currently loaded document.
- Main-process-authoritative mutations that reread and atomically replace the
  canonical file, reject external changes, and return validated inverse
  batches. Dedicated fake/Codex contributors use immutable read-only snapshots
  with selected-item context, bounded events, cancellation, and explicit
  review-before-apply proposals; stale proposals remain inspectable but cannot
  be applied.
- Five live, production-functional interface approaches: Control Room, IDE
  Workbench, Focus Studio, Mission Board, and Spatial Canvas. They share one
  workflow implementation and switch presentation without touching Codex
  threads, active turns, selections, interactions, drafts, or attention.
- A keyboard-accessible Settings overlay (`Cmd/Ctrl+,`) with persisted global
  approach, comfortable/compact density, and system/full/reduced motion
  preferences. Unknown preference values recover to Control Room defaults
  without affecting runner state.

- Project and custom group tabs with resumable Codex sessions backed by one
  main-process-owned `codex app-server` over JSONL stdio.
- A display-only xterm transcript, session-specific fixed composer, same-turn
  steering, interruption, bounded drafts, explicit-click links, search, copy,
  and scrollback.
- Structured command/file/network approvals and agent questions that are
  correlated to a single thread and fail closed for unknown request types.
- Workspace and read-only permission presets, Codex model discovery, bounded
  crash recovery, thread restoration, and isolated successor persistence.
- A deterministic attention layer plus a bounded, redacted, read-only
  `gpt-5.6-luna` analyzer with validated evidence references and persistent
  snooze/dismiss triage.
- Alignment, Deck, Canvas, and Browser secondary surfaces that preserve runner
  session state.

The runner uses structured app-server events rather than a raw PTY. xterm stdin
is disabled; all user text enters through the composer.

## Run

Requires Node.js 22.12 or newer and Codex CLI 0.146.0 or newer.

```sh
npm install
npm start
```

Use `npm run verify` for TypeScript, contract/unit tests, and an Electron Forge
package build. After packaging, `npm run visual:packaged -- /tmp/chromux-next-visual`
captures standard and narrow screenshots of all five approaches.

The successor uses an upward-chevron variation of the Chromux mark. Run
`npm run icons` after changing `build/icon.svg` to regenerate the packaged
ICNS, ICO, and PNG assets.

## Data model and trust boundaries

Codex remains authoritative for conversation history. Chromux Next stores only
its own groups, thread IDs, bounded display cache, drafts, settings, and
attention triage. Raw app-server envelopes remain in the main process; the
renderer receives validated normalized events. Renderer isolation, context
isolation, sandboxing, popup denial, and an HTTP(S)-only navigation allowlist
are enabled.

App-local state lives under the separate Electron user-data directory named
`GBlockParty Chromux Next`. Alignment documents live only at user-selected JSON
paths. Codex processes inherit normal authentication, but Chromux Next never
locates, copies, stores, or logs credentials.

## Release convention

Experimental releases use tags `chromux-next-v0.x.y`, titles
`GBlockParty Chromux Next v0.x.y`, and are GitHub prereleases. They must not
become GitHub `/releases/latest`, which remains the legacy Chromux update
channel until the cutover gates are met.
