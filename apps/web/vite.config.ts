import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Cloudflare Pages serves the built `dist/` at "/". `IMAGORO_WEB_TERM_BASE_PATH`
 * lets the same source build for a sub-path mount (e.g. behind a gateway) without
 * a code change. The terminal connects to a pty agent over wss:// at runtime, so
 * there is no build-time backend dependency.
 */
export default defineConfig({
  base: process.env.IMAGORO_WEB_TERM_BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    port: 8793,
    strictPort: true
  },
  build: {
    target: "es2022",
    sourcemap: true
  }
});
