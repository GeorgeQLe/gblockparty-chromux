import { z } from "zod";

const Id = z.string().min(1).max(256);
const Timestamp = z.string().datetime();
const BoundedText = z.string().max(64 * 1024);

export const PermissionPresetSchema = z.enum(["workspace", "read-only"]);
export type PermissionPreset = z.infer<typeof PermissionPresetSchema>;

export const RunnerEventV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  sessionId: Id,
  threadId: Id.optional(),
  turnId: Id.optional(),
  itemId: Id.optional(),
  at: Timestamp,
  kind: z.enum([
    "user", "agent", "reasoning", "command", "file-change", "tool",
    "status", "error", "system"
  ]),
  phase: z.enum(["started", "delta", "completed", "failed"]).optional(),
  text: BoundedText,
  sourceMethod: z.string().max(256).optional(),
  links: z.array(z.string().url().max(4096)).max(20).default([])
});
export type RunnerEventV1 = z.infer<typeof RunnerEventV1Schema>;

export const PendingInteractionV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  requestId: z.union([z.string(), z.number()]),
  sessionId: Id,
  threadId: Id,
  turnId: Id.optional(),
  itemId: Id.optional(),
  at: Timestamp,
  kind: z.enum(["command-approval", "file-approval", "network-approval", "question"]),
  title: z.string().min(1).max(512),
  detail: BoundedText,
  questions: z.array(z.object({
    id: Id,
    header: z.string().max(128).default("Question"),
    question: z.string().max(4096),
    options: z.array(z.object({
      label: z.string().max(256),
      description: z.string().max(2048).default("")
    })).max(20).default([])
  })).max(3).default([]),
  offeredDecisions: z.array(z.enum([
    "accept", "accept-session", "decline", "cancel", "accept-amendment"
  ])).max(5),
  policyAmendment: z.array(z.string().max(4096)).max(100).optional(),
  rawMethod: z.string().max(256)
});
export type PendingInteractionV1 = z.infer<typeof PendingInteractionV1Schema>;

export const RunnerSessionV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  title: z.string().min(1).max(256),
  projectPath: z.string().min(1).max(4096),
  canonicalProjectPath: z.string().min(1).max(4096),
  groupId: Id,
  threadId: Id.optional(),
  activeTurnId: Id.optional(),
  status: z.enum(["idle", "starting", "active", "failed", "closed"]),
  model: z.string().max(256).optional(),
  reasoningEffort: z.string().max(64).optional(),
  permissionPreset: PermissionPresetSchema,
  draft: BoundedText.default(""),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  events: z.array(RunnerEventV1Schema).max(1000).default([]),
  interactions: z.array(PendingInteractionV1Schema).max(20).default([])
});
export type RunnerSessionV1 = z.infer<typeof RunnerSessionV1Schema>;

export const RunnerGroupV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  title: z.string().min(1).max(256),
  kind: z.enum(["project", "custom"]),
  projectPath: z.string().max(4096).optional(),
  sessionIds: z.array(Id).max(100),
  createdAt: Timestamp,
  updatedAt: Timestamp
});
export type RunnerGroupV1 = z.infer<typeof RunnerGroupV1Schema>;

export const ModelOptionV1Schema = z.object({
  id: z.string().min(1).max(256),
  displayName: z.string().min(1).max(256),
  description: z.string().max(2048).default(""),
  recommended: z.boolean().default(false),
  defaultReasoningEffort: z.string().max(64).optional(),
  reasoningEfforts: z.array(z.string().max(64)).max(20).default([])
});
export type ModelOptionV1 = z.infer<typeof ModelOptionV1Schema>;

export const AttentionSourceV1Schema = z.object({
  id: Id,
  sessionId: Id.optional(),
  groupId: Id.optional(),
  eventId: Id.optional(),
  kind: z.enum(["session", "event", "interaction", "alignment", "git"])
});

