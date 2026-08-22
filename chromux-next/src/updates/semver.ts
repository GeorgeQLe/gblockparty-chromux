export interface ParsedSemver { core: [number, number, number]; prerelease?: string[] }

export function parseSemver(value: string): ParsedSemver | undefined {
  const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return undefined;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], ...(match[4] ? { prerelease: match[4].split(".") } : {}) };
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left); const b = parseSemver(right);
  if (!a || !b) throw new Error("Malformed semantic version");
  for (let index = 0; index < 3; index += 1) if (a.core[index] !== b.core[index]) return a.core[index]! > b.core[index]! ? 1 : -1;
  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const av = a.prerelease[index]; const bv = b.prerelease[index];
    if (av === undefined) return -1; if (bv === undefined) return 1; if (av === bv) continue;
    const an = /^\d+$/.test(av); const bn = /^\d+$/.test(bv);
    if (an && bn) return Number(av) > Number(bv) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return av > bv ? 1 : -1;
  }
  return 0;
}
