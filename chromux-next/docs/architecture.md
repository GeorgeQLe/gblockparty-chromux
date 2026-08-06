# Chromux Next architecture

## Dependency direction

```text
renderer → typed preload bridge → validated IPC → runner manager
   │                                           ├─ Codex app-server JSONL
   └──── bounded runner contracts ─────────────┼─ isolated atomic state
                                               ├─ Luna analyzer
                                               └─ explicit WebContentsView
```

`src/runner` owns the Codex protocol facade, normalized runner contracts,
session/group lifecycle, and attention analysis. Raw app-server messages never
cross IPC. `src/persistence` owns isolated atomic app state. `src/ipc` is the
only renderer/main contract. Existing `src/domain` alignment contracts remain
available to the secondary surfaces.

## Runner lifecycle

- The main process validates Codex CLI 0.146.0+, initializes one app-server,
  and verifies `model/list` before sessions are used.
- A new session starts one persisted Codex thread. Restoration resumes stored
  thread IDs without starting a turn.
- Idle composer submissions call `turn/start`; active submissions call
  `turn/steer` with the expected turn ID; Stop calls `turn/interrupt`.
- Closing cancels pending interactions, interrupts active work, and
  unsubscribes without deleting Codex history.
- App-server crashes use bounded 1/2/5-second restart attempts and resume open
  threads after a compatible connection returns.

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

- Stable document and item IDs survive edits and presentation changes.
- A mutation batch must target the document's current revision.
- Accepted batches advance the revision exactly once and append history.
- Operations are applied transactionally to a clone. Validation failure leaves
  the input unchanged.
- Each accepted batch produces inverse operations. Undo is a new mutation and
  therefore a new revision; history is never rewritten.
- Removing an item also removes dangling view references. Its inverse restores
  both the item and the previous view mappings.

## Contextual attention

Attention snapshots contain bounded recent runner events, pending
interactions, and read-only Git summaries. Credential-like values are redacted
before the snapshot is hashed or passed to a separate ephemeral
`gpt-5.6-luna` process. The analyzer runs read-only with approvals disabled,
low reasoning, ignored user config/rules, a 90-second timeout, one active
process, a 128 KiB snapshot cap, and validated source references. Deterministic
approvals, questions, crashes, and failed turns always remain above model
recommendations.

## Navigation

Text is scanned for safe HTTP(S) URLs and displayed as ordinary buttons.
Navigation happens only after a click. A main-process-owned `WebContentsView`
denies popups and unsupported schemes. `file:`, `javascript:`, custom schemes,
and automatic navigation are rejected. Localhost is treated like any other
explicit HTTP(S) link.