export const AttentionSnapshotV1Schema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: Timestamp,
  sessions: z.array(z.object({
    id: Id,
    groupId: Id,
    title: z.string().max(256),
    projectPath: z.string().max(4096),
    status: z.string().max(64),
    updatedAt: Timestamp,
    latestMessages: z.array(z.object({
      eventId: Id,
      kind: z.string().max(64),
      text: z.string().max(4096),
      at: Timestamp
    })).max(8),
    interactions: z.array(z.object({
      id: Id,
      kind: z.string().max(64),
      title: z.string().max(512),
      detail: z.string().max(4096)
    })).max(10)
  })).max(100),
  git: z.array(z.object({
    sourceId: Id,
    projectPath: z.string().max(4096),
    branch: z.string().max(512),
    status: z.string().max(8192)
  })).max(50),
  alignment: z.array(z.object({
    sourceId: Id,
    title: z.string().max(512),
    state: z.string().max(128)
  })).max(100).default([])
});
export type AttentionSnapshotV1 = z.infer<typeof AttentionSnapshotV1Schema>;

export const AttentionRecommendationV1Schema = z.object({
  id: Id,
  priority: z.enum(["critical", "high", "medium", "low"]),
  title: z.string().min(1).max(256),
  reason: z.string().min(1).max(2048),
  suggestedAction: z.string().min(1).max(1024),
  evidence: z.string().min(1).max(4096),
  sourceIds: z.array(Id).min(1).max(10),
  fingerprint: Id
});

export const AttentionAnalysisV1Schema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: Timestamp,
  recommendations: z.array(AttentionRecommendationV1Schema).max(5)
});
export type AttentionAnalysisV1 = z.infer<typeof AttentionAnalysisV1Schema>;

export const AttentionTriageV1Schema = z.object({
  schemaVersion: z.literal(1),
  fingerprint: Id,
  action: z.enum(["snooze", "dismiss"]),
  until: Timestamp.optional(),
  at: Timestamp
});
export type AttentionTriageV1 = z.infer<typeof AttentionTriageV1Schema>;

export const RunnerStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  groups: z.array(RunnerGroupV1Schema).max(100),
  sessions: z.array(RunnerSessionV1Schema).max(100),
  selectedGroupId: Id.optional(),
  selectedSessionId: Id.optional(),
  attention: AttentionAnalysisV1Schema.optional(),
  attentionFailure: z.string().max(2048).optional(),
  triage: z.array(AttentionTriageV1Schema).max(1000).default([])
});
export type RunnerStateV1 = z.infer<typeof RunnerStateV1Schema>;

export const CreateSessionInputSchema = z.object({
  projectPath: z.string().min(1).max(4096),
  title: z.string().min(1).max(256).optional(),
  groupId: Id.optional(),
  permissionPreset: PermissionPresetSchema.default("workspace"),
  model: z.string().max(256).optional(),
  reasoningEffort: z.string().max(64).optional()
});

export const TurnInputSchema = z.object({
  sessionId: Id,
  text: z.string().min(1).max(64 * 1024)
});

export const ApprovalResponseInputSchema = z.object({
  sessionId: Id,
  interactionId: Id,
  decision: z.enum(["accept", "accept-session", "decline", "cancel", "accept-amendment"]),
  answers: z.record(z.string(), z.array(z.string().max(4096)).max(20)).optional()
});

export const GroupMutationInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), title: z.string().min(1).max(256) }),
  z.object({ type: z.literal("rename"), groupId: Id, title: z.string().min(1).max(256) }),
  z.object({ type: z.literal("delete"), groupId: Id }),
  z.object({ type: z.literal("move-session"), groupId: Id, sessionId: Id })
]);

export const DraftInputSchema = z.object({ sessionId: Id, draft: BoundedText });

export const TriageInputSchema = z.object({
  fingerprint: Id,
  action: z.enum(["snooze", "dismiss"]),
  duration: z.enum(["15m", "1h", "4h", "tomorrow"]).optional()
});
