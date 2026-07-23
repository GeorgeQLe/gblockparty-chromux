# Chromux troubleshooting

## Saved project cannot start

Chromux enables **START PROJECT** only when the directory exists, contains a readable `package.json`, and
the selected script still exists. The runner comes from `packageManager` or a recognized lockfile, falling
back to npm. Started server URLs remain in the review queue until explicitly opened. Delete
`~/.chromux/projects.json` while Chromux is closed to clear saved projects; malformed or stale entries are
ignored safely.

This guide covers the first local loop: terminal output opens a paired browser preview, browser evidence becomes a capture payload, and delivery runs through `claude -p`.

## Preview detection

Chromux watches complete terminal lines from each session. It auto-detects:

- `http://` or `https://` URLs on `localhost`, `127.0.0.1`, `0.0.0.0`, or `[::1]`
- loopback URLs with a port, such as `http://localhost:5173`
- loopback URLs with a path, such as `http://localhost/app`
- absolute local `.html` or `.htm` paths that exist on disk

`0.0.0.0` and `[::1]` are normalized to `localhost` before loading in the browser pane. Bare `http://localhost` is ignored because it is too easy to match accidentally.

If a preview did not open:

1. Reprint the full URL on one line in the paired terminal.
2. Make sure the URL includes a port or path.
3. Paste the URL into the pane's URL bar as a manual fallback.
4. Check the pane's QUEUE badge; if the pane was already showing another page, the new URL waits there instead of replacing the current page.

If the same URL is printed again, Chromux refreshes the pane instead of adding a duplicate queue item.

## File previews

Chromux detects absolute `.html` and `.htm` paths only after confirming the file exists. The resulting preview loads through `file://`.

For terminal link clicks, Chromux resolves HTML paths against the live PTY directory,
the session launch directory, and the Git/project root. If those do not resolve, a
repository-wide filename/suffix match opens only when it is unique. Ambiguous matches
open the project HTML explorer prefiltered to the filename instead of guessing.

If a file preview did not open:

1. Click **⌕** to open the HTML explorer rooted at the session's Git root (or launch directory).
2. Filter by filename, browse folders containing HTML descendants, and use **REFRESH** after generating a file.
3. Confirm the path stays inside the project and ends in `.html` or `.htm`; dependency/cache/VCS trees and outside symlinks are excluded.
4. Paste absolute, home-relative, live-terminal-relative, launch-relative, or project-relative paths into the URL bar. Spaces and `#` characters are encoded when the file opens.

## Paired browser tabs

Terminal HTTP(S) links, queue **OPEN**, favorites, and explorer file selections
create or focus a page tab in the originating session. Exact normalized URLs are
deduplicated. A typed web URL navigates the active page tab, or creates one from
the explorer/blank state. Closing the active tab chooses its nearest neighbor;
closing the last tab returns to the blank preview.

Back, reload, favorite, console, picker, and capture controls always target the
active page tab. Page tabs in one session share cookies/storage, while different
terminal sessions remain isolated.

## Review queue

Chromux never auto-opens a detected preview. Every localhost / loopback / local `.html` hit and every popup goes to QUEUE until you approve it. Opening a queued or favorite URL creates/focuses a page tab and restores the browser if it was shut.

Use QUEUE to open the next preview intentionally. Command-J reveals and focuses the next queued OPEN button without opening it. If a page seems stale, check whether the updated URL is waiting in QUEUE.

New sessions start with the paired browser shut so the terminal owns the workspace. Use the browser rail's BROWSER control (or Command-Shift-B) to open it, and COLLAPSE / Command-Shift-B again to shut it. Toggle does not clear URL, queue, or capture state.

## Favorites

Use the star beside the URL bar to pin the current page, or `PIN` on a review
queue row. Favorites are global in v1: every session shows the same list, and
choosing one opens it in whichever session is active. Opening a favorite also
restores that session's paired browser if it was shut.

Chromux stores at most 200 favorites in `~/.chromux/favorites.json`. It accepts
only `http:`, `https:`, and `file:` URLs, removes fragments such as `#section`
before deduplication, and safely treats a missing or malformed file as an empty
list. To reset the list, quit Chromux and delete `~/.chromux/favorites.json`.

## Screenshots

Capture tries to save the visible viewport as `screenshot.png` next to the YAML payload. Screenshot failure does not cancel the capture. The payload is still written and `screenshot.mode` becomes `unavailable`.

If screenshots are missing:

1. Retry after the page finishes loading.
2. Make sure the browser pane is showing the page you meant to capture.
3. Use the payload path shown in the capture modal; the YAML is still usable without the image.

## Console logs

