import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Plain client-side build: `vite build` writes static files to dist/,
// which Nginx serves directly. No Node.js process runs on the server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths: the same build works at a domain root and under a prefix (e.g. /calc/).
  base: "./",
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
