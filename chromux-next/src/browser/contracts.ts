import { z } from "zod";

const IdSchema = z.string().min(1).max(200);
const HttpUrlSchema = z.string().url().max(4096).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Only HTTP(S) URLs are supported");

export const BrowserSessionV1Schema = z.object({
  schemaVersion: z.literal(1),
  sessionId: IdSchema,
  url: HttpUrlSchema,
  title: z.string().max(500).default(""),
  updatedAt: z.string().datetime()
});

export const EvidenceStatusSchema = z.enum([
  "awaiting-review",
  "approved",
  "rejected",
  "delivered"
]);

export const BrowserEvidenceV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  sessionId: IdSchema,
  url: HttpUrlSchema,
  title: z.string().max(500).default(""),
  note: z.string().max(4000).default(""),
  status: EvidenceStatusSchema,
  capturedAt: z.string().datetime(),
  reviewedAt: z.string().datetime().optional(),
  deliveredAt: z.string().datetime().optional(),
  artifactName: z.string().regex(/^evidence-[a-zA-Z0-9_-]+\.png$/)
});

export const BrowserWorkspaceV1Schema = z.object({
  schemaVersion: z.literal(1),
  sessions: z.array(BrowserSessionV1Schema).max(200).default([]),
  evidence: z.array(BrowserEvidenceV1Schema).max(200).default([])
});

export const BrowserOpenInputSchema = z.object({
  sessionId: IdSchema,
  url: HttpUrlSchema
});

export const BrowserPresentationInputSchema = z.object({
  sessionId: IdSchema.optional(),
  bounds: z.object({
    x: z.number().int().min(0).max(20_000),
    y: z.number().int().min(0).max(20_000),
    width: z.number().int().min(1).max(20_000),
    height: z.number().int().min(1).max(20_000)
  }).optional()
}).refine((value) => Boolean(value.sessionId) === Boolean(value.bounds), {
  message: "Session and bounds must be supplied together"
});

export const BrowserActionInputSchema = z.object({
  sessionId: IdSchema,
  type: z.enum(["back", "forward", "reload", "copy-link", "open-external"])
});

export const EvidenceCaptureInputSchema = z.object({
  sessionId: IdSchema,
  note: z.string().max(4000).default("")
});

export const EvidenceReviewInputSchema = z.object({
  evidenceId: IdSchema,
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(4000).optional()
});

export const EvidenceIdInputSchema = z.object({ evidenceId: IdSchema });

export const EvidencePreviewSchema = z.object({
  evidenceId: IdSchema,
  dataUrl: z.string().startsWith("data:image/png;base64,").max(15_000_000)
});

export type BrowserSessionV1 = z.infer<typeof BrowserSessionV1Schema>;
export type BrowserEvidenceV1 = z.infer<typeof BrowserEvidenceV1Schema>;
export type BrowserWorkspaceV1 = z.infer<typeof BrowserWorkspaceV1Schema>;
export type BrowserPresentationInput = z.infer<typeof BrowserPresentationInputSchema>;

export const DEFAULT_BROWSER_WORKSPACE: BrowserWorkspaceV1 = {
  schemaVersion: 1,
  sessions: [],
  evidence: []
};
