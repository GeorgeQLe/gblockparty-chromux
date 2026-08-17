import { describe, expect, it } from "vitest";
import {
  AttentionCadence,
  buildAttentionSnapshot,
  evidenceFingerprint,
  redact,
  snapshotHash
} from "../src/runner/attention";
import type { RunnerSessionV1 } from "../src/runner/contracts";

function session(text = "hello"): RunnerSessionV1 {
  return {
    schemaVersion: 1,
    id: "session",
    title: "Test",
    projectPath: "/tmp/project",
    canonicalProjectPath: "/tmp/project",
    groupId: "group",
    status: "idle",
    permissionPreset: "read-only",
    historyHydration: "complete",
    draft: "",
    createdAt: "2026-08-05T12:00:00.000Z",
    updatedAt: "2026-08-05T12:00:00.000Z",
    events: [{
      schemaVersion: 1,
      id: "event",
      sessionId: "session",
      at: "2026-08-05T12:00:00.000Z",
      kind: "agent",
      text,
      links: []
    }],
    interactions: []
  };
}

describe("attention snapshot", () => {
  it("redacts credential-like values before analysis", () => {
    expect(redact("token=supersecret sk-abcdefghijklmnop")).toBe("token=[REDACTED] [REDACTED]");
    const snapshot = buildAttentionSnapshot([session("password=hunter2")], [], new Date("2026-08-05T12:00:00Z"));
    expect(JSON.stringify(snapshot)).not.toContain("hunter2");
  });

  it("caps complete snapshots at 128 KiB", () => {
    const sessions = Array.from({ length: 100 }, (_, index) => ({
      ...session("x".repeat(4096)),
      id: `session-${index}`,
      groupId: `group-${index}`,
      events: [{ ...session().events[0]!, id: `event-${index}`, sessionId: `session-${index}`, text: "x".repeat(4096) }]
    }));
    const snapshot = buildAttentionSnapshot(sessions);
    expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThanOrEqual(128 * 1024);
  });

  it("hashes content independently of generated time", () => {
    const first = buildAttentionSnapshot([session()], [], new Date("2026-08-05T12:00:00Z"));
    const second = buildAttentionSnapshot([session()], [], new Date("2026-08-05T12:05:00Z"));
    expect(snapshotHash(first)).toBe(snapshotHash(second));
    expect(evidenceFingerprint(["b", "a"], "same")).toBe(evidenceFingerprint(["a", "b"], "same"));
  });

  it("enforces quiet and throttle windows", () => {
    const cadence = new AttentionCadence();
    cadence.changed(1_000);
    expect(cadence.automaticDue(30_999)).toBe(false);
    expect(cadence.automaticDue(31_000)).toBe(false);
    expect(cadence.automaticDue(121_000)).toBe(true);
    cadence.ran(121_000);
    cadence.changed(130_000);
    expect(cadence.automaticDue(160_000)).toBe(false);
    expect(cadence.automaticDue(241_000)).toBe(true);
  });
});
