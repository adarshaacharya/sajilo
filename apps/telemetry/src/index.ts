type Environment = {
  DB: D1Database;
};

type Ping = {
  version: string;
  platform: (typeof PLATFORMS)[number];
  architecture: (typeof ARCHITECTURES)[number];
  /** The UTC date the app de-duplicated against. Sent from 0.1.25. */
  dayUtc?: string;
  /**
   * The Nepal date builds up to 0.1.24 de-duplicate against. Still accepted so
   * those installs keep counting, but a Nepal day does not line up with a UTC
   * one, so it is never used to file the count.
   */
  dayNpt?: string;
  gapDays: number;
  upgradedFromVersion?: string;
};

const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;
const MAX_BODY_BYTES = 1_024;
const MAX_GAP_DAYS = 45;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// "other" is a real answer, not a malformed one: a build for a target nobody
// planned for should still be counted rather than retry a rejection forever.
const PLATFORMS = ["macos", "windows", "linux", "other"] as const;
const ARCHITECTURES = ["arm64", "x64", "other"] as const;

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * The UTC day a ping counts towards, as the instant that day began.
 *
 * The app de-duplicates by its own UTC day, so that is the day to file it
 * under — filed by arrival instead, a ping sent at 23:59 lands on tomorrow and
 * tomorrow's ping counts the same install twice. A device clock more than a day
 * out is not trusted, and an older build's Nepal day cannot be mapped onto a UTC
 * one; both fall back to the day the ping arrived.
 */
function dayStartedAtUtc(ping: Ping, now = Date.now()): string {
  const plausible = [now - DAY_MILLISECONDS, now, now + DAY_MILLISECONDS].map(utcDay);
  const day = ping.dayUtc !== undefined && plausible.includes(ping.dayUtc) ? ping.dayUtc : utcDay(now);
  return `${day}T00:00:00Z`;
}

function isDay(value: unknown): boolean {
  return typeof value === "string" && DAY_PATTERN.test(value);
}

function isPing(value: unknown): value is Ping {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const ping = value as Record<string, unknown>;
  return (
    typeof ping.version === "string" &&
    VERSION_PATTERN.test(ping.version) &&
    PLATFORMS.some((platform) => platform === ping.platform) &&
    ARCHITECTURES.some((architecture) => architecture === ping.architecture) &&
    (ping.dayUtc !== undefined || ping.dayNpt !== undefined) &&
    (ping.dayUtc === undefined || isDay(ping.dayUtc)) &&
    (ping.dayNpt === undefined || isDay(ping.dayNpt)) &&
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
        (day_started_at_utc, version, platform, architecture, country, gap_days, upgraded_from_version, pings)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(day_started_at_utc, version, platform, architecture, country, gap_days, upgraded_from_version)
       DO UPDATE SET pings = pings + 1`,
    )
      .bind(
        dayStartedAtUtc(payload),
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
