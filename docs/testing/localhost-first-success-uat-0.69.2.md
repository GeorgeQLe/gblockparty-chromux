# Localhost first-success UAT — Chromux 0.69.2

- Schema: `chromux.localhost-first-success.uat/v1`
- Verdict: **PASS**
- Candidate SHA: `f497832f135db9f843014baf26d6719d8a0ed771`
- Command: `npm run uat:localhost-first-success -- --allow-model-turns 1`
- Started: 2026-07-28T16:11:34.572Z
- Finished: 2026-07-28T16:11:50.441Z

## Fixture and approval

- Fixture: `http://localhost:52952/`
- Health: HTTP 200 / healthy
- Queue detected: 2026-07-28T16:11:35.826Z
- Explicit OPEN: 2026-07-28T16:11:35.830Z
- Automatic navigation before OPEN: no
- Loaded marker: `Release status: candidate ready for review`

## Attachment and routing

- Source alias: `fixture-shell`
- Selected target alias: `chosen-codex`
- Decoy alias: `decoy-codex`
- Attached: 2026-07-28T16:11:36.218Z
- Payload: exists=true, bytes=991
- Screenshot: exists=true, bytes=70501
- Selected target prompt payloads: 1
- Decoy prompt payloads: 0
- Submitted model turns: 1
- Retry count after submission: 0

## Bounded response and actionability

> • VERDICT: HOLD — “Visible blocker: approval transcript is not archived” marker; ACTION: one concrete next action.

- References a visible fixture marker: yes
- Recommends a concrete action: yes

## Cleanup

- Managed sessions stopped: yes
- Fixture listener stopped: yes
- Temporary Chromux profile removed: yes
- Temporary capture directory removed: yes
- Failure reasons: none
