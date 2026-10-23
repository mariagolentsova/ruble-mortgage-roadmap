import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests cover the pure mortgage math, so they run in plain Node — no browser emulation.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
