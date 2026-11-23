import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    // Colyseus signals readiness with process.send() (PM2 convention), which
    // collides with the IPC channel of the default "forks" pool.
    pool: "threads",
  },
  esbuild: {
    // Colyseus schema decorators need legacy decorator semantics.
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
  },
});
