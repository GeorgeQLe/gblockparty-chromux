import { z } from "zod";
import {
  AgentRunEventSchema,
  AgentRunRequestSchema,
  AgentRunResultSchema,
  AlignmentDocumentV1Schema,
  AlignmentMutationBatchV1Schema
} from "../domain/schema";
import {
  ApprovalResponseInputSchema,
  CreateSessionInputSchema,
  DraftInputSchema,
  GroupMutationInputSchema,
  RunnerStateV1Schema,
  TriageInputSchema,
  TurnInputSchema
} from "../runner/contracts";
import { UiPreferencesPatchV1Schema, UiPreferencesV1Schema } from "../settings/ui-preferences";

export const IpcChannels = {
  documentOpen: "document:open",
  documentRead: "document:read",
  documentSave: "document:save",
  documentSaveAs: "document:save-as",
  mutationApply: "mutation:apply",
  agentRun: "agent:run",
  agentCancel: "agent:cancel",
  agentEvent: "agent:event",
  browserOpen: "browser:open",
  browserAction: "browser:action"
  ,runnerState: "runner:state"
  ,runnerStateChanged: "runner:state-changed"
  ,runnerCreate: "runner:create"
  ,runnerClose: "runner:close"
  ,runnerSend: "runner:send"
  ,runnerInterrupt: "runner:interrupt"
  ,runnerDraft: "runner:draft"
  ,runnerRespond: "runner:respond"
  ,runnerModels: "runner:models"
  ,runnerGroup: "runner:group"
  ,runnerSelect: "runner:select"
  ,attentionRefresh: "attention:refresh"
  ,attentionTriage: "attention:triage"
  ,settingsGetUiPreferences: "settings:get-ui-preferences"
  ,settingsUpdateUiPreferences: "settings:update-ui-preferences"
  ,settingsUiPreferencesChanged: "settings:ui-preferences-changed"
} as const;

export const DocumentPayloadSchema = z.object({
  filePath: z.string().min(1),
  document: AlignmentDocumentV1Schema
});

export const SavePayloadSchema = z.object({
  filePath: z.string().min(1),
  document: AlignmentDocumentV1Schema
});

export const DocumentPathSchema = z.string().min(1);

export const MutationPayloadSchema = z.object({
  filePath: z.string().min(1),
  batch: AlignmentMutationBatchV1Schema
});

export const MutationResultSchema = z.object({
  filePath: z.string().min(1),
  document: AlignmentDocumentV1Schema,
  inverseBatch: AlignmentMutationBatchV1Schema
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
  AlignmentDocumentV1Schema,
  ApprovalResponseInputSchema,
  CreateSessionInputSchema,
  DraftInputSchema,
  GroupMutationInputSchema,
  RunnerStateV1Schema,
  TriageInputSchema,
  TurnInputSchema
  ,UiPreferencesPatchV1Schema
  ,UiPreferencesV1Schema
};
