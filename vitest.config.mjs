import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/app/layout.tsx", "src/app/fonts/**", "src/**/*.d.ts"],
      reporter: ["text", "json", "html"],
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    }
  },
})
