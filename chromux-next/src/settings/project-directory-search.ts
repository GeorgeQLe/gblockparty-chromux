import path from "node:path";
import os from "node:os";
import { opendir, realpath, stat } from "node:fs/promises";
import type { ProjectDirectoryCandidateV1, ProjectDirectorySearchResultV1 } from "./project-search";

export type { ProjectDirectoryCandidateV1, ProjectDirectorySearchResultV1 } from "./project-search";

const MAX_PROJECT_DEPTH = 5;
const MAX_CANDIDATES = 2_000;

export async function discoverProjectDirectories(options: {
  homePath?: string;
  configuredBase?: string;
  basePaths?: string[];
} = {}): Promise<ProjectDirectorySearchResultV1> {
  const homePath = options.homePath ?? os.homedir();
  const requestedBases = options.basePaths ?? [
    ...(options.configuredBase ? [options.configuredBase] : []),
    path.join(homePath, "projects"),
    path.join(homePath, ".developer-storage", "Projects")
  ];
  const basePaths: string[] = [];
  for (const requested of requestedBases) {
    try {
      const canonical = await realpath(requested);
      if ((await stat(canonical)).isDirectory() && !basePaths.includes(canonical)) basePaths.push(canonical);
    } catch {
      // Missing or protected conventional roots are simply unavailable.
    }
  }

  const found = new Map<string, { path: string; basePath: string }>();
  await Promise.all(basePaths.map(async (basePath) => {
    const paths = await scanForGitRoots(basePath, 0);
    for (const projectPath of paths) {
      if (found.size >= MAX_CANDIDATES) break;
      if (!found.has(projectPath)) found.set(projectPath, { path: projectPath, basePath });
    }
  }));

  const orderedPaths = [...found.keys()].sort((left, right) => left.localeCompare(right));
  const candidates = orderedPaths.map((projectPath) => {
    const match = found.get(projectPath)!;
    return {
      name: path.basename(projectPath) || projectPath,
      path: projectPath,
      relativePath: path.relative(match.basePath, projectPath) || path.basename(projectPath),
      basePath: match.basePath,
      nested: orderedPaths.some((possibleParent) =>
        possibleParent !== projectPath && projectPath.startsWith(`${possibleParent}${path.sep}`))
    };
  }).sort(compareCandidates);

  return { basePaths, candidates };
}

async function scanForGitRoots(directory: string, depth: number): Promise<string[]> {
  if (depth > MAX_PROJECT_DEPTH) return [];
  const projects: string[] = [];
  let entries;
  try {
    entries = await opendir(directory);
  } catch {
    return projects;
  }
  const childDirectories: string[] = [];
  for await (const entry of entries) {
    if (entry.name === ".git") {
      if (entry.isDirectory() || entry.isFile()) projects.push(directory);
    } else if (entry.name !== "node_modules" && entry.isDirectory() && depth < MAX_PROJECT_DEPTH) {
      childDirectories.push(path.join(directory, entry.name));
    }
  }
  const nested = await Promise.all(childDirectories.map((child) => scanForGitRoots(child, depth + 1)));
  return projects.concat(...nested);
}

function compareCandidates(left: ProjectDirectoryCandidateV1, right: ProjectDirectoryCandidateV1): number {
  if (left.nested !== right.nested) return left.nested ? 1 : -1;
  return left.relativePath.localeCompare(right.relativePath);
}
