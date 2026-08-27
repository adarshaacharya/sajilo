import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const stub = (name: string) => fileURLToPath(new URL(`./src/tauri-stub/${name}.ts`, import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    /* The app's own source lives in ../desktop, so an unqualified `react`
     * inside it resolves against that package's node_modules and React ends up
     * loaded twice — which shows up as "Invalid hook call" and a blank panel.
     * Every runtime dependency is pinned to this package's single copy. */
    dedupe: ["react", "react-dom", "react-router", "swr", "motion", "sf-symbols-lib"],
    alias: [
      { find: /^@tauri-apps\/api\/core$/, replacement: stub("core") },
      { find: /^@tauri-apps\/api\/event$/, replacement: stub("event") },
      { find: /^@tauri-apps\/api\/.*$/, replacement: stub("noop") },
      { find: /^@tauri-apps\/plugin-opener$/, replacement: stub("opener") },
      { find: /^@tauri-apps\/plugin-.*$/, replacement: stub("noop") },
    ],
  },
  /* The Devanagari webfont is the desktop app's own copy, served from its
   * public dir rather than duplicated here — a second copy is a second thing
   * to update when the subset changes. */
  publicDir: fileURLToPath(new URL("../desktop/public", import.meta.url)),
  /* Built straight into the landing site's asset folder: the panel is part of
   * that page, and a separate `dist` would only be a directory to remember to
   * copy. `base: "./"` keeps every reference relative so it works from
   * /assets/app/ without the path being configured in two places. */
  build: {
    target: "safari15",
    outDir: fileURLToPath(new URL("../landing/assets/app", import.meta.url)),
    emptyOutDir: true,
  },
});
