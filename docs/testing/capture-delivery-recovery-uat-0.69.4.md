# Capture Delivery Failure-Recovery UAT — v0.69.4

Date: 2026-07-28

Result: **PASS**

## Scope

This deterministic UAT exercised Chromux's real Electron capture persistence
and `claude -p` delivery adapter with an isolated home directory. A controlled
local CLI fixture deliberately failed the first delivery, and the exact
documented manual retry form then delivered the same persisted YAML payload.
No real Claude account, credential, network request, or model turn was used.

## Sanitized transcript

| Step | Operator-visible action or result | Evidence |
| --- | --- | --- |
| 1 | Prepare capture before delivery | Payload and screenshot were written beneath the isolated Chromux capture directory. |
| 2 | Send through `claude -p` | Fixture exited 23; delivery output reported `FIXTURE_INDUCED_DELIVERY_FAILURE`. |
| 3 | Inspect retained artifacts | Payload remained 1014 bytes with SHA-256 `7e2325a949738744425ca190af0fe3a0b7766021bf72ff0d400fa5420c763878`; screenshot remained 68 bytes with SHA-256 `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`. |
| 4 | Inspect delivery history | `delivery-log.jsonl` retained one failed `claude -p` attempt for the same payload path and exit 23. |
| 5 | Follow documented retry route | Ran `cd '<project>' && claude -p "$(cat '<payload>')"` with no file edits or replacement. |
| 6 | Confirm recovery | Fixture exited 0 and reported the persisted YAML content SHA-256 `2922d5689d6b7242dd47296785dc1315051c56f5726bcebb5be96c48fe822f5c` after shell-standard trailing-newline removal. |
| 7 | Recheck artifacts | Payload and screenshot hashes were unchanged after recovery. |

## Artifact boundary

- Payload: `<isolated-chromux-home>/captures/<capture>/payload.yaml`
- Screenshot: `<isolated-chromux-home>/captures/<capture>/screenshot.png`
- Delivery log: `<isolated-chromux-home>/delivery-log.jsonl`
- Fixture invocation count: 2 (one induced failure,
  one documented retry)
- Temporary profile, capture files, fixture executable, and delivery log were
  removed after these bounded facts were recorded.

## What this proves

- Chromux persists capture artifacts before invoking its delivery adapter.
- A failed adapter attempt does not delete or rewrite the payload or screenshot.
- The failed attempt is recorded with the same payload path.
- The documented manual retry command can deliver the persisted payload content
  after a deliberately induced transient failure. Shell command substitution
  removes the file's trailing newline; it does not rewrite the artifact.
- Recovery required no hidden mutation or credential intervention.

This is a controlled recovery-mechanism proof, not evidence that an inactive
Claude subscription can authenticate successfully. Real account recovery would
still require valid Claude access.
