import type {
  AgentRunEvent,
  AgentRunRequest,
  AgentRunResult,
  AlignmentDocumentV1,
  AlignmentMutationBatchV1
} from "../domain/schema";

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
}

declare global {
  interface Window {
    chromuxNext: ChromuxNextApi;
  }
}
