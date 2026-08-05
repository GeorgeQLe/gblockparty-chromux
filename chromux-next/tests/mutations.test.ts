import { describe, expect, it } from "vitest";
import { applyMutationBatch, MutationConflictError } from "../src/domain/mutations";
import type { AlignmentMutationBatchV1 } from "../src/domain/schema";
import { sampleDocument } from "../src/fixtures/sample-document";

function batch(overrides: Partial<AlignmentMutationBatchV1> = {}): AlignmentMutationBatchV1 {
  return {
    schemaVersion: 1,
    documentId: sampleDocument.id,
    baseRevision: sampleDocument.revision,
    summary: "Approve purpose",
    actor: "Test reviewer",
    operations: [{
      type: "review.update",
      itemId: "text-purpose",
      review: {
        status: "approved",
        feedback: "Clear",
        reviewer: "Test reviewer",
        reviewedAt: "2026-08-05T14:00:00.000Z"
      }
    }],
    ...overrides
  };
}

describe("mutation engine", () => {
  it("increments revision, records history, and creates a working inverse", () => {
    const applied = applyMutationBatch(sampleDocument, batch(), "2026-08-05T14:00:00.000Z");
    expect(applied.document.revision).toBe(1);
    expect(applied.document.items[1]!.review.status).toBe("approved");
    expect(applied.document.history.at(-1)?.summary).toBe("Approve purpose");

    const undone = applyMutationBatch(applied.document, applied.inverseBatch, "2026-08-05T14:01:00.000Z");
    expect(undone.document.revision).toBe(2);
    expect(undone.document.items[1]!.review.status).toBe("unreviewed");
  });

  it("rejects stale document revisions", () => {
    expect(() => applyMutationBatch(sampleDocument, batch({ baseRevision: 99 }))).toThrow(MutationConflictError);
  });

  it("rejects updates that change stable item IDs", () => {
    expect(() => applyMutationBatch(sampleDocument, batch({
      operations: [{
        type: "item.update",
        itemId: "text-purpose",
        item: { ...sampleDocument.items[1]!, id: "replacement-id" }
      }]
    }))).toThrow(MutationConflictError);
  });

  it("restores view mappings when a removal is undone", () => {
    const removed = applyMutationBatch(sampleDocument, batch({
      summary: "Remove purpose",
      operations: [{ type: "item.remove", itemId: "text-purpose" }]
    }));
    const documentView = removed.document.views.find((view) => view.kind === "document");
    expect(documentView?.sections[0]?.itemIds).not.toContain("text-purpose");

    const restored = applyMutationBatch(removed.document, removed.inverseBatch);
    expect(restored.document.items.some((item) => item.id === "text-purpose")).toBe(true);
    const restoredView = restored.document.views.find((view) => view.kind === "document");
    expect(restoredView?.sections[0]?.itemIds).toContain("text-purpose");
  });
});
