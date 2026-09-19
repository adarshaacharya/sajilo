#!/usr/bin/env bun
/**
 * Records the last 20 GitHub releases into src/data/releases.json, so
 * /releases.html reads its own site instead of sending visitors to GitHub.
 * No token: the GitHub REST API serves public releases unauthenticated, at a
 * rate limit far above what one build needs.
 *
 * Runs automatically as part of `bun run build`, so every deploy picks up
 * whatever has been released since the last one — nothing to remember to
 * regenerate by hand. `--soft` (what the build passes) turns a failed fetch
 * into a warning that keeps the file already checked in, so a GitHub hiccup
 * during a Cloudflare Workers Build never blocks the rest of the site from
 * shipping; without it (`bun run releases`, run by hand) the same failure is
 * fatal, so a real problem doesn't go unnoticed.
 */

const soft = process.argv.includes("--soft");
const OWNER_REPO = "adarshaacharya/sajilo";
const OUT_FILE = new URL("../src/data/releases.json", import.meta.url);

async function main() {
  const res = await fetch(`https://api.github.com/repos/${OWNER_REPO}/releases?per_page=20`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "sajilo-landing" },
  });

  if (!res.ok) {
    throw new Error(`GitHub API responded ${res.status}: ${await res.text()}`);
  }

  const releases = (await res.json()).map((r) => ({
    version: r.tag_name,
    name: r.name || r.tag_name,
    publishedAt: r.published_at,
    body: r.body || "",
    prerelease: Boolean(r.prerelease),
    htmlUrl: r.html_url,
  }));

  await Bun.write(OUT_FILE, JSON.stringify(releases, null, 2) + "\n");
  console.log(`Wrote ${releases.length} releases to ${OUT_FILE.pathname}`);
}

try {
  await main();
} catch (err) {
  if (soft) {
    console.warn(`[fetch-releases] ${err.message} — keeping the release notes already checked in.`);
  } else {
    console.error(err.message);
    process.exit(1);
  }
}
