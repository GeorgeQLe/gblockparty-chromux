# Chromux — v1 prototype

A macOS desktop **agent cockpit**: parallel Claude Code / Codex / Grok Build terminal sessions,
each paired 1:1 with an embedded Chromium browser pane. Localhost dev-server previews and
generated `file://` HTML open next to the session that produced them — no alt-tabbing — and
one click packages browser evidence (console tail + picked element + screenshot + URL) into a
YAML payload delivered to an agent via `claude -p`.

Scope follows `research/idea-brief.md`: this is the "smallest v1 you'd actually use every day"
(interview round 2, Q5). Deferred: live-session stdin injection, full network telemetry,
unified-sidebar layout toggle, productization.

![Chromux cockpit](docs/screenshot.png)

## Quickstart — the first local loop

Requires: macOS, Node 22.12+, Xcode command-line tools (for the `node-pty` native build), and the
`claude` CLI on your PATH (only needed for delivery; everything else works without it).

```sh
cd prototype
npm install        # also rebuilds node-pty against Electron
npm start
```

### Install as a macOS app

```sh
npm run install-app   # packages Chromux.app (arm64) and copies it to /Applications
```

This builds `dist/Chromux-darwin-arm64/Chromux.app` with `@electron/packager` (asar-packed,
with `node-pty` unpacked so its `spawn-helper` can exec) and replaces any existing
`/Applications/Chromux.app`. The app is unsigned — fine for a locally-built personal tool;
Gatekeeper only quarantines downloaded bundles. Launch from Spotlight as "Chromux". Both the
terminal PTY and `claude -p` delivery run through your login shell, so PATH and CLI auth work
the same as in Terminal even when launched from Finder.

Then complete the loop:

1. **Start a session** — `+ NEW`, pick your project directory, choose CLAUDE CODE / CODEX /
   GROK BUILD / SHELL ONLY. Chromux spawns your login shell and launches the agent CLI
   *unchanged* — it wraps the CLIs, never modifies them.

   **…or adopt what's already running** — hit **⛶ DETECT** (⌘D). Chromux scans your open
   terminal tabs (`ps` + `lsof`, tab titles via Terminal.app/iTerm2 AppleScript) and lists
   every live `claude` / `codex` / `grok` process with its project directory, plus plain-shell
   tabs. Per row: **RESUME** re-opens that project's latest saved conversation in a new
   Chromux session (`claude --resume <id>` / `codex resume <id>` / `grok --resume <id>`),
   **FRESH** starts a new one in the same directory, **OPEN SHELL** adopts a shell tab's cwd.
   **OPEN ALL AGENTS** does the lot, resuming where a saved session exists. The original tabs
   are never touched — everything is read-only; if the agent is still running in the terminal,
   the resumed copy diverges from the last save point.
2. **Approve the preview** — run your dev server (or ask the agent to). When the terminal
   prints `http://localhost:5173` (or any loopback URL, or an absolute `/path/to/page.html`),
   Chromux queues it in the badged **QUEUE** — nothing auto-opens. Approve with queue
   **OPEN**, **⌘-click** a terminal link, or type a URL in the browser bar and hit ⏎.
   Opening a URL also restores a shut browser. New sessions start with the paired browser
   shut; use **RESTORE** / **COLLAPSE** or `Command+Shift+B` to open/shut it. Re-emitting
   the same already-open URL auto-refreshes the pane (throttled). Popups queue too.
3. **Capture evidence** — hit **⌖ PICK ELEMENT**, hover to highlight, click the broken thing
   (Esc cancels). Or **⚡ CAPTURE** for a page-level capture. Review the YAML payload, add a
   note, pick a target (paired session by default, redirectable), then:
   - **SEND — claude -p**: runs a one-off `claude -p` in the target session's project
     directory with the payload as the prompt, streaming output back; or
   - **FILE-DROP ONLY**: just writes the payload to disk for manual use.

Every capture is written to `~/.chromux/captures/<timestamp>/payload.yaml` (+
`screenshot.png`) *before* delivery, so a failed send is always manually retryable — the
failure screen shows the exact retry command. Every attempt is logged to
`~/.chromux/delivery-log.jsonl` (DELIVERY LOG button in the status bar).

