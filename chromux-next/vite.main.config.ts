import { defineConfig } from "vite";

export default defineConfig({
  // `ws` probes optional native accelerators with CommonJS `require()` calls.
  // When Vite bundles the Electron main process without those optional packages,
  // the probe can become an empty module that crashes on the first masked frame.
  // Keep the package on its built-in JavaScript implementation in packaged apps.
  define: {
    "process.env.WS_NO_BUFFER_UTIL": JSON.stringify("1"),
    "process.env.WS_NO_UTF_8_VALIDATE": JSON.stringify("1")
  },
  build: {
    rollupOptions: {
      external: ["electron"]
    }
  }
});
