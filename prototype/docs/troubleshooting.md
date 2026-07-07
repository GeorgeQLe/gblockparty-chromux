# Chromux troubleshooting

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

For terminal link clicks, Chromux also supports existing relative paths such as `./index.html`, `../page.html`, and `~/path/page.html`. Use Command-click in the terminal to open one of these links.

If a file preview did not open:

1. Use an absolute path first, for example `/Users/me/project/dist/index.html`.
2. Confirm the path exists and ends in `.html` or `.htm`.
3. Avoid shell output that splits the path across lines.
4. Drag the file path into the terminal or paste it into the browser URL bar as `file:///Users/me/project/dist/index.html`.

## Review queue

Chromux does not hot-swap a busy browser pane. The first detected preview fills an empty pane; later URLs and popup windows go to QUEUE.

Use QUEUE to open the next preview intentionally. Command-J reveals and focuses the next queued OPEN button without opening it. If a page seems stale, check whether the updated URL is waiting in QUEUE.

Use the browser pane's COLLAPSE control or Command-Shift-B when you need the active terminal to take the full workspace width; the same shortcut restores the paired browser without clearing its URL, queue, or capture state.

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
| Hook settings and notify scripts | `~/.chromux/` |
| Browser profile | Electron partition `persist:chromux` |

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
