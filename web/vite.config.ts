/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    // main.tsx imports design/ds/styles.css, one level above the web/ root (ADR 0005).
    // Only that directory: `..` would be the repo root, and the dev server would happily
    // serve /@fs/<repo>/token.json, client_secrets.json, yt-secrets.json and test_data/.
    fs: {
      allow: [
        path.resolve(__dirname, "."),
        path.resolve(__dirname, "../design"),
      ],
    },
    // In dev the API comes from `beat-upload serve` on 8765; in prod FastAPI serves dist/.
    proxy: { "/api": "http://127.0.0.1:8765" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
