# Terminal interaction roadmap

Chromux 0.42.0 adds a lightweight multiline prompt composer to every managed terminal pane. It is an editor and interaction-provider seam, not a replacement terminal protocol.

## Shipped in 0.42.0

- Open **COMPOSE** in the terminal header or press `Command+Shift+Enter` while terminal or Chromux app-surface focus owns the shortcut.
- Inside the composer, `Enter` inserts a newline and `Command+Shift+Enter` submits. A successful submit clears the editor but leaves it open and focused. `Escape` closes it without clearing and returns focus to xterm.
- Composer text passes through xterm's supported paste and input APIs, preserving bracketed-paste handling, the existing PTY input path, shell-launch adoption, and turn tracking. Native terminal input remains the default and the hidden xterm helper textarea is unchanged.
- Drafts are independent per session, limited to 64 KiB, and included in managed schema-v4 restore snapshots. Restored drafts stay closed until requested; the **COMPOSE** control shows a draft indicator.
- Shell-only sessions warn before multiline submission. Cancelling preserves the draft and focus. Exited sessions preserve editable drafts but disable submission.
- `Option+Up` and `Option+Down` recall project history while preserving the current unsent scratch text. **HISTORY** offers case-insensitive search, full-prompt reuse, individual deletion, and confirmed project clearing.
- History is local plaintext at `~/.chromux/prompt-history.json`, grouped by canonical working directory. It keeps at most 100 unique prompts per project and at most 5 MiB globally, evicting the globally oldest entries when required. The file is atomically replaced with user-only `0600` permissions and is never synchronized by Chromux.

The raw xterm input remains the escape hatch for interactive programs, control sequences, alternate-screen applications, and any workflow that should not use prompt composition.

## Prepared in 0.64.0

- Full-Chromux browser mode exposes **COMPOSE**, docking the existing Composer beneath the full-width
  mounted browser. The drawer supports its existing expansion behavior and closes with `Escape`.
- A fresh target picker lists every live session plus **New session** and defaults to the paired
  session whenever the drawer opens. Existing-session sends use the recipient’s xterm/PTY input path,
  prompt history, activity timestamp, and attention transition without switching away from the source
  browser. Working agents accept steering.
- Routing blocks missing or exited sessions, pending recipient terminal input, and recipient-owned
  Composer drafts. The source draft stays intact and live targets expose a switch-to-target action.
  Multiline shell confirmation is based on the recipient agent type.
- **ATTACH CURRENT PAGE** is explicit and persists normal bounded capture evidence before adding a
  removable/refreshable chip. Only attached evidence appends bounded payload, screenshot, URL, and
  title references. Successful existing-session sends clear attachments; failures preserve them.
- **New session** uses canonical session creation with the source runtime, distribution, directory,
  and current URL but a fresh browser partition. It activates the new full-browser session, moves
  staged evidence, and leaves the prompt unsent for review. Grok keeps its explicit data-risk gate.
- Schema v9 now stores staged browser-context references and `fullBrowserComposerOpen`, keeps the
  routing target ephemeral, reads the unshipped schema-v9 `chatOpen` field as a compatibility fallback,
  and discards old `chatMessages`.

## Ordered post-v1 milestones

1. Define normalized `prompt`, `approval`, and `choice` interaction state, including stale-request detection and confidence handling.
2. Integrate Codex App Server behind a versioned adapter using schemas generated for the installed Codex CLI. Terminal scraping remains low-confidence and cannot authorize actions automatically.
3. Render structured approval and question controls in the active terminal pane and Threads preview. Preview xterms remain read-only, and actions route to the source session.
4. Add Monaco as a lazy-loaded editor adapter without changing composer persistence or submission contracts.

Monaco, Codex App Server, approval buttons, multiple-choice controls, and interactive Threads previews are intentionally outside 0.42.0.
