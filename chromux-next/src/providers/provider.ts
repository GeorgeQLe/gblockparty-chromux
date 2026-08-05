import type {
  AgentRunEvent,
  AgentRunRequest,
  AgentRunResult
} from "../domain/schema";

export interface AgentProvider {
  readonly id: AgentRunRequest["provider"];
  run(
    request: AgentRunRequest,
    emit: (event: AgentRunEvent) => void,
    signal: AbortSignal
  ): Promise<AgentRunResult>;
}

export function event(
  type: AgentRunEvent["type"],
  runId: string,
  data: Record<string, unknown> = {}
): AgentRunEvent {
  return { type, runId, at: new Date().toISOString(), ...data } as AgentRunEvent;
}
