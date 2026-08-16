import { contextBridge, ipcRenderer } from "electron";
import {
  AgentRunEventSchema,
  AgentRunRequestSchema,
  AgentRunResultSchema,
  DocumentPayloadSchema,
  IpcChannels,
  MutationResultSchema,
  RunnerStateV1Schema,
  CompatibilityDiagnosticsV1Schema,
  AcquireDetectionLeaseInputSchema,
  CreateFromDetectionInputSchema,
  DetectionLeaseIdInputSchema,
  DetectionLeaseV1Schema,
  DetectionResultV1Schema,
  BrowserActionInputSchema,
  BrowserOpenInputSchema,
  BrowserPresentationInputSchema,
  BrowserWorkspaceV1Schema,
  EvidenceCaptureInputSchema,
  EvidenceIdInputSchema,
  EvidencePreviewSchema,
  EvidenceReviewInputSchema,
  UiPreferencesPatchV1Schema,
  UiPreferencesV1Schema
  ,WorkspacePreferencesPatchV1Schema
  ,WorkspacePreferencesV1Schema
} from "./ipc/contracts";
import type { ChromuxNextApi } from "./ipc/bridge";
import { parseMainToRendererEvent } from "./ipc/registry";
import { AlignmentDocumentV1Schema, AlignmentMutationBatchV1Schema } from "./domain/schema";
import {
  AttentionAnalysisV1Schema,
  ApprovalResponseInputSchema,
  CreateSessionInputSchema,
  DraftInputSchema,
  GroupMutationInputSchema,
  ModelOptionV1Schema,
  RunnerSessionV1Schema,
  TriageInputSchema,
  TurnInputSchema
} from "./runner/contracts";

