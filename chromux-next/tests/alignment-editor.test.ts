import { describe, expect, it } from "vitest";
import {
  createItem,
  humanReview,
  isProposalStale,
  mutationBatch,
  normalizeTable
} from "../src/alignment/editor-model";
import { sampleDocument } from "../src/fixtures/sample-document";

describe("alignment editor model", () => {
  it("creates a valid stable-ID item for every semantic kind", () => {
    for (const kind of ["heading", "text", "list", "table", "media", "code", "decision", "question", "metric"] as const) {
      const item = createItem(kind, `stable-${kind}`, "Reviewer", "2026-08-05T15:00:00.000Z");
      expect(item.id).toBe(`stable-${kind}`);
      expect(item.kind).toBe(kind);
      expect(item.provenance.actor).toBe("Reviewer");
      expect(item.review.status).toBe("unreviewed");
    }
  });

  it("records and clears human review metadata", () => {
    expect(humanReview("approved", "Ready", "George", "2026-08-05T15:00:00.000Z")).toEqual({
      status: "approved",
      feedback: "Ready",
      reviewer: "George",
      reviewedAt: "2026-08-05T15:00:00.000Z"
    });
    expect(humanReview("unreviewed", "Reset", "George")).toEqual({
      status: "unreviewed",
      feedback: "Reset"
    });
  });

  it("normalizes table rows and produces revision-bound batches", () => {
    expect(normalizeTable(["a", "b"], [["1"], ["2", "3", "ignored"]])).toEqual([["1", ""], ["2", "3"]]);
    const batch = mutationBatch(sampleDocument, "Archive", [{ type: "status.set", status: "archived" }]);
    expect(batch.documentId).toBe(sampleDocument.id);
    expect(batch.baseRevision).toBe(sampleDocument.revision);
  });

  it("marks proposals stale on document or revision changes", () => {
    const batch = mutationBatch(sampleDocument, "Draft", [{ type: "status.set", status: "draft" }]);
    expect(isProposalStale(batch, sampleDocument)).toBe(false);
    expect(isProposalStale(batch, { ...sampleDocument, revision: 1 })).toBe(true);
    expect(isProposalStale({ ...batch, documentId: "other" }, sampleDocument)).toBe(true);
  });
});
