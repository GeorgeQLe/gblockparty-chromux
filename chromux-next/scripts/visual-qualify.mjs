import { access, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const outPath = path.resolve("out");
const directories = await readdir(outPath);
const packageDirectory = directories.find((entry) => entry.startsWith("Chromux Next-"));
if (!packageDirectory) throw new Error("Packaged Chromux Next app was not found");

const executable = process.platform === "darwin"
  ? path.join(outPath, packageDirectory, "Chromux Next.app", "Contents", "MacOS", "chromux-next")
  : process.platform === "win32"
    ? path.join(outPath, packageDirectory, "chromux-next.exe")
    : path.join(outPath, packageDirectory, "chromux-next");
await access(executable);

const destination = path.resolve(process.argv[2] ?? await mkdtemp(path.join(os.tmpdir(), "chromux-next-visual-")));
const userData = await mkdtemp(path.join(os.tmpdir(), "chromux-next-visual-state-"));
const at = new Date().toISOString();
const event = (id, sessionId, kind, text, phase) => ({ schemaVersion: 1, id, sessionId, at, kind, text, links: [], ...(phase ? { phase } : {}) });
const session = (id, title, groupId, status, extra = {}) => ({
  schemaVersion: 1,
  id,
  title,
  projectPath: "/Users/example/Projects/chromux-next-long-project-name",
  canonicalProjectPath: "/Users/example/Projects/chromux-next-long-project-name",
  groupId,
  status,
  permissionPreset: "workspace",
  draft: id === "session-active" ? "Preserved draft while the active turn continues" : "",
  createdAt: at,
  updatedAt: at,
  events: [event(`${id}-event`, id, status === "failed" ? "error" : "agent", status === "failed" ? "Build failed: inspect the packaging output" : "The implementation is ready for review.")],
  interactions: [],
  ...extra
});
const approval = {
  schemaVersion: 1,
  id: "approval-1",
  requestId: "request-1",
  sessionId: "session-approval",
  threadId: "visual-thread-approval",
  at,
  kind: "command-approval",
  title: "Approve package verification",
  detail: "npm run package",
  questions: [],
  offeredDecisions: ["accept", "accept-session", "decline", "cancel"],
  rawMethod: "item/commandExecution/requestApproval"
};
const question = {
  schemaVersion: 1,
  id: "question-1",
  requestId: "request-2",
  sessionId: "session-question",
  threadId: "visual-thread-question",
  at: new Date(Date.parse(at) + 60_000).toISOString(),
  kind: "question",
  title: "Choose release posture",
  detail: "The qualified package is ready. Confirm audience and rollout posture before the prerelease is published. ".repeat(12),
  questions: [
    { id: "audience", header: "Audience", question: "Who should receive this experiment?", options: [{ label: "Internal operators", description: "Limit access to the operations group." }, { label: "All testers", description: "Offer it to all opted-in testers." }] },
    { id: "rollout", header: "Rollout", question: "How should access expand?", options: [{ label: "Staged", description: "Expand after the review window." }, { label: "Immediate", description: "Enable access at publication." }] }
  ],
  offeredDecisions: ["accept", "cancel"],
  rawMethod: "item/tool/requestUserInput"
};
await writeFile(path.join(userData, "state-v1.json"), `${JSON.stringify({
  schemaVersion: 1,
  recentDocuments: [],
  lastProjectPath: "",
  window: { width: 1440, height: 900 },
  runLogs: [],
  uiPreferences: { schemaVersion: 1, approach: "control-room", density: "comfortable", motion: "system" },
  runner: {
    schemaVersion: 1,
    groups: [
      { schemaVersion: 1, id: "group-project", title: "Chromux Next · Interface System", kind: "project", projectPath: "/Users/example/Projects/chromux-next-long-project-name", sessionIds: ["session-approval", "session-question", "session-active", "session-ready"], createdAt: at, updatedAt: at },
      { schemaVersion: 1, id: "group-release", title: "Release qualification", kind: "custom", sessionIds: ["session-failed", "session-idle"], createdAt: at, updatedAt: at }
    ],
    sessions: [
      session("session-approval", "Resolve package approval", "group-project", "idle", { threadId: "visual-thread-approval", interactions: [approval], events: [
        event("visual-user", "session-approval", "user", "Turn the runner transcript into a calm, conversational workspace."),
        event("visual-reasoning", "session-approval", "reasoning", "Reviewing transcript structure and responsive behavior."),
        event("visual-command", "session-approval", "command", "npm run typecheck\nCompleted successfully", "completed"),
        event("visual-agent", "session-approval", "agent", "The conversational transcript is ready. Wrapped prose stays aligned inside each bubble.\n\n- User messages sit on the right\n- Agent messages sit on the left\n\n```tsx\n<RunnerTranscript session={session} />\n```\n\n| Surface | Presentation |\n| --- | --- |\n| Prose | Bubble |\n| Code and tables | Full width |\n\n![Transcript layout](https://example.com/transcript-layout.png)")
      ] }),
      session("session-question", "Choose publication strategy", "group-project", "idle", { threadId: "visual-thread-question", interactions: [question] }),
      session("session-active", "Implement five interface approaches", "group-project", "active", { activeTurnId: "visual-turn-active" }),
      session("session-ready", "Review accessibility fallbacks", "group-project", "idle"),
      session("session-failed", "Qualify narrow window packaging", "group-release", "failed"),
      session("session-idle", "Write release notes", "group-release", "idle")
    ],
    selectedGroupId: "group-project",
    selectedSessionId: "session-approval",
    attention: { schemaVersion: 1, generatedAt: at, recommendations: [{ id: "attention-1", priority: "high", title: "Review visual captures", reason: "Thirty packaged views are ready", suggestedAction: "Inspect contrast and clipping", evidence: "Packaged visual qualification", sourceIds: ["session-ready"], fingerprint: "visual-capture-review" }] },
    triage: []
  }
}, null, 2)}\n`);
const scenarioPath = path.join(userData, "situation-room-scenario.json");
await writeFile(scenarioPath, JSON.stringify({ version: "0.146.0" }));
const child = spawn(executable, [`--visual-smoke-dir=${destination}`], {
  env: { ...process.env, CHROMUX_NEXT_SMOKE_USER_DATA: userData, CHROMUX_NEXT_FIXTURE_SCENARIO: scenarioPath },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});
clearTimeout(timeout);
if (exitCode !== 0 || !output.includes("visual qualification captured 46 views")) {
  throw new Error(`Packaged visual qualification failed (${exitCode}): ${output.slice(-4_000)}`);
}
const situation = spawn(executable, [`--visual-smoke-dir=${destination}`, "--situation-room"], {
  env: { ...process.env, CHROMUX_NEXT_SMOKE_USER_DATA: userData, CHROMUX_NEXT_FIXTURE_SCENARIO: scenarioPath },
  stdio: ["ignore", "pipe", "pipe"]
});
let situationOutput = "";
situation.stdout.on("data", (chunk) => { situationOutput += chunk; });
situation.stderr.on("data", (chunk) => { situationOutput += chunk; });
const situationTimeout = setTimeout(() => situation.kill("SIGKILL"), 60_000);
const situationExitCode = await new Promise((resolve, reject) => {
  situation.once("error", reject);
  situation.once("exit", resolve);
});
clearTimeout(situationTimeout);
if (situationExitCode !== 0 || !situationOutput.includes("Situation Room visual qualification captured 8 views")) {
  throw new Error(`Packaged Situation Room visual qualification failed (${situationExitCode}): ${situationOutput.slice(-4_000)}`);
}
output += situationOutput;
const recovery = spawn(executable, [`--visual-smoke-dir=${destination}`, "--renderer-recovery-visual"], {
  env: { ...process.env, CHROMUX_NEXT_SMOKE_USER_DATA: userData },
  stdio: ["ignore", "pipe", "pipe"]
});
let recoveryOutput = "";
recovery.stdout.on("data", (chunk) => { recoveryOutput += chunk; });
recovery.stderr.on("data", (chunk) => { recoveryOutput += chunk; });
const recoveryTimeout = setTimeout(() => recovery.kill("SIGKILL"), 30_000);
const recoveryExitCode = await new Promise((resolve, reject) => {
  recovery.once("error", reject);
  recovery.once("exit", resolve);
});
clearTimeout(recoveryTimeout);
if (recoveryExitCode !== 0 || !recoveryOutput.includes("Renderer recovery visual qualification captured 2 views")) {
  throw new Error(`Packaged renderer recovery visual qualification failed (${recoveryExitCode}): ${recoveryOutput.slice(-4_000)}`);
}
output += recoveryOutput;
const restart = spawn(executable, ["--smoke"], {
  env: { ...process.env, CHROMUX_NEXT_SMOKE_USER_DATA: userData, CHROMUX_NEXT_EXPECT_APPROACH: "spatial-canvas" },
  stdio: ["ignore", "pipe", "pipe"]
});
let restartOutput = "";
restart.stdout.on("data", (chunk) => { restartOutput += chunk; });
restart.stderr.on("data", (chunk) => { restartOutput += chunk; });
const restartTimeout = setTimeout(() => restart.kill("SIGKILL"), 20_000);
const restartExitCode = await new Promise((resolve, reject) => {
  restart.once("error", reject);
  restart.once("exit", resolve);
});
clearTimeout(restartTimeout);
if (restartExitCode !== 0 || !restartOutput.includes("Chromux Next smoke passed")) {
  throw new Error(`Packaged preference restart failed (${restartExitCode}): ${restartOutput.slice(-4_000)}`);
}
process.stdout.write(`${output}Screenshots: ${destination}\n`);
