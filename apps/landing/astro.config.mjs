import { defineConfig } from "astro/config";
import { rehypeHeadingIds } from "@astrojs/markdown-remark";
import headingAnchors from "./src/lib/heading-anchors.mjs";

export default defineConfig({
  site: "https://sajilo.fyi",
  output: "static",
  // `install.html` and `404.html` keep the URLs the old hand-written site had,
  // so every link already out on the web stays valid.
  build: { format: "file" },
  // A "#" after each docs heading, to link a section; see the plugin. Astro
  // gives headings their ids after user plugins run, so its own id step goes
  // first here.
  markdown: { rehypePlugins: [rehypeHeadingIds, headingAnchors] },
  // The recording the page reads its numbers from lives in the showcase
  // package; Vite refuses to serve files outside the project root unless told.
  vite: { server: { fs: { allow: [".."] } } },
});
