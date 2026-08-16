import type { PendingInteractionV1 } from "../runner/contracts";

const at = "2026-08-16T16:00:00.000Z";

export const situationRoomApprovalFixture: PendingInteractionV1 = {
  schemaVersion: 1, id: "fixture-approval", requestId: "request-approval", sessionId: "session-approval",
  threadId: "thread-approval", at, kind: "command-approval", title: "Publish the qualified build",
  detail: "npm run make && gh release create chromux-next-v0.10.0",
  questions: [], offeredDecisions: ["accept", "accept-session", "accept-amendment", "decline"],
  policyAmendment: ["Allow npm run make", "Allow gh release create for this repository"],
  rawMethod: "item/commandExecution/requestApproval"
};

export const situationRoomQuestionFixture: PendingInteractionV1 = {
  schemaVersion: 1, id: "fixture-question", requestId: "request-question", sessionId: "session-question",
  threadId: "thread-question", at: "2026-08-16T16:01:00.000Z", kind: "question", title: "Choose the release posture",
  detail: "The release is qualified. Two product decisions remain before publication.",
  questions: [
    { id: "audience", header: "Audience", question: "Who should receive this experiment?", options: [
      { label: "Internal operators", description: "Limit the prerelease to the operations team." },
      { label: "All testers", description: "Make the prerelease visible to every opted-in tester." }
    ] },
    { id: "rollout", header: "Rollout", question: "How quickly should access expand?", options: [
      { label: "Staged", description: "Expand access after the first review window." },
      { label: "Immediate", description: "Enable it for the selected audience at publication." }
    ] }
  ], offeredDecisions: ["accept", "cancel"], rawMethod: "item/tool/requestUserInput"
};
