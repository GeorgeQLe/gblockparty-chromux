import { z } from "zod";

const Id = z.string().min(1).max(128);
const IsoDate = z.string().datetime();

export const ProvenanceSchema = z.object({
  kind: z.enum(["human", "agent", "import"]),
  actor: z.string().min(1).max(120),
  createdAt: IsoDate,
  runId: Id.optional(),
  source: z.string().max(2048).optional()
});

export const ReviewStateSchema = z.object({
  status: z.enum(["unreviewed", "changes-requested", "approved"]),
  feedback: z.string().max(20_000).default(""),
  reviewer: z.string().max(120).optional(),
  reviewedAt: IsoDate.optional()
});

const ItemBase = {
  id: Id,
  provenance: ProvenanceSchema,
  review: ReviewStateSchema.default({
    status: "unreviewed",
    feedback: ""
  })
};

export const AlignmentItemSchema = z.discriminatedUnion("kind", [
  z.object({ ...ItemBase, kind: z.literal("heading"), level: z.number().int().min(1).max(6), text: z.string().max(20_000) }),
  z.object({ ...ItemBase, kind: z.literal("text"), text: z.string().max(100_000) }),
  z.object({ ...ItemBase, kind: z.literal("list"), style: z.enum(["bullet", "numbered"]), items: z.array(z.string().max(20_000)).max(500) }),
  z.object({ ...ItemBase, kind: z.literal("table"), columns: z.array(z.string().max(500)).max(100), rows: z.array(z.array(z.string().max(20_000)).max(100)).max(5_000) }),
  z.object({ ...ItemBase, kind: z.literal("media"), url: z.string().max(4096), alt: z.string().max(1_000), caption: z.string().max(5_000).optional() }),
  z.object({ ...ItemBase, kind: z.literal("code"), language: z.string().max(100), code: z.string().max(200_000) }),
  z.object({ ...ItemBase, kind: z.literal("decision"), question: z.string().max(20_000), answer: z.string().max(50_000), gate: z.boolean().default(false) }),
  z.object({ ...ItemBase, kind: z.literal("question"), question: z.string().max(20_000), answer: z.string().max(50_000).default(""), gate: z.boolean().default(false) }),
  z.object({ ...ItemBase, kind: z.literal("metric"), label: z.string().max(1_000), value: z.union([z.string().max(5_000), z.number()]), unit: z.string().max(100).optional() })
]);

export const DocumentViewSchema = z.object({
  kind: z.literal("document"),
  sections: z.array(z.object({
    id: Id,
    title: z.string().max(1_000),
    itemIds: z.array(Id)
  }))
});

export const DeckViewSchema = z.object({
  kind: z.literal("deck"),
  slides: z.array(z.object({
    id: Id,
    title: z.string().max(1_000),
    layout: z.enum(["title", "content", "two-column", "statement"]),
    itemIds: z.array(Id)
  }))
});

export const CanvasViewSchema = z.object({
  kind: z.literal("canvas"),
  nodes: z.array(z.object({
    id: Id,
    itemId: Id.optional(),
    shape: z.enum(["card", "text", "group", "arrow", "image"]),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    height: z.number().positive(),
    text: z.string().max(20_000).optional(),
    fromId: Id.optional(),
    toId: Id.optional()
  }))
});

export const PresentationViewSchema = z.discriminatedUnion("kind", [
  DocumentViewSchema,
  DeckViewSchema,
  CanvasViewSchema
]);

export const AlignmentDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  revision: z.number().int().nonnegative(),
  title: z.string().min(1).max(1_000),
  status: z.enum(["draft", "in-review", "approved", "archived"]),
  provenance: ProvenanceSchema,
  updatedAt: IsoDate,
  items: z.array(AlignmentItemSchema).max(20_000),
  views: z.array(PresentationViewSchema).max(100),
  history: z.array(z.object({
    revision: z.number().int().positive(),
    summary: z.string().min(1).max(2_000),
    appliedAt: IsoDate,
    actor: z.string().min(1).max(120)
  })).max(1_000).default([])
});

export type AlignmentDocumentV1 = z.infer<typeof AlignmentDocumentV1Schema>;
export type AlignmentItem = z.infer<typeof AlignmentItemSchema>;
export type PresentationView = z.infer<typeof PresentationViewSchema>;

