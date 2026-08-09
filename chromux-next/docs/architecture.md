# Chromux Next architecture

## Dependency direction

```text
renderer → typed preload bridge → validated IPC → runner manager
   │                                           ├─ Codex app-server JSONL
   └──── bounded runner contracts ─────────────┼─ isolated atomic state
                                               ├─ Luna analyzer
                                               └─ explicit WebContentsView
```

## Presentation approaches

The renderer has one authoritative workflow composition and persistent
workspace component: display-only runner, composer and structured interactions,
session/group operations, attention, secondary surfaces, and session creation.
Five presentations arrange those primitives without owning runner state:

- Control Room uses top tabs and a persistent right attention rail.
- IDE Workbench uses a project tree, editor tabs, and inspector.
- Focus Studio uses breadcrumb/session switching and an attention drawer.
- Mission Board provides four status lanes plus the full detail workspace.
- Spatial Canvas provides project clusters and session nodes plus a docked
  detail workspace. Its DOM tree remains the keyboard/screen-reader equivalent
  of the visual map.

Before an approach change, the renderer flushes the active draft. The shared
workspace, xterm, Composer, draft, selected item, pending interactions, and all
secondary surfaces stay mounted; inactive surfaces are hidden. Selected
group/session remain runner-owned while the active surface, document state,
undo stack, contributor state, and bounded viewport map remain renderer-owned.
Presentation changes never invoke start, steer, interrupt, resume, Luna, or
thread lifecycle calls.

`UiPreferencesV1` is stored in the isolated successor `state-v1.json` with
strict approach, density, and motion enums. The bridge permits only get,
validated partial update, and validated changed events. Malformed or future UI
preferences recover independently to Control Room/comfortable/system so valid
runner state survives. Serialized atomic store mutations prevent preference
and runner writes from overwriting one another.

`src/runner` owns the Codex protocol facade, normalized runner contracts,
session/group lifecycle, and attention analysis. Raw app-server messages never
cross IPC. `src/persistence` owns isolated atomic app state and canonical
document transactions. `src/ipc` is the only renderer/main contract. Existing
`src/domain` alignment contracts remain schema-v1 compatible.

## Modular baseline and recovery

The v0.7.1 baseline makes ownership enforceable rather than conventional:

- `main/browser-view-service.ts` owns the guest view and accepts an injected
  host/dependency interface; renderer code never receives a view, filesystem
  path, or `webContents` reference.
- `ipc/registry.ts` is the complete preload invocation catalog. Main-process
  startup asserts that every catalog entry has exactly one handler. The same
  module owns the schema map for all main-to-renderer event streams.
- `renderer/persistent-surfaces.tsx` keeps every surface mounted and changes
  visibility only. Presentation shells cannot destroy workspace state as a
  side effect of layout changes.
- `persistence/local-store.ts` stores app, runner, UI, and workspace/onboarding
  state in separate `0600` atomic JSON slices. A malformed or future optional
  slice recovers independently. The previous combined `state-v1.json` is read
  only as an upgrade fallback and is never rewritten or removed.
- `main/service-contracts.ts` defines injection seams for subprocess, storage,
  release-client, clock, and ID behavior. Migration and update services have
  explicit main-process boundaries before they gain renderer-visible APIs.

## Detect-first onboarding

- On macOS, the main process runs bounded `ps` and per-process `lsof` probes
  for processes with attached ttys. It excludes the Chromux process tree, canonicalizes
  valid working directories, sanitizes output, caps work and renderer rows,
  and treats exited processes and command timeouts as missing observations.
- Terminal and iTerm tab titles are optional Automation metadata. Denial is
  reported separately and removes only titles; process, agent, and directory
  detection continues.
- Codex candidates are enriched only through exact-cwd `thread/list` matches
  from the existing app-server. A bounded `thread/read` lookup supplies the
  latest available agent preview. No legacy Chromux state is read.
- Authoritative cwd and thread IDs remain in a two-minute main-process cache.
  The renderer receives opaque scan/target IDs and cannot supply either value
  to detected-session creation. A later scan replaces the prior cache.
- Fresh creation uses `thread/start`; resume uses `thread/resume`; an already
  open thread focuses its existing session. Successful detected creation
  atomically persists the project/worktree registry and runner state. Failed
  validation, start, resume, or persistence does not create a partial Chromux
  session or complete onboarding.
- Detection never attaches to a terminal, sends it input, interrupts it, or
  changes its process state. Resuming an active external Codex thread creates
  a separate continuation that may diverge.

## Runner lifecycle

- The main process validates Codex CLI 0.146.0+, initializes one app-server,
  and verifies `model/list` before sessions are used.
- Stdout passes through an incremental, 1 MiB-per-line JSONL decoder. Partial,
  malformed, schema-invalid, and oversized messages compromise the child,
  reject each pending request once, and enter bounded recovery.
- A new session starts one persisted Codex thread. Restoration resumes stored
  thread IDs without starting a turn.
- Idle composer submissions call `turn/start`; active submissions call
  `turn/steer` with the expected turn ID; Stop calls `turn/interrupt`.
