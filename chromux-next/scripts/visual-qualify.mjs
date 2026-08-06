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
const event = (id, sessionId, kind, text) => ({ schemaVersion: 1, id, sessionId, at, kind, text, links: [] });
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
      { schemaVersion: 1, id: "group-project", title: "Chromux Next · Interface System", kind: "project", projectPath: "/Users/example/Projects/chromux-next-long-project-name", sessionIds: ["session-approval", "session-active", "session-ready"], createdAt: at, updatedAt: at },
      { schemaVersion: 1, id: "group-release", title: "Release qualification", kind: "custom", sessionIds: ["session-failed", "session-idle"], createdAt: at, updatedAt: at }
    ],
    sessions: [
      session("session-approval", "Resolve package approval", "group-project", "idle", { interactions: [approval] }),
      session("session-active", "Implement five interface approaches", "group-project", "active", { activeTurnId: "visual-turn-active" }),
      session("session-ready", "Review accessibility fallbacks", "group-project", "idle"),
      session("session-failed", "Qualify narrow window packaging", "group-release", "failed"),
      session("session-idle", "Write release notes", "group-release", "idle")
    ],
    selectedGroupId: "group-project",
    selectedSessionId: "session-approval",
    attention: { schemaVersion: 1, generatedAt: at, recommendations: [{ id: "attention-1", priority: "high", title: "Review visual captures", reason: "Ten packaged views are ready", suggestedAction: "Inspect contrast and clipping", evidence: "Packaged visual qualification", sourceIds: ["session-ready"], fingerprint: "visual-capture-review" }] },
    triage: []
  }
}, null, 2)}\n`);
const child = spawn(executable, [`--visual-smoke-dir=${destination}`], {
  env: { ...process.env, CHROMUX_NEXT_SMOKE_USER_DATA: userData },
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
if (exitCode !== 0 || !output.includes("visual qualification captured 10 views")) {
  throw new Error(`Packaged visual qualification failed (${exitCode}): ${output.slice(-4_000)}`);
}
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
