import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStore } from "../src/persistence/local-store";
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  WorkspacePreferencesPatchV1Schema,
  recoverWorkspacePreferences
} from "../src/settings/workspace-preferences";

const at = "2026-08-06T12:00:00.000Z";

describe("successor workspace preferences", () => {
  it("defaults malformed state and rejects unknown settings fields", () => {
    expect(recoverWorkspacePreferences({ schemaVersion: 9, importLegacy: true }))
      .toEqual(DEFAULT_WORKSPACE_PREFERENCES);
    expect(() => WorkspacePreferencesPatchV1Schema.parse({ legacyPath: "/tmp/legacy" })).toThrow();
  });

  it("persists onboarding, defaults, projects, and safe removal", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-workspace-"));
    const store = new LocalStore(directory);
    await store.addProject({
      schemaVersion: 1,
      id: "project-one",
      name: "Project",
      path: "/tmp/project",
      kind: "project",
      addedAt: at,
      lastUsedAt: at
    });
    await store.addProject({
      schemaVersion: 1,
      id: "worktree-two",
      name: "Worktree",
      path: "/tmp/worktree",
      kind: "worktree",
      addedAt: at,
      lastUsedAt: at
    });
    await store.updateWorkspacePreferences({
      onboardingComplete: true,
      defaultProjectId: "worktree-two",
      defaultPermissionPreset: "read-only",
      defaultModel: "gpt-5.6",
      defaultReasoningEffort: "high"
    });
    expect((await new LocalStore(directory).getWorkspacePreferences()).projects).toHaveLength(2);
    const removed = await store.removeProject("worktree-two");
    expect(removed.defaultProjectId).toBe("project-one");
    expect(removed.defaultPermissionPreset).toBe("read-only");
  });

  it("recovers malformed workspace metadata without dropping runner or UI state", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-workspace-recovery-"));
    const filePath = path.join(directory, "state-v1.json");
    await writeFile(filePath, JSON.stringify({
      schemaVersion: 1,
      recentDocuments: [],
      lastProjectPath: "",
      window: { width: 1440, height: 900 },
      runLogs: [],
      runner: { schemaVersion: 1, groups: [], sessions: [], triage: [] },
      uiPreferences: {
        schemaVersion: 1,
        approach: "focus-studio",
        density: "compact",
        motion: "reduced"
      },
      workspacePreferences: { schemaVersion: 99, projects: "legacy" }
    }));
    const state = await new LocalStore(directory).read();
    expect(state.runner?.schemaVersion).toBe(1);
    expect(state.uiPreferences.approach).toBe("focus-studio");
    expect(state.workspacePreferences).toEqual(DEFAULT_WORKSPACE_PREFERENCES);
    expect(JSON.parse(await readFile(filePath, "utf8")).workspacePreferences.schemaVersion).toBe(99);
  });

  it("serializes runner, UI, and workspace updates without lost writes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-workspace-race-"));
    const store = new LocalStore(directory);
    await Promise.all([
      store.updateRunner({ schemaVersion: 1, groups: [], sessions: [], triage: [] }),
      store.updateUiPreferences({ approach: "mission-board" }),
      store.updateWorkspacePreferences({ onboardingComplete: true })
    ]);
    const state = await store.read();
    expect(state.runner?.schemaVersion).toBe(1);
    expect(state.uiPreferences.approach).toBe("mission-board");
    expect(state.workspacePreferences.onboardingComplete).toBe(true);
  });
});
