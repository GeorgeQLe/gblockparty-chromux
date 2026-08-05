import { describe, expect, it } from "vitest";
import type { AgentRunRequest } from "../src/domain/schema";
import { sampleDocument } from "../src/fixtures/sample-document";
import { FakeProvider, type FakeScenario } from "../src/providers/fake-provider";

function request(): AgentRunRequest {
  return {
    id: "test-run",
    provider: "fake",
    prompt: "Propose a note",
    projectPath: "/tmp",
    contextItemIds: ["text-purpose"],
    document: sampleDocument,
    timeoutMs: 5_000
  };
}

describe("deterministic provider fixtures", () => {
  it("normalizes success and returns review-before-apply mutations", async () => {
    const events: string[] = [];
    const result = await new FakeProvider().run(
      request(),
      (event) => events.push(event.type),
      new AbortController().signal
    );
    expect(result.status).toBe("completed");
    expect(result.contribution?.proposedBatches).toHaveLength(1);
    expect(result.contribution?.proposedBatches[0]?.baseRevision).toBe(sampleDocument.revision);
    expect(events).toEqual(["started", "progress", "output", "completed"]);
    expect(sampleDocument.revision).toBe(0);
  });

  for (const scenario of ["invalid-output", "missing-cli", "authentication-failure", "timeout"] satisfies FakeScenario[]) {
    it(`normalizes ${scenario}`, async () => {
      const result = await new FakeProvider(scenario).run(
        request(),
        () => undefined,
        new AbortController().signal
      );
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe(scenario);
    });
  }

  it("supports cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await new FakeProvider().run(request(), () => undefined, controller.signal);
    expect(result.status).toBe("cancelled");
  });
});
