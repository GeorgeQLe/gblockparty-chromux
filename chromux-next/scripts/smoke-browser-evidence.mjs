import { createServer } from "node:http";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const outPath = path.resolve("out");
const packageDirectory = (await readdir(outPath)).find((entry) => entry.startsWith("Chromux Next-"));
if (!packageDirectory) throw new Error("Packaged Chromux Next app was not found");
const executable = process.platform === "darwin"
  ? path.join(outPath, packageDirectory, "Chromux Next.app", "Contents", "MacOS", "chromux-next")
  : process.platform === "win32"
    ? path.join(outPath, packageDirectory, "chromux-next.exe")
    : path.join(outPath, packageDirectory, "chromux-next");
const temporary = await mkdtemp(path.join(os.tmpdir(), "chromux-next-browser-evidence-"));
const scenarioPath = path.join(temporary, "scenario.json");
const userData = path.join(temporary, "user-data");
const logPath = path.join(temporary, "fixture.jsonl");
await writeFile(scenarioPath, JSON.stringify({ version: "0.146.0", fragments: [1, 3, 11], logPath }), { mode: 0o600 });
const server = createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<html><head><title>${request.url === "/one" ? "Evidence One" : "Evidence Two"}</title></head><body><h1>Packaged browser evidence</h1><p>${request.url}</p></body></html>`);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Fixture server address is unavailable");
const url = `http://127.0.0.1:${address.port}`;
const child = spawn(executable, [`--browser-evidence-smoke=${url}`], {
  env: {
    ...process.env,
    ELECTRON_DISABLE_GPU: "1",
    CHROMUX_NEXT_SMOKE_USER_DATA: userData,
    CHROMUX_NEXT_FIXTURE_SCENARIO: scenarioPath
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
const timeout = setTimeout(() => child.kill("SIGKILL"), 30_000);
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});
clearTimeout(timeout);
await new Promise((resolve) => server.close(resolve));
if (exitCode !== 0 || !output.includes("packaged browser evidence smoke passed")) {
  throw new Error(`Packaged browser evidence smoke failed (${exitCode}): ${output.slice(-4_000)}`);
}
process.stdout.write(output);
