import { z } from "zod";
import {
  AgentRunEventSchema,
  AgentRunRequestSchema,
  AgentRunResultSchema,
  AlignmentDocumentV1Schema,
  AlignmentMutationBatchV1Schema
} from "../domain/schema";
import {
  AttentionScopeInputSchema,
  ApprovalResponseInputSchema,
  CreateSessionInputSchema,
  DraftInputSchema,
  GroupMutationInputSchema,
  RunnerStateV1Schema,
  CompatibilityDiagnosticsV1Schema,
  TriageInputSchema,
  TurnInputSchema
} from "../runner/contracts";
import { UiPreferencesPatchV1Schema, UiPreferencesV1Schema } from "../settings/ui-preferences";
import {
  WorkspacePreferencesPatchV1Schema,
  WorkspacePreferencesV1Schema
} from "../settings/workspace-preferences";
import {
  ProjectSuggestionQuerySchema,
  ProjectSuggestionV1Schema
} from "../settings/project-suggestions";
import {
  AcquireDetectionLeaseInputSchema,
  CreateFromDetectionInputSchema,
  DetectionLeaseIdInputSchema,
  DetectionLeaseV1Schema,
  DetectionResultV1Schema,
  DetectedTerminalV1Schema
} from "../detection/contracts";
import {
  BrowserActionInputSchema,
  BrowserOpenInputSchema,
  BrowserPresentationInputSchema,
  BrowserWorkspaceV1Schema,
  EvidenceCaptureInputSchema,
  EvidenceIdInputSchema,
  EvidencePreviewSchema,
  EvidenceReviewInputSchema
} from "../browser/contracts";
import {
  UpdateActionSchema,
  UpdateCheckActionSchema,
  UpdateReleaseNotesActionSchema,
  UpdateStateV1Schema
} from "../updates/contracts";
import {
  attachmentEventSchema,
  attachmentInputSchema,
  attachmentResizeSchema,
  fleetAttachInputSchema,
  fleetEnrollmentInputSchema,
  fleetStateSchema,
  remoteTabSchema,
  surfaceIdInputSchema
} from "../control-plane/contracts";
import { RepositoryInspectionRequestSchema, RepositoryInspectionResultSchema } from "../repository/contracts";

