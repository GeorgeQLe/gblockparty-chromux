# Chromux capture payload — YAML schema v1

Every browser→agent capture is a single YAML document written to
`~/.chromux/captures/<timestamp>/payload.yaml` **before** any delivery attempt, so payloads are
always inspectable and manually retryable (`claude -p "$(cat payload.yaml)"`).

## Schema

```yaml
schema_version: 1                 # integer; bump on breaking change
captured_at: 2026-07-06T21:14:03.512Z   # ISO-8601, capture time
session:
  id: s2                          # originating Chromux session id (required in every payload)
  name: web-app
  project_path: /Users/me/projects/web-app
page:
  url: http://localhost:5173/checkout
  title: Checkout — Web App
selection:                        # null for page-level captures (no element picked)
  selector: '#cart > div.line-item:nth-of-type(3) > button.remove'
  outer_html: '<button class="remove" …>'   # bounded, see limits
  truncated: false
console:
  total_captured: 214             # all messages seen since the pane opened
  included: 50                    # tail actually included
  truncated: true
  entries:
    - ts: 2026-07-06T21:13:58.101Z
      level: error                # debug | info | warn | error
      message: 'Uncaught TypeError: cart.items is undefined'
screenshot:
  path: /Users/me/.chromux/captures/2026-07-06_21-14-03/screenshot.png
  mode: visible-viewport          # or "unavailable" — payload is kept without an image
delivery:
  adapter: claude -p              # v1's only agent adapter; file-drop is logged separately
  target: web-app                 # paired session name, another session, or "one-off"
  target_cwd: /Users/me/projects/web-app
notes: the remove button deletes the wrong line item   # user note; null if omitted
```

## Field bounds

| Field | Bound | On overflow |
| --- | --- | --- |
| `selection.outer_html` | 8,000 chars | truncate + `truncated: true` |
| `console.entries` | last 50 messages | drop oldest + `truncated: true`, `total_captured` keeps the real count |
| `console.entries[].message` | 500 chars each | truncate |

Bounds exist so a payload stays cheap to send through `claude -p` and legible to inspect;
truncation is always declared in-band rather than silent.

## Retention

Chromux never deletes captures. Each capture directory is self-contained
(`payload.yaml` + optional `screenshot.png`); reclaim space by deleting directories under
`~/.chromux/captures/`. Delivery attempts (adapter, target, exit status, payload path) append
to `~/.chromux/delivery-log.jsonl`.

## Versioning

`schema_version` is bumped on any breaking change to field names, nesting, or semantics.
Additive optional fields do not bump the version. v1 intentionally excludes network/telemetry
capture (perf entries, request waterfall) — deferred per the idea brief.
