import { describe, expect, it } from "vitest";
import type { PendingInteractionV1, RunnerStateV1 } from "../src/runner/contracts";
import { collectRoomRequests, decisionCopy, eligibleRoomRequests, reconcileDeferrals, roomCounts, roomRequestKey } from "../src/runner/situation-room";
import { situationRoomApprovalFixture, situationRoomQuestionFixture } from "../src/fixtures/situation-room";

function state(): RunnerStateV1 {
  const session = (id: string, status: "idle" | "active" | "failed", interactions: PendingInteractionV1[] = []) => ({
    schemaVersion: 1 as const, id, title: id, projectPath: `/work/${id}`, canonicalProjectPath: `/work/${id}`,
    groupId: "group", status, permissionPreset: "workspace" as const, draft: "", createdAt: "2026-08-16T15:00:00.000Z",
    updatedAt: "2026-08-16T16:00:00.000Z", events: [], interactions
  });
  return { schemaVersion: 1, groups: [{ schemaVersion: 1, id: "group", title: "Chromux", kind: "project", projectPath: "/work", sessionIds: ["one", "two", "three"], createdAt: "2026-08-16T15:00:00.000Z", updatedAt: "2026-08-16T16:00:00.000Z" }], sessions: [
    session("one", "active", [situationRoomQuestionFixture]),
    session("two", "idle", [situationRoomApprovalFixture]),
    session("three", "failed")
  ], triage: [] };
}

describe("Situation Room queue", () => {
  it("collects globally and orders chronologically", () => expect(collectRoomRequests(state()).map((item) => item.interaction.id)).toEqual(["fixture-approval", "fixture-question"]));
  it("filters local deferrals and removes resolved deferrals", () => {
    const requests = collectRoomRequests(state());
    const approvalKey = roomRequestKey(requests[0]!);
    expect(eligibleRoomRequests(requests, new Set([approvalKey])).map((item) => item.interaction.id)).toEqual(["fixture-question"]);
    expect([...reconcileDeferrals(new Set([approvalKey, "resolved"]), requests)]).toEqual([approvalKey]);
  });
  it("isolates equal interaction IDs owned by different sessions", () => {
    const requests = collectRoomRequests(state());
    const duplicate = { ...requests[1]!, interaction: { ...requests[1]!.interaction, id: requests[0]!.interaction.id } };
    expect(roomRequestKey(requests[0]!)).not.toBe(roomRequestKey(duplicate));
  });
  it("labels every validated decision", () => expect(decisionCopy("accept-amendment").title).toBe("Apply policy amendment"));
  it("counts live room status", () => expect(roomCounts(state())).toEqual({ active: 1, blocked: 2, failed: 1, pendingRequests: 2 }));
});
