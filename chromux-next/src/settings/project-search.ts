export interface ProjectDirectoryCandidateV1 {
  name: string;
  path: string;
  relativePath: string;
  basePath: string;
  nested: boolean;
}

export interface ProjectDirectorySearchResultV1 {
  basePaths: string[];
  candidates: ProjectDirectoryCandidateV1[];
}

export function matchProjectDirectories<T extends ProjectDirectoryCandidateV1>(
  candidates: T[],
  query: string,
  limit = 12
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return candidates.slice(0, limit);
  const basenameMatches = candidates.filter((candidate) =>
    candidate.name.toLocaleLowerCase().includes(normalized));
  const matches = basenameMatches.length
    ? basenameMatches
    : candidates.filter((candidate) => candidate.relativePath.toLocaleLowerCase().includes(normalized));
  return matches.slice(0, limit);
}
