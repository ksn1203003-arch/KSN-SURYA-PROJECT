import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    globals:     true,
    environment: "jsdom",
    include:     ["src/tests/**/*.test.{ts,tsx}"],
    setupFiles:  ["src/tests/setup.ts"],
    coverage: {
      provider:   "v8",
      include:    ["src/lib/**", "src/contexts/**"],
      thresholds: { lines: 60 },
      reporter:   ["text", "lcov"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
