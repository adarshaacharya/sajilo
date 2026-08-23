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
 * What is written down is a running count per day, platform and country. There
 * is no row per person: no address, no user agent, no identifier, nothing that
 * describes who downloaded, only how many did.
 */

const OWNER_REPO = "adarshaacharya/sajilo";
const RELEASES_LATEST = `https://github.com/${OWNER_REPO}/releases/latest`;

/** The asset each `/dl/<platform>` link stands for. */
const ASSETS = {
  "macos-arm64": "Sajilo-macos-arm64.dmg",
  "macos-x64": "Sajilo-macos-x64.dmg",
  windows: "Sajilo-windows-x64.exe",
  "linux-deb": "Sajilo-linux-amd64.deb",
  "linux-appimage": "Sajilo-linux-x86_64.AppImage",
};

function assetUrl(name) {
  return `https://github.com/${OWNER_REPO}/releases/latest/download/${name}`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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

async function record(env, platform, request) {
  if (!env.DB) return;

  const day = new Date().toISOString().slice(0, 10);
  const country = request.cf?.country ?? "XX";
  const referrer = referrerHost(request.headers.get("Referer"));

  try {
    await env.DB.prepare(
      `INSERT INTO download_clicks (day, platform, country, referrer, clicks)
       VALUES (?1, ?2, ?3, ?4, 1)
       ON CONFLICT (day, platform, country, referrer)
       DO UPDATE SET clicks = clicks + 1`,
    )
      .bind(day, platform, country, referrer)
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
