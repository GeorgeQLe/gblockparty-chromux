import { access, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
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

const directory = await mkdtemp(path.join(os.tmpdir(), "chromux-next-runner-restoration-"));
const userData = path.join(directory, "user-data");
const logPath = path.join(directory, "fixture.jsonl");
const scenarioPath = path.join(directory, "scenario.json");
await writeFile(scenarioPath, JSON.stringify({
  version: "0.146.0",
  fragments: [1, 2, 7, 3, 19],
  fragmentDelayMs: 1,
  logPath
}));

for (const phase of ["first", "second"]) {
  const child = spawn(executable, [`--runner-restoration-smoke=${phase}`], {
    env: {
      ...process.env,
      CHROMUX_NEXT_SMOKE_USER_DATA: userData,
      CHROMUX_NEXT_FIXTURE_SCENARIO: scenarioPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  clearTimeout(timeout);
  if (exitCode !== 0 || !output.includes(`runner restoration smoke ${phase} passed`)) {
    throw new Error(`Packaged runner restoration ${phase} failed (${exitCode}): ${output.slice(-4_000)}`);
  }
  process.stdout.write(output);
}

const entries = (await readFile(logPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
const requests = entries.filter((entry) => entry.event === "request").map((entry) => entry.message);
const starts = entries.filter((entry) => entry.event === "start" && entry.mode === "app-server");
const exits = entries.filter((entry) => entry.event === "exit");
if (requests.filter((entry) => entry.method === "thread/start").length !== 2
  || requests.filter((entry) => entry.method === "thread/resume").length !== 2
  || requests.some((entry) => entry.method === "turn/start" || entry.method === "turn/steer")
  || starts.length !== 2
  || exits.length < 2) {
  throw new Error(`Packaged restoration process/request invariant failed: ${JSON.stringify(entries.slice(-30))}`);
}
console.log("Chromux Next packaged two-session restoration smoke passed");
