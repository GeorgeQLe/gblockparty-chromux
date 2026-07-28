# Localhost first-success UAT — Chromux 0.69.2

- Schema: `chromux.localhost-first-success.uat/v1`
- Verdict: **HOLD**
- Candidate SHA: `952e42046f61892ccce92138f877d9a6e2f7d714`
- Command: `npm run uat:localhost-first-success -- --allow-model-turns 1`
- Started: 2026-07-28T16:06:07.032Z
- Finished: 2026-07-28T16:06:10.227Z

## Fixture and approval

- Fixture: `http://localhost:52662/`
- Health: HTTP 200 / healthy
- Queue detected: 2026-07-28T16:06:08.222Z
- Explicit OPEN: 2026-07-28T16:06:08.227Z
- Automatic navigation before OPEN: no
- Loaded marker: `Release status: candidate ready for review`

## Attachment and routing

- Source alias: `fixture-shell`
- Selected target alias: `chosen-codex`
- Decoy alias: `decoy-codex`
- Attached: 2026-07-28T16:06:08.619Z
- Payload: exists=true at attachment checkpoint, bytes=not retained after runner abort
- Screenshot: exists=true at attachment checkpoint, bytes=not retained after runner abort
- Selected target prompt payloads: 1
- Decoy prompt payloads: unresolved; the runner counted all terminal-protocol replies as input
- Submitted model turns: 1
- Retry count after submission: 0

## Bounded response and actionability

> (no qualifying response captured)

- References a visible fixture marker: no
- Recommends a concrete action: no

## Cleanup

- Managed sessions stopped: yes
- Fixture listener stopped: yes
- Temporary Chromux profile removed: yes
- Temporary capture directory removed: yes
- Failure reasons: the post-submission assertion counted Codex/xterm terminal-protocol replies as routed input; the runner stopped before a response and did not return artifact size metadata

## Run notes

- Candidate `537a07f232be11ec9f2bf37da404d05ac589b10e`
  stopped during setup because renderer CSP blocked a direct health fetch.
  It submitted zero model turns, opened no page, and cleaned up completely.
- Candidate `952e42046f61892ccce92138f877d9a6e2f7d714` moved health
  verification to the parent process. It loaded and attached the real page,
  then submitted exactly one prompt.
- The selected-session assertion confirmed the bounded prompt and attachment
  references reached the chosen target. The subsequent decoy assertion was
  invalid because raw PTY input also contains terminal-protocol replies. The
  runner closed all sessions immediately, so no response was retained.
- No retry occurred after submission. This UAT remains **HOLD**, and v0.69.2
  must not be tagged or published from this evidence.
