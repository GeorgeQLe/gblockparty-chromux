# GBlockParty Chromux Next

Chromux Next is an experimental, local-first alignment workspace. It is a
separate Electron app from legacy Chromux in `../prototype/`: it has a distinct
package, bundle identifier, user-data directory, architecture, and release
line.

## Current prerelease: v0.18.1

This runner-first prerelease includes:

- Production-safe Fleet WebSockets in packaged builds. The Electron main
  bundle uses `ws`'s built-in JavaScript masking and validation paths, accepts
  the control plane's durable-history status and stream/reset metadata, and
  queues the initial terminal dimensions until the attachment socket opens.

- A front-and-center, p-style New Session project search that prioritizes
  registered folders and recent `p_history`, discovers Git projects under `P_BASE` or `~/projects`,
  matches names before relative paths, and completes literal absolute paths.
  Its dedicated “Find a project” card explains search sources and keyboard
  controls; the accessible combobox supports mouse, arrow keys, Enter, Tab,
  and Escape, while the native folder browser remains available.

- A read-only conversational transcript with right-aligned user bubbles,
  left-aligned agent bubbles, and full-width code, tables, ANSI/ASCII output,
  graphic links, and expandable runtime activity. DOM search reveals collapsed
  matches, session-local scrolling follows streaming output only near the
  bottom, and remote graphics never load without an explicit Browser click.

- An opt-in GBlockParty Fleet picker and distinct attached-terminal tabs for
  daemon-owned Codex sessions. Remote tabs reconnect with their last replay
  cursor, visibly clear history on a replay gap, and detach without stopping
  the session. One-time device enrollment stores its scoped credential with
  macOS protected storage; terminals attach read-only and accept input only
  while the server grants this device its renewable single-writer lease.

- Safe transcript viewport recovery: each session retains its DOM scroll
  position in memory and restores at the bottom when no position exists. A
  root renderer error boundary replaces future React blank screens with a
  concise diagnostic, persisted-session assurance, and a renderer-only reload
  action.

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
  the two threads can later diverge. Fork creation requests metadata only, so
  long source histories are not echoed back through one bounded JSONL frame.
  Chromux pages summary history from the owned fork, displays it chronologically
  within a 1,000-event cap, and repairs pending or failed hydration in place on
  launch without creating another fork.
  Failed creation remains retryable on the same lease; abandoned or expired
  leases clean themselves up without leaving a partial session or completing
  onboarding.
- A calm premium-dark interface system shared by all five layouts, with
  semantic graphite/sage tokens, comfortable and compact density, consistent
  controls and states, Lucide icons, responsive navigation, and reduced-motion
  support.
- One global product header for surfaces, Settings, and New Session plus a
  contextual session strip. Accessible in-app dialogs replace native prompts
  for custom-group creation and rename, with focus containment, Escape
  handling, and focus restoration.
- Polished runner, transcript, Composer, approval, attention, detect-first onboarding,
  Settings, New Session, empty/error, renderer-recovery, and Alignment states.
  Packaged visual qualification now reviews 56 standard, narrow, Situation
  Room, and renderer-recovery captures, including Repository, Cmd-K,
  project-empty Alignment, and open/collapsed attention states.
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
- A DOM-based conversational transcript, session-specific fixed composer,
  same-turn steering, interruption, bounded drafts, explicit-click links,
  search, selection copy, and scroll restoration. xterm is reserved for
  interactive GBlockParty remote terminal tabs.
- Structured command/file/network approvals and agent questions that are
  correlated to a single thread and fail closed for unknown request types.
- Workspace and read-only permission presets, Codex model discovery, bounded
  crash recovery, thread restoration, and isolated successor persistence.
- A deterministic attention layer plus a bounded, redacted, read-only
  `gpt-5.6-luna` analyzer with validated evidence references and persistent
  snooze/dismiss triage.
- Alignment, Deck, Canvas, and Browser secondary surfaces that preserve runner
  session state.

The runner uses structured app-server events rather than a raw PTY. Its DOM
transcript has no input surface; all user text enters through the composer.

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
captures standard and narrow screenshots of all five approaches plus the
renderer recovery screen.

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

Blank session titles opt into automatic naming. Chromux Next immediately uses
the canonical project-directory basename, then prefers a valid Codex
app-server thread name. Remaining sessions use one redacted, 512-character
request (or one agent excerpt when no meaningful request exists) in an
isolated, ephemeral GPT-5.6 Luna subprocess with no reasoning. Restoration
batches at most ten sessions per subprocess. Fingerprinted attempts retry
immediately only when input or prompt configuration changes, otherwise after
24 hours; explicit and already-generated titles are never replaced. Settings
diagnostics show aggregate reuse, outcomes, retry timing, subprocesses, and
reported token usage without storing prompts or process output.

App-local state lives under the separate Electron user-data directory named
`GBlockParty Chromux Next`. Alignment documents live only at user-selected JSON
paths. Codex processes inherit normal authentication, but Chromux Next never
locates, copies, stores, or logs credentials.

## GBlockParty fleet attachment

Fleet attachment is disabled by default. Start Chromux Next with:

```bash
CHROMUX_NEXT_GBP_FLEET=1 npm start
```

The control plane defaults to `http://127.0.0.1:4400`; override it with
`CHROMUX_NEXT_CONTROL_PLANE_URL`. For an authenticated control plane, open
Fleet and exchange a one-time device code. Chromux validates server
capabilities, then stores the returned scoped credential encrypted with
Electron protected storage in a mode-`0600` file. Process-provided cookie/token
variables remain available for development and compatibility. Authentication
material, URL ownership, snapshot requests, and terminal WebSockets stay in
the main process and never cross renderer IPC.

The renderer receives only bounded host/workspace/session display metadata and
surface IDs. It never receives host credentials, absolute workspace paths, or
launch authority. Remote tabs expose resize and read-only output immediately.
Input is enabled only after **Request control** receives the server's
single-writer lease; it is disabled again on contention, release, expiry,
disconnect, or revocation. They do
not expose local-only session creation, browser capture, or evidence delivery.
Closing a tab sends detach and leaves the daemon-owned Codex/tmux session
running. See [control-plane troubleshooting](docs/control-plane-troubleshooting.md).

## Updates

Chromux Next checks GitHub's prerelease list at startup and every 24 hours for
the greatest non-draft `chromux-next-vX.Y.Z` tag. Manual checks bypass the
successful-check cache; failures are immediately retryable. The legacy
`chromux-v…` channel and GitHub `/releases/latest` are never used.

Settings → Updates shows separate Chromux Next and Codex status. Download and
installation always require explicit confirmation. Managed macOS arm64
installation requires exact manifest size/SHA-256, bundle ID
`dev.georgele.chromux.next`, Developer ID Team `NC56VXK48K`, arm64 code, and
Gatekeeper acceptance. Other platforms and unsigned or read-only installs
retain the release link and use manual installation.

Starting or active sessions, active turns, and unanswered interactions block
maintenance. Idle, failed, and closed sessions are safe because thread IDs and
drafts are persisted. Clearing blockers never starts installation. Codex
updates are capability-probed at runtime and otherwise show install guidance.

Chromux Next 0.11.1 has no updater. Install 0.12.0 manually once; managed
Chromux Next updates begin with the release after 0.12.0.

## Release convention

Experimental releases use tags `chromux-next-v0.x.y`, titles
`GBlockParty Chromux Next v0.x.y`, and are GitHub prereleases. They must not
become GitHub `/releases/latest`, which remains the legacy Chromux update
channel until the cutover gates are met.
