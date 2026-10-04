import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
// Dev only: the browser build reaches a scratch core through Vite (the core allows only the
// window's own origin), e.g. ALPHA_CORE_PROXY=http://127.0.0.1:53920 for tools/layout-run.mjs.
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
