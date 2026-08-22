import { z } from "zod";

export const UpdatePhaseSchema = z.enum([
  "idle", "checking", "current", "available", "downloading", "staged",
  "blocked", "installing", "failed"
]);
export type UpdatePhase = z.infer<typeof UpdatePhaseSchema>;

const VersionSchema = z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/).max(64);
const SafeUrlSchema = z.string().url().max(4096).refine((value) => new URL(value).protocol === "https:");

export const UpdateFailureSchema = z.enum([
  "network", "timeout", "cancelled", "malformed-release", "unsupported",
  "untrusted-package", "checksum", "filesystem", "process", "verification", "unknown"
]);

export const UpdateTargetStateSchema = z.object({
  phase: UpdatePhaseSchema,
  currentVersion: VersionSchema.optional(),
  latestVersion: VersionSchema.optional(),
  releaseUrl: SafeUrlSchema.optional(),
  checkedAt: z.string().datetime().optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  progressLabel: z.string().max(256).optional(),
  blockers: z.array(z.string().min(1).max(256)).max(100).default([]),
  failure: UpdateFailureSchema.optional(),
  failureMessage: z.string().max(512).optional(),
  trust: z.enum(["unknown", "manual-only", "verified"]).default("unknown"),
  installKind: z.enum(["homebrew", "npm", "standalone"]).optional(),
  managedInstallSupported: z.boolean().default(false),
  staged: z.boolean().default(false)
}).strict();
export type UpdateTargetState = z.infer<typeof UpdateTargetStateSchema>;

export const UpdateStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  app: UpdateTargetStateSchema,
  codex: UpdateTargetStateSchema
}).strict();
export type UpdateStateV1 = z.infer<typeof UpdateStateV1Schema>;

export const DEFAULT_UPDATE_STATE: UpdateStateV1 = {
  schemaVersion: 1,
  app: { phase: "idle", blockers: [], trust: "unknown", managedInstallSupported: false, staged: false },
  codex: { phase: "idle", blockers: [], trust: "unknown", managedInstallSupported: false, staged: false }
};

export const UpdateCheckActionSchema = z.object({ target: z.enum(["all", "app", "codex"]) }).strict();
export const UpdateActionSchema = z.object({}).strict();
export const UpdateReleaseNotesActionSchema = z.object({ target: z.enum(["app", "codex"]) }).strict();

export const AppUpdateManifestSchema = z.object({
  schemaVersion: z.literal(1),
  tag: z.string().regex(/^chromux-next-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/).max(80),
  version: VersionSchema,
  platform: z.literal("darwin"),
  architecture: z.literal("arm64"),
  asset: z.string().regex(/^GBlockParty-Chromux-Next-(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-darwin-arm64\.zip$/).max(180),
  size: z.number().int().positive().max(1024 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bundleId: z.literal("dev.georgele.chromux.next"),
  teamId: z.literal("NC56VXK48K")
}).superRefine((value, context) => {
  if (value.tag !== `chromux-next-v${value.version}` || value.asset !== `GBlockParty-Chromux-Next-${value.version}-darwin-arm64.zip`) {
    context.addIssue({ code: "custom", message: "Manifest identity fields disagree" });
  }
});
export type AppUpdateManifest = z.infer<typeof AppUpdateManifestSchema>;
