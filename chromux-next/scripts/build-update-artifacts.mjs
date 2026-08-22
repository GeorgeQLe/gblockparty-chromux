import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)) throw new Error("Package version is not release-safe");
const appPath = path.join(root, "out", "Chromux Next-darwin-arm64", "Chromux Next.app");
await execFile("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
const signature = (await execFile("/usr/bin/codesign", ["-dv", "--verbose=4", appPath])).stderr;
if (!signature.includes("TeamIdentifier=NC56VXK48K")) throw new Error("Packaged app has the wrong Team ID");
await execFile("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
await execFile("/usr/bin/xcrun", ["stapler", "validate", appPath]);
const destinationRoot = path.join(root, "out", "update-release"); await mkdir(destinationRoot, { recursive: true });
const asset = `GBlockParty-Chromux-Next-${version}-darwin-arm64.zip`;
const destination = path.join(destinationRoot, asset);
await execFile("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, destination]);
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
