import { z } from "zod";
import {
  AgentRunEventSchema,
  AgentRunRequestSchema,
  AgentRunResultSchema,
  AlignmentDocumentV1Schema,
  AlignmentMutationBatchV1Schema
} from "../domain/schema";

export const IpcChannels = {
  documentOpen: "document:open",
  documentSave: "document:save",
  documentSaveAs: "document:save-as",
  mutationApply: "mutation:apply",
  agentRun: "agent:run",
  agentCancel: "agent:cancel",
  agentEvent: "agent:event",
  browserOpen: "browser:open",
  browserAction: "browser:action"
} as const;

export const DocumentPayloadSchema = z.object({
  filePath: z.string().min(1),
  document: AlignmentDocumentV1Schema
});

export const SavePayloadSchema = z.object({
  filePath: z.string().min(1),
  document: AlignmentDocumentV1Schema
});

export const MutationPayloadSchema = z.object({
  filePath: z.string().min(1),
  document: AlignmentDocumentV1Schema,
  batch: AlignmentMutationBatchV1Schema
});

export const BrowserActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("forward") }),
  z.object({ type: z.literal("reload") }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("copy-link") }),
  z.object({ type: z.literal("open-external") })
]);

export {
  AgentRunEventSchema,
  AgentRunRequestSchema,
  AgentRunResultSchema,
  AlignmentDocumentV1Schema
};
