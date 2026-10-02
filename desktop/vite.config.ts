import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
// Dev only: the core allows one browser origin (port 1430), so a second dev server or the
// layout run reaches it through this one (set VITE_ALPHA_CORE_URL to this server's own origin).
const proxy = process.env.ALPHA_CORE_PROXY;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1430, strictPort: true, host: host || false, proxy: proxy ? { "/api": proxy } : undefined },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "safari15",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], globals: false },
});