## What's in the box

| Piece | File | Notes |
| --- | --- | --- |
| Main process | `main.js` | PTYs (`node-pty`), capture persistence, `claude -p` adapter, popup interception, external terminal/agent-session detection (Claude / Codex / Grok) |
| Bridge | `preload.js` | narrow `window.chromux` API, no node in the page |
| Guest bridge | `webview-preload.js` | element-picker results and focused-editable status |
| UI | `renderer/` | sessions, xterm terminals, paired webviews, review queue, capture modal |
| Payload contract | `docs/capture-payload.md` | schema v1, field bounds, retention |
| Privacy and local data | `docs/privacy-and-local-data.md` | local storage map, outbound boundaries, deletion guidance |

## Troubleshooting

See [`docs/troubleshooting.md`](docs/troubleshooting.md) for the full support guide.

- **`node-pty` failed to build** — install Xcode CLT (`xcode-select --install`), then
  `npm run rebuild`.
- **Preview not detected** — detection scans complete terminal lines for
  `http(s)://localhost|127.0.0.1|0.0.0.0|[::1]` URLs (a port or path is required, so wrapped
  fragments don't false-positive) and absolute `*.html` paths (which must exist on disk).
  Paste the URL into the pane's URL bar as a manual fallback.
- **`claude -p` exits non-zero** — delivery runs `claude -p` through your login shell, so PATH
  and auth match your terminal. Check `claude` works there; the payload file is kept and the
  modal shows a copy-pastable retry command.
- **Screenshot missing** — capture keeps the payload without it and marks
  `screenshot.mode: unavailable`.
- **DETECT shows tabs without titles** — grant Chromux Automation access to Terminal/iTerm2
  (System Settings → Privacy & Security → Automation; macOS prompts on the first scan).
  Detection itself (`ps`/`lsof`) works without it — you just lose the tab titles.
- **DETECT's RESUME opens the wrong conversation** — resume targets the *latest saved*
  session for the tab's project directory (`~/.claude/projects/<dir>` /
  `~/.codex/sessions` / `~/.grok/sessions/<encoded-cwd>`); two agents in the same directory
  can't be told apart.

## Storage map

| What | Where |
| --- | --- |
| Capture payloads + screenshots | `~/.chromux/captures/<timestamp>/` |
| Delivery log | `~/.chromux/delivery-log.jsonl` |
| Restore snapshot | `~/.chromux/restore-sessions.json` |
| Update cache/source/install log | `~/.chromux/update-cache.json`, `~/.chromux/update-source.json`, `~/.chromux/update-install.log` |
| Hook settings and notify scripts | `~/.chromux/hooks-claude.json`, `~/.chromux/codex-notify.sh`, `~/.chromux/hooks-grok.json`, `~/.chromux/grok-hook.sh`, and `~/.grok/hooks/chromux-turn-signals.json` |

## Agent attention protocol

Chromux creates a random 256-bit signal token for every PTY and exposes it only
to that session's processes. Generated hooks use Electron's embedded Node
runtime to classify native callback JSON, bound message text, and write an
authenticated base64url-JSON v2 OSC envelope to `/dev/tty`. Chromux rejects
wrong session, token, or agent claims; malformed or oversized envelopes;
duplicates; stale sequences and turns; and invalid transitions. Legacy v1 OSC
remains accepted at lower confidence, and Codex prompt output is only a final
fallback after a recently inferred working turn.

Claude Code and Grok Build provide native start, actionable-notification, and
completion callbacks. Codex provides native completion while start is inferred
from submitted Enter; its actionable notification capabilities are unavailable.
Unknown native notifications are retained in local diagnostics and never create
an attention row. Chromux does not post macOS Notification Center alerts.
| Browser pane profile | Electron partition `persist:chromux` |

Chromux has no account, cloud sync, Chromux-hosted capture upload, or product
telemetry in the current prototype. Browser pages, update checks, agent CLIs,
and `SEND - claude -p` can make outbound requests. See
[`docs/privacy-and-local-data.md`](docs/privacy-and-local-data.md) for the full
data-handling notice.
