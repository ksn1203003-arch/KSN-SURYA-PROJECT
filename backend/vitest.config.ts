import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals:     true,
    environment: "node",
    include:     ["src/tests/**/*.test.ts"],
    coverage: {
      provider:   "v8",
      include:    ["src/routes/**", "src/lib/**", "src/middleware/**"],
      exclude:    [],
      thresholds: { lines: 70, functions: 70, branches: 65 },
      reporter:   ["text", "lcov"],
    },
    testTimeout:  30000,
    hookTimeout:  30000,
    // mongodb-memory-server needs a longer startup on first run (binary download)
    globalSetup: [],
    pool: "forks",
  },
})
