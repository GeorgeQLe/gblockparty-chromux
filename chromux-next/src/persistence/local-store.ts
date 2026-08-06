import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { RunnerStateV1Schema } from "../runner/contracts";
import {
  DEFAULT_UI_PREFERENCES,
  UiPreferencesV1Schema,
  recoverUiPreferences,
  type UiPreferencesPatchV1,
  type UiPreferencesV1
} from "../settings/ui-preferences";
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  ProjectEntryV1Schema,
  WorkspacePreferencesV1Schema,
  recoverWorkspacePreferences,
  type ProjectEntryV1,
  type WorkspacePreferencesPatchV1,
  type WorkspacePreferencesV1
} from "../settings/workspace-preferences";

const LocalStateSchema = z.object({
  schemaVersion: z.literal(1),
  recentDocuments: z.array(z.string().max(4096)).max(20).default([]),
  lastProjectPath: z.string().max(4096).default(""),
  window: z.object({
    width: z.number().int().min(800).max(10_000),
    height: z.number().int().min(600).max(10_000)
  }).default({ width: 1440, height: 900 }),
  runLogs: z.array(z.object({
    runId: z.string(),
    provider: z.string(),
    status: z.string(),
    at: z.string().datetime()
  })).max(100).default([]),
  runner: RunnerStateV1Schema.optional(),
  // Invalid or future preference values recover independently so runner state
  // is never discarded because presentation metadata was malformed.
  uiPreferences: z.unknown().optional().transform(recoverUiPreferences),
  // Successor-native onboarding data is recovered independently and never
  // consults the legacy Chromux user-data directory.
  workspacePreferences: z.unknown().optional().transform(recoverWorkspacePreferences)
});
export type LocalState = z.infer<typeof LocalStateSchema>;

const DEFAULT_STATE: LocalState = {
  schemaVersion: 1,
  recentDocuments: [],
  lastProjectPath: "",
  window: { width: 1440, height: 900 },
  runLogs: [],
  uiPreferences: { ...DEFAULT_UI_PREFERENCES },
  workspacePreferences: structuredClone(DEFAULT_WORKSPACE_PREFERENCES)
};

export class LocalStore {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "state-v1.json");
  }

  async read(): Promise<LocalState> {
    try {
      return LocalStateSchema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(DEFAULT_STATE);
      throw error;
    }
  }

  async write(state: LocalState): Promise<void> {
    const validated = LocalStateSchema.parse(state);
    const next = this.writeQueue.then(() => this.writeValidated(validated));
    this.writeQueue = next.catch(() => undefined);
    await next;
  }

  async getUiPreferences(): Promise<UiPreferencesV1> {
    return recoverUiPreferences((await this.read()).uiPreferences);
  }

  async updateUiPreferences(patch: UiPreferencesPatchV1): Promise<UiPreferencesV1> {
    let result: UiPreferencesV1 = { ...DEFAULT_UI_PREFERENCES };
    await this.update((state) => {
      result = UiPreferencesV1Schema.parse({
        ...recoverUiPreferences(state.uiPreferences),
        ...patch,
        schemaVersion: 1
      });
      return { ...state, uiPreferences: result };
    });
    return result;
  }

  async getWorkspacePreferences(): Promise<WorkspacePreferencesV1> {
    return recoverWorkspacePreferences((await this.read()).workspacePreferences);
  }

  async updateWorkspacePreferences(patch: WorkspacePreferencesPatchV1): Promise<WorkspacePreferencesV1> {
    let result = structuredClone(DEFAULT_WORKSPACE_PREFERENCES);
    await this.update((state) => {
      const current = recoverWorkspacePreferences(state.workspacePreferences);
      result = WorkspacePreferencesV1Schema.parse({
        ...current,
        ...patch,
        defaultProjectId: patch.defaultProjectId === null ? undefined : patch.defaultProjectId ?? current.defaultProjectId,
        defaultModel: patch.defaultModel === null ? undefined : patch.defaultModel ?? current.defaultModel,
        defaultReasoningEffort: patch.defaultReasoningEffort === null
          ? undefined
          : patch.defaultReasoningEffort ?? current.defaultReasoningEffort,
        schemaVersion: 1
      });
      return { ...state, workspacePreferences: result };
    });
    return result;
  }

  async addProject(project: ProjectEntryV1): Promise<WorkspacePreferencesV1> {
    const validated = ProjectEntryV1Schema.parse(project);
    let result = structuredClone(DEFAULT_WORKSPACE_PREFERENCES);
    await this.update((state) => {
      const current = recoverWorkspacePreferences(state.workspacePreferences);
      const existing = current.projects.find((item) => item.path === validated.path);
      const projects = existing
        ? current.projects.map((item) => item.id === existing.id
          ? { ...validated, id: existing.id, addedAt: existing.addedAt }
          : item)
        : [...current.projects, validated];
      result = WorkspacePreferencesV1Schema.parse({
        ...current,
        projects,
        defaultProjectId: current.defaultProjectId ?? existing?.id ?? validated.id
      });
      return { ...state, workspacePreferences: result };
    });
    return result;
  }

  async removeProject(projectId: string): Promise<WorkspacePreferencesV1> {
    let result = structuredClone(DEFAULT_WORKSPACE_PREFERENCES);
    await this.update((state) => {
      const current = recoverWorkspacePreferences(state.workspacePreferences);
      const projects = current.projects.filter((item) => item.id !== projectId);
      result = WorkspacePreferencesV1Schema.parse({
        ...current,
        projects,
        defaultProjectId: current.defaultProjectId === projectId ? projects[0]?.id : current.defaultProjectId
      });
      return { ...state, workspacePreferences: result };
    });
    return result;
  }

  async updateRunner(runner: LocalState["runner"]): Promise<void> {
    await this.update((state) => ({ ...state, ...(runner ? { runner } : {}) }));
  }

  async registerDetectedSession(
    runner: NonNullable<LocalState["runner"]>,
    project: ProjectEntryV1
  ): Promise<WorkspacePreferencesV1> {
    const validatedRunner = RunnerStateV1Schema.parse(runner);
    const validatedProject = ProjectEntryV1Schema.parse(project);
    let result = structuredClone(DEFAULT_WORKSPACE_PREFERENCES);
    await this.update((state) => {
      const current = recoverWorkspacePreferences(state.workspacePreferences);
      const existing = current.projects.find((item) => item.path === validatedProject.path);
      const projects = existing
        ? current.projects.map((item) => item.id === existing.id
          ? { ...validatedProject, id: existing.id, addedAt: existing.addedAt }
          : item)
        : [...current.projects, validatedProject];
      result = WorkspacePreferencesV1Schema.parse({
        ...current,
        projects,
        defaultProjectId: current.defaultProjectId ?? existing?.id ?? validatedProject.id
      });
      return { ...state, runner: validatedRunner, workspacePreferences: result };
    });
    return result;
  }

  private async update(mutator: (state: LocalState) => LocalState): Promise<void> {
    const next = this.writeQueue.then(async () => {
      const state = LocalStateSchema.parse(mutator(await this.read()));
      await this.writeValidated(state);
    });
    this.writeQueue = next.catch(() => undefined);
    await next;
  }

  private async writeValidated(state: LocalState): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}
