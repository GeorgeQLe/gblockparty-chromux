import { describe, expect, it, vi } from "vitest";
import { BrowserEvidenceWorkflow } from "../src/browser/workflow";
import { DEFAULT_BROWSER_WORKSPACE, type BrowserWorkspaceV1 } from "../src/browser/contracts";

function harness() {
  let state: BrowserWorkspaceV1 = structuredClone(DEFAULT_BROWSER_WORKSPACE);
  const artifacts = new Map<string, Buffer>();
  let tick = 0;
  const workflow = new BrowserEvidenceWorkflow({
    async getBrowserWorkspace() { return structuredClone(state); },
    async updateBrowserWorkspace(next) { state = structuredClone(next); }
  }, "/private/evidence", {
    now: () => new Date(`2026-08-09T12:00:0${tick++}.000Z`),
    id: () => "capture-one",
    async writeArtifact(filePath, contents) { artifacts.set(filePath, Buffer.from(contents)); },
    async readArtifact(filePath) {
      const value = artifacts.get(filePath);
      if (!value) throw new Error("missing");
      return value;
    }
  });
  return { workflow, state: () => state };
}

describe("reviewed browser evidence", () => {
  it("persists session navigation and requires approval before exact-once delivery", async () => {
    const { workflow, state } = harness();
    const snapshot = { sessionId: "session-one", url: "https://example.com/proof", title: "Proof" };
    await workflow.recordNavigation(snapshot);
    const captured = await workflow.capture(snapshot, "Check the empty state", Buffer.from("png"));
    expect(captured.evidence.status).toBe("awaiting-review");
    expect(state().sessions[0]).toMatchObject({ sessionId: "session-one", url: snapshot.url });

    const send = vi.fn(async (_sessionId: string, _prompt: string) => undefined);
    await expect(workflow.deliver(captured.evidence.id, send)).rejects.toThrow("approved");
    expect(send).not.toHaveBeenCalled();

    await workflow.review(captured.evidence.id, "approve", "Verified at narrow width");
    const delivered = await workflow.deliver(captured.evidence.id, send);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("session-one");
    expect(send.mock.calls[0]?.[1]).toContain("human-approved browser evidence");
    expect(send.mock.calls[0]?.[1]).toContain("Verified at narrow width");
    expect(delivered.evidence[0]?.status).toBe("delivered");
    await expect(workflow.deliver(captured.evidence.id, send)).rejects.toThrow("approved");
    expect(send).toHaveBeenCalledOnce();
  });

  it("keeps approved evidence retryable after delivery failure and serves a bounded preview", async () => {
    const { workflow, state } = harness();
    const snapshot = { sessionId: "session-one", url: "https://example.com", title: "Example" };
    const { evidence } = await workflow.capture(snapshot, "", Buffer.from("png"));
    await workflow.review(evidence.id, "approve");
    await expect(workflow.deliver(evidence.id, async () => { throw new Error("runner unavailable"); }))
      .rejects.toThrow("runner unavailable");
    expect(state().evidence[0]?.status).toBe("approved");
    expect(await workflow.preview(evidence.id)).toEqual({
      evidenceId: evidence.id,
      dataUrl: "data:image/png;base64,cG5n"
    });
  });

  it("retains rejected captures without allowing delivery", async () => {
    const { workflow, state } = harness();
    const snapshot = { sessionId: "session-one", url: "https://example.com", title: "Example" };
    const { evidence } = await workflow.capture(snapshot, "Wrong viewport", Buffer.from("png"));
    await workflow.review(evidence.id, "reject");
    await expect(workflow.deliver(evidence.id, async () => undefined)).rejects.toThrow("approved");
    expect(state().evidence[0]).toMatchObject({ status: "rejected", note: "Wrong viewport" });
  });
});
