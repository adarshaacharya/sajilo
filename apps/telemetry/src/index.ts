type Environment = {
  DB: D1Database;
};

type Ping = {
  version: string;
  platform: (typeof PLATFORMS)[number];
  architecture: (typeof ARCHITECTURES)[number];
  dayNpt: string;
  gapDays: number;
  upgradedFromVersion?: string;
};

const NEPAL_OFFSET_MILLISECONDS = (5 * 60 + 45) * 60 * 1_000;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;
const MAX_BODY_BYTES = 1_024;
const MAX_GAP_DAYS = 45;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// "other" is a real answer, not a malformed one: a build for a target nobody
// planned for should still be counted rather than retry a rejection forever.
const PLATFORMS = ["macos", "windows", "linux", "other"] as const;
const ARCHITECTURES = ["arm64", "x64", "other"] as const;

function nepalDay(now = Date.now()): string {
  return new Date(now + NEPAL_OFFSET_MILLISECONDS).toISOString().slice(0, 10);
}

/**
 * The day a ping counts towards. The app de-duplicates by its own Nepal day, so
 * that is the day to file it under — filed by arrival instead, a ping sent at
 * 23:59 lands on tomorrow and tomorrow's ping counts the same install twice. A
 * device clock more than a day out is not trusted; the server's day wins.
 */
function countedDay(clientDay: string, now = Date.now()): string {
  const plausible = [now - DAY_MILLISECONDS, now, now + DAY_MILLISECONDS].map(nepalDay);
  return plausible.includes(clientDay) ? clientDay : nepalDay(now);
}

function isPing(value: unknown): value is Ping {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const ping = value as Record<string, unknown>;
  return (
    typeof ping.version === "string" &&
    VERSION_PATTERN.test(ping.version) &&
    PLATFORMS.some((platform) => platform === ping.platform) &&
    ARCHITECTURES.some((architecture) => architecture === ping.architecture) &&
    typeof ping.dayNpt === "string" &&
    DAY_PATTERN.test(ping.dayNpt) &&
    Number.isInteger(ping.gapDays) &&
    Number(ping.gapDays) >= 0 &&
    Number(ping.gapDays) <= MAX_GAP_DAYS &&
    (ping.upgradedFromVersion === undefined ||
      (typeof ping.upgradedFromVersion === "string" && VERSION_PATTERN.test(ping.upgradedFromVersion)))
  );
}

function empty(status: number, headers?: HeadersInit): Response {
  return new Response(null, { status, headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/v1/ping") return empty(404);
    if (request.method !== "POST") return empty(405, { allow: "POST" });
    if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return empty(413);

    // A chunked body carries no content-length, so the header check alone is
    // not a limit. The body is measured after reading as well.
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return empty(413);

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return empty(400);
    }
    if (!isPing(payload)) return empty(422);

    const country = request.cf?.country ?? "XX";
    const upgradedFromVersion = payload.upgradedFromVersion ?? "";
    await env.DB.prepare(
      `INSERT INTO app_pings
        (day_npt, version, platform, architecture, country, gap_days, upgraded_from_version, pings)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(day_npt, version, platform, architecture, country, gap_days, upgraded_from_version)
       DO UPDATE SET pings = pings + 1`,
    )
      .bind(
        countedDay(payload.dayNpt),
        payload.version,
        payload.platform,
        payload.architecture,
        country,
        payload.gapDays,
        upgradedFromVersion,
      )
      .run();

    return empty(204, { "cache-control": "no-store" });
  },
} satisfies ExportedHandler<Environment>;
