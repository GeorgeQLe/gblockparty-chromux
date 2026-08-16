# GBlockParty Chromux Next

Chromux Next is an experimental, local-first alignment workspace. It is a
separate Electron app from legacy Chromux in `../prototype/`: it has a distinct
package, bundle identifier, user-data directory, architecture, and release
line.

## Current prerelease: v0.10.3

This runner-first prerelease includes:

- An experimental Situation Room (`npm run start:situation-room`) that presents
  all pending agent questions and approvals in one chronological decision queue
  while retaining the transcript, composer, browser, and Alignment surfaces.
  Later defers a request only for the current renderer lifetime; no response is
  sent until an offered decision is explicitly selected.

- Project names in DETECT results and detected-session setup, replacing raw
  launcher labels such as `node` and `/usr/bin/env` while keeping full paths
  and terminal metadata available as supporting context.

- A persistent browser for each open session, with isolated Chromium storage,
  explicit HTTP(S)-only URL/transcript/contributor navigation, bounded native
  controls, exact responsive guest placement, and last-page restoration.
- A local reviewed-evidence workflow: capture the current page with an
  optional note, inspect the private screenshot, approve or reject it, and
  explicitly send approved evidence to its originating Codex session. Failed
  sends remain approved and retryable; rejected and delivered records remain
  inspectable.

- Detect-first onboarding that automatically scans open macOS Terminal and
  iTerm tabs for shell, Claude, Codex, and Grok workspaces without attaching
  to or changing the original processes. DETECT remains available from the
  product header after onboarding.
- Exact-directory Codex thread enrichment through the existing app-server,
  with bounded latest-agent previews, Continue, Start Fresh, and Focus Existing.
  Continue and Start Fresh exchange opaque scan/target IDs for a renewable
  main-process detection lease before configuration opens. Authoritative
  directories and thread IDs never cross into renderer-controlled creation
  input, and later scans cannot revoke an active configuration lease.
- Transactional detected-session creation that registers a project/worktree
  and persists a successful fresh session or forked continuation together.
  Continue copies safely stored source history into a distinct thread without
  sharing an in-progress partial turn; the external process remains active and
  the two threads can later diverge. Failed creation remains retryable on the
  same lease; abandoned or expired leases clean themselves up without leaving
  a partial session or completing onboarding.
- A calm premium-dark interface system shared by all five layouts, with
  semantic graphite/sage tokens, comfortable and compact density, consistent
  controls and states, Lucide icons, responsive navigation, and reduced-motion
  support.
- One global product header for surfaces, Settings, and New Session plus a
  contextual session strip. Accessible in-app dialogs replace native prompts
  for custom-group creation and rename, with focus containment, Escape
  handling, and focus restoration.
- Polished runner, transcript, Composer, approval, attention, detect-first onboarding,
  Settings, New Session, empty/error, and Alignment states. Packaged visual
  qualification now reviews 28 standard and narrow captures.
- First-run successor-native onboarding with a native project/worktree folder
  chooser, a persisted project registry, and editable default permission,
  model, and reasoning preferences for new sessions.
- Expanded Settings for project/default management, custom and project group
  administration, appearance, and live CLI/app-server/authentication/model
  compatibility diagnostics. All onboarding and preference data remains in
  the independent Chromux Next user-data directory; no legacy state is read,
  imported, or changed.
- A hardened incremental app-server JSONL transport with deterministic
  fragmented-message handling, 1 MiB framing limits, fail-closed protocol
  validation, bounded 1/2/5-second recovery, and awaited TERM/KILL shutdown.
- Independent restoration of every open persisted thread without starting a
  turn, plus a packaged two-launch smoke that proves two thread IDs, drafts,
  membership, and selection survive while both fixture processes exit.
- Subprocess-tested Luna analysis with fragmented output, redacted failures,
  timeout cleanup, stale-evidence rejection, deterministic fingerprints, and
  last-valid-analysis retention.
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
# Flag-gated operations-room experiment:
npm run start:situation-room
```

Use `npm run verify` for TypeScript, contract/unit and subprocess integration
tests, an Electron Forge package build, the baseline packaged smoke, and the
two-launch runner restoration smoke. After packaging,
`npm run visual:packaged -- /tmp/chromux-next-visual`
captures standard and narrow screenshots of all five approaches.

The successor uses an upward-chevron variation of the Chromux mark. Run
`npm run icons` after changing `build/icon.svg` to regenerate the packaged
ICNS, ICO, and PNG assets.

## Data model and trust boundaries

Codex remains authoritative for conversation history. Chromux Next stores only
its own groups, thread IDs, bounded display cache, drafts, settings, attention
triage, session browser locations, and reviewed local evidence records. Private
PNG artifacts live under the successor user-data directory. Raw app-server
envelopes remain in the main process; the
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
