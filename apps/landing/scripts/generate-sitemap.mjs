#!/usr/bin/env bun
/**
 * Writes dist/sitemap.xml from whatever `astro build` actually produced, so
 * it can never drift the way the old hand-written public/sitemap.xml did —
 * that one still listed three pages after the site had grown to a dozen,
 * missing /report.html, /license.html, /releases.html and every release's
 * own page entirely.
 *
 * Runs as the last step of `bun run build`, after Astro has written dist/.
 */

import { readdir, writeFile, stat } from "node:fs/promises";

const SITE = "https://sajilo.fyi";
const DIST = new URL("../dist/", import.meta.url);

// Never indexed: the 404 page, the OG-image render target (a dev tool, not a
// page), the embedded showcase app (an iframe target with no page of its
// own, copied under assets/), and paginated release-list pages past the
// first — those already carry their own <meta name="robots" content="noindex">,
// listing them here too would just contradict that tag.
const EXCLUDE = [/^404\.html$/, /^og\.html$/, /^assets\//, /^releases\/page\//];

/** Weekly for pages whose content keeps changing; a release's own page is
 * effectively frozen the moment it's published. */
function priorityAndFreq(pathname) {
  if (pathname === "/") return { priority: "1.0", changefreq: "weekly" };
  if (pathname === "/releases.html") return { priority: "0.8", changefreq: "weekly" };
  if (pathname.startsWith("/releases/")) return { priority: "0.3", changefreq: "never" };
  if (pathname === "/install.html") return { priority: "0.6", changefreq: "monthly" };
  if (pathname === "/report.html") return { priority: "0.5", changefreq: "monthly" };
  return { priority: "0.4", changefreq: "yearly" };
}

async function htmlFiles(dir) {
  const entries = await readdir(new URL(dir, DIST), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await htmlFiles(rel)));
    } else if (entry.name.endsWith(".html")) {
      files.push(rel);
    }
  }
  return files;
}

const files = (await htmlFiles("")).filter((f) => !EXCLUDE.some((re) => re.test(f)));

const urls = await Promise.all(
  files.map(async (file) => {
    const pathname = file === "index.html" ? "/" : `/${file}`;
    const { priority, changefreq } = priorityAndFreq(pathname);
    const { mtime } = await stat(new URL(file, DIST));
    return { loc: `${SITE}${pathname}`, lastmod: mtime.toISOString().slice(0, 10), priority, changefreq };
  }),
);

// Deterministic order: the file walk order depends on the filesystem, and a
// sitemap that reshuffles itself on every build is a needless diff.
urls.sort((a, b) => a.loc.localeCompare(b.loc));

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(
    (u) =>
      `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  ),
  "</urlset>",
  "",
].join("\n");

await writeFile(new URL("sitemap.xml", DIST), xml);
console.log(`Wrote sitemap.xml with ${urls.length} URLs`);
