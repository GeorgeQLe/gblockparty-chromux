import path from "node:path";
import { realpathSync } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import type { ProjectEntryV1 } from "../settings/workspace-preferences";
import type { ProjectSuggestionV1 } from "../settings/project-suggestions";

const DISCOVERY_TTL_MS = 5 * 60_000;
const MAX_DISCOVERED_PROJECTS = 5_000;
const MAX_HISTORY_ROWS = 50;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

interface Candidate {
  path: string;
  source: ProjectSuggestionV1["source"];
  priority: number;
  recency: number;
}

export interface ProjectSuggestionServiceOptions {
  homeDirectory: string;
  environment?: NodeJS.ProcessEnv;
  now?: () => number;
}

/** Main-process-owned, bounded project discovery compatible with p's search model. */
export class ProjectSuggestionService {
  private readonly baseDirectory: string;
  private readonly historyPath: string;
  private readonly now: () => number;
  private discovered: { at: number; paths: string[] } | undefined;
  private discovery: Promise<string[]> | undefined;

  constructor(private readonly options: ProjectSuggestionServiceOptions) {
    const environment = options.environment ?? process.env;
    const configuredBase = path.resolve(environment.P_BASE?.trim() || path.join(options.homeDirectory, "projects"));
    try { this.baseDirectory = realpathSync(configuredBase); }
    catch { this.baseDirectory = configuredBase; }
    const cacheRoot = path.resolve(environment.XDG_CACHE_HOME?.trim() || path.join(options.homeDirectory, ".cache"));
    this.historyPath = path.join(cacheRoot, "p", "p_history");
    this.now = options.now ?? Date.now;
  }

  async suggest(queryValue: string, registered: readonly ProjectEntryV1[], limit = 12): Promise<ProjectSuggestionV1[]> {
    const query = queryValue.trim();
    const maximum = Math.max(1, Math.min(20, limit));
    if (query.startsWith("/") || query.startsWith("~")) {
      const literal = await this.completeLiteralPath(query, maximum);
      if (literal.length) return literal;
    }

    const candidates = new Map<string, Candidate>();
    const add = async (candidatePath: string, source: Candidate["source"], priority: number, recency = 0) => {
      const normalized = await realpath(candidatePath).catch(() => path.resolve(candidatePath));
      const existing = candidates.get(normalized);
      if (!existing || priority < existing.priority || (priority === existing.priority && recency > existing.recency)) {
        candidates.set(normalized, { path: normalized, source, priority, recency });
      }
    };

    for (const [index, project] of registered.entries()) {
      await add(project.path, "registered", 0, registered.length - index);
    }
    const recent = await this.readHistory();
    for (const [index, projectPath] of recent.entries()) {
      await add(projectPath, "recent", 1, recent.length - index);
    }
    for (const projectPath of await this.discoverProjects()) await add(projectPath, "p", 2);

    const needle = query.toLocaleLowerCase();
    return [...candidates.values()]
      .map((candidate) => ({ candidate, rank: matchRank(candidate.path, this.baseDirectory, needle) }))
      .filter((item) => item.rank !== undefined)
      .sort((left, right) =>
        left.candidate.priority - right.candidate.priority
        || left.rank! - right.rank!
        || right.candidate.recency - left.candidate.recency
        || path.basename(left.candidate.path).localeCompare(path.basename(right.candidate.path)))
      .slice(0, maximum)
      .map(({ candidate }) => suggestion(candidate.path, candidate.source, this.baseDirectory));
  }

  private async readHistory(): Promise<string[]> {
    try {
      const rows = (await readFile(this.historyPath, "utf8")).split(/\r?\n/u).filter(Boolean).slice(-MAX_HISTORY_ROWS).reverse();
      const valid: string[] = [];
      for (const row of rows) {
        if (await isDirectory(row)) valid.push(row);
      }
      return valid;
    } catch {
      return [];
    }
  }

