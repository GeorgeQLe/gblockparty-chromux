import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  AgentRunEventSchema,
  BrowserWorkspaceV1Schema,
  IpcChannels,
  RunnerStateV1Schema,
  UiPreferencesV1Schema,
  WorkspacePreferencesV1Schema
} from "./contracts";

export const PreloadInvokeChannels = [
  IpcChannels.documentOpen,
  IpcChannels.documentRead,
  IpcChannels.documentSave,
  IpcChannels.documentSaveAs,
  IpcChannels.mutationApply,
  IpcChannels.agentRun,
  IpcChannels.agentCancel,
  IpcChannels.browserOpen,
  IpcChannels.browserAction,
  IpcChannels.browserState,
  IpcChannels.browserPresent,
  IpcChannels.browserCapture,
  IpcChannels.browserReview,
  IpcChannels.browserPreview,
  IpcChannels.browserDeliver,
  IpcChannels.runnerState,
  IpcChannels.runnerModels,
  IpcChannels.runnerCreate,
  IpcChannels.runnerDetectExternal,
  IpcChannels.runnerAcquireDetectionLease,
  IpcChannels.runnerRenewDetectionLease,
  IpcChannels.runnerReleaseDetectionLease,
  IpcChannels.runnerCreateFromDetection,
  IpcChannels.runnerClose,
  IpcChannels.runnerSend,
  IpcChannels.runnerInterrupt,
  IpcChannels.runnerDraft,
  IpcChannels.runnerRespond,
  IpcChannels.runnerGroup,
  IpcChannels.runnerSelect,
  IpcChannels.attentionRefresh,
  IpcChannels.attentionTriage,
  IpcChannels.settingsGetUiPreferences,
  IpcChannels.settingsUpdateUiPreferences,
  IpcChannels.settingsGetWorkspacePreferences,
  IpcChannels.settingsUpdateWorkspacePreferences,
  IpcChannels.settingsChooseProject,
  IpcChannels.settingsRemoveProject,
  IpcChannels.settingsCompatibilityDiagnostics
] as const;

export const MainToRendererChannels = [
  IpcChannels.agentEvent,
  IpcChannels.runnerStateChanged,
  IpcChannels.settingsUiPreferencesChanged,
  IpcChannels.settingsWorkspacePreferencesChanged,
  IpcChannels.browserStateChanged
] as const;

const MainToRendererSchemas = {
  [IpcChannels.agentEvent]: AgentRunEventSchema,
  [IpcChannels.runnerStateChanged]: RunnerStateV1Schema,
  [IpcChannels.settingsUiPreferencesChanged]: UiPreferencesV1Schema,
  [IpcChannels.settingsWorkspacePreferencesChanged]: WorkspacePreferencesV1Schema,
  [IpcChannels.browserStateChanged]: BrowserWorkspaceV1Schema
} as const;

export function parseMainToRendererEvent<C extends typeof MainToRendererChannels[number]>(
  channel: C,
  value: unknown
): ReturnType<(typeof MainToRendererSchemas)[C]["parse"]> {
  return MainToRendererSchemas[channel].parse(value) as ReturnType<(typeof MainToRendererSchemas)[C]["parse"]>;
}

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/** Fails app startup if the preload contract and installed handlers diverge. */
export class IpcHandlerRegistry {
  private readonly installed = new Set<string>();

  constructor(private readonly ipc: Pick<IpcMain, "handle">) {}

  handle(channel: typeof PreloadInvokeChannels[number], handler: Handler): void {
    if (this.installed.has(channel)) throw new Error(`Duplicate IPC handler: ${channel}`);
    this.installed.add(channel);
    this.ipc.handle(channel, handler);
  }

  assertComplete(): void {
    const missing = PreloadInvokeChannels.filter((channel) => !this.installed.has(channel));
    if (missing.length) throw new Error(`Missing IPC handlers: ${missing.join(", ")}`);
  }
}
