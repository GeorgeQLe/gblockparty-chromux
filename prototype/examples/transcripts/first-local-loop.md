# Demo transcript — the first local loop (scripted E2E, 2026-07-06)

Produced by driving the real app (`CHROMUX_E2E=<driver> npx electron . --smoke`): a shell
session is created through the actual PTY, a preview path is echoed through the terminal,
and the capture pipeline runs end-to-end against the live webview.

```
PASS session created + pty alive
PASS pty produced terminal output
PASS file:// preview auto-opened in empty pane — file:///tmp/chromux-e2e.html
PASS guest console captured — 3 msgs, 1 errors
PASS second preview queued (no hot-swap) — ["http://localhost:5199/"]
PASS capture modal opened with YAML preview
PASS screenshot captured — 28316 b64 chars
PASS file-drop wrote payload — payload: ~/.chromux/captures/2026-07-06_05-32-59/payload.yaml
```

Delivery adapter verified separately (exact command the app runs, login shell + stdin prompt):

```
$ echo "Reply with exactly: CHROMUX-ADAPTER-OK" | /bin/zsh -lc 'claude -p'
CHROMUX-ADAPTER-OK
```

The resulting payload and screenshot from this run are preserved as
[`examples/captures/sample-capture.yaml`](../captures/sample-capture.yaml) and
[`examples/captures/sample-screenshot.png`](../captures/sample-screenshot.png).

What this proves, mapped to the idea brief's riskiest unknowns:

1. **Embedded browser feasibility** — a first-class Chromium pane (Electron `<webview>`) pairs
   1:1 with a PTY session, with console capture, element picking, and screenshots working.
2. **Payload → agent handoff** — the bounded YAML payload reaches `claude -p` through the
   user's login shell, and every payload is file-dropped to `~/.chromux/captures` first, so
   failed deliveries are always manually retryable.
