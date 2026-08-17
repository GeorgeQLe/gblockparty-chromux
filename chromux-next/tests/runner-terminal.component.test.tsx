// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunnerSessionV1 } from "../src/runner/contracts";

const writes: string[] = [];

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    buffer = { active: { viewportY: 0, getLine: () => undefined } };
    loadAddon() {}
    open() {}
    registerLinkProvider() {}
    reset() { writes.length = 0; }
    writeln(value: string) { writes.push(value); }
    write(value: string) { writes.push(value); }
    scrollToBottom() {}
    scrollToLine() {}
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

afterEach(() => {
  cleanup();
  writes.length = 0;
});

describe("runner transcript history", () => {
  it("renders copied history, truncation notice, and hydration failure events", async () => {
    const at = "2026-08-16T12:00:00.000Z";
    const session: RunnerSessionV1 = {
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
    render(<RunnerTerminal session={session} openBrowser={vi.fn()} />);
    await waitFor(() => {
      const output = writes.join("\n");
      expect(output).toContain("Earlier conversation");
      expect(output).toContain("Earlier copied history was omitted");
      expect(output).toContain("Copied history could not be loaded");
    });
  });
});
