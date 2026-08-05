import { AgentRunRequestSchema, AgentRunResultSchema, type AgentRunRequest } from "../domain/schema";
import { event, type AgentProvider } from "./provider";

export type FakeScenario =
  | "success"
  | "invalid-output"
  | "missing-cli"
  | "authentication-failure"
  | "timeout";

export class FakeProvider implements AgentProvider {
  readonly id = "fake" as const;

  constructor(private readonly scenario: FakeScenario = "success", private readonly delayMs = 5) {}

  async run(input: AgentRunRequest, emit: Parameters<AgentProvider["run"]>[1], signal: AbortSignal) {
    const request = AgentRunRequestSchema.parse(input);
    emit(event("started", request.id));
    await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    if (signal.aborted) {
      emit(event("cancelled", request.id));
      return AgentRunResultSchema.parse({ runId: request.id, provider: this.id, status: "cancelled" });
    }
    if (this.scenario !== "success") {
      const messages: Record<Exclude<FakeScenario, "success">, string> = {
        "invalid-output": "Provider returned output that failed schema validation",
        "missing-cli": "Provider CLI was not found",
        "authentication-failure": "Provider authentication failed",
        timeout: "Provider run timed out"
      };
      emit(event("failed", request.id, { code: this.scenario, message: messages[this.scenario] }));
      return AgentRunResultSchema.parse({
        runId: request.id,
        provider: this.id,
        status: "failed",
        error: { code: this.scenario, message: messages[this.scenario] }
      });
    }

    emit(event("progress", request.id, { message: "Reviewing the immutable document snapshot" }));
    const item = request.document.items.find((candidate) => request.contextItemIds.includes(candidate.id));
    const response = item
      ? `Reviewed “${request.document.title}” with focus on ${item.kind} item ${item.id}.`
      : `Reviewed “${request.document.title}” revision ${request.document.revision}.`;
    const proposedItemId = `agent-note-${request.id}`;
    const proposedBatches = [{
      schemaVersion: 1 as const,
      documentId: request.document.id,
      baseRevision: request.document.revision,
      summary: "Add fake-provider review note",
      actor: "Fake provider",
      operations: [{
        type: "item.insert" as const,
        index: request.document.items.length,
        item: {
          id: proposedItemId,
          kind: "text" as const,
          text: `Agent proposal: ${request.prompt}`,
          provenance: {
            kind: "agent" as const,
            actor: "Fake provider",
            createdAt: new Date().toISOString(),
            runId: request.id
          },
          review: { status: "unreviewed" as const, feedback: "" }
        }
      }]
    }];
    emit(event("output", request.id, { text: response }));
    emit(event("completed", request.id));
    return AgentRunResultSchema.parse({
      runId: request.id,
      provider: this.id,
      status: "completed",
      contribution: { response, proposedBatches }
    });
  }
}
