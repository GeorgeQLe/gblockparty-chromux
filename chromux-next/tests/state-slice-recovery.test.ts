import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStore } from "../src/persistence/local-store";
import { DEFAULT_UI_PREFERENCES } from "../src/settings/ui-preferences";

describe("independently recoverable local state", () => {
  it("does not discard runner or workspace state when UI preferences are malformed", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-slices-"));
    const store = new LocalStore(directory);
    await store.updateRunner({ schemaVersion: 1, groups: [], sessions: [], triage: [] });
    await store.updateWorkspacePreferences({ onboardingComplete: true });
    await writeFile(path.join(directory, "ui-preferences-v1.json"), "{broken", { mode: 0o600 });

    const restored = await new LocalStore(directory).read();
    expect(restored.runner?.schemaVersion).toBe(1);
    expect(restored.workspacePreferences.onboardingComplete).toBe(true);
    expect(restored.uiPreferences).toEqual(DEFAULT_UI_PREFERENCES);
  });

  it("does not discard preferences when runner state is malformed or future", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-runner-slice-"));
    const store = new LocalStore(directory);
    await store.updateUiPreferences({ approach: "focus-studio", motion: "reduced" });
    await store.updateWorkspacePreferences({ onboardingComplete: true });
    await writeFile(path.join(directory, "runner-state-v1.json"), JSON.stringify({
      schemaVersion: 99,
      sessions: "future"
    }), { mode: 0o600 });

    const restored = await new LocalStore(directory).read();
    expect(restored.runner).toBeUndefined();
    expect(restored.uiPreferences.approach).toBe("focus-studio");
    expect(restored.workspacePreferences.onboardingComplete).toBe(true);
  });

  it("recovers malformed browser evidence without discarding runner state", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-browser-slice-"));
    const store = new LocalStore(directory);
    await store.updateRunner({ schemaVersion: 1, groups: [], sessions: [], triage: [] });
    await writeFile(path.join(directory, "browser-workspace-v1.json"), JSON.stringify({
      schemaVersion: 99,
      sessions: [{ url: "javascript:unsafe" }]
    }), { mode: 0o600 });
    const restored = await new LocalStore(directory).read();
    expect(restored.runner?.schemaVersion).toBe(1);
    expect(restored.browserWorkspace).toEqual({ schemaVersion: 1, sessions: [], evidence: [] });
  });

  it("writes private, schema-owned files and leaves the legacy fallback untouched", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-private-slices-"));
    const legacyPath = path.join(directory, "state-v1.json");
    await writeFile(legacyPath, "legacy sentinel", { mode: 0o600 });
    const store = new LocalStore(directory);
    await store.updateUiPreferences({ density: "compact" });
    expect(JSON.parse(await readFile(path.join(directory, "ui-preferences-v1.json"), "utf8")))
      .toMatchObject({ schemaVersion: 1, density: "compact" });
    expect(await readFile(legacyPath, "utf8")).toBe("legacy sentinel");
  });

  it("recovers a detected session and project as one crash-safe transaction", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-state-transaction-"));
    const workspace = {
      schemaVersion: 1 as const,
      onboardingComplete: true,
      projects: [{
        schemaVersion: 1 as const,
        id: "project-one",
        name: "Project",
        path: "/tmp/project",
        kind: "project" as const,
        addedAt: "2026-08-09T12:00:00.000Z",
        lastUsedAt: "2026-08-09T12:00:00.000Z"
      }],
      defaultProjectId: "project-one",
      defaultPermissionPreset: "workspace" as const
    };
    const runner = { schemaVersion: 1 as const, groups: [], sessions: [], triage: [] };
    await writeFile(path.join(directory, "detected-session-transaction-v1.json"), JSON.stringify({
      schemaVersion: 1,
      runner,
      workspacePreferences: workspace
    }), { mode: 0o600 });

    const restored = await new LocalStore(directory).read();
    expect(restored.runner).toEqual(runner);
    expect(restored.workspacePreferences.projects[0]?.id).toBe("project-one");
    expect(JSON.parse(await readFile(path.join(directory, "runner-state-v1.json"), "utf8"))).toEqual(runner);
    await expect(readFile(path.join(directory, "detected-session-transaction-v1.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});
