# Chromux — v1 prototype

A macOS desktop **agent cockpit**: parallel Claude Code / Codex terminal sessions, each paired
1:1 with an embedded Chromium browser pane. Localhost dev-server previews and generated
`file://` HTML open next to the session that produced them — no alt-tabbing — and one click
packages browser evidence (console tail + picked element + screenshot + URL) into a YAML
payload delivered to an agent via `claude -p`.

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
   SHELL ONLY. Chromux spawns your login shell and launches the agent CLI *unchanged* — it
   wraps the CLIs, never modifies them.

   **…or adopt what's already running** — hit **⛶ DETECT** (⌘D). Chromux scans your open
   terminal tabs (`ps` + `lsof`, tab titles via Terminal.app/iTerm2 AppleScript) and lists
   every live `claude` / `codex` process with its project directory, plus plain-shell tabs.
   Per row: **RESUME** re-opens that project's latest saved conversation in a new Chromux
   session (`claude --resume <id>` / `codex resume <id>`), **FRESH** starts a new one in the
   same directory, **OPEN SHELL** adopts a shell tab's cwd. **OPEN ALL AGENTS** does the lot,
   resuming where a saved session exists. The original tabs are never touched — everything is
   read-only; if the agent is still running in the terminal, the resumed copy diverges from
   the last save point.
2. **Let the preview find you** — run your dev server (or ask the agent to). When the terminal
   prints `http://localhost:5173` (or any loopback URL, or an absolute `/path/to/page.html`),
   the paired browser pane auto-opens it. An empty pane auto-fills; a busy pane never gets
   hot-swapped — later URLs land in the badged **QUEUE**, and popups from the page do too.
   Re-emitting the same URL auto-refreshes the pane (throttled). Use **COLLAPSE** or
   `Command+Shift+B` to hide/show the paired browser for the active session.
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
| Main process | `main.js` | PTYs (`node-pty`), capture persistence, `claude -p` adapter, popup interception, external terminal/agent-session detection |
| Bridge | `preload.js` | narrow `window.chromux` API, no node in the page |
| Guest bridge | `webview-preload.js` | element-picker results and focused-editable status |
| UI | `renderer/` | sessions, xterm terminals, paired webviews, review queue, capture modal |
| Payload contract | `docs/capture-payload.md` | schema v1, field bounds, retention |

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
  `~/.codex/sessions`); two agents in the same directory can't be told apart.

## Storage map

| What | Where |
| --- | --- |
| Capture payloads + screenshots | `~/.chromux/captures/<timestamp>/` |
| Delivery log | `~/.chromux/delivery-log.jsonl` |
| Browser pane profile | Electron partition `persist:chromux` |

Nothing leaves the machine except what `claude -p` itself sends.
