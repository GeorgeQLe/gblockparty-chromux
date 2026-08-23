import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)) throw new Error("Package version is not release-safe");
const appPath = path.join(root, "out", "Chromux Next-darwin-arm64", "Chromux Next.app");
async function verifyApp(candidate) {
  await execFile("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", candidate]);
  const signature = (await execFile("/usr/bin/codesign", ["-dv", "--verbose=4", candidate])).stderr;
  if (!signature.includes("TeamIdentifier=NC56VXK48K")) throw new Error("Packaged app has the wrong Team ID");
  await execFile("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", candidate]);
  await execFile("/usr/bin/xcrun", ["stapler", "validate", candidate]);
}
await verifyApp(appPath);
const destinationRoot = path.join(root, "out", "update-release"); await mkdir(destinationRoot, { recursive: true });
const asset = `GBlockParty-Chromux-Next-${version}-darwin-arm64.zip`;
const destination = path.join(destinationRoot, asset);
await rm(destination, { force: true });
await execFile("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, destination]);
const verificationRoot = await mkdtemp(path.join(os.tmpdir(), "chromux-next-release-verify-"));
try {
  await execFile("/usr/bin/ditto", ["-x", "-k", destination, verificationRoot]);
  await verifyApp(path.join(verificationRoot, "Chromux Next.app"));
} finally {
  await rm(verificationRoot, { recursive: true, force: true });
}
const body = await readFile(destination); const metadata = await stat(destination);
const manifest = {
  schemaVersion: 1,
  tag: `chromux-next-v${version}`,
  version,
  platform: "darwin",
  architecture: "arm64",
  asset,
  size: metadata.size,
  sha256: createHash("sha256").update(body).digest("hex"),
  bundleId: "dev.georgele.chromux.next",
  teamId: "NC56VXK48K"
};
await writeFile(path.join(destinationRoot, `chromux-next-${version}-manifest-v1.json`), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
console.log(`Verified release artifacts written to ${destinationRoot}`);
