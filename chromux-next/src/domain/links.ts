const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`)\]}]+/giu;

export function extractSafeLinks(text: string): string[] {
  const links = (text.match(URL_PATTERN) ?? []).map((link) => link.replace(/[.,;:!?]+$/u, ""));
  return [...new Set(links)].filter((candidate) => {
    try {
      const url = new URL(candidate);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  });
}

export function isSafeNavigation(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
