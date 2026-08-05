import { describe, expect, it } from "vitest";
import {
  AgentRunEventSchema,
  AlignmentDocumentV1Schema,
  AlignmentMutationBatchV1Schema
} from "../src/domain/schema";
import { sampleDocument } from "../src/fixtures/sample-document";

describe("alignment contracts", () => {
  it("validates the canonical sample document", () => {
    expect(AlignmentDocumentV1Schema.parse(sampleDocument)).toEqual(sampleDocument);
  });

  it("rejects unknown semantic item kinds", () => {
    const candidate = structuredClone(sampleDocument) as unknown as {
      items: Array<Record<string, unknown>>;
    };
    candidate.items[0]!.kind = "iframe";
    expect(() => AlignmentDocumentV1Schema.parse(candidate)).toThrow();
  });

  it("rejects malformed provider events", () => {
    expect(() => AgentRunEventSchema.parse({
      type: "progress",
      runId: "run-1",
      at: "not-a-date",
      message: "Working"
    })).toThrow();
  });

  it("bounds mutation batch size", () => {
    expect(() => AlignmentMutationBatchV1Schema.parse({
      schemaVersion: 1,
      documentId: sampleDocument.id,
      baseRevision: 0,
      summary: "No operations",
      actor: "Test",
      operations: []
    })).toThrow();
  });
});
