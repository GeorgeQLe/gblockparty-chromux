# Codex Activity Production Fix Plan

Status: Gate 1 rejected persistent app-server integration; conservative fallback selected
Evidence: `docs/testing/codex-activity-approval-0.69.0.md`

## Approval result

Codex 0.145.0 accepted a private Unix-socket app-server handshake and an
ephemeral `thread/start`, but a second observer connection did not receive
`turn/started` or `turn/completed` for the visible TUI launched with
`codex resume <thread> --remote unix://…`. Both bounded Gate 1 attempts reached
their pre-event timeout, created no `codex exec` process, and removed every
temporary socket and workspace. Because the same-turn signal was not proven,
the persistent app-server lifecycle pilot is rejected.

Chromux 0.69.0 therefore takes the conservative route:

1. submitted Codex input remains `pending` / Awaiting agent activity;
2. Pending is never projected as animated Working;
3. existing recognized title/output/native evidence alone activates Working;
4. existing completion, cancellation, process-exit, `/clear`, restore, update
   safety, Threads, diagnostics, and disabled-indicator contracts remain in
   force.

The experimental same-turn probe remains opt-in in the Activity Lab tooling for
future Codex minors. Each new minor must be qualified separately. It is not
started by normal Chromux sessions and can be disabled immediately by simply
not invoking the probe command.

## Smallest viable signal change

The rejected pilot would have added a Chromux-owned structured lifecycle
sidecar for managed Codex sessions.
For each submitted interactive turn, start a correlated
`codex exec --json --ephemeral --ignore-user-config --ignore-rules` reference
only when the installed CLI advertises the required flags. Treat its
`turn.started`, `turn.completed`, structured error, and exit events as the
highest-confidence activity source for the matching Chromux session and
generation. Keep the visible interactive TUI as the user-facing process.

Before implementation, prototype whether Codex exposes an attach/observe mode or
native notification that can describe the *same* interactive turn. Prefer that
single-turn signal if available. A duplicate model invocation is not acceptable
for production; the lab's paired reference is diagnostic only. If no same-turn
structured source exists, the smallest viable production change is instead:

1. stop projecting `pending` as animated `working`;
2. retain `launching`/pending as a non-animated state;
3. activate `working` only from recognized title/output/native start evidence;
4. stop `working` on native completion, explicit cancellation, or process exit.

This conservative fallback removes false spinners without claiming to solve
missed-working intervals.

## Compatibility

- Codex versions with a verified same-turn structured signal use it at high
  confidence.
- Older or incompatible Codex versions keep existing title, meaningful-output,
  rendered-idle, and notify completion fallbacks.
- Unknown/malformed structured events are diagnostic only and never start a
  spinner.
- Absence of structured capability must not block session launch.
- Existing Claude Code, Grok Build, and shell behavior remains unchanged.

## Affected interfaces

- Main-process Codex capability detection and PTY/session launch metadata.
- Preload IPC for correlated structured lifecycle envelopes.
- Renderer session turn state (`pending`, `working`, terminal states),
  generation/session correlation, diagnostics, Threads projection, tab
  indicators, and update-safety calculation.
- Restore schema only if a new non-terminal state must persist; prefer no schema
  change and normalize restored in-flight state to idle.
- Privacy/troubleshooting docs for any additional local subprocess or event
  retention.

## Migration and operational risks

- Accidentally duplicating model usage or producing a second answer.
- Correlating a structured event to the wrong session or prompt generation.
- A structured subprocess outliving cancellation or app shutdown.
- Version/flag drift across Codex releases.
- Double completion when structured and notify/title fallbacks arrive together.
- Changed update-safety behavior while a turn is launching but not confirmed.
- Regressing immediate visual feedback if pending becomes non-animated.

## Exact regression tests

1. Pending submission projects a non-animated launching/pending indicator.
2. `turn.started` for the current session and generation projects Working once.
3. Unknown, malformed, stale-generation, wrong-session, and duplicate events
   cannot activate Working.
4. `turn.completed` stops the spinner and projects Completed once even when a
   notify/title completion follows.
5. Structured error/non-zero exit projects Failed; user cancellation projects
   Cancelled; both stop animation immediately.
6. Process exit cannot leave Working or pending animation behind.
7. Two concurrent sessions cannot consume each other's lifecycle events.
8. Older Codex capability fallback preserves title/output/notify behavior.
9. Capability detection failure does not delay or block interactive launch.
10. `/clear`, resume, restored sessions, update safety, Threads membership, tab
    continuity, and disabled-indicator behavior retain their current contracts.
11. Electron smoke confirms only Working has a non-`none` animation name.
12. Opt-in real-CLI UAT repeats all five lab scenarios without CI model usage.

No persistent production app-server lifecycle implementation is authorized by
this result. A future attempt requires a new version-specific approval gate.
