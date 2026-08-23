// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetectionDialog } from "../src/renderer";
import type { ChromuxNextApi } from "../src/ipc/bridge";
import type { RunnerStateV1 } from "../src/runner/contracts";
import type { WorkspacePreferencesV1 } from "../src/settings/workspace-preferences";

vi.mock("@xterm/xterm", () => ({ Terminal: class {} }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));

const detection = {
  schemaVersion: 1 as const,
  scanId: "scan",
  scannedAt: "2026-08-16T12:00:00.000Z",
  titlePermission: "granted" as const,
  rows: [{
    schemaVersion: 1 as const,
    targetId: "target",
    terminal: "Terminal" as const,
    agent: "codex" as const,
    pid: 42,
    directory: "/tmp/project",
    projectName: "project",
    command: "codex",
    externalActive: true,
    resumeAvailable: true
  }]
};

const workspace: WorkspacePreferencesV1 = {
  schemaVersion: 1,
  onboardingComplete: true,
  projects: [],
  defaultPermissionPreset: "workspace"
};
const model = {
  id: "model",
  displayName: "Model",
  description: "",
  recommended: true,
  defaultReasoningEffort: "medium",
  reasoningEfforts: ["low", "medium"]
};

function setup(overrides: Record<string, ReturnType<typeof vi.fn>> = {}, state?: RunnerStateV1) {
  const runner = {
    detectExternal: vi.fn().mockResolvedValue(detection),
    acquireDetectionLease: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      leaseId: "lease",
      expiresAt: "2026-08-16T12:02:00.000Z"
    }),
    renewDetectionLease: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      leaseId: "lease",
      expiresAt: "2026-08-16T12:02:30.000Z"
    }),
    releaseDetectionLease: vi.fn().mockResolvedValue(undefined),
    createFromDetection: vi.fn().mockResolvedValue({}),
    select: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
  Object.defineProperty(window, "chromuxNext", {
    configurable: true,
    value: { runner } as unknown as ChromuxNextApi
  });
  const complete = vi.fn();
  const view = render(<DetectionDialog
    onboarding={false}
    workspace={workspace}
    models={[model]}
    state={state ?? { schemaVersion: 1, groups: [], sessions: [], triage: [] }}
    chooseProject={vi.fn()}
    close={vi.fn()}
    complete={complete}
    fail={vi.fn()}
  />);
  return { ...view, runner, complete };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("detected-session lease UI", () => {
  it("prevents duplicate acquisition and releases on Back and unmount", async () => {
    let resolveLease!: (value: unknown) => void;
    const acquire = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLease = resolve; }))
      .mockResolvedValue({ schemaVersion: 1, leaseId: "lease-two", expiresAt: "2026-08-16T12:02:00.000Z" });
    const { runner, unmount } = setup({ acquireDetectionLease: acquire });
    const continueButton = await screen.findByRole("button", { name: "Continue" });
    fireEvent.click(continueButton);
    fireEvent.click(continueButton);
    expect(acquire).toHaveBeenCalledTimes(1);
    await act(async () => resolveLease({ schemaVersion: 1, leaseId: "lease", expiresAt: "2026-08-16T12:02:00.000Z" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(runner.releaseDetectionLease).toHaveBeenCalledWith("lease");

    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await screen.findByRole("button", { name: "Create continuation" });
    unmount();
    expect(runner.releaseDetectionLease).toHaveBeenCalledTimes(2);
  });

  it("renews every 30 seconds and preserves form values when renewal fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const renew = vi.fn().mockRejectedValue(new Error("expired"));
    const { runner } = setup({ renewDetectionLease: renew });
    await screen.findByRole("button", { name: "Continue" });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const title = await screen.findByLabelText("Session title");
    fireEvent.change(title, { target: { value: "My preserved title" } });
    fireEvent.change(screen.getByLabelText("Permissions"), { target: { value: "read-only" } });
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(renew).toHaveBeenCalledWith("lease");
    expect(await screen.findByText(/Your settings are preserved/)).toBeInTheDocument();
    expect(title).toHaveValue("My preserved title");
    expect(screen.getByLabelText("Permissions")).toHaveValue("read-only");
    expect(screen.getByRole("button", { name: "Create continuation" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    await waitFor(() => expect(runner.detectExternal).toHaveBeenCalledTimes(2));
  });

  it("keeps the lease and form retryable after ordinary creation rejection", async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error("fork rejected")).mockResolvedValueOnce({});
    const { runner, complete } = setup({ createFromDetection: create });
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    const createButton = await screen.findByRole("button", { name: "Create continuation" });
    fireEvent.change(screen.getByLabelText("Session title"), { target: { value: "Retry me" } });
    fireEvent.click(createButton);
    expect(await screen.findByText(/fork rejected/)).toBeInTheDocument();
    expect(screen.getByLabelText("Session title")).toHaveValue("Retry me");
    fireEvent.click(screen.getByRole("button", { name: "Create continuation" }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]![0]).toMatchObject({ leaseId: "lease" });
    expect(create.mock.calls[1]![0]).toMatchObject({ leaseId: "lease" });
    expect(create.mock.calls[0]![0]).toMatchObject({ mode: "continue" });
    expect(runner.releaseDetectionLease).not.toHaveBeenCalled();
  });

  it("keeps Focus Existing lease-free", async () => {
    const state: RunnerStateV1 = {
      schemaVersion: 1,
      groups: [],
      sessions: [{
        schemaVersion: 1,
        id: "session",
        title: "Open",
        projectPath: "/tmp/project",
        canonicalProjectPath: "/tmp/project",
        groupId: "group",
        status: "idle",
        permissionPreset: "workspace",
        historyHydration: "complete",
        draft: "",
        createdAt: "2026-08-16T12:00:00.000Z",
        updatedAt: "2026-08-16T12:00:00.000Z",
        events: [],
        interactions: []
      }],
      triage: []
    };
    const focusedDetection = { ...detection, rows: [{ ...detection.rows[0]!, alreadyOpenSessionId: "session" }] };
    const detect = vi.fn().mockResolvedValue(focusedDetection);
    const { runner, complete } = setup({ detectExternal: detect }, state);
    fireEvent.click(await screen.findByRole("button", { name: "Focus Existing" }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(runner.select).toHaveBeenCalledWith("group", "session");
    expect(runner.acquireDetectionLease).not.toHaveBeenCalled();
  });
});
