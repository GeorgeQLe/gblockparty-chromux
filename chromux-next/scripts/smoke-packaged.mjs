import { access, mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const outPath = path.resolve("out");
const directories = await readdir(outPath);
const packageDirectory = directories.find((entry) => entry.startsWith("Chromux Next-"));
if (!packageDirectory) throw new Error("Packaged Chromux Next app was not found");

let executable;
if (process.platform === "darwin") {
  executable = path.join(outPath, packageDirectory, "Chromux Next.app", "Contents", "MacOS", "chromux-next");
} else if (process.platform === "win32") {
  executable = path.join(outPath, packageDirectory, "chromux-next.exe");
} else {
  executable = path.join(outPath, packageDirectory, "chromux-next");
}
await access(executable);

const userData = await mkdtemp(path.join(os.tmpdir(), "chromux-next-smoke-state-"));
const child = spawn(executable, ["--smoke"], {
  env: { ...process.env, CHROMUX_NEXT_SMOKE_USER_DATA: userData },
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
if (exitCode !== 0 || !output.includes("Chromux Next smoke passed")) {
  throw new Error(`Packaged smoke failed (${exitCode}): ${output.slice(-4_000)}`);
}
process.stdout.write(output);

const situationChild = spawn(executable, ["--smoke", "--situation-room"], {
  env: { ...process.env, CHROMUX_NEXT_SMOKE_USER_DATA: userData, CHROMUX_NEXT_EXPECT_SITUATION_ROOM: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});
let situationOutput = "";
situationChild.stdout.on("data", (chunk) => { situationOutput += chunk; });
situationChild.stderr.on("data", (chunk) => { situationOutput += chunk; });
const situationTimeout = setTimeout(() => situationChild.kill("SIGKILL"), 20_000);
const situationExitCode = await new Promise((resolve, reject) => {
  situationChild.once("error", reject);
  situationChild.once("exit", resolve);
});
clearTimeout(situationTimeout);
if (situationExitCode !== 0 || !situationOutput.includes("Chromux Next smoke passed")) {
  throw new Error(`Packaged Situation Room smoke failed (${situationExitCode}): ${situationOutput.slice(-4_000)}`);
}
process.stdout.write(situationOutput);
