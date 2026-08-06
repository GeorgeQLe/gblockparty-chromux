import { z } from "zod";
import { PermissionPresetSchema } from "../runner/contracts";

const Id = z.string().min(1).max(256);

export const ProjectEntryV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  name: z.string().min(1).max(256),
  path: z.string().min(1).max(4096),
  kind: z.enum(["project", "worktree"]),
  addedAt: z.string().datetime(),
  lastUsedAt: z.string().datetime()
}).strict();

export const WorkspacePreferencesV1Schema = z.object({
  schemaVersion: z.literal(1),
  onboardingComplete: z.boolean(),
  projects: z.array(ProjectEntryV1Schema).max(100),
  defaultProjectId: Id.optional(),
  defaultPermissionPreset: PermissionPresetSchema,
  defaultModel: z.string().max(256).optional(),
  defaultReasoningEffort: z.string().max(64).optional()
}).strict();

export const WorkspacePreferencesPatchV1Schema = z.object({
  onboardingComplete: z.boolean().optional(),
  defaultProjectId: Id.nullable().optional(),
  defaultPermissionPreset: PermissionPresetSchema.optional(),
  defaultModel: z.string().max(256).nullable().optional(),
  defaultReasoningEffort: z.string().max(64).nullable().optional()
}).strict();

export type ProjectEntryV1 = z.infer<typeof ProjectEntryV1Schema>;
export type WorkspacePreferencesV1 = z.infer<typeof WorkspacePreferencesV1Schema>;
export type WorkspacePreferencesPatchV1 = z.infer<typeof WorkspacePreferencesPatchV1Schema>;

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferencesV1 = Object.freeze({
  schemaVersion: 1,
  onboardingComplete: false,
  projects: [],
  defaultPermissionPreset: "workspace"
});

export function recoverWorkspacePreferences(input: unknown): WorkspacePreferencesV1 {
  const parsed = WorkspacePreferencesV1Schema.safeParse(input);
  return parsed.success ? parsed.data : structuredClone(DEFAULT_WORKSPACE_PREFERENCES);
}
