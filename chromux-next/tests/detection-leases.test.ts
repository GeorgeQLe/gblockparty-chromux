import { describe, expect, it } from "vitest";
import type { EnrichedDetectionCandidate } from "../src/detection/contracts";
import { ExternalTerminalDetector } from "../src/detection/external";
import { DetectionLeaseStore } from "../src/detection/leases";

function candidate(cwd = "/tmp/project"): EnrichedDetectionCandidate {
  return {
    pid: 20,
    ppid: 10,
    tty: "ttys001",
    command: "codex",
    args: "codex",
    cwd,
    terminal: "Terminal",
    agent: "codex",
    threadId: "source-thread"
  };
}

describe("detection leases", () => {
  it("acquires and renews authority beyond the original two-minute scan deadline", () => {
    let now = Date.parse("2026-08-16T12:00:00.000Z");
    let sequence = 0;
    const leases = new DetectionLeaseStore({ now: () => now, id: () => `lease-${++sequence}` });
    const lease = leases.acquire(candidate());
    expect(leases.resolve(lease.leaseId)).toMatchObject({ cwd: "/tmp/project", threadId: "source-thread" });

    now += 90_000;
    const renewed = leases.renew(lease.leaseId);
    now += 90_000;
    expect(new Date(renewed.expiresAt).getTime()).toBeGreaterThan(now);
    expect(leases.resolve(lease.leaseId).threadId).toBe("source-thread");
  });

  it("survives scan replacement and supports explicit release and successful consumption", async () => {
    let sequence = 0;
    const leases = new DetectionLeaseStore({ id: () => `lease-${++sequence}` });
    const detector = new ExternalTerminalDetector(async (rows) => rows.map((row) => ({
      ...row,
      threadId: row.cwd.endsWith("one") ? "thread-one" : "thread-two"
    })), {
      platform: "darwin",
      ownPid: 999,
      canonicalize: async (value) => value,
      run: async (command) => {
        if (command.endsWith("ps")) return { stdout: "20 1 ttys001 codex codex" };
        if (command.endsWith("osascript")) return { stdout: "" };
        if (command.endsWith("lsof")) return { stdout: `p20\nfcwd\nn/tmp/${sequence ? "two" : "one"}\n` };
        throw new Error("unexpected command");
      }
    });
    const firstScan = await detector.scan();
    const firstLease = leases.acquire(detector.resolve(firstScan.scanId, firstScan.rows[0]!.targetId));
    await detector.scan();
    expect(leases.resolve(firstLease.leaseId)).toMatchObject({ cwd: "/tmp/one", threadId: "thread-one" });

    leases.release(firstLease.leaseId);
    expect(() => leases.resolve(firstLease.leaseId)).toThrow("unknown");
    const consumed = leases.acquire(candidate("/tmp/consumed"));
    leases.consume(consumed.leaseId);
    expect(() => leases.resolve(consumed.leaseId)).toThrow("unknown");
  });

  it("cleans up expiry, rejects unknown ids, and enforces bounded capacity after cleanup", () => {
    let now = Date.parse("2026-08-16T12:00:00.000Z");
    let sequence = 0;
    const leases = new DetectionLeaseStore({
      now: () => now,
      id: () => `lease-${++sequence}`,
      capacity: 2
    });
    const first = leases.acquire(candidate("/tmp/one"));
    leases.acquire(candidate("/tmp/two"));
    expect(() => leases.acquire(candidate("/tmp/three"))).toThrow("Too many");
    expect(() => leases.renew("missing")).toThrow("unknown");
    expect(() => leases.release("missing")).toThrow("unknown");

    now += 120_001;
    expect(() => leases.resolve(first.leaseId)).toThrow("expired");
    expect(() => leases.acquire(candidate("/tmp/three"))).not.toThrow();
  });
});
