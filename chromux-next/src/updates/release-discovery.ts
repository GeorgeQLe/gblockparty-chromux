import { z } from "zod";
import { compareSemver } from "./semver";

const AssetSchema = z.object({ name: z.string().max(256), browser_download_url: z.string().url().max(4096), size: z.number().int().nonnegative() });
const ReleaseSchema = z.object({
  tag_name: z.string().max(128), draft: z.boolean(), prerelease: z.boolean(),
  html_url: z.string().url().max(4096), assets: z.array(AssetSchema).max(100)
});

export interface NextRelease { version: string; tag: string; releaseUrl: string; manifestUrl: string }

export function selectNextRelease(value: unknown): NextRelease | undefined {
  const releases = z.array(ReleaseSchema).max(100).parse(value);
  return releases.flatMap((release) => {
    const match = release.tag_name.match(/^chromux-next-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/);
    if (!match || release.draft || !release.prerelease) return [];
    const version = match[1]!;
    const manifest = release.assets.find((asset) => asset.name === `chromux-next-${version}-manifest-v1.json`);
    if (!manifest) return [];
    const releaseUrl = new URL(release.html_url); const manifestUrl = new URL(manifest.browser_download_url);
    if (releaseUrl.origin !== "https://github.com" || releaseUrl.pathname !== `/GeorgeQLe/gblockparty-chromux/releases/tag/${release.tag_name}` || releaseUrl.search || releaseUrl.hash) return [];
    const manifestPath = `/GeorgeQLe/gblockparty-chromux/releases/download/${release.tag_name}/${manifest.name}`;
    if (manifestUrl.origin !== "https://github.com" || manifestUrl.pathname !== manifestPath || manifestUrl.search || manifestUrl.hash) return [];
    return [{ version, tag: release.tag_name, releaseUrl: release.html_url, manifestUrl: manifest.browser_download_url }];
  }).sort((a, b) => compareSemver(b.version, a.version))[0];
}

export function selectNextReleaseFromAtom(xml: string): NextRelease | undefined {
  if (Buffer.byteLength(xml, "utf8") > 2 * 1024 * 1024) throw new Error("Release feed is too large");
  const candidates: NextRelease[] = [];
  for (const entry of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/g)) {
    const tag = entry[0].match(/chromux-next-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))/)?.[0];
    if (!tag) continue;
    const version = tag.slice("chromux-next-v".length);
    candidates.push({ version, tag, releaseUrl: `https://github.com/GeorgeQLe/gblockparty-chromux/releases/tag/${tag}`, manifestUrl: `https://github.com/GeorgeQLe/gblockparty-chromux/releases/download/${tag}/chromux-next-${version}-manifest-v1.json` });
  }
  return candidates.sort((a, b) => compareSemver(b.version, a.version))[0];
}
