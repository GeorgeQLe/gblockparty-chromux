import { describe, expect, it, vi } from "vitest";
import { IpcChannels } from "../src/ipc/contracts";
import {
  IpcHandlerRegistry,
  MainToRendererChannels,
  PreloadInvokeChannels,
  parseMainToRendererEvent
} from "../src/ipc/registry";

describe("preload/main IPC conformance", () => {
  it("requires every preload invoke channel exactly once", () => {
    expect(new Set(PreloadInvokeChannels).size).toBe(PreloadInvokeChannels.length);
    const handle = vi.fn();
    const registry = new IpcHandlerRegistry({ handle } as never);
    for (const channel of PreloadInvokeChannels) registry.handle(channel, vi.fn());
    expect(() => registry.assertComplete()).not.toThrow();
    expect(handle).toHaveBeenCalledTimes(PreloadInvokeChannels.length);
    expect(() => registry.handle(IpcChannels.runnerState, vi.fn())).toThrow("Duplicate IPC handler");
  });

  it("fails closed when a preload invoke handler is missing", () => {
    const registry = new IpcHandlerRegistry({ handle: vi.fn() } as never);
    for (const channel of PreloadInvokeChannels.slice(1)) registry.handle(channel, vi.fn());
    expect(() => registry.assertComplete()).toThrow(IpcChannels.documentOpen);
  });

  it("runtime-validates every main-to-renderer event", () => {
    expect(new Set(MainToRendererChannels)).toEqual(new Set([
      IpcChannels.agentEvent,
      IpcChannels.runnerStateChanged,
      IpcChannels.settingsUiPreferencesChanged,
      IpcChannels.settingsWorkspacePreferencesChanged
    ]));
    expect(parseMainToRendererEvent(IpcChannels.runnerStateChanged, {
      schemaVersion: 1,
      groups: [],
      sessions: [],
      triage: []
    })).toMatchObject({ schemaVersion: 1 });
    expect(() => parseMainToRendererEvent(IpcChannels.runnerStateChanged, { sessions: "unsafe" }))
      .toThrow();
    expect(() => parseMainToRendererEvent(IpcChannels.settingsUiPreferencesChanged, {
      schemaVersion: 1,
      approach: "injected-layout",
      density: "compact",
      motion: "system"
    })).toThrow();
  });
});
