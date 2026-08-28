import { describe, expect, it } from "vitest";
import { RunnerStateV1Schema } from "../src/runner/contracts";
import { resolveAttentionContext, sameAttentionContext } from "../src/runner/manager";

const at = "2026-08-28T12:00:00.000Z";
const session = (id: string, groupId: string, project: string) => ({ schemaVersion: 1 as const, id, title: id, projectPath: project, canonicalProjectPath: project, groupId,
  status: "idle" as const, permissionPreset: "workspace" as const, historyHydration: "complete" as const, draft: "", createdAt: at, updatedAt: at, events: [], interactions: [] });

describe("attention scope", () => {
  const base = RunnerStateV1Schema.parse({ schemaVersion: 1, groups: [], sessions: [session("one", "a", "/one"), session("two", "a", "/two"), session("three", "b", "/three")], selectedSessionId: "one", selectedGroupId: "a", triage: [] });
  it("defaults legacy state to the selected session", () => {
    expect(resolveAttentionContext(base)).toMatchObject({ scope: "session", targetSessionIds: ["one"], targetProjectPaths: ["/one"] });
  });
  it("resolves group and all targets deterministically", () => {
    expect(resolveAttentionContext({ ...base, attentionScope: "group" }).targetSessionIds).toEqual(["one", "two"]);
    expect(resolveAttentionContext({ ...base, attentionScope: "all" }).targetSessionIds).toEqual(["one", "three", "two"]);
  });
  it("rejects context reuse after a target change", () => {
    const left = resolveAttentionContext(base);
    const right = resolveAttentionContext({ ...base, selectedSessionId: "two" });
    expect(sameAttentionContext(left, right)).toBe(false);
  });
  it("drops legacy context-free recommendations without dropping sessions or triage", () => {
    const recovered = RunnerStateV1Schema.parse({ ...base, attention: { schemaVersion: 1, generatedAt: at, recommendations: [] } });
    expect(recovered.attention).toBeUndefined();
    expect(recovered.sessions).toHaveLength(3);
  });
});
