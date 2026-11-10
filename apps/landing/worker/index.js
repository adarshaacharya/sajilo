/**
 * The landing site, plus a counted redirect for every download link.
 *
 * Downloads are served by GitHub, not by us — the assets are large, GitHub is
 * more reliable than anything here, and its own per-asset counter is worth
 * keeping. But a link straight to `github.com` leaves no trace on this side, so
 * the site cannot tell whether a visit turned into a download. `/dl/<platform>`
 * is a doorway: it records that a click happened and then hands the visitor
 * straight to the same GitHub URL they would have got anyway.
 *
 * What is written down is a running count per UTC hour, platform, country and
 * referring site. There
 * is no row per person: no address, no user agent, no identifier, nothing that
 * describes who downloaded, only how many did.
 */

import { handleReport } from "./report.js";

const OWNER_REPO = "adarshaacharya/sajilo";
const RELEASES_LATEST = `https://github.com/${OWNER_REPO}/releases/latest`;

/** The asset each `/dl/<platform>` link stands for. */
const ASSETS = {
  "macos-arm64": "Sajilo-macos-arm64.dmg",
  "macos-x64": "Sajilo-macos-x64.dmg",
  windows: "Sajilo-windows-x64.exe",
  "linux-deb": "Sajilo-linux-amd64.deb",
  "linux-appimage": "Sajilo-linux-x86_64.AppImage",
  "linux-rpm": "Sajilo-linux-x86_64.rpm",
};

function assetUrl(name) {
  return `https://github.com/${OWNER_REPO}/releases/latest/download/${name}`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/report") {
      return handleReport(request, env);
    }

    if (url.pathname.endsWith(".mp4")) {
      return serveRanged(request, env);
    }

    const platform = url.pathname.startsWith("/dl/")
      ? url.pathname.slice("/dl/".length)
      : null;

    if (platform === null) {
      return env.ASSETS.fetch(request);
    }

    const asset = ASSETS[platform];
    // An unknown platform still gets somewhere useful. A 404 here would mean a
    // stale link on a shared post silently costing a download.
    const target = asset ? assetUrl(asset) : RELEASES_LATEST;

    if (asset) {
      // `waitUntil` keeps the redirect immediate, and keeps a database that is
      // down or over quota from ever standing between a visitor and the file.
      ctx.waitUntil(record(env, platform, request));
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: target,
        // Each click is a click. A cached redirect would be counted once and
        // then never again for that visitor.
        "Cache-Control": "no-store",
      },
    });
  },
};

/**
 * Video, with byte ranges. The static asset server answers every request
 * with the whole file and no `Accept-Ranges`, and without ranges a browser
 * cannot seek in a video: dragging the playhead just snaps back. So videos go
 * through here: the file is read from the assets and the asked-for slice is
 * sent back as a 206. Files are a few megabytes, well inside a Worker's
 * memory.
 */
async function serveRanged(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  // Asked for whole, without the Range the asset server would ignore anyway.
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: "GET" }));
  if (!asset.ok) return asset;

  const body = await asset.arrayBuffer();
  const size = body.byteLength;
  const headers = new Headers({
    "Content-Type": asset.headers.get("Content-Type") ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
  });
  const etag = asset.headers.get("ETag");
  if (etag) headers.set("ETag", etag);

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("Range") ?? "");
  if (!range || (range[1] === "" && range[2] === "")) {
    headers.set("Content-Length", String(size));
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  }

  // "bytes=a-b", "bytes=a-" (to the end) or "bytes=-n" (the last n bytes).
  let start;
  let end;
  if (range[1] === "") {
    start = Math.max(0, size - Number(range[2]));
    end = size - 1;
  } else {
    start = Number(range[1]);
    end = range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
  }
  if (start >= size || start > end) {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(request.method === "HEAD" ? null : body.slice(start, end + 1), { status: 206, headers });
}

async function record(env, platform, request) {
  if (!env.DB) return;

  // The bucket is the UTC hour the click fell in, as a plain ISO timestamp —
  // the same clock every other count in this database is kept in.
  const hourStartedAtUtc = `${new Date().toISOString().slice(0, 13)}:00:00Z`;
  const country = request.cf?.country ?? "XX";
  const referrer = referrerHost(request.headers.get("Referer"));

  try {
    await env.DB.prepare(
      `INSERT INTO download_clicks (hour_started_at_utc, platform, country, referrer, clicks)
       VALUES (?1, ?2, ?3, ?4, 1)
       ON CONFLICT (hour_started_at_utc, platform, country, referrer)
       DO UPDATE SET clicks = clicks + 1`,
    )
      .bind(hourStartedAtUtc, platform, country, referrer)
      .run();
  } catch {
    // A missed tally is not worth a failed download.
  }
}

/**
 * Which site sent them, and nothing more.
 *
 * A full referring URL can carry the search terms someone typed or the path of
 * a private page, neither of which this is entitled to keep. The hostname
 * answers the only question being asked — did that Reddit post work — so it is
 * all that is kept. Our own pages read as "direct": a visit that began on the
 * site is not a referral to it.
 */
function referrerHost(header) {
  if (!header) return "direct";
  try {
    const host = new URL(header).hostname.replace(/^www\./, "");
    return host === "sajilo.fyi" ? "direct" : host;
  } catch {
    return "direct";
  }
}
