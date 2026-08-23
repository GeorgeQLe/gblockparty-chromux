import os from "node:os";
import path from "node:path";

export function codexSearchPath(
  currentPath = process.env.PATH,
  homeDirectory = os.homedir()
): string {
  return [...new Set([
    currentPath,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(homeDirectory, ".local/bin"),
    path.join(homeDirectory, ".npm-global/bin"),
    path.join(homeDirectory, ".bun/bin"),
    path.join(homeDirectory, ".volta/bin")
  ].flatMap((entry) => entry?.split(path.delimiter) ?? []).filter(Boolean))].join(path.delimiter);
}

export function chromuxOwnedCodexEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = os.homedir()
): NodeJS.ProcessEnv {
  return {
    ...environment,
    PATH: codexSearchPath(environment.PATH, homeDirectory),
    CODEX_DISABLE_UPDATE_PROMPT: "1",
    CODEX_DISABLE_UPDATE_CHECK: "1"
  };
}
