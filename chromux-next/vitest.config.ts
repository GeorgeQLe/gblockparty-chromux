import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Subprocess compatibility fixtures use intentionally tight deadlines.
    // Run files serially so host CPU contention cannot turn protocol evidence
    // into unrelated timeout failures.
    fileParallelism: false,
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
