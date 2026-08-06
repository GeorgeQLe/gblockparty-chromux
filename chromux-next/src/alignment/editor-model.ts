import {
  AlignmentItemSchema,
  AlignmentMutationBatchV1Schema,
  ReviewStateSchema,
  type AlignmentDocumentV1,
  type AlignmentItem,
  type AlignmentMutationBatchV1,
  type AlignmentMutationOperation
} from "../domain/schema";

export type AlignmentItemKind = AlignmentItem["kind"];

const ITEM_LABELS: Record<AlignmentItemKind, string> = {
  heading: "Heading",
  text: "Text",
  list: "List",
  table: "Table",
  media: "Media",
  code: "Code",
  decision: "Decision",
  question: "Question",
  metric: "Metric"
};

export function itemLabel(item: AlignmentItem): string {
  const detail = "text" in item ? item.text
    : "question" in item ? item.question
    : "label" in item ? item.label
    : "language" in item ? item.language
    : "url" in item ? item.alt || item.url
    : item.kind === "list" ? item.items[0] ?? ""
    : item.kind === "table" ? item.columns.join(", ")
    : "";
  return `${ITEM_LABELS[item.kind]}${detail ? ` · ${detail}` : ""}`;
}

export function createItem(
  kind: AlignmentItemKind,
  id: string,
  actor = "Human editor",
  now = new Date().toISOString()
): AlignmentItem {
  const base = {
    id,
    provenance: { kind: "human" as const, actor, createdAt: now },
    review: { status: "unreviewed" as const, feedback: "" }
  };
  const value: AlignmentItem =
    kind === "heading" ? { ...base, kind, level: 2, text: "New heading" }
      : kind === "text" ? { ...base, kind, text: "" }
        : kind === "list" ? { ...base, kind, style: "bullet", items: [""] }
          : kind === "table" ? { ...base, kind, columns: ["Column"], rows: [[""]] }
            : kind === "media" ? { ...base, kind, url: "", alt: "", caption: "" }
              : kind === "code" ? { ...base, kind, language: "text", code: "" }
                : kind === "decision" ? { ...base, kind, question: "", answer: "", gate: false }
                  : kind === "question" ? { ...base, kind, question: "", answer: "", gate: false }
                    : { ...base, kind, label: "", value: "", unit: "" };
  return AlignmentItemSchema.parse(value);
}

export function humanReview(
  status: AlignmentItem["review"]["status"],
  feedback: string,
  reviewer: string,
  now = new Date().toISOString()
): AlignmentItem["review"] {
  return ReviewStateSchema.parse(status === "unreviewed"
    ? { status, feedback }
    : { status, feedback, reviewer, reviewedAt: now });
}

export function mutationBatch(
  document: AlignmentDocumentV1,
  summary: string,
  operations: AlignmentMutationOperation[],
  actor = "Human editor"
): AlignmentMutationBatchV1 {
  return AlignmentMutationBatchV1Schema.parse({
    schemaVersion: 1,
    documentId: document.id,
    baseRevision: document.revision,
    summary,
    actor,
    operations
  });
}

export function normalizeTable(columns: string[], rows: string[][]): string[][] {
  return rows.map((row) => columns.map((_, index) => row[index] ?? ""));
}

export function isProposalStale(
  batch: AlignmentMutationBatchV1,
  document: AlignmentDocumentV1
): boolean {
  return batch.documentId !== document.id || batch.baseRevision !== document.revision;
}