  private async discoverProjects(): Promise<string[]> {
    if (this.discovered && this.now() - this.discovered.at < DISCOVERY_TTL_MS) return this.discovered.paths;
    if (this.discovery) return this.discovery;
    this.discovery = scanProjectBase(this.baseDirectory).then((paths) => {
      this.discovered = { at: this.now(), paths };
      return paths;
    }).finally(() => { this.discovery = undefined; });
    return this.discovery;
  }

  private async completeLiteralPath(query: string, limit: number): Promise<ProjectSuggestionV1[]> {
    const expanded = query === "~" ? this.options.homeDirectory
      : query.startsWith("~/") ? path.join(this.options.homeDirectory, query.slice(2))
      : query;
    const parent = expanded.endsWith(path.sep) ? expanded : path.dirname(expanded);
    const prefix = expanded.endsWith(path.sep) ? "" : path.basename(expanded).toLocaleLowerCase();
    try {
      const entries = await readdir(parent, { withFileTypes: true });
      const rows: ProjectSuggestionV1[] = [];
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (rows.length >= limit || !entry.isDirectory() || !entry.name.toLocaleLowerCase().startsWith(prefix)) continue;
        const entryPath = path.join(parent, entry.name);
        rows.push(suggestion(await realpath(entryPath).catch(() => entryPath), "filesystem", this.baseDirectory));
      }
      return rows;
    } catch {
      return [];
    }
  }
}

async function scanProjectBase(baseDirectory: string): Promise<string[]> {
  if (!await isDirectory(baseDirectory)) return [];
  const projects = new Set<string>();
  if (await hasGitMarker(baseDirectory)) projects.add(await realpath(baseDirectory).catch(() => baseDirectory));
  let roots;
  try { roots = await readdir(baseDirectory, { withFileTypes: true }); } catch { return []; }
  for (const root of roots) {
    if (projects.size >= MAX_DISCOVERED_PROJECTS) break;
    if (!root.isDirectory() || SKIPPED_DIRECTORIES.has(root.name)) continue;
    await scanDirectory(path.join(baseDirectory, root.name), 4, projects);
  }
  return [...projects].sort();
}

async function scanDirectory(directory: string, remainingDepth: number, projects: Set<string>): Promise<void> {
  if (projects.size >= MAX_DISCOVERED_PROJECTS || remainingDepth < 0) return;
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
  if (entries.some((entry) => entry.name === ".git" && (entry.isDirectory() || entry.isFile()))) {
    projects.add(await realpath(directory).catch(() => directory));
  }
  if (remainingDepth === 0) return;
  for (const entry of entries) {
    if (projects.size >= MAX_DISCOVERED_PROJECTS) return;
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) continue;
    await scanDirectory(path.join(directory, entry.name), remainingDepth - 1, projects);
  }
}

async function hasGitMarker(directory: string): Promise<boolean> {
  try {
    const marker = await stat(path.join(directory, ".git"));
    return marker.isDirectory() || marker.isFile();
  } catch { return false; }
}

async function isDirectory(value: string): Promise<boolean> {
  try { return (await stat(value)).isDirectory(); } catch { return false; }
}

function matchRank(candidatePath: string, baseDirectory: string, needle: string): number | undefined {
  if (!needle) return 4;
  const basename = path.basename(candidatePath).toLocaleLowerCase();
  if (basename === needle) return 0;
  if (basename.startsWith(needle)) return 1;
  if (basename.includes(needle)) return 2;
  const relative = path.relative(baseDirectory, candidatePath).toLocaleLowerCase();
  return relative.includes(needle) ? 3 : undefined;
}

function suggestion(candidatePath: string, source: ProjectSuggestionV1["source"], baseDirectory: string): ProjectSuggestionV1 {
  const relative = path.relative(baseDirectory, candidatePath);
  return {
    schemaVersion: 1,
    name: path.basename(candidatePath) || candidatePath,
    path: candidatePath,
    detail: relative && !relative.startsWith("..") ? relative : candidatePath,
    source
  };
}
