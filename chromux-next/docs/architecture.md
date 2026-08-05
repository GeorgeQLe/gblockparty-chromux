# Chromux Next architecture

## Dependency direction

```text
renderer → typed preload bridge → validated IPC → main process
   │                                      │
   └──────── domain contracts ────────────┤
                                          ├─ atomic document store
                                          ├─ app-local state
                                          ├─ provider adapters
                                          └─ explicit WebContentsView
```

`src/domain` owns meaning and mutation rules. Presentation views reference
semantic item IDs instead of duplicating item content. `src/providers` owns
normalization at the process boundary. `src/persistence` owns canonical
workspace writes and app-local state. `src/ipc` is the only renderer/main
contract.

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

## Provider behavior

Providers receive an immutable, validated document snapshot. The deterministic
fake adapter covers success, malformed output, missing CLI, authentication
failure, timeout, cancellation, and stale proposals without model usage.

The Codex adapter starts `codex exec` with JSONL output, read-only sandboxing,
no interactive approval, and a constrained final output shape. It inherits the
user's normal CLI authentication environment but does not locate, open, copy,
or log credentials. Provider output is bounded and stderr is token-redacted
before it reaches the renderer.

Claude and Gemini are represented by deterministic failure fixtures in this
slice; real adapters require independent UAT before they appear in the UI.

## Navigation

Text is scanned for safe HTTP(S) URLs and displayed as ordinary buttons.
Navigation happens only after a click. A main-process-owned `WebContentsView`
denies popups and unsupported schemes. `file:`, `javascript:`, custom schemes,
and automatic navigation are rejected. Localhost is treated like any other
explicit HTTP(S) link.
