import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://sajilo.fyi",
  output: "static",
  // `install.html` and `404.html` keep the URLs the old hand-written site had,
  // so every link already out on the web stays valid.
  build: { format: "file" },
  // The recording the page reads its numbers from lives in the showcase
  // package; Vite refuses to serve files outside the project root unless told.
  vite: { server: { fs: { allow: [".."] } } },
});