export const IpcChannels = {
  documentCurrent: "document:current",
  documentCreate: "document:create",
  documentOpen: "document:open",
  documentRead: "document:read",
  documentSave: "document:save",
  documentSaveAs: "document:save-as",
  mutationApply: "mutation:apply",
  agentRun: "agent:run",
  agentCancel: "agent:cancel",
  agentEvent: "agent:event",
  browserOpen: "browser:open",
  browserAction: "browser:action",
  browserState: "browser:state",
  browserPresent: "browser:present",
  browserCapture: "browser:capture",
  browserReview: "browser:review",
  browserPreview: "browser:preview",
  browserDeliver: "browser:deliver",
  browserStateChanged: "browser:state-changed"
  ,runnerState: "runner:state"
  ,runnerStateChanged: "runner:state-changed"
  ,runnerCreate: "runner:create"
  ,runnerClose: "runner:close"
  ,runnerSend: "runner:send"
  ,runnerInterrupt: "runner:interrupt"
  ,runnerDraft: "runner:draft"
  ,runnerRespond: "runner:respond"
  ,runnerModels: "runner:models"
  ,runnerSuggestProjects: "runner:suggest-projects"
  ,runnerGroup: "runner:group"
  ,runnerSelect: "runner:select"
  ,runnerDetectExternal: "runner:detect-external"
  ,runnerAcquireDetectionLease: "runner:acquire-detection-lease"
  ,runnerRenewDetectionLease: "runner:renew-detection-lease"
  ,runnerReleaseDetectionLease: "runner:release-detection-lease"
  ,runnerCreateFromDetection: "runner:create-from-detection"
  ,attentionRefresh: "attention:refresh"
  ,attentionTriage: "attention:triage"
  ,attentionSetScope: "attention:set-scope"
  ,repositoryInspect: "repository:inspect"
  ,settingsGetUiPreferences: "settings:get-ui-preferences"
  ,settingsUpdateUiPreferences: "settings:update-ui-preferences"
  ,settingsUiPreferencesChanged: "settings:ui-preferences-changed"
  ,settingsGetWorkspacePreferences: "settings:get-workspace-preferences"
  ,settingsUpdateWorkspacePreferences: "settings:update-workspace-preferences"
  ,settingsWorkspacePreferencesChanged: "settings:workspace-preferences-changed"
  ,settingsChooseProject: "settings:choose-project"
  ,settingsRemoveProject: "settings:remove-project"
  ,settingsCompatibilityDiagnostics: "settings:compatibility-diagnostics"
  ,updateState: "update:state"
  ,updateCheck: "update:check"
  ,updatePrepareApp: "update:prepare-app"
  ,updateCancelApp: "update:cancel-app"
  ,updateInstallApp: "update:install-app"
  ,updateInstallCodex: "update:install-codex"
  ,updateOpenReleaseNotes: "update:open-release-notes"
  ,updateStateChanged: "update:state-changed"
  ,fleetState: "fleet:state"
  ,fleetEnroll: "fleet:enroll"
  ,fleetForgetEnrollment: "fleet:forget-enrollment"
  ,fleetRefresh: "fleet:refresh"
  ,fleetAttach: "fleet:attach"
  ,fleetDetach: "fleet:detach"
  ,fleetInput: "fleet:input"
  ,fleetRequestControl: "fleet:request-control"
  ,fleetReleaseControl: "fleet:release-control"
  ,fleetResize: "fleet:resize"
  ,fleetStateChanged: "fleet:state-changed"
  ,fleetAttachmentEvent: "fleet:attachment-event"
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
export const ProjectPathSchema = z.string().min(1).max(4096);
export const ProjectDocumentSaveAsSchema = z.object({ projectPath: ProjectPathSchema, document: AlignmentDocumentV1Schema });
export const ProjectChooserInputSchema = z.object({ defaultPath: z.string().min(1).max(4096).optional() }).strict();
export const ProjectChooserResultSchema = z.object({
  preferences: WorkspacePreferencesV1Schema,
  selectedProject: z.object({ path: ProjectPathSchema, id: z.string().min(1).max(256) })
}).strict();

export const MutationPayloadSchema = z.object({
  filePath: z.string().min(1),
  batch: AlignmentMutationBatchV1Schema
});

export const MutationResultSchema = z.object({
  filePath: z.string().min(1),
  document: AlignmentDocumentV1Schema,
  inverseBatch: AlignmentMutationBatchV1Schema
});

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
  AttentionScopeInputSchema,
  TurnInputSchema
  ,CompatibilityDiagnosticsV1Schema
  ,UiPreferencesPatchV1Schema
  ,UiPreferencesV1Schema
  ,WorkspacePreferencesPatchV1Schema
  ,WorkspacePreferencesV1Schema
  ,ProjectSuggestionQuerySchema
  ,ProjectSuggestionV1Schema
  ,CreateFromDetectionInputSchema
  ,AcquireDetectionLeaseInputSchema
  ,DetectionLeaseIdInputSchema
  ,DetectionLeaseV1Schema
  ,DetectionResultV1Schema
  ,DetectedTerminalV1Schema
  ,BrowserActionInputSchema
  ,BrowserOpenInputSchema
  ,BrowserPresentationInputSchema
  ,BrowserWorkspaceV1Schema
  ,EvidenceCaptureInputSchema
  ,EvidenceIdInputSchema
  ,EvidencePreviewSchema
  ,EvidenceReviewInputSchema
  ,UpdateActionSchema
  ,UpdateCheckActionSchema
  ,UpdateReleaseNotesActionSchema
  ,UpdateStateV1Schema
  ,attachmentEventSchema
  ,attachmentInputSchema
  ,attachmentResizeSchema
  ,fleetAttachInputSchema
  ,fleetEnrollmentInputSchema
  ,fleetStateSchema
  ,remoteTabSchema
  ,surfaceIdInputSchema
  ,RepositoryInspectionRequestSchema
  ,RepositoryInspectionResultSchema
};
