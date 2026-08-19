import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tauri waits on this exact URL (see src-tauri/tauri.conf.json devUrl).
  // strictPort so a busy port fails loudly instead of silently moving.
  server: { port: 1420, strictPort: true },
  build: { target: "safari15" },
});
