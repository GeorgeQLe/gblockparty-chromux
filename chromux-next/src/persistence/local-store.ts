import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { RunnerStateV1Schema, type RunnerStateV1 } from "../runner/contracts";
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
import {
  BrowserWorkspaceV1Schema,
  DEFAULT_BROWSER_WORKSPACE,
  type BrowserWorkspaceV1
} from "../browser/contracts";
import {
  DEFAULT_UPDATE_STATE,
  UpdateStateV1Schema,
  type UpdateStateV1
} from "../updates/contracts";

const AppStateV1Schema = z.object({
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
  })).max(100).default([])
});

const LegacyLocalStateSchema = AppStateV1Schema.extend({
  runner: z.unknown().optional(),
  uiPreferences: z.unknown().optional(),
  workspacePreferences: z.unknown().optional()
});

const DetectedSessionTransactionV1Schema = z.object({
  schemaVersion: z.literal(1),
  runner: RunnerStateV1Schema,
  workspacePreferences: WorkspacePreferencesV1Schema
});

type AppStateV1 = z.infer<typeof AppStateV1Schema>;
export type LocalState = AppStateV1 & {
  runner?: RunnerStateV1;
  uiPreferences: UiPreferencesV1;
  workspacePreferences: WorkspacePreferencesV1;
  browserWorkspace: BrowserWorkspaceV1;
  updateState: UpdateStateV1;
};

const DEFAULT_APP_STATE: AppStateV1 = {
  schemaVersion: 1,
  recentDocuments: [],
  lastProjectPath: "",
  window: { width: 1440, height: 900 },
  runLogs: []
};

type SliceName =
  | "app-state-v1.json"
  | "runner-state-v1.json"
  | "ui-preferences-v1.json"
  | "workspace-preferences-v1.json"
  | "browser-workspace-v1.json"
  | "update-state-v1.json"
  | "detected-session-transaction-v1.json";

/**
 * Successor state is split by ownership. A malformed optional slice is
 * recovered without invalidating drafts, sessions, or another preference
 * domain. state-v1.json remains a read-only migration fallback for v0.7.0.
 */
