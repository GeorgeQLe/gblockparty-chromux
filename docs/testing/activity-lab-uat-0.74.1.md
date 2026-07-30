# Codex Activity Indicator Lab UAT — Chromux 0.74.1

Date: 2026-07-29
Qualified CLI: `codex-cli 0.145.0`
Lab profile: temporary and isolated
Workspaces: fresh temporary directories, removed after each paired run
Sandbox/approval policy: read-only / never

## Result

All five opt-in scenarios completed against an exact temporary installation of
Codex 0.145.0. Every normal interactive turn entered the production pending
spinner projection after a real PTY submission and stopped from a
reducer-observed completion. No resident TUI reached the 90-second timeout.
Cancellation stopped both lanes, concurrent sessions remained isolated, and
the idle control started no process.

The installed global CLI changed from 0.145.0 to 0.146.0 during qualification,
so the final planned-version run used
`@openai/codex@0.145.0` from an isolated temporary prefix. The report's version
lookup used that same configured binary.

No response text, prompt content, terminal output, structured item content, or
temporary workspace path was retained.

| Scenario | Outcome | PTY start lag | PTY stop lag | Other lane difference | Safeguards |
| --- | --- | ---: | ---: | ---: | --- |
| Response-only | Completed | 153 ms | 519 ms late | 519 ms false / 153 ms missed Working | No timeout, leakage, or stale spinner |
| Read-only filesystem | Completed | 193 ms | 0 ms late | 0 ms false / 4,774 ms missed Working | No timeout, leakage, or stale spinner |
| Two concurrent turns | Completed | 201 ms | 824 ms late | 824 ms false / 201 ms missed Working | No timeout, leakage, or stale spinner |
| Cancellation | Cancelled | 208 ms | 0 ms late | 0 ms false / 208 ms missed Working | Both lanes cancelled; no stale spinner |
| Idle / no-process | Completed | Not applicable | Not applicable | 0 ms | Remained idle |

The paired lanes are separate model invocations, so model-duration differences
are expected. The acceptance signal is lifecycle agreement: both lanes start,
both stop at an observed boundary, and the interactive lane no longer remains
Working for 69–86 seconds after the structured lane finishes.

## Production-path evidence

The interactive lane now:

1. launches Codex with the same ANSI theme, disabled native update check,
   sandbox, approval, and notify configuration used by normal Chromux;
2. approves only its newly created temporary workspace;
3. waits for either the 0.145 or 0.146 composer chrome;
4. submits through the PTY and calls the production attention submission
   reducer and status projection;
5. runs PTY output through the production OSC and title parsers;
6. applies title, rendered-terminal, and notify transitions through the
   production attention reducer; and
7. ends the resident TUI after reducer-observed completion so cleanup is not
   classified as failure.

All four non-control interactive runs recorded Codex notify-hook invocation,
payload acceptance, and a successful `/dev/tty` write. Codex 0.145.0 did not
surface that OSC sequence on the lab's outer node-pty stream, so live stop
evidence came from the production title-idle reducer. The deterministic lab
runner still requires the generated v1 notify sequence to traverse the
production OSC parser and transition pending to Completed. Renderer coverage
separately proves authenticated v2 and generated v1 pending completion without
title/output start evidence.

## Acceptance interpretation

- Five scenarios executed: pass.
- Exact Codex 0.145.0 provenance: pass.
- Temporary profile/workspaces and cleanup: pass.
- Real PTY submission and immediate pending projection: pass.
- Structured reference mapping: pass.
- Interactive start and stop without timeout: pass.
- Cancellation, idle control, and concurrent isolation: pass.
- Prompt/response exclusion: pass.
- Live outer-PTY notify OSC observation: not observed; covered
  deterministically, with live invocation/payload/delivery stages confirmed.
