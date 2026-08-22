import type {
  AgentRunEvent,
  AgentRunRequest,
  AgentRunResult,
  AlignmentDocumentV1,
  AlignmentMutationBatchV1
} from "../domain/schema";
import type {
  AttentionAnalysisV1,
  CompatibilityDiagnosticsV1,
  ModelOptionV1,
  RunnerSessionV1,
  RunnerStateV1
} from "../runner/contracts";
import type { UiPreferencesPatchV1, UiPreferencesV1 } from "../settings/ui-preferences";
import type {
  WorkspacePreferencesPatchV1,
  WorkspacePreferencesV1
} from "../settings/workspace-preferences";
import type {
  AcquireDetectionLeaseInput,
  CreateFromDetectionInput,
  DetectionLeaseV1,
  DetectionResultV1
} from "../detection/contracts";
import type { BrowserWorkspaceV1 } from "../browser/contracts";
import type { UpdateStateV1 } from "../updates/contracts";
import type { AttachmentEvent, FleetState, RemoteTab } from "../control-plane/contracts";

export interface DocumentPayload {
  filePath: string;
  document: AlignmentDocumentV1;
}

export interface MutationResult extends DocumentPayload {
  inverseBatch: AlignmentMutationBatchV1;
}

export interface ChromuxNextApi {
  documents: {
    open(): Promise<DocumentPayload | null>;
    read(filePath: string): Promise<DocumentPayload>;
    save(filePath: string, document: AlignmentDocumentV1): Promise<DocumentPayload>;
    saveAs(document: AlignmentDocumentV1): Promise<DocumentPayload | null>;
    apply(filePath: string, batch: AlignmentMutationBatchV1): Promise<MutationResult>;
  };
  agents: {
    run(request: AgentRunRequest): Promise<AgentRunResult>;
    cancel(runId: string): Promise<boolean>;
    onEvent(listener: (event: AgentRunEvent) => void): () => void;
  };
  browser: {
    state(): Promise<BrowserWorkspaceV1>;
    open(sessionId: string, url: string): Promise<boolean>;
    present(sessionId?: string, bounds?: { x: number; y: number; width: number; height: number }): Promise<void>;
    action(sessionId: string, type: "back" | "forward" | "reload" | "copy-link" | "open-external"): Promise<boolean>;
    capture(sessionId: string, note: string): Promise<BrowserWorkspaceV1>;
    review(evidenceId: string, decision: "approve" | "reject", note?: string): Promise<BrowserWorkspaceV1>;
    preview(evidenceId: string): Promise<{ evidenceId: string; dataUrl: string }>;
    deliver(evidenceId: string): Promise<BrowserWorkspaceV1>;
    onState(listener: (state: BrowserWorkspaceV1) => void): () => void;
  };
  runner: {
    state(): Promise<RunnerStateV1>;
    models(): Promise<ModelOptionV1[]>;
    create(input: {
      projectPath: string;
      title?: string;
      groupId?: string;
      permissionPreset?: "workspace" | "read-only";
      model?: string;
      reasoningEffort?: string;
    }): Promise<RunnerSessionV1>;
    detectExternal(): Promise<DetectionResultV1>;
    acquireDetectionLease(input: AcquireDetectionLeaseInput): Promise<DetectionLeaseV1>;
    renewDetectionLease(leaseId: string): Promise<DetectionLeaseV1>;
    releaseDetectionLease(leaseId: string): Promise<void>;
    createFromDetection(input: CreateFromDetectionInput): Promise<RunnerSessionV1>;
    close(sessionId: string): Promise<void>;
    send(sessionId: string, text: string): Promise<void>;
    interrupt(sessionId: string): Promise<void>;
    saveDraft(sessionId: string, draft: string): Promise<void>;
    respond(input: {
      sessionId: string;
      interactionId: string;
      decision: "accept" | "accept-session" | "decline" | "cancel" | "accept-amendment";
      answers?: Record<string, string[]>;
    }): Promise<void>;
    mutateGroup(input:
      | { type: "create"; title: string }
      | { type: "rename"; groupId: string; title: string }
      | { type: "delete"; groupId: string }
      | { type: "move-session"; groupId: string; sessionId: string }
    ): Promise<void>;
    select(groupId: string, sessionId: string): Promise<void>;
    onState(listener: (state: RunnerStateV1) => void): () => void;
  };
  attention: {
    refresh(): Promise<AttentionAnalysisV1 | undefined>;
    triage(input: {
      fingerprint: string;
      action: "snooze" | "dismiss";
      duration?: "15m" | "1h" | "4h" | "tomorrow";
    }): Promise<void>;
  };
  updates: {
    state(): Promise<UpdateStateV1>;
    check(target?: "all" | "app" | "codex"): Promise<UpdateStateV1>;
    prepareApp(): Promise<UpdateStateV1>;
    cancelApp(): Promise<UpdateStateV1>;
    installApp(): Promise<UpdateStateV1>;
    installCodex(): Promise<UpdateStateV1>;
    openReleaseNotes(target: "app" | "codex"): Promise<boolean>;
    onState(listener: (state: UpdateStateV1) => void): () => void;
  };
  fleet: {
    state(): Promise<FleetState>;
    refresh(): Promise<FleetState>;
    attach(surfaceId: string, title: string): Promise<RemoteTab>;
    detach(surfaceId: string): Promise<void>;
    input(surfaceId: string, data: string): Promise<void>;
    resize(surfaceId: string, cols: number, rows: number): Promise<void>;
    onState(listener: (state: FleetState) => void): () => void;
    onAttachment(listener: (event: AttachmentEvent) => void): () => void;
  };
  settings: {
    getUiPreferences(): Promise<UiPreferencesV1>;
    updateUiPreferences(patch: UiPreferencesPatchV1): Promise<UiPreferencesV1>;
    onUiPreferencesChanged(listener: (preferences: UiPreferencesV1) => void): () => void;
    getWorkspacePreferences(): Promise<WorkspacePreferencesV1>;
    updateWorkspacePreferences(patch: WorkspacePreferencesPatchV1): Promise<WorkspacePreferencesV1>;
    chooseProject(): Promise<WorkspacePreferencesV1 | null>;
    removeProject(projectId: string): Promise<WorkspacePreferencesV1>;
    compatibilityDiagnostics(): Promise<CompatibilityDiagnosticsV1>;
    onWorkspacePreferencesChanged(listener: (preferences: WorkspacePreferencesV1) => void): () => void;
  };
}

declare global {
  interface Window {
    chromuxNext: ChromuxNextApi;
  }
}
