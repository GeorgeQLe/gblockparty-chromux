import { AlignmentDocumentV1Schema, type AlignmentDocumentV1 } from "../domain/schema";

const createdAt = "2026-08-05T12:00:00.000Z";
const provenance = { kind: "human" as const, actor: "Chromux Next fixture", createdAt };
const review = { status: "unreviewed" as const, feedback: "" };

export const sampleDocument: AlignmentDocumentV1 = AlignmentDocumentV1Schema.parse({
  schemaVersion: 1,
  id: "sample-alignment",
  revision: 0,
  title: "Chromux Next alignment",
  status: "draft",
  provenance,
  updatedAt: createdAt,
  items: [
    { id: "heading-purpose", kind: "heading", level: 1, text: "Purpose", provenance, review },
    {
      id: "text-purpose",
      kind: "text",
      text: "Create a shared semantic workspace where human and agent contributions remain reviewable.",
      provenance,
      review
    },
    {
      id: "decision-authority",
      kind: "decision",
      question: "What is authoritative?",
      answer: "The versioned alignment document JSON. Rendered outputs are projections.",
      gate: true,
      provenance,
      review
    },
    {
      id: "question-cutover",
      kind: "question",
      question: "When should Chromux Next replace legacy Chromux?",
      answer: "",
      gate: true,
      provenance,
      review
    },
    {
      id: "metric-runs",
      kind: "metric",
      label: "Required qualified provider runs",
      value: 25,
      unit: "runs",
      provenance,
      review
    }
  ],
  views: [
    {
      kind: "document",
      sections: [
        {
          id: "section-foundation",
          title: "Foundation",
          itemIds: ["heading-purpose", "text-purpose", "decision-authority", "question-cutover", "metric-runs"]
        }
      ]
    },
    {
      kind: "deck",
      slides: [
        { id: "slide-purpose", title: "Purpose", layout: "statement", itemIds: ["text-purpose"] },
        { id: "slide-gates", title: "Cutover gates", layout: "content", itemIds: ["decision-authority", "question-cutover", "metric-runs"] }
      ]
    },
    {
      kind: "canvas",
      nodes: [
        { id: "node-purpose", itemId: "text-purpose", shape: "card", x: 80, y: 80, width: 280, height: 150 },
        { id: "node-decision", itemId: "decision-authority", shape: "card", x: 450, y: 220, width: 300, height: 180 }
      ]
    }
  ],
  history: []
});
