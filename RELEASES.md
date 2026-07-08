# Release Notes

## GBlockParty Chromux v0.12.8

Planned tag: `chromux-v0.12.8`

- Harden terminal preview parsing so code, diff, search, test fixture, markdown, and release-note examples containing localhost URLs do not open or queue fake previews.
- Preserve real dev-server/prose preview detection for lines such as `Local: http://localhost:5173/` and `ready on http://localhost:3000`.
- Document the future explicit Chromux preview OSC signal path, with MCP planned as an adapter over the same internal preview action.

## GBlockParty Chromux v0.12.7

Planned tag: `chromux-v0.12.7`

- Suppress preview detection from completed user-typed localhost and local `.html` command echoes, including commands assembled across terminal input chunks.
- Add queue source/reason metadata so review queue rows and attention details explain why each preview exists, with legacy restored queue records labeled as restored from a previous session.

## GBlockParty Chromux v0.12.6

Planned tag: `chromux-v0.12.6`

- Fix Command+1..9 session switching when Electron reports top-row number keys through `input.code` as `Digit1` through `Digit9` instead of a plain digit `input.key`.

## GBlockParty Chromux v0.12.5

Planned tag: `chromux-v0.12.5`

- Add Command+Shift+B and a View menu item to toggle the active session's paired browser between collapsed and restored states.
- Keep the browser collapse shortcut guarded while modals or editable fields are focused, matching the existing shell-level shortcut behavior.
- Extend the browser-collapse renderer smoke test to cover the shortcut path in addition to the collapse/restore control.

## GBlockParty Chromux v0.12.4

Planned tag: `chromux-v0.12.4`

- Add a Codex-only renderer fallback that marks an already-working turn completed when Codex reaches a known idle or rate-limit interstitial state, while preserving OSC `turn-end` as the primary signal.
- Reject malformed localhost preview tokens that concatenate nested URLs or include prompt glyph contamination, and preserve delimiters while stripping terminal control sequences so status redraws cannot corrupt preview URLs.
- Suppress localhost previews echoed from typed Codex prompt input once per occurrence, while still allowing the same URL to route when later printed by agent output.

## GBlockParty Chromux v0.12.3

Planned tag: `chromux-v0.12.3`

- Keep completed attention rows display-hidden only while their own session is focused; they now reliably reappear after blur unless explicitly dismissed or superseded by new input.
- Stop queuing malformed terminal preview URLs when Codex output wraps or concatenates localhost URLs; nested `http://` / `https://` starts are split and prompt glyphs terminate the current URL.

## GBlockParty Chromux v0.12.2

Planned tag: `chromux-v0.12.2`

- Move renderer attention and turn-transition rules into a dedicated `renderer/attention.js` domain module, leaving DOM rendering and activation actions in `renderer.js`.
- Normalize deterministic Claude/Codex lifecycle inputs through one turn vocabulary while keeping malformed or wrong-session OSC sequences diagnostic-only.
- Reorder the attention rail as an actionable triage queue: input needed, delivery failures, actionable update states, queued previews, completed turns, then passive update waiting.
- Keep focused-session hiding, dismiss acknowledgements, user-input turn transitions, and update safety derived from canonical turn state instead of rendered queue rows.

## GBlockParty Chromux v0.12.1

Tag: `chromux-v0.12.1`

- Show the running app's actual version in Settings even when update release metadata comes from the one-day cache.
- Recompute cached update availability against the live app version so newer local builds do not display stale update prompts.
- Reopen the exact installed `/Applications/Chromux.app` bundle after managed update installs instead of resolving by bundle name.

## GBlockParty Chromux v0.12.0

Planned tag: `chromux-v0.12.0`

- Change the update action from opening GitHub Releases to a managed install flow that runs the recorded local `npm run install-app` source.
- Save a workspace restore snapshot before managed update installs, quit Chromux, run the installer after the current app exits, and reopen Chromux when installation finishes.
- Keep the GitHub Release URL visible as a reference link, while Settings and update attention now label the primary action as INSTALL UPDATE / RETRY INSTALL.

## GBlockParty Chromux v0.11.1

Planned tag: `chromux-v0.11.1`

- Let queued update attention items be dismissed from WAITING, READY, and FAILED states; dismissal clears the stale reminder back to idle while preserving the available release.
- Allow the update queue to be queued again after dismissal, so cleared or newly opened Codex windows can bring back UPDATE WAITING or UPDATE READY as current session safety changes.

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