const InsertItemOperationSchema = z.object({
  type: z.literal("item.insert"),
  index: z.number().int().nonnegative(),
  item: AlignmentItemSchema
});
const UpdateItemOperationSchema = z.object({
  type: z.literal("item.update"),
  itemId: Id,
  item: AlignmentItemSchema
});
const RemoveItemOperationSchema = z.object({
  type: z.literal("item.remove"),
  itemId: Id
});
const MoveItemOperationSchema = z.object({
  type: z.literal("item.move"),
  itemId: Id,
  toIndex: z.number().int().nonnegative()
});
const ReviewUpdateOperationSchema = z.object({
  type: z.literal("review.update"),
  itemId: Id,
  review: ReviewStateSchema
});
const ViewSetOperationSchema = z.object({
  type: z.literal("view.set"),
  view: PresentationViewSchema
});
const ViewRemoveOperationSchema = z.object({
  type: z.literal("view.remove"),
  kind: z.enum(["document", "deck", "canvas"])
});
const StatusSetOperationSchema = z.object({
  type: z.literal("status.set"),
  status: z.enum(["draft", "in-review", "approved", "archived"])
});

export const AlignmentMutationOperationSchema = z.discriminatedUnion("type", [
  InsertItemOperationSchema,
  UpdateItemOperationSchema,
  RemoveItemOperationSchema,
  MoveItemOperationSchema,
  ReviewUpdateOperationSchema,
  ViewSetOperationSchema,
  ViewRemoveOperationSchema,
  StatusSetOperationSchema
]);

export const AlignmentMutationBatchV1Schema = z.object({
  schemaVersion: z.literal(1),
  documentId: Id,
  baseRevision: z.number().int().nonnegative(),
  summary: z.string().min(1).max(2_000),
  actor: z.string().min(1).max(120),
  operations: z.array(AlignmentMutationOperationSchema).min(1).max(1_000)
});

export type AlignmentMutationOperation = z.infer<typeof AlignmentMutationOperationSchema>;
export type AlignmentMutationBatchV1 = z.infer<typeof AlignmentMutationBatchV1Schema>;

export const AgentRunRequestSchema = z.object({
  id: Id,
  provider: z.enum(["fake", "codex", "claude", "gemini"]),
  prompt: z.string().min(1).max(100_000),
  projectPath: z.string().min(1).max(4096),
  contextItemIds: z.array(Id).max(10_000),
  document: AlignmentDocumentV1Schema.readonly(),
  timeoutMs: z.number().int().min(1_000).max(600_000).default(120_000)
});

export const AgentRunEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("started"), runId: Id, at: IsoDate }),
  z.object({ type: z.literal("progress"), runId: Id, at: IsoDate, message: z.string().max(20_000) }),
  z.object({ type: z.literal("output"), runId: Id, at: IsoDate, text: z.string().max(200_000) }),
  z.object({ type: z.literal("completed"), runId: Id, at: IsoDate }),
  z.object({ type: z.literal("cancelled"), runId: Id, at: IsoDate }),
  z.object({ type: z.literal("failed"), runId: Id, at: IsoDate, code: z.string().max(100), message: z.string().max(20_000) })
]);

export const AgentContributionSchema = z.object({
  response: z.string().max(500_000),
  proposedBatches: z.array(AlignmentMutationBatchV1Schema).max(100)
});

export const AgentRunResultSchema = z.object({
  runId: Id,
  provider: z.enum(["fake", "codex", "claude", "gemini"]),
  status: z.enum(["completed", "cancelled", "failed"]),
  contribution: AgentContributionSchema.optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional()
});

export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>;
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>;
export type AgentContribution = z.infer<typeof AgentContributionSchema>;
export type AgentRunResult = z.infer<typeof AgentRunResultSchema>;

export const AlignmentResponseV1Schema = z.object({
  schemaVersion: z.literal(1),
  documentId: Id,
  baseRevision: z.number().int().nonnegative(),
  responder: z.string().min(1).max(120),
  respondedAt: IsoDate,
  itemReviews: z.array(z.object({ itemId: Id, review: ReviewStateSchema })),
  overallStatus: z.enum(["changes-requested", "approved"])
});
