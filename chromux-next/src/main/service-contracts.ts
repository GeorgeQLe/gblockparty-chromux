import type { ChildProcessWithoutNullStreams } from "node:child_process";

export interface SubprocessLauncher {
  spawn(command: string, args: readonly string[], options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }): ChildProcessWithoutNullStreams;
}

export interface JsonStateStorage<T> {
  read(): Promise<T>;
  write(value: T): Promise<void>;
}

export interface ReleaseClient {
  getJson(url: URL, options: { signal: AbortSignal; maximumBytes: number }): Promise<unknown>;
  download(url: URL, destination: string, options: {
    signal: AbortSignal;
    maximumBytes: number;
  }): Promise<{ bytes: number; sha256: string }>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  create(): string;
}

export const systemClock: Clock = { now: () => new Date() };
