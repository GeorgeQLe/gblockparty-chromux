import { z } from "zod";

export const UiApproachV1Schema = z.enum([
  "control-room",
  "ide-workbench",
  "focus-studio",
  "mission-board",
  "spatial-canvas"
]);
export const UiDensityV1Schema = z.enum(["comfortable", "compact"]);
export const UiMotionV1Schema = z.enum(["system", "full", "reduced"]);

export const UiPreferencesV1Schema = z.object({
  schemaVersion: z.literal(1),
  approach: UiApproachV1Schema,
  density: UiDensityV1Schema,
  motion: UiMotionV1Schema,
  attentionPanelOpen: z.boolean().default(true)
}).strict();

export const UiPreferencesPatchV1Schema = z.object({
  approach: UiApproachV1Schema.optional(),
  density: UiDensityV1Schema.optional(),
  motion: UiMotionV1Schema.optional()
  ,attentionPanelOpen: z.boolean().optional()
}).strict();

export type UiApproachV1 = z.infer<typeof UiApproachV1Schema>;
export type UiDensityV1 = z.infer<typeof UiDensityV1Schema>;
export type UiMotionV1 = z.infer<typeof UiMotionV1Schema>;
export type UiPreferencesV1 = z.infer<typeof UiPreferencesV1Schema>;
export type UiPreferencesPatchV1 = z.infer<typeof UiPreferencesPatchV1Schema>;

export const DEFAULT_UI_PREFERENCES: UiPreferencesV1 = Object.freeze({
  schemaVersion: 1,
  approach: "control-room",
  density: "comfortable",
  motion: "system",
  attentionPanelOpen: true
});

export function recoverUiPreferences(input: unknown): UiPreferencesV1 {
  const parsed = UiPreferencesV1Schema.safeParse(input && typeof input === "object" ? { attentionPanelOpen: true, ...input } : input);
  return parsed.success ? parsed.data : { ...DEFAULT_UI_PREFERENCES };
}

export function mergeUiPreferences(current: unknown, patch: unknown): UiPreferencesV1 {
  return UiPreferencesV1Schema.parse({
    ...recoverUiPreferences(current),
    ...UiPreferencesPatchV1Schema.parse(patch),
    schemaVersion: 1
  });
}
