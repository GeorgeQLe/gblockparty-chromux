# Codex Activity Indicator Lab UAT — Chromux 0.67.0

Date: 2026-07-27
Installed CLI: `codex-cli 0.145.0`
Lab profile: temporary and isolated
Workspaces: fresh temporary directories, removed after each paired run
Sandbox/approval policy: read-only / never

## Result

All five scenarios ran against the installed Codex CLI. The response-only,
filesystem-read, and two-concurrent-turn scenarios reached structured
`turn.started` and `turn.completed` events. The production rendered-terminal
fallback also recognized meaningful interactive output and started Working,
but the exact interactive command remained resident until the 90-second lab
timeout. Its inferred Working state therefore continued long after the
structured turn completed. The cancellation scenario terminated both lanes on
the user-cancellation boundary. The idle control started no process and
remained idle.

No response text, prompt content, terminal output, or structured item content
was retained in this report.

| Scenario | Outcome | Reference working evidence | PTY working evidence | Missed working | Other findings |
| --- | --- | --- | --- | ---: | --- |
| Response-only | Timed out | Yes | Yes | 86,091 ms false-working | Completion 85,843 ms late |
| Read-only filesystem inspection | Timed out | Yes | Yes | 68,957 ms false-working | Completion 68,914 ms late |
| Two concurrent turns | Timed out | Yes, both runs | Yes, both runs | 86,879 ms false-working; 17 ms missed | No cross-session leakage |
| Cancellation during work | Cancelled | Yes | Yes | 6 ms missed | Both lanes reached cancelled |
| Idle / no-process control | Completed | No process | No process | 0 ms | Remained idle |

The structured lane completed normally before the PTY timeout in the first
three scenarios. The scenario-level `failed` outcome therefore records the
interactive timeout, not a model or structured lifecycle failure.

## Signal ordering

Observed structured ordering was:

1. process spawned → `launching`
2. JSONL `turn.started` → `working`
3. JSONL `turn.completed` → `completed`
4. process exit → `completed`

Observed interactive ordering for non-cancelled live scenarios was:

1. process spawned → `launching`
2. production rendered-terminal fallback → `working`
3. timeout → `failed`
4. process exit → `failed`

The interactive command is intentionally the plan-specified
`codex -s read-only -a never -C <temp> <prompt>`. Codex 0.145.0 keeps that TUI
process resident after satisfying the initial prompt, so process exit cannot be
used as a prompt-completion boundary.

## Acceptance interpretation

- Five scenarios executed: pass.
- Temporary profile/workspaces and cleanup: pass.
- Explicit run gate and spinner-only-while-working Electron contract: pass.
- Structured reference mapping: pass.
- Cross-session leakage and stale-spinner checks: pass.
- PTY/reference agreement: fail. Start detection was prompt, but the resident
  TUI supplied no inferred completion boundary after structured completion,
  producing 69–86 seconds of false-working time.
- Production behavior changed: no.

The mismatch is sufficient to plan a production signal improvement, but it does
not justify changing normal Chromux inference without separate approval.
