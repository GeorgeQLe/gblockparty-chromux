import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStore } from "../src/persistence/local-store";
import {
  DEFAULT_UI_PREFERENCES,
  UiPreferencesPatchV1Schema,
  UiPreferencesV1Schema,
  mergeUiPreferences,
  recoverUiPreferences
} from "../src/settings/ui-preferences";

describe("UI preferences", () => {
  it("defaults missing and malformed state without accepting future values", () => {
    expect(recoverUiPreferences(undefined)).toEqual(DEFAULT_UI_PREFERENCES);
    expect(recoverUiPreferences({ schemaVersion: 1, approach: "future-ui", density: "tiny", motion: "warp" }))
      .toEqual(DEFAULT_UI_PREFERENCES);
    expect(() => UiPreferencesV1Schema.parse({ ...DEFAULT_UI_PREFERENCES, approach: "future-ui" })).toThrow();
  });

  it("validates strict patches and merges only known presentation fields", () => {
    expect(mergeUiPreferences(DEFAULT_UI_PREFERENCES, { approach: "focus-studio" })).toEqual({
      ...DEFAULT_UI_PREFERENCES,
      approach: "focus-studio"
    });
    expect(() => UiPreferencesPatchV1Schema.parse({ arbitraryCss: "body{}" })).toThrow();
  });

  it("persists updates and restores them across store instances", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-preferences-"));
    const store = new LocalStore(directory);
    expect(await store.getUiPreferences()).toEqual(DEFAULT_UI_PREFERENCES);
    await store.updateUiPreferences({ approach: "spatial-canvas", density: "compact" });
    expect(await new LocalStore(directory).getUiPreferences()).toEqual({
      schemaVersion: 1,
      approach: "spatial-canvas",
      density: "compact",
      motion: "system",
      attentionPanelOpen: true
    });
  });

  it("recovers malformed preferences while preserving runner state", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-preferences-recovery-"));
    const filePath = path.join(directory, "state-v1.json");
    await writeFile(filePath, JSON.stringify({
      schemaVersion: 1,
      recentDocuments: [],
      lastProjectPath: "",
      window: { width: 1440, height: 900 },
      runLogs: [],
      runner: { schemaVersion: 1, groups: [], sessions: [], triage: [] },
      uiPreferences: { schemaVersion: 9, approach: "unknown" }
    }));
    const state = await new LocalStore(directory).read();
    expect(state.runner).toEqual({ schemaVersion: 1, groups: [], sessions: [], triage: [] });
    expect(state.uiPreferences).toEqual(DEFAULT_UI_PREFERENCES);
    expect(JSON.parse(await readFile(filePath, "utf8")).runner.schemaVersion).toBe(1);
  });

  it("serializes runner and preference updates without dropping either", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-preferences-race-"));
    const store = new LocalStore(directory);
    await Promise.all([
      store.updateRunner({ schemaVersion: 1, groups: [], sessions: [], triage: [] }),
      store.updateUiPreferences({ approach: "mission-board", motion: "reduced" })
    ]);
    const state = await store.read();
    expect(state.runner?.schemaVersion).toBe(1);
    expect(state.uiPreferences?.approach).toBe("mission-board");
    expect(state.uiPreferences?.motion).toBe("reduced");
  });
});
