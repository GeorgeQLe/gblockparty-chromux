import type {
  AgentRunEvent,
  AgentRunRequest,
  AgentRunResult,
  AlignmentDocumentV1,
  AlignmentMutationBatchV1
} from "../domain/schema";
import type {
  AttentionAnalysisV1,
  ModelOptionV1,
  RunnerSessionV1,
  RunnerStateV1
} from "../runner/contracts";

export interface DocumentPayload {
  filePath: string;
  document: AlignmentDocumentV1;
}

export interface ChromuxNextApi {
  documents: {
    open(): Promise<DocumentPayload | null>;
    save(filePath: string, document: AlignmentDocumentV1): Promise<DocumentPayload>;
    saveAs(document: AlignmentDocumentV1): Promise<DocumentPayload | null>;
    apply(filePath: string, document: AlignmentDocumentV1, batch: AlignmentMutationBatchV1): Promise<DocumentPayload>;
  };
  agents: {
    run(request: AgentRunRequest): Promise<AgentRunResult>;
    cancel(runId: string): Promise<boolean>;
    onEvent(listener: (event: AgentRunEvent) => void): () => void;
  };
  browser: {
    open(url: string): Promise<boolean>;
    action(type: "back" | "forward" | "reload" | "close" | "copy-link" | "open-external"): Promise<boolean>;
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
}

declare global {
  interface Window {
    chromuxNext: ChromuxNextApi;
  }
}