const api: ChromuxNextApi = {
  documents: {
    async open() {
      const value: unknown = await ipcRenderer.invoke(IpcChannels.documentOpen);
      return value === null ? null : DocumentPayloadSchema.parse(value);
    },
    async read(filePath) {
      const value: unknown = await ipcRenderer.invoke(IpcChannels.documentRead, filePath);
      return DocumentPayloadSchema.parse(value);
    },
    async save(filePath, document) {
      const value: unknown = await ipcRenderer.invoke(IpcChannels.documentSave, {
        filePath,
        document: AlignmentDocumentV1Schema.parse(document)
      });
      return DocumentPayloadSchema.parse(value);
    },
    async saveAs(document) {
      const value: unknown = await ipcRenderer.invoke(
        IpcChannels.documentSaveAs,
        AlignmentDocumentV1Schema.parse(document)
      );
      return value === null ? null : DocumentPayloadSchema.parse(value);
    },
    async apply(filePath, batch) {
      const value: unknown = await ipcRenderer.invoke(IpcChannels.mutationApply, {
        filePath,
        batch: AlignmentMutationBatchV1Schema.parse(batch)
      });
      return MutationResultSchema.parse(value);
    }
  },
  agents: {
    async run(request) {
      const value: unknown = await ipcRenderer.invoke(
        IpcChannels.agentRun,
        AgentRunRequestSchema.parse(request)
      );
      return AgentRunResultSchema.parse(value);
    },
    async cancel(runId) {
      return Boolean(await ipcRenderer.invoke(IpcChannels.agentCancel, runId));
    },
    onEvent(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
        listener(parseMainToRendererEvent(IpcChannels.agentEvent, value));
      };
      ipcRenderer.on(IpcChannels.agentEvent, handler);
      return () => ipcRenderer.removeListener(IpcChannels.agentEvent, handler);
    }
  },
  browser: {
    async state() {
      return BrowserWorkspaceV1Schema.parse(await ipcRenderer.invoke(IpcChannels.browserState));
    },
    async open(sessionId, url) {
      const input = BrowserOpenInputSchema.parse({ sessionId, url });
      return Boolean(await ipcRenderer.invoke(IpcChannels.browserOpen, input));
    },
    async present(sessionId, bounds) {
      await ipcRenderer.invoke(IpcChannels.browserPresent, BrowserPresentationInputSchema.parse({ sessionId, bounds }));
    },
    async action(sessionId, type) {
      return Boolean(await ipcRenderer.invoke(
        IpcChannels.browserAction,
        BrowserActionInputSchema.parse({ sessionId, type })
      ));
    },
    async capture(sessionId, note) {
      return BrowserWorkspaceV1Schema.parse(await ipcRenderer.invoke(
        IpcChannels.browserCapture,
        EvidenceCaptureInputSchema.parse({ sessionId, note })
      ));
    },
    async review(evidenceId, decision, note) {
      return BrowserWorkspaceV1Schema.parse(await ipcRenderer.invoke(
        IpcChannels.browserReview,
        EvidenceReviewInputSchema.parse({ evidenceId, decision, note })
      ));
    },
    async preview(evidenceId) {
      return EvidencePreviewSchema.parse(await ipcRenderer.invoke(
        IpcChannels.browserPreview,
        EvidenceIdInputSchema.parse({ evidenceId })
      ));
    },
    async deliver(evidenceId) {
      return BrowserWorkspaceV1Schema.parse(await ipcRenderer.invoke(
        IpcChannels.browserDeliver,
        EvidenceIdInputSchema.parse({ evidenceId })
      ));
    },
    onState(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
        listener(parseMainToRendererEvent(IpcChannels.browserStateChanged, value));
      };
      ipcRenderer.on(IpcChannels.browserStateChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannels.browserStateChanged, handler);
    }
  },
  runner: {
    async state() {
      return RunnerStateV1Schema.parse(await ipcRenderer.invoke(IpcChannels.runnerState));
    },
    async models() {
      return ModelOptionV1Schema.array().parse(await ipcRenderer.invoke(IpcChannels.runnerModels));
    },
    async create(input) {
      return RunnerSessionV1Schema.parse(await ipcRenderer.invoke(
        IpcChannels.runnerCreate,
        CreateSessionInputSchema.parse(input)
      ));
    },
    async detectExternal() {
      return DetectionResultV1Schema.parse(
        await ipcRenderer.invoke(IpcChannels.runnerDetectExternal)
      );
    },
    async acquireDetectionLease(input) {
      return DetectionLeaseV1Schema.parse(await ipcRenderer.invoke(
        IpcChannels.runnerAcquireDetectionLease,
        AcquireDetectionLeaseInputSchema.parse(input)
      ));
    },
    async renewDetectionLease(leaseId) {
      return DetectionLeaseV1Schema.parse(await ipcRenderer.invoke(
        IpcChannels.runnerRenewDetectionLease,
        DetectionLeaseIdInputSchema.parse({ leaseId })
      ));
    },
    async releaseDetectionLease(leaseId) {
      await ipcRenderer.invoke(
        IpcChannels.runnerReleaseDetectionLease,
        DetectionLeaseIdInputSchema.parse({ leaseId })
      );
    },
    async createFromDetection(input) {
      return RunnerSessionV1Schema.parse(await ipcRenderer.invoke(
        IpcChannels.runnerCreateFromDetection,
        CreateFromDetectionInputSchema.parse(input)
      ));
    },
    async close(sessionId) {
      await ipcRenderer.invoke(IpcChannels.runnerClose, sessionId);
    },
    async send(sessionId, text) {
      await ipcRenderer.invoke(IpcChannels.runnerSend, TurnInputSchema.parse({ sessionId, text }));
    },
    async interrupt(sessionId) {
      await ipcRenderer.invoke(IpcChannels.runnerInterrupt, sessionId);
    },
    async saveDraft(sessionId, draft) {
      await ipcRenderer.invoke(IpcChannels.runnerDraft, DraftInputSchema.parse({ sessionId, draft }));
    },
    async respond(input) {
      await ipcRenderer.invoke(IpcChannels.runnerRespond, ApprovalResponseInputSchema.parse(input));
    },
    async mutateGroup(input) {
      await ipcRenderer.invoke(IpcChannels.runnerGroup, GroupMutationInputSchema.parse(input));
    },
    async select(groupId, sessionId) {
      await ipcRenderer.invoke(IpcChannels.runnerSelect, { groupId, sessionId });
    },
    onState(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
        listener(parseMainToRendererEvent(IpcChannels.runnerStateChanged, value));
      };
      ipcRenderer.on(IpcChannels.runnerStateChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannels.runnerStateChanged, handler);
    }
  },
  attention: {
    async refresh() {
      const value: unknown = await ipcRenderer.invoke(IpcChannels.attentionRefresh);
      return value === undefined ? undefined : AttentionAnalysisV1Schema.parse(value);
    },
    async triage(input) {
      await ipcRenderer.invoke(IpcChannels.attentionTriage, TriageInputSchema.parse(input));
    }
  },
  settings: {
    async getUiPreferences() {
      return UiPreferencesV1Schema.parse(await ipcRenderer.invoke(IpcChannels.settingsGetUiPreferences));
    },
    async updateUiPreferences(patch) {
      return UiPreferencesV1Schema.parse(await ipcRenderer.invoke(
        IpcChannels.settingsUpdateUiPreferences,
        UiPreferencesPatchV1Schema.parse(patch)
      ));
    },
    onUiPreferencesChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
        listener(parseMainToRendererEvent(IpcChannels.settingsUiPreferencesChanged, value));
      };
      ipcRenderer.on(IpcChannels.settingsUiPreferencesChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannels.settingsUiPreferencesChanged, handler);
    },
    async getWorkspacePreferences() {
      return WorkspacePreferencesV1Schema.parse(
        await ipcRenderer.invoke(IpcChannels.settingsGetWorkspacePreferences)
      );
    },
    async updateWorkspacePreferences(patch) {
      return WorkspacePreferencesV1Schema.parse(await ipcRenderer.invoke(
        IpcChannels.settingsUpdateWorkspacePreferences,
        WorkspacePreferencesPatchV1Schema.parse(patch)
      ));
    },
    async chooseProject() {
      const value: unknown = await ipcRenderer.invoke(IpcChannels.settingsChooseProject);
      return value === null ? null : WorkspacePreferencesV1Schema.parse(value);
    },
    async removeProject(projectId) {
      return WorkspacePreferencesV1Schema.parse(
        await ipcRenderer.invoke(IpcChannels.settingsRemoveProject, projectId)
      );
    },
    async compatibilityDiagnostics() {
      return CompatibilityDiagnosticsV1Schema.parse(
        await ipcRenderer.invoke(IpcChannels.settingsCompatibilityDiagnostics)
      );
    },
    onWorkspacePreferencesChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
        listener(parseMainToRendererEvent(IpcChannels.settingsWorkspacePreferencesChanged, value));
      };
      ipcRenderer.on(IpcChannels.settingsWorkspacePreferencesChanged, handler);
      return () => ipcRenderer.removeListener(IpcChannels.settingsWorkspacePreferencesChanged, handler);
    }
  }
};

contextBridge.exposeInMainWorld("chromuxNext", api);
