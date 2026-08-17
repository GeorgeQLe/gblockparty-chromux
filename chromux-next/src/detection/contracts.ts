import { z } from "zod";
import { PermissionPresetSchema } from "../runner/contracts";

const Id = z.string().min(1).max(256);
const SafeText = z.string().max(512);

export const DetectedTerminalV1Schema = z.object({
  schemaVersion: z.literal(1),
  targetId: Id,
  terminal: z.enum(["Terminal", "iTerm", "terminal"]),
  agent: z.enum(["shell", "claude", "codex", "grok"]),
  pid: z.number().int().positive(),
  directory: z.string().min(1).max(4096),
  projectName: z.string().min(1).max(512),
  title: SafeText.optional(),
  command: SafeText,
  externalActive: z.boolean(),
  resumeAvailable: z.boolean(),
  resumePreview: z.string().max(2048).optional(),
  threadUpdatedAt: z.string().datetime().optional(),
  alreadyOpenSessionId: Id.optional()
}).strict();
export type DetectedTerminalV1 = z.infer<typeof DetectedTerminalV1Schema>;

export const DetectionResultV1Schema = z.object({
  schemaVersion: z.literal(1),
  scanId: Id,
  scannedAt: z.string().datetime(),
  titlePermission: z.enum(["granted", "denied", "unavailable"]),
  rows: z.array(DetectedTerminalV1Schema).max(100)
}).strict();
export type DetectionResultV1 = z.infer<typeof DetectionResultV1Schema>;

export const AcquireDetectionLeaseInputSchema = z.object({
  scanId: Id,
  targetId: Id
}).strict();
export type AcquireDetectionLeaseInput = z.infer<typeof AcquireDetectionLeaseInputSchema>;

export const DetectionLeaseV1Schema = z.object({
  schemaVersion: z.literal(1),
  leaseId: Id,
  expiresAt: z.string().datetime()
}).strict();
export type DetectionLeaseV1 = z.infer<typeof DetectionLeaseV1Schema>;

export const DetectionLeaseIdInputSchema = z.object({
  leaseId: Id
}).strict();
export type DetectionLeaseIdInput = z.infer<typeof DetectionLeaseIdInputSchema>;

export const CreateFromDetectionInputSchema = z.object({
  leaseId: Id,
  mode: z.enum(["continue", "fresh"]),
  title: z.string().min(1).max(256),
  permissionPreset: PermissionPresetSchema,
  model: z.string().max(256).optional(),
  reasoningEffort: z.string().max(64).optional()
}).strict();
export type CreateFromDetectionInput = z.infer<typeof CreateFromDetectionInputSchema>;

export type DetectionCandidate = {
  pid: number;
  ppid: number;
  tty: string;
  command: string;
  args: string;
  cwd: string;
  terminal: DetectedTerminalV1["terminal"];
  title?: string;
  agent: DetectedTerminalV1["agent"];
};

export type EnrichedDetectionCandidate = DetectionCandidate & {
  threadId?: string;
  resumePreview?: string;
  threadUpdatedAt?: string;
  alreadyOpenSessionId?: string;
};
