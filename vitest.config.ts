import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Let integration tests see Supabase keys from .env.local (Vitest does not load it).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests auto-skip when the Supabase env vars are unset.
    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
  },
});
