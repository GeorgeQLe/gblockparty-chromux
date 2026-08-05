import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";

const run = promisify(execFile);
const buildDirectory = path.resolve("build");
const source = await readFile(path.join(buildDirectory, "icon.svg"));

function render(size) {
  return new Resvg(source, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)"
  }).render().asPng();
}

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
await writeFile(path.join(buildDirectory, "icon.ico"), await pngToIco(icoSizes.map(render)));
await writeFile(path.join(buildDirectory, "icon.png"), render(1024));

if (process.platform === "darwin") {
  const iconset = path.join(buildDirectory, "icon.iconset");
  await rm(iconset, { recursive: true, force: true });
  await mkdir(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    await writeFile(path.join(iconset, `icon_${size}x${size}.png`), render(size));
    await writeFile(path.join(iconset, `icon_${size}x${size}@2x.png`), render(size * 2));
  }
  await run("iconutil", ["-c", "icns", iconset, "-o", path.join(buildDirectory, "icon.icns")]);
  await rm(iconset, { recursive: true, force: true });
}