- Closing cancels pending interactions, interrupts active work, and
  unsubscribes without deleting Codex history.
- App-server crashes use bounded 1/2/5-second restart attempts and resume open
  threads independently after a compatible connection returns. One failed
  resume does not block another, closed sessions remain closed, and restoration
  never starts or steers a turn.
- Quit cancels restart timers, rejects pending requests, closes stdin, sends
  TERM, escalates to KILL after the configured grace, awaits child exit, and
  persists runner state before Electron exits.

## Trust boundaries

- Workspace mode maps to workspace-write, network disabled, and on-request
  approvals. Read-only mode maps to read-only and never approvals.
- Approval responses are accepted only for a pending request belonging to the
  selected session's exact thread and only for decisions offered by that
  request.
- xterm has `disableStdin`; it is a presentation surface, not a shell or PTY.
- Events, drafts, caches, protocol messages, analyzer input, and analyzer
  output are size-bounded and runtime validated.
- Unknown server requests fail closed and create an actionable runner error.

## Canonical document behavior

- The shipped sample starts unsaved. Its first mutation invokes Save As; a
  cancelled dialog leaves the document and revision unchanged.
- `documents.apply` accepts only a canonical path and validated mutation batch.
  The main process rereads the file, rejects document/revision mismatches,
  applies to a clone, atomically persists, and returns the updated document
  plus its validated inverse batch.
- Stable document and item IDs survive edits and presentation changes.
- A mutation batch must target the document's current revision.
- Accepted batches advance the revision exactly once and append history.
- Operations are applied transactionally to a clone. Validation failure leaves
  the input unchanged.
- Each accepted batch produces inverse operations. Undo is a new mutation and
  therefore a new revision; history is never rewritten.
- Removing an item also removes dangling view references. Its inverse restores
  both the item and the previous view mappings.
- Undo batches are session-local, apply as ordinary new revisions, and clear
  when a document is replaced or an unrecoverable external conflict occurs.
- External conflicts reload the latest valid canonical document. Contributor
  proposals are kept for inspection, but document/revision mismatches disable
  Apply and require a new contributor run.

## Dedicated document contributors

Alignment contribution is separate from live runner threads. Fake and Codex
adapters receive an immutable document snapshot, selected-item IDs, and an
explicit prompt. Codex uses an ephemeral, read-only, schema-constrained process
that cannot edit files or reuse the selected runner session. Events, response,
and proposal counts are bounded; cancellation is explicit. Proposals never
mutate the document until the human chooses Apply, and Reject discards only the
selected proposal.

## Contextual attention

Attention snapshots contain bounded recent runner events, pending
interactions, and read-only Git summaries. Credential-like values are redacted
before the snapshot is hashed or passed to a separate ephemeral
`gpt-5.6-luna` process. The analyzer runs read-only with approvals disabled,
low reasoning, ignored user config/rules, a 90-second timeout, one active
process, a 128 KiB snapshot cap, and validated source references. Deterministic
approvals, questions, crashes, and failed turns always remain above model
recommendations.

App-server and Luna executable paths, prefix arguments, environments, timeouts,
line limits, restart delays, shutdown grace, and client version are injectable
at their main-process boundary. Production retains the documented defaults;
executable injection is wired into Electron only behind the explicit packaged
runner-restoration smoke argument.

## Navigation

Text is scanned for safe HTTP(S) URLs and displayed as ordinary buttons.
Navigation happens only after a click. A main-process-owned `WebContentsView`
denies popups and unsupported schemes. `file:`, `javascript:`, custom schemes,
and automatic navigation are rejected. Localhost is treated like any other
explicit HTTP(S) link.

## Session browser and reviewed evidence

`BrowserViewService` owns one sandboxed `WebContentsView` per open runner
session. Each guest uses a stable session-derived persistent partition; the
raw session ID, partition name, guest object, and `webContents` never cross
preload. The renderer supplies only a validated session ID and viewport
rectangle. Main clamps that rectangle to the host window and hides every guest
when Browser is inactive or a dialog obscures it.

Last safe URL/title state and bounded evidence metadata live in the independent
`browser-workspace-v1.json` slice. Invalid or future browser state recovers to
an empty browser workspace without affecting runner or preference slices.
Guest history and cookies remain Chromium-owned; restoring Chromux recreates a
guest lazily only when its session's Browser surface becomes visible.

Page capture is an explicit user action. Main captures the originating guest
to a private PNG under `browser-evidence/`, then records immutable session,
URL, title, timestamp, and artifact identity before exposing an Awaiting Review
record. The renderer can request only a bounded data-URL preview by evidence
ID; it never supplies or receives an artifact path.

Delivery is a two-action gate: Approve, then Send to session. The serialized
workflow rechecks Approved status immediately before calling the runner and
marks Delivered only after `turn/start` or `turn/steer` succeeds. A runner
failure leaves the evidence Approved for retry. Rejected and delivered records
remain inspectable, and delivered evidence cannot be reviewed or sent again.