export class LocalStore {
  private readonly userDataPath: string;
  private readonly legacyFilePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath;
    this.legacyFilePath = path.join(userDataPath, "state-v1.json");
  }

  async read(): Promise<LocalState> {
    const legacy = await this.readLegacy();
    const transaction = await this.recoverDetectedSessionTransaction();
    const app = await this.readSlice("app-state-v1.json", AppStateV1Schema)
      ?? (legacy ? AppStateV1Schema.parse(legacy) : structuredClone(DEFAULT_APP_STATE));
    const runnerValue = await this.readUnknownSlice("runner-state-v1.json");
    const runner = RunnerStateV1Schema.safeParse(transaction?.runner ?? runnerValue ?? legacy?.runner);
    const uiValue = await this.readUnknownSlice("ui-preferences-v1.json");
    const workspaceValue = await this.readUnknownSlice("workspace-preferences-v1.json");
    const browserValue = await this.readUnknownSlice("browser-workspace-v1.json");
    const updateValue = await this.readUnknownSlice("update-state-v1.json");
    const browser = BrowserWorkspaceV1Schema.safeParse(browserValue);
    return {
      ...app,
      ...(runner.success ? { runner: runner.data } : {}),
      uiPreferences: recoverUiPreferences(uiValue ?? legacy?.uiPreferences),
      workspacePreferences: recoverWorkspacePreferences(
        transaction?.workspacePreferences ?? workspaceValue ?? legacy?.workspacePreferences
      ),
      browserWorkspace: browser.success ? browser.data : structuredClone(DEFAULT_BROWSER_WORKSPACE)
      ,updateState: UpdateStateV1Schema.safeParse(updateValue).success
        ? UpdateStateV1Schema.parse(updateValue)
        : structuredClone(DEFAULT_UPDATE_STATE)
    };
  }

  async write(state: LocalState): Promise<void> {
    const validated = this.validateState(state);
    await this.enqueue(async () => {
      await this.writeSlice("app-state-v1.json", AppStateV1Schema.parse(validated));
      if (validated.runner) await this.writeSlice("runner-state-v1.json", validated.runner);
      await this.writeSlice("ui-preferences-v1.json", validated.uiPreferences);
      await this.writeSlice("workspace-preferences-v1.json", validated.workspacePreferences);
      await this.writeSlice("browser-workspace-v1.json", validated.browserWorkspace);
      await this.writeSlice("update-state-v1.json", validated.updateState);
    });
  }

  async getUiPreferences(): Promise<UiPreferencesV1> {
    return (await this.read()).uiPreferences;
  }

  async updateUiPreferences(patch: UiPreferencesPatchV1): Promise<UiPreferencesV1> {
    let result: UiPreferencesV1 = { ...DEFAULT_UI_PREFERENCES };
    await this.enqueue(async () => {
      const current = (await this.read()).uiPreferences;
      result = UiPreferencesV1Schema.parse({ ...current, ...patch, schemaVersion: 1 });
      await this.writeSlice("ui-preferences-v1.json", result);
    });
    return result;
  }

  async getWorkspacePreferences(): Promise<WorkspacePreferencesV1> {
    return (await this.read()).workspacePreferences;
  }

  async updateWorkspacePreferences(patch: WorkspacePreferencesPatchV1): Promise<WorkspacePreferencesV1> {
    let result = structuredClone(DEFAULT_WORKSPACE_PREFERENCES);
    await this.enqueue(async () => {
      const current = (await this.read()).workspacePreferences;
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
      await this.writeSlice("workspace-preferences-v1.json", result);
    });
    return result;
  }

  async addProject(project: ProjectEntryV1): Promise<WorkspacePreferencesV1> {
    const validated = ProjectEntryV1Schema.parse(project);
    return this.mutateProjects((current) => {
      const existing = current.projects.find((item) => item.path === validated.path);
      const projects = existing
        ? current.projects.map((item) => item.id === existing.id
          ? { ...validated, id: existing.id, addedAt: existing.addedAt }
          : item)
        : [...current.projects, validated];
      return { ...current, projects, defaultProjectId: current.defaultProjectId ?? existing?.id ?? validated.id };
    });
  }

  async removeProject(projectId: string): Promise<WorkspacePreferencesV1> {
    return this.mutateProjects((current) => {
      const projects = current.projects.filter((item) => item.id !== projectId);
      return {
        ...current,
        projects,
        defaultProjectId: current.defaultProjectId === projectId ? projects[0]?.id : current.defaultProjectId
      };
    });
  }

  async updateRunner(runner: LocalState["runner"]): Promise<void> {
    if (!runner) return;
    const validated = RunnerStateV1Schema.parse(runner);
    await this.enqueue(() => this.writeSlice("runner-state-v1.json", validated));
  }

  async getBrowserWorkspace(): Promise<BrowserWorkspaceV1> {
    return (await this.read()).browserWorkspace;
  }

  async updateBrowserWorkspace(workspace: BrowserWorkspaceV1): Promise<void> {
    const validated = BrowserWorkspaceV1Schema.parse(workspace);
    await this.enqueue(() => this.writeSlice("browser-workspace-v1.json", validated));
  }

  async getUpdateState(): Promise<UpdateStateV1> {
    return (await this.read()).updateState;
  }

  async updateUpdateState(state: UpdateStateV1): Promise<void> {
    const validated = UpdateStateV1Schema.parse(state);
    await this.enqueue(() => this.writeSlice("update-state-v1.json", validated));
  }

  async registerDetectedSession(
    runner: NonNullable<LocalState["runner"]>,
    project: ProjectEntryV1
  ): Promise<WorkspacePreferencesV1> {
    const validatedRunner = RunnerStateV1Schema.parse(runner);
    const validatedProject = ProjectEntryV1Schema.parse(project);
    let result = structuredClone(DEFAULT_WORKSPACE_PREFERENCES);
    await this.enqueue(async () => {
      const current = (await this.read()).workspacePreferences;
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
      // The marker makes the two-file mutation logically atomic. If the
      // process exits between renames, read() completes the exact transaction
      // before exposing either slice.
      await this.writeSlice("detected-session-transaction-v1.json", {
        schemaVersion: 1,
        runner: validatedRunner,
        workspacePreferences: result
      });
      await this.writeSlice("workspace-preferences-v1.json", result);
      await this.writeSlice("runner-state-v1.json", validatedRunner);
      await this.removeTransactionMarker();
    });
    return result;
  }

  private async mutateProjects(
    mutate: (current: WorkspacePreferencesV1) => WorkspacePreferencesV1
  ): Promise<WorkspacePreferencesV1> {
    let result = structuredClone(DEFAULT_WORKSPACE_PREFERENCES);
    await this.enqueue(async () => {
      result = WorkspacePreferencesV1Schema.parse(mutate((await this.read()).workspacePreferences));
      await this.writeSlice("workspace-preferences-v1.json", result);
    });
    return result;
  }

  private validateState(state: LocalState): LocalState {
    return {
      ...AppStateV1Schema.parse(state),
      ...(state.runner ? { runner: RunnerStateV1Schema.parse(state.runner) } : {}),
      uiPreferences: UiPreferencesV1Schema.parse(state.uiPreferences),
      workspacePreferences: WorkspacePreferencesV1Schema.parse(state.workspacePreferences),
      browserWorkspace: BrowserWorkspaceV1Schema.parse(state.browserWorkspace)
      ,updateState: UpdateStateV1Schema.parse(state.updateState)
    };
  }

  private async readLegacy(): Promise<z.infer<typeof LegacyLocalStateSchema> | undefined> {
    try {
      return LegacyLocalStateSchema.parse(JSON.parse(await readFile(this.legacyFilePath, "utf8")));
    } catch {
      return undefined;
    }
  }

  private async recoverDetectedSessionTransaction(): Promise<z.infer<typeof DetectedSessionTransactionV1Schema> | undefined> {
    const value = await this.readUnknownSlice("detected-session-transaction-v1.json");
    const parsed = DetectedSessionTransactionV1Schema.safeParse(value);
    if (!parsed.success) return undefined;
    await this.writeSlice("workspace-preferences-v1.json", parsed.data.workspacePreferences);
    await this.writeSlice("runner-state-v1.json", parsed.data.runner);
    await this.removeTransactionMarker();
    return parsed.data;
  }

  private async removeTransactionMarker(): Promise<void> {
    try {
      await unlink(path.join(this.userDataPath, "detected-session-transaction-v1.json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private async readUnknownSlice(name: SliceName): Promise<unknown | undefined> {
    try {
      return JSON.parse(await readFile(path.join(this.userDataPath, name), "utf8"));
    } catch {
      return undefined;
    }
  }

  private async readSlice<T>(name: SliceName, schema: z.ZodType<T>): Promise<T | undefined> {
    const value = await this.readUnknownSlice(name);
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(operation);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  private async writeSlice(name: SliceName, value: unknown): Promise<void> {
    await mkdir(this.userDataPath, { recursive: true });
    const filePath = path.join(this.userDataPath, name);
    const temporaryPath = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, filePath);
  }
}
