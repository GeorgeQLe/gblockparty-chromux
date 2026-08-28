// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/control-plane/ui", () => ({ FleetFeature: () => null }));
import { CommandPalette } from "../src/renderer";
import type { RunnerStateV1 } from "../src/runner/contracts";

afterEach(cleanup);

const at = "2026-08-28T12:00:00.000Z";
const state: RunnerStateV1 = {
  schemaVersion: 1,
  groups: [{ schemaVersion: 1, id: "group", title: "Release Group", kind: "custom", sessionIds: ["alpha", "beta"], createdAt: at, updatedAt: at }],
  sessions: ["Alpha runner", "Beta checks"].map((title, index) => ({
    schemaVersion: 1, id: index ? "beta" : "alpha", title, projectPath: index ? "/projects/beta" : "/projects/alpha",
    canonicalProjectPath: index ? "/projects/beta" : "/projects/alpha", groupId: "group", status: index ? "active" : "idle",
    permissionPreset: "workspace", historyHydration: "complete", draft: "", createdAt: at, updatedAt: at, events: [], interactions: []
  })),
  selectedGroupId: "group", selectedSessionId: "alpha", triage: []
};

describe("Cmd-K command palette", () => {
  it("ranks and activates an exact local result with the keyboard", () => {
    const activate = vi.fn();
    render(<CommandPalette state={state} fleetTabs={[]} close={vi.fn()} activateLocal={activate} />);
    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "beta" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({ id: "beta" }));
  });

  it("activates only an already attached Fleet tab and restores dismissal", () => {
    const close = vi.fn();
    const activated = vi.fn();
    window.addEventListener("chromux:fleet-activate", activated, { once: true });
    render(<CommandPalette state={state} fleetTabs={[{ surfaceId: "surface-1", sessionId: "remote", title: "Remote deploy", status: "connected", authority: "unleased", lastSeq: 1, resetCount: 0, error: null }]} close={close} activateLocal={vi.fn()} />);
    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "remote" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(activated).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("supports arrow navigation and Escape dismissal", () => {
    const close = vi.fn();
    const activate = vi.fn();
    render(<CommandPalette state={state} fleetTabs={[]} close={close} activateLocal={activate} />);
    const search = screen.getByRole("combobox");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({ id: "beta" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalled();
  });
});
