import { contextBridge, ipcRenderer } from "electron";
import {
  AgentRunEventSchema,
  AgentRunRequestSchema,
  AgentRunResultSchema,
  DocumentPayloadSchema,
  IpcChannels
} from "./ipc/contracts";
import type { ChromuxNextApi } from "./ipc/bridge";
import { AlignmentDocumentV1Schema, AlignmentMutationBatchV1Schema } from "./domain/schema";

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
  }
};

contextBridge.exposeInMainWorld("chromuxNext", api);
