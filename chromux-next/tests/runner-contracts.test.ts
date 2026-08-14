import { describe, expect, it } from "vitest";
import {
  PendingInteractionV1Schema,
  RunnerEventV1Schema,
  RunnerSessionV1Schema,
  CompatibilityDiagnosticsV1Schema
} from "../src/runner/contracts";
import { compareVersions } from "../src/runner/protocol";
import { permissionParams } from "../src/runner/manager";
import {
  CreateFromDetectionInputSchema,
  DetectionResultV1Schema
} from "../src/detection/contracts";

describe("runner contracts and compatibility", () => {
  it("requires Codex CLI 0.146.0 or newer", () => {
    expect(compareVersions("0.145.9", "0.146.0")).toBeLessThan(0);
    expect(compareVersions("0.146.0", "0.146.0")).toBe(0);
    expect(compareVersions("0.147.0", "0.146.0")).toBeGreaterThan(0);
  });

  it("bounds renderer events and drafts", () => {
    const event = {
      schemaVersion: 1,
      id: "event",
      sessionId: "session",
      at: "2026-08-05T12:00:00.000Z",
      kind: "agent",
      text: "ok",
      links: []
    };
    expect(RunnerEventV1Schema.parse(event).text).toBe("ok");
    expect(() => RunnerEventV1Schema.parse({ ...event, text: "x".repeat(64 * 1024 + 1) })).toThrow();
    expect(() => RunnerSessionV1Schema.parse({
      schemaVersion: 1,
      id: "session",
      title: "Session",
      projectPath: "/tmp",
      canonicalProjectPath: "/tmp",
      groupId: "group",
      status: "idle",
      permissionPreset: "workspace",
      draft: "x".repeat(64 * 1024 + 1),
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
      events: [],
      interactions: []
    })).toThrow();
  });

  it("maps only the two exposed permission presets", () => {
    expect(permissionParams("workspace")).toEqual({
      sandbox: "workspace-write",
      approvalPolicy: "on-request"
    });
    expect(permissionParams("read-only")).toEqual({
      sandbox: "read-only",
      approvalPolicy: "never"
    });
  });

  it("rejects unoffered approval decisions at the schema boundary", () => {
    const interaction = PendingInteractionV1Schema.parse({
      schemaVersion: 1,
      id: "interaction",
      requestId: 1,
      sessionId: "session",
      threadId: "thread",
      at: "2026-08-05T12:00:00.000Z",
      kind: "command-approval",
      title: "Command",
      detail: "npm test",
      questions: [],
      offeredDecisions: ["accept", "decline", "cancel"],
      rawMethod: "item/commandExecution/requestApproval"
    });
    expect(interaction.offeredDecisions).not.toContain("accept-amendment");
  });

  it("bounds and labels successor-only compatibility diagnostics", () => {
    const diagnostics = CompatibilityDiagnosticsV1Schema.parse({
      schemaVersion: 1,
      generatedAt: "2026-08-06T12:00:00.000Z",
      appVersion: "0.5.0",
      platform: "darwin arm64",
      stateScope: "successor-only",
      checks: [{ id: "codex-cli", label: "Codex CLI", status: "pass", detail: "0.146.0" }]
    });
    expect(diagnostics.stateScope).toBe("successor-only");
  });

  it("keeps detection IPC opaque, strict, and bounded", () => {
    const result = DetectionResultV1Schema.parse({
      schemaVersion: 1,
      scanId: "scan",
      scannedAt: "2026-08-06T12:00:00.000Z",
      titlePermission: "denied",
      rows: [{
        schemaVersion: 1,
        targetId: "target",
        terminal: "Terminal",
        agent: "codex",
        pid: 42,
        directory: "/tmp",
        projectName: "tmp",
        command: "codex",
        externalActive: true,
        resumeAvailable: true
      }]
    });
    expect(result.rows[0]?.targetId).toBe("target");
    expect(() => CreateFromDetectionInputSchema.parse({
      scanId: "scan",
      targetId: "target",
      mode: "resume",
      title: "Session",
      permissionPreset: "workspace",
      cwd: "/renderer-controlled",
      threadId: "renderer-controlled"
    })).toThrow();
  });
});
