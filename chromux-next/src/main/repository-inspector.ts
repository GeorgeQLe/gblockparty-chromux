import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  RepositoryInspectionRequestSchema,
  RepositoryInspectionResultSchema,
  type RepositoryEntryV1,
  type RepositoryInspectionRequest,
  type RepositoryInspectionResult
} from "../repository/contracts";

const run = promisify(execFile);
const TIMEOUT_MS = 5_000;
const MAX_BUFFER = 128 * 1024;

export class RepositoryInspector {
  async inspect(input: RepositoryInspectionRequest): Promise<RepositoryInspectionResult> {
    const request = RepositoryInspectionRequestSchema.parse(input);
    const canonical = new Map<string, string>();
    for (const requestedPath of request.projectPaths) {
      const resolved = await realpath(requestedPath).catch(() => path.resolve(requestedPath));
      if (!canonical.has(resolved)) canonical.set(resolved, requestedPath);
    }
    const sessionCounts = new Map<string, number>();
    for (const sessionPath of request.sessionProjectPaths) {
      const resolved = await realpath(sessionPath).catch(() => path.resolve(sessionPath));
      sessionCounts.set(resolved, (sessionCounts.get(resolved) ?? 0) + 1);
    }
    const repositories = await Promise.all([...canonical.keys()].slice(0, 100).map((projectPath) =>
      this.inspectOne(projectPath, sessionCounts.get(projectPath) ?? 0)));
    return RepositoryInspectionResultSchema.parse({ schemaVersion: 1, generatedAt: new Date().toISOString(), repositories });
  }

  private async inspectOne(projectPath: string, attachedSessions: number): Promise<RepositoryEntryV1> {
    const base = { schemaVersion: 1 as const, projectPath, repositoryPath: projectPath, worktree: "unknown" as const,
      branch: "", detached: false, unborn: false, head: "", upstream: "", ahead: 0, behind: 0,
      staged: 0, unstaged: 0, untracked: 0, conflicted: 0, clean: false, attachedSessions };
    try {
      if (!(await stat(projectPath)).isDirectory()) return { ...base, status: "inaccessible", error: "Directory is unavailable" };
    } catch { return { ...base, status: "inaccessible", error: "Directory is unavailable" }; }
    try {
      const [{ stdout: porcelain }, { stdout: root }, { stdout: gitDir }, headResult] = await Promise.all([
        run("git", ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"], { cwd: projectPath, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }),
        run("git", ["rev-parse", "--show-toplevel"], { cwd: projectPath, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }),
        run("git", ["rev-parse", "--absolute-git-dir"], { cwd: projectPath, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }),
        run("git", ["rev-parse", "--short=12", "HEAD"], { cwd: projectPath, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }).catch(() => ({ stdout: "" }))
      ]);
      const parsed = parsePorcelainV2(String(porcelain));
      const repositoryPath = String(root).trim() || projectPath;
      const absoluteGitDir = String(gitDir).trim();
      const mainGitDir = path.join(repositoryPath, ".git");
      const worktree = absoluteGitDir === mainGitDir ? "main" : "linked";
      const dirty = parsed.staged + parsed.unstaged + parsed.untracked + parsed.conflicted > 0;
      return { ...base, ...parsed, repositoryPath, worktree, head: String(headResult.stdout).trim().slice(0, 64),
        clean: !dirty, status: dirty ? "dirty" : "clean", error: "" };
    } catch (error: any) {
      const message = String(error?.message ?? error).slice(0, 2048);
      const timedOut = error?.killed === true || error?.signal === "SIGTERM" || /timed out/i.test(message);
      const notGit = /not a git repository/i.test(message);
      return { ...base, worktree: notGit ? "plain-directory" : "unknown", status: timedOut ? "timeout" : notGit ? "not-git" : "error", error: message };
    }
  }
}

export function parsePorcelainV2(output: string) {
  let branch = "", detached = false, unborn = false, upstream = "", ahead = 0, behind = 0;
  let staged = 0, unstaged = 0, untracked = 0, conflicted = 0;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("# branch.oid ") && line.slice(13).trim() === "(initial)") unborn = true;
    else if (line.startsWith("# branch.head ")) { branch = line.slice(14).trim(); detached = branch === "(detached)"; }
    else if (line.startsWith("# branch.upstream ")) upstream = line.slice(18).trim();
    else if (line.startsWith("# branch.ab ")) { const match = line.match(/\+(\d+)\s+-(\d+)/); ahead = Number(match?.[1] ?? 0); behind = Number(match?.[2] ?? 0); }
    else if (line.startsWith("? ")) untracked += 1;
    else if (line.startsWith("u ")) conflicted += 1;
    else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const xy = line.slice(2, 4); if (xy[0] !== ".") staged += 1; if (xy[1] !== ".") unstaged += 1;
    }
  }
  return { branch: detached ? "" : branch, detached, unborn, upstream, ahead, behind, staged, unstaged, untracked, conflicted };
}
