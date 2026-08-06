import { contextBridge, ipcRenderer } from "electron";
import {
  AgentRunEventSchema,
  AgentRunRequestSchema,
  AgentRunResultSchema,
  DocumentPayloadSchema,
  IpcChannels,
  RunnerStateV1Schema
} from "./ipc/contracts";
import type { ChromuxNextApi } from "./ipc/bridge";
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
    async apply(filePath, document, batch) {
      const value: unknown = await ipcRenderer.invoke(IpcChannels.mutationApply, {
        filePath,
        document: AlignmentDocumentV1Schema.parse(document),
        batch: AlignmentMutationBatchV1Schema.parse(batch)
      });
      return DocumentPayloadSchema.parse(value);
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
        listener(AgentRunEventSchema.parse(value));
      };
      ipcRenderer.on(IpcChannels.agentEvent, handler);
      return () => ipcRenderer.removeListener(IpcChannels.agentEvent, handler);
    }
  },
  browser: {
    async open(url) {
      return Boolean(await ipcRenderer.invoke(IpcChannels.browserOpen, url));
    },
    async action(type) {
      return Boolean(await ipcRenderer.invoke(IpcChannels.browserAction, { type }));
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
        listener(RunnerStateV1Schema.parse(value));
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
  }
};

contextBridge.exposeInMainWorld("chromuxNext", api);