Chromux records browser console messages seen by the pane after it opens. Capture includes the last 50 entries, and each message is capped at 500 characters. The payload reports `console.total_captured`, `console.included`, and whether entries were truncated.

If the expected log is not in the payload:

1. Reproduce the issue after the pane is open.
2. Check the console chip in the pane header for the current log count and error count.
3. Capture soon after reproducing; older messages drop out of the 50-entry tail.
4. Add important missing context in the capture note before delivery.

## CLI auth and delivery

`SEND - claude -p` starts a one-off `claude -p` through your login shell in the target directory. Finder-launched app builds use the same login-shell PATH behavior as the terminal PTYs.

If delivery fails:

1. Run `claude -p` in Terminal and confirm it is installed and authenticated.
2. Check the capture modal for the exact manual retry command.
3. Use FILE-DROP ONLY if you want to save the payload without sending it.
4. Open DELIVERY LOG from the status bar to inspect prior attempts.

Every capture is written before delivery, so a failed send does not lose the payload.

## Wrong-session routing

The capture target defaults to the paired session, but the review modal can send to another session or one-off `claude -p`.

If evidence went to the wrong place:

1. Check the target selector in the capture modal before sending.
2. Confirm the target cwd shown in the modal.
3. For DETECT rows, remember that RESUME opens the latest saved Claude or Codex conversation for that project directory. Two live agents in the same directory cannot be distinguished by saved-session lookup.
4. For external terminal adoption, DETECT is read-only: it starts a new Chromux PTY from the detected cwd or saved session; it does not attach to the original terminal tab.

If DETECT rows are missing tab titles, grant Chromux Automation access to Terminal and iTerm2 in System Settings, Privacy & Security, Automation. The `ps` and `lsof` scan can still find processes without tab-title access.

## Storage cleanup

Chromux stores local artifacts under your home directory:

| Data | Location |
| --- | --- |
| Capture payloads and screenshots | `~/.chromux/captures/<timestamp>/` |
| Delivery log | `~/.chromux/delivery-log.jsonl` |
| Global favorites | `~/.chromux/favorites.json` |
| Hook settings and notify scripts | `~/.chromux/` |
| Browser profiles | Session-specific Electron partitions `persist:chromux-<session ID>` |

### Resource broker unavailable or stuck

Open **RESOURCES** and use **REFRESH** first. The daemon normally starts on demand at `~/.chromux/resource-broker.sock`. If MCP tools are missing, run `/mcp` in Codex and follow the registration steps in [`resource-broker.md`](resource-broker.md). A queued request advances automatically when its owner releases, disconnects, or reaches TTL. Use **FORCE RELEASE** only after confirming the displayed owner is stale; it cannot stop an operation that already escaped the wrapper.

Chromux does not currently expire capture directories. To reclaim disk space, delete old directories under `~/.chromux/captures/`. To clear delivery history, delete `~/.chromux/delivery-log.jsonl`.

Do not delete a capture directory until you no longer need its `payload.yaml` or `screenshot.png` for manual retry or audit.

## Manual retry reference

From a capture directory:

```sh
claude -p "$(cat payload.yaml)"
```

From another directory:

```sh
cd /path/to/project
claude -p "$(cat /Users/me/.chromux/captures/<timestamp>/payload.yaml)"
```

See [capture-payload.md](capture-payload.md) for the YAML schema and field limits.
See [privacy-and-local-data.md](privacy-and-local-data.md) for the complete local-data map, outbound boundaries, and cleanup guidance.

## A thread's attention reason is missing or marked legacy

Use the rail's **Threads** icon for actionable items and unseen background completions. Sessions with
outstanding work are pinned in the expanded **Needs Attention** section above working-directory groups.
Opening a completed session removes only that completion reason and returns the session to its directory
group when no other reasons remain. Permission, authentication, input, rate-limit, and tool-failure items are
not cleared by opening their session. **Git Changes** resolves the repositories used
by live sessions and tracks their staged, unstaged, untracked, renamed, and conflicted files. Clean working
trees remain visible as clean; non-repository sessions are omitted. New outstanding work changes the Threads
badge but does not switch away from Git Changes.

Chromux regenerates its classifier and installed hook files at startup. New v2
events are authenticated to one PTY; copied terminal output, callbacks from a
different session, and stale or duplicate callbacks are intentionally rejected.
If classifier installation fails, Claude, Codex, and Grok use the existing v1
adapter where it can be written, otherwise that agent launches uninstrumented—a
command is never launched with a missing helper path. Existing user settings and
configs are not replaced: Claude receives an additional `--settings` file,
Codex receives a launch-scoped `notify` value, and Grok uses its global hook
discovery file, which no-ops outside Chromux.
