import type { PendingInteractionV1, RunnerSessionV1, RunnerStateV1 } from "./contracts";

export type RoomRequest = {
  interaction: PendingInteractionV1;
  session: RunnerSessionV1;
  project: string;
};

export type RoomCounts = {
  active: number;
  blocked: number;
  failed: number;
  pendingRequests: number;
};

export function roomRequestKey(request: Pick<RoomRequest, "interaction" | "session">): string {
  return `${request.session.id}:${request.interaction.id}`;
}

export function collectRoomRequests(state: RunnerStateV1): RoomRequest[] {
  return state.sessions
    .filter((session) => session.status !== "closed")
    .flatMap((session) => session.interactions.map((interaction) => ({
      interaction,
      session,
      project: state.groups.find((group) => group.id === session.groupId)?.title
        ?? session.projectPath.split(/[\\/]/).filter(Boolean).at(-1)
        ?? "Project"
    })))
    .sort((left, right) => {
      const chronological = Date.parse(left.interaction.at) - Date.parse(right.interaction.at);
      return chronological || left.interaction.id.localeCompare(right.interaction.id);
    });
}

export function eligibleRoomRequests(requests: RoomRequest[], deferred: ReadonlySet<string>): RoomRequest[] {
  return requests.filter((request) => !deferred.has(roomRequestKey(request)));
}

export function reconcileDeferrals(deferred: ReadonlySet<string>, requests: RoomRequest[]): Set<string> {
  const unresolved = new Set(requests.map(roomRequestKey));
  return new Set([...deferred].filter((id) => unresolved.has(id)));
}

export function roomCounts(state: RunnerStateV1): RoomCounts {
  const open = state.sessions.filter((session) => session.status !== "closed");
  return {
    active: open.filter((session) => session.status === "active" || session.status === "starting").length,
    blocked: open.filter((session) => session.interactions.length > 0).length,
    failed: open.filter((session) => session.status === "failed").length,
    pendingRequests: open.reduce((total, session) => total + session.interactions.length, 0)
  };
}

export const DECISION_COPY = {
  accept: { title: "Authorize once", description: "Permit only this request, then return to the existing policy." },
  "accept-session": { title: "Authorize for this session", description: "Permit equivalent requests for the remainder of this session." },
  "accept-amendment": { title: "Apply policy amendment", description: "Apply the exact policy amendment offered with this request." },
  decline: { title: "Decline", description: "Deny this request and let the agent continue without it." },
  cancel: { title: "Cancel", description: "Cancel this request without granting authority." }
} satisfies Record<PendingInteractionV1["offeredDecisions"][number], { title: string; description: string }>;

export function decisionCopy(decision: PendingInteractionV1["offeredDecisions"][number]) {
  return DECISION_COPY[decision];
}
