# Explicit Preview Signal

Chromux currently discovers previews from PTY output as a compatibility fallback:
localhost URLs and existing local `.html` paths printed by a session can open the
paired browser pane or enter the review queue.

For agent-aware integrations, the preferred direction is an explicit OSC signal
that rides the same terminal stream as the existing turn lifecycle events:

```text
ESC ] 777 ; chromux ; v1 ; preview ; <session-id> ; <url-b64url> BEL
```

Rules:

- `<session-id>` must match the PTY session that emitted the sequence.
- `<url-b64url>` is the UTF-8 preview URL encoded with unpadded base64url.
- The renderer should route this through the same internal preview action used
  by terminal detection, so queue behavior, reasons, duplicate handling, and
  restore metadata stay unified.
- MCP should become a convenience adapter over this preview action, not a
  separate routing system.

Chromux should keep the terminal parser fallback because useful preview output
also comes from non-agent tools and development servers that do not know about
Chromux.
