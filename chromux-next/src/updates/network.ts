import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import https from "node:https";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const ALLOWED_HOSTS = new Set(["api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "raw.githubusercontent.com", "formulae.brew.sh", "registry.npmjs.org"]);

function validateUrl(url: URL): void {
  if (url.protocol !== "https:" || url.port || url.username || url.password || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error("Update source is not trusted");
  }
}

async function response(url: URL, signal: AbortSignal, maximumBytes: number, redirects = 0): Promise<{ body: Buffer; finalUrl: URL }> {
  validateUrl(url);
  if (redirects > 5) throw new Error("Too many update redirects");
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "GBlockParty-Chromux-Next-Update", Accept: "application/vnd.github+json, application/json, application/atom+xml, text/xml" } }, (incoming) => {
      const status = incoming.statusCode ?? 0;
      if (REDIRECTS.has(status)) {
        incoming.resume();
        const location = incoming.headers.location;
        if (!location) { reject(new Error("Update redirect was missing a location")); return; }
        let next: URL;
        try { next = new URL(location, url); validateUrl(next); } catch { reject(new Error("Update redirect was not trusted")); return; }
        void response(next, signal, maximumBytes, redirects + 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) { incoming.resume(); reject(new Error(`Update source returned HTTP ${status}`)); return; }
      const declared = Number(incoming.headers["content-length"] ?? 0);
      if (declared > maximumBytes) { incoming.destroy(); reject(new Error("Update response exceeded its size limit")); return; }
      const chunks: Buffer[] = []; let bytes = 0;
      incoming.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > maximumBytes) incoming.destroy(new Error("Update response exceeded its size limit")); else chunks.push(chunk); });
      incoming.on("end", () => resolve({ body: Buffer.concat(chunks), finalUrl: url }));
      incoming.on("error", reject);
    });
    const abort = () => request.destroy(new Error("Update request was cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    request.setTimeout(15_000, () => request.destroy(new Error("Update request timed out")));
    request.on("error", reject);
    request.on("close", () => signal.removeEventListener("abort", abort));
  });
}

export async function getJson(url: URL, signal: AbortSignal, maximumBytes = 2 * 1024 * 1024): Promise<unknown> {
  const result = await response(url, signal, maximumBytes);
  try { return JSON.parse(result.body.toString("utf8")); } catch { throw new Error("Update source returned malformed JSON"); }
}

export async function getText(url: URL, signal: AbortSignal, maximumBytes = 2 * 1024 * 1024): Promise<string> {
  return (await response(url, signal, maximumBytes)).body.toString("utf8");
}

export async function downloadFile(url: URL, destination: string, signal: AbortSignal, maximumBytes: number, onProgress?: (bytes: number, total?: number) => void): Promise<{ bytes: number; sha256: string }> {
  const attempt = async (current: URL, redirects = 0): Promise<{ bytes: number; sha256: string }> => {
    validateUrl(current); if (redirects > 5) throw new Error("Too many update redirects");
    return new Promise((resolve, reject) => {
      const request = https.get(current, { headers: { "User-Agent": "GBlockParty-Chromux-Next-Update", Accept: "application/octet-stream" } }, (incoming) => {
        const status = incoming.statusCode ?? 0;
        if (REDIRECTS.has(status)) {
          incoming.resume(); const location = incoming.headers.location;
          if (!location) { reject(new Error("Update redirect was missing a location")); return; }
          let next: URL; try { next = new URL(location, current); validateUrl(next); } catch { reject(new Error("Update redirect was not trusted")); return; }
          void attempt(next, redirects + 1).then(resolve, reject); return;
        }
        if (status < 200 || status >= 300) { incoming.resume(); reject(new Error(`Update source returned HTTP ${status}`)); return; }
        const declared = Number(incoming.headers["content-length"] ?? 0);
        if (declared > maximumBytes) { incoming.destroy(); reject(new Error("Update package exceeded its size limit")); return; }
        const output = createWriteStream(destination, { mode: 0o600 }); const hash = createHash("sha256"); let bytes = 0;
        incoming.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > maximumBytes) incoming.destroy(new Error("Update package exceeded its size limit")); else { hash.update(chunk); onProgress?.(bytes, declared || undefined); } });
        incoming.on("error", reject); output.on("error", reject);
        output.on("finish", () => resolve({ bytes, sha256: hash.digest("hex") })); incoming.pipe(output);
      });
      const abort = () => request.destroy(new Error("Update request was cancelled")); signal.addEventListener("abort", abort, { once: true });
      request.setTimeout(30_000, () => request.destroy(new Error("Update request timed out"))); request.on("error", reject); request.on("close", () => signal.removeEventListener("abort", abort));
    });
  };
  try { return await attempt(url); } catch (error) { await unlink(destination).catch(() => undefined); throw error; }
}
