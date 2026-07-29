import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
    pool: "forks",
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src"),
    },
  },
});
