# Release Notes

## GBlockParty Chromux v0.11.0

Planned tag: `chromux-v0.11.0`

- Add a per-session paired-browser collapse control: collapsed sessions expand the terminal, keep a narrow restore rail visible, disable divider resizing, and preserve browser URL, queue, webview, and capture state.
- Restore each browser pane to its previous split width and refit the paired terminal after collapse, restore, divider drag, and session activation.
- Make the paired browser header controls horizontally scrollable when the pane is narrow, keeping Queue, Pick Element, and Capture reachable instead of squeezing controls into overlap.
- New test: `test:browser-collapse-renderer` covers collapse/restore state preservation, per-session tab switching, terminal refit, disabled divider behavior, and narrow-toolbar reachability.

## GBlockParty Chromux v0.10.1

Planned tag: `chromux-v0.10.1`

- Preserve a pending (unconsumed, non-empty) restore snapshot when quitting with zero open sessions; an idle Command+Q can no longer destroy a workspace the user hadn't reopened yet. Quits with open sessions still write a fresh `app-close` snapshot.
- Guard Command+J against editable focus, matching Command+1..9: focusing the next queued preview no longer fires while an input, textarea, select, or contenteditable is focused (or while a modal is open).
- Stop pointing agents at broken hook paths when the startup hook install fails: `get-env` now returns `null` for `hooksSettingsPath`/`codexNotifyPath` unless the corresponding file was written successfully, and both main and renderer fall back to launching bare `claude`/`codex`.
- Quote agent launch commands for the shell: hook/notify paths (and resume ids) are POSIX single-quoted, and the codex notify path is additionally TOML-escaped, so a HOME containing spaces, quotes, or backslashes no longer produces an unparseable command.
- New test: `test:agent-command-quoting` builds claude/codex commands under a hostile HOME and verifies them with zsh; `test:shortcuts-renderer` now exercises the guarded shortcut IPC paths with an editable focused.
- Upgrade the prototype runtime/build devDependencies to Electron 43 and `@electron/rebuild` 4.1.0, clearing npm audit findings before packaging and raising the prototype Node prerequisite to 22.12+.
- Add a troubleshooting guide for preview detection, file previews, queued reviews, screenshots, console logs, CLI delivery, wrong-session routing, and local storage cleanup.

## GBlockParty Chromux v0.10.0

Planned tag: `chromux-v0.10.0`

- Replace regex-based agent attention heuristics with deterministic turn signals: Claude Code sessions launch with a Chromux-managed `--settings` hooks file (UserPromptSubmit/Notification/Stop) and Codex sessions with a `notify` override; both emit a Chromux OSC sequence that rides the session's own PTY.
- Add the Chromux OSC v1 wire protocol and a chunk-boundary-safe parser (`renderer/signals.js`); signals whose session id does not match the PTY they arrived on are dropped and recorded as rejected.
- Restructure renderer session state into explicit domains (identity, lifecycle, turn, browser, terminal) with a single `apply()` event seam, a bounded diagnostic event ring, and coalesced rendering.
- Make the attention queue a pure projection: the focused session's items are hidden while focused and reappear on blur; DISMISS acknowledges without deleting state; typing after completion returns the turn to working (stale output can no longer resurrect COMPLETED); exited sessions show only the dead tab dot.
- Derive update-queue safety from turn state (exited/needs-input/completed are safe; working/unknown block) so focusing a session can no longer regress a READY update to WAITING.
- Track captures as first-class records with a delivery index: overlapping deliveries resolve independently, failures attribute to the capture's own target/capturing session (never the focused one), the SENT gauge counts only exit-0 deliveries, records survive modal close, and the browser pane shows a capture chip for its current URL.
- Guard shell-level shortcuts: Command+1..9 switch sessions from the Chromux shell, Command+J reveals and focuses the next queued preview's OPEN button without opening it, and Command+Q now routes through the quit confirmation flow.
- New tests: `test:osc-parser`, `test:turn-signals-renderer` (replaces `test:attention-signals-renderer`), `test:capture-records-renderer`, `test:shortcuts-renderer`; update-queue test rewritten onto turn state.

## GBlockParty Chromux v0.9.0

Planned tag: `chromux-v0.9.0`

- Switch update checks from local source comparisons to GitHub Releases.
- Cache automatic update checks for up to one day while allowing manual checks to bypass the cache.
- Open the GitHub Release URL for newer versions instead of auto-installing binaries.
- Prepare the project for publication as `GeorgeQLe/gblockparty-chromux` under the MIT license.
