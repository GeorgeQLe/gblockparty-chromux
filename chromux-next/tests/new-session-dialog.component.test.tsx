// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewSessionDialog } from "../src/renderer";
import type { ChromuxNextApi } from "../src/ipc/bridge";
import type { WorkspacePreferencesV1 } from "../src/settings/workspace-preferences";

vi.mock("@xterm/xterm", () => ({ Terminal: class {} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));

const workspace: WorkspacePreferencesV1 = {
  schemaVersion: 1,
  onboardingComplete: true,
  projects: [],
  defaultPermissionPreset: "workspace"
};
const models = [{
  id: "model",
  displayName: "Model",
  description: "",
  recommended: true,
  defaultReasoningEffort: "medium",
  reasoningEfforts: ["low", "medium"]
}];
const suggestion = {
  schemaVersion: 1 as const,
  name: "chromux",
  path: "/projects/tools/chromux",
  detail: "tools/chromux",
  source: "p" as const
};

function setup(suggestProjects = vi.fn().mockResolvedValue([suggestion])) {
  const create = vi.fn().mockResolvedValue({});
  Object.defineProperty(window, "chromuxNext", {
    configurable: true,
    value: { runner: { suggestProjects, create } } as unknown as ChromuxNextApi
  });
  const created = vi.fn();
  render(<NewSessionDialog
    models={models}
    workspace={workspace}
    selectedSession={undefined}
    selectedGroupId={undefined}
    chooseProject={vi.fn()}
    close={vi.fn()}
    created={created}
    fail={vi.fn()}
  />);
  return { create, created, suggestProjects };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("New Session project autocomplete", () => {
  it("searches, accepts the active suggestion with Enter, and creates in its exact directory", async () => {
    const { create, created, suggestProjects } = setup();
    const input = screen.getByRole("combobox", { name: "Project or worktree" });
    fireEvent.change(input, { target: { value: "chrom" } });
    expect(await screen.findByRole("option", { name: /chromux/i })).toBeVisible();
    expect(suggestProjects).toHaveBeenLastCalledWith("chrom");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue(suggestion.path);
    fireEvent.click(screen.getByRole("button", { name: "Create session" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      projectPath: suggestion.path,
      permissionPreset: "workspace",
      model: "model",
      reasoningEffort: "medium"
    })));
    expect(created).toHaveBeenCalledOnce();
  });

  it("ignores stale search responses after the query changes", async () => {
    let resolveFirst!: (value: unknown) => void;
    const suggestProjects = vi.fn((query: string) => {
      if (query === "first") return new Promise((resolve) => { resolveFirst = resolve; });
      if (query === "second") return Promise.resolve([{ ...suggestion, name: "second", path: "/projects/second" }]);
      return Promise.resolve([]);
    });
    setup(suggestProjects);
    const input = screen.getByRole("combobox", { name: "Project or worktree" });
    fireEvent.change(input, { target: { value: "first" } });
    await waitFor(() => expect(suggestProjects).toHaveBeenCalledWith("first"));
    fireEvent.change(input, { target: { value: "second" } });
    expect(await screen.findByRole("option", { name: /second/i })).toBeVisible();
    resolveFirst([{ ...suggestion, name: "first", path: "/projects/first" }]);
    await waitFor(() => expect(screen.queryByRole("option", { name: /first/i })).not.toBeInTheDocument());
    expect(screen.getByRole("option", { name: /second/i })).toBeVisible();
  });
});
