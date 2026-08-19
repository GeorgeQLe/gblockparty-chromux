// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunnerSessionV1 } from "../src/runner/contracts";

const writes: string[] = [];
const terminals: Array<{
  buffer: { active: { viewportY: number; getLine: () => undefined } };
  scrollToBottom: ReturnType<typeof vi.fn>;
  scrollToLine: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    buffer = { active: { viewportY: 0, getLine: () => undefined } };
    scrollToBottom = vi.fn();
    scrollToLine = vi.fn();
    constructor() { terminals.push(this); }
    loadAddon() {}
    open() {}
    registerLinkProvider() {}
    reset() { writes.length = 0; }
    writeln(value: string) { writes.push(value); }
    write(value: string) { writes.push(value); }
    dispose() {}
  }
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/addon-search", () => ({ SearchAddon: class { findNext() {}; findPrevious() {} } }));

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class { observe() {}; disconnect() {} }
});

import { RunnerTerminal } from "../src/renderer";
import { normalizeTerminalViewport } from "../src/renderer/recovery";

afterEach(() => {
  cleanup();
  writes.length = 0;
  terminals.length = 0;
});

function session(id: string, events: RunnerSessionV1["events"] = []): RunnerSessionV1 {
  const at = "2026-08-16T12:00:00.000Z";
  return {
    schemaVersion: 1,
    id,
    title: id,
    projectPath: `/tmp/${id}`,
    canonicalProjectPath: `/tmp/${id}`,
    groupId: "group",
    threadId: `thread-${id}`,
    status: "idle",
    permissionPreset: "workspace",
    historyHydration: "complete",
    draft: "",
    createdAt: at,
    updatedAt: at,
    events,
    interactions: []
  };
}

describe("terminal viewport recovery", () => {
  it.each([
    [14.9, 14],
    [-3.4, 0],
    [Number.NaN, undefined],
    [Number.POSITIVE_INFINITY, undefined],
    [Number.NEGATIVE_INFINITY, undefined]
  ])("normalizes %s to %s", (value, expected) => {
    expect(normalizeTerminalViewport(value)).toBe(expected);
  });

  it.each([
    ["fractional", 14.9, 14],
    ["negative", -3.4, 0]
  ])("restores a %s viewport only as a non-negative integer", async (suffix, viewportY, expected) => {
    const first = session(`viewport-${suffix}`);
    const second = session(`other-${suffix}`);
    const view = render(<RunnerTerminal session={first} openBrowser={vi.fn()} />);
    await waitFor(() => expect(terminals).toHaveLength(1));
    terminals[0]!.buffer.active.viewportY = viewportY;
    view.rerender(<RunnerTerminal session={second} openBrowser={vi.fn()} />);
    view.rerender(<RunnerTerminal session={first} openBrowser={vi.fn()} />);
    await waitFor(() => expect(terminals[0]!.scrollToLine).toHaveBeenLastCalledWith(expected));
    expect(Number.isInteger(terminals[0]!.scrollToLine.mock.calls.at(-1)?.[0])).toBe(true);
  });

  it.each([
    ["nan", Number.NaN],
    ["positive-infinity", Number.POSITIVE_INFINITY],
    ["negative-infinity", Number.NEGATIVE_INFINITY]
  ])("discards a %s viewport and restores at the transcript bottom", async (suffix, viewportY) => {
    const first = session(`invalid-${suffix}`);
    const second = session(`other-invalid-${suffix}`);
    const view = render(<RunnerTerminal session={first} openBrowser={vi.fn()} />);
    await waitFor(() => expect(terminals).toHaveLength(1));
    terminals[0]!.buffer.active.viewportY = viewportY;
    view.rerender(<RunnerTerminal session={second} openBrowser={vi.fn()} />);
    const bottomCalls = terminals[0]!.scrollToBottom.mock.calls.length;
    view.rerender(<RunnerTerminal session={first} openBrowser={vi.fn()} />);
    await waitFor(() => expect(terminals[0]!.scrollToBottom.mock.calls.length).toBeGreaterThan(bottomCalls));
  });

  it("keeps transcript output and a valid viewport across event updates", async () => {
    const at = "2026-08-16T12:00:00.000Z";
    const first = session("event-update", [
      { schemaVersion: 1, id: "one", sessionId: "event-update", at, kind: "agent", text: "first response", links: [] }
    ]);
    const view = render(<RunnerTerminal session={first} openBrowser={vi.fn()} />);
    await waitFor(() => expect(writes.join("\n")).toContain("first response"));
    terminals[0]!.buffer.active.viewportY = 7.8;
    view.rerender(<RunnerTerminal session={session("event-update", [
      ...first.events,
      { schemaVersion: 1, id: "two", sessionId: "event-update", at, kind: "agent", text: "second response", links: [] }
    ])} openBrowser={vi.fn()} />);
    await waitFor(() => {
      expect(writes.join("\n")).toContain("first response");
      expect(writes.join("\n")).toContain("second response");
      expect(terminals[0]!.scrollToLine).toHaveBeenLastCalledWith(7);
    });
  });
});

describe("runner transcript history", () => {
  it("renders copied history, truncation notice, and hydration failure events", async () => {
    const at = "2026-08-16T12:00:00.000Z";
    const runnerSession: RunnerSessionV1 = {
      schemaVersion: 1,
      id: "session",
      title: "Continue · omega-war",
      projectPath: "/tmp/omega-war",
      canonicalProjectPath: "/tmp/omega-war",
      groupId: "group",
      threadId: "owned-thread",
      status: "idle",
      permissionPreset: "workspace",
      historyHydration: "failed",
      draft: "",
      createdAt: at,
      updatedAt: at,
      events: [
        { schemaVersion: 1, id: "history", sessionId: "session", at, kind: "agent", text: "Earlier conversation", links: [] },
        { schemaVersion: 1, id: "notice", sessionId: "session", at, kind: "system", text: "Earlier copied history was omitted", links: [] },
        { schemaVersion: 1, id: "failure", sessionId: "session", at, kind: "error", text: "Copied history could not be loaded", links: [] }
      ],
      interactions: []
    };
    render(<RunnerTerminal session={runnerSession} openBrowser={vi.fn()} />);
    await waitFor(() => {
      const output = writes.join("\n");
      expect(output).toContain("Earlier conversation");
      expect(output).toContain("Earlier copied history was omitted");
      expect(output).toContain("Copied history could not be loaded");
    });
  });
});
