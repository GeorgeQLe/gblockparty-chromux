# Codex Activity Fix Approval — Chromux 0.69.0

Date: 2026-07-27/28 (America/New_York)
Installed CLI: `codex-cli 0.145.0`
Protocol schema SHA-256:
`27e765d8bde235f7e13553046c4b8598c8146b6c621443a93329f014518b737c`

## Verdict

Gate 1: **failed — persistent app-server lifecycle integration rejected**.

Gate 2 pilot: **not authorized and not run**.

Selected release route: **conservative non-animated Pending fallback**.

The private app-server accepted its Unix-socket WebSocket handshake,
`initialize`, and ephemeral `thread/start`. However, an observer connected
through `codex app-server proxy` did not receive `turn/started` or
`turn/completed` for the visible TUI launched with
`codex resume <thread> --remote unix://…`. The architecture therefore did not
prove that Chromux could observe the exact visible TUI turn.

## Five-turn accounting

| Allocation | Observer-confirmed `turn/started` | Unique turn IDs | Result |
| --- | ---: | ---: | --- |
| Gate 1 response-only attempt | 0 | 0 | pre-event timeout |
| Gate 1 cancellation attempt | 0 | 0 | pre-event timeout |
| Gate 2 read-only filesystem | not run | 0 | not authorized |
| Gate 2 concurrent A | not run | 0 | not authorized |
| Gate 2 concurrent B | not run | 0 | not authorized |

Observer-confirmed billable turns: **0 of 5**. Two TUI launch attempts were
made under the Gate 1 allowance. Because the observer did not see their
lifecycle, this report cannot independently prove whether either CLI reached
the model service; no retry was made after the single setup retry allowed by
the plan. No reference lane or `codex exec` process was created.

## Commands and results

Static capability and schema:

```text
codex --version
codex app-server --help
codex app-server proxy --help
codex resume --help
codex app-server generate-json-schema --experimental --out <temporary-dir>
```

Result: required commands were present in 0.145.0. Unix transport uses a
WebSocket HTTP upgrade and frames even when its raw byte stream is carried by
`app-server proxy`.

Automated and idle controls:

```text
npm run test:activity-lab
node scripts/run-same-turn-probe.js --scenario idle --allow-model-turns 0
```

Result: Activity Lab core, runner, Electron smoke, lifecycle parser, bounds,
disconnect, timeout, and cleanup tests passed. The idle control started no
model process, found no new `codex exec`, and left no temporary workspace or
socket.

Gate 1:

```text
node scripts/run-same-turn-probe.js --scenario gate1 \
  --allow-model-turns 2 --out /tmp/chromux-gate1-report.json
```

The first execution failed at `initialize` before any TUI launch because the
harness initially treated the proxied Unix transport as JSONL. This was a
non-billable setup failure. After adding the documented WebSocket upgrade and
frame handling, a non-model handshake passed. The one allowed setup retry then
ran both bounded TUI scenarios. Each reached its 90-second pre-event deadline
with zero observer notifications. Cleanup removed every
`chromux-same-turn-*` and `chromux-codex-lifecycle-*` path, and the process
control found no new `codex exec` PID.

## Released fallback contract

- Pending/Awaiting agent activity is non-animated in tabs and Threads.
- Only confirmed Working uses `tabActivitySpin`.
- Pending remains unsafe for managed updates.
- Existing title, meaningful-output, rendered-idle, notify, cancellation,
  process-exit, `/clear`, resume, restore, diagnostics, Threads, and disabled
  indicator paths remain active.
- The same-turn harness retains no prompts, responses, terminal output, or
  structured item content. Its report contains only timestamps, IDs, status,
  version, counts, cleanup state, and pass/fail reasons.

## Residual risk

Codex app-server remote transport is experimental, version-specific, and did
not broadcast the visible TUI lifecycle to the observer in 0.145.0. The probe
must remain opt-in and each new Codex minor requires separate qualification.
The conservative fallback intentionally accepts missed Working intervals in
exchange for eliminating false animation before provider activity is known.
