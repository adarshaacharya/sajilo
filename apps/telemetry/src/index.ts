type Environment = {
  DB: D1Database;
};

type Ping = {
  version: string;
  platform: "macos" | "windows" | "linux";
  architecture: "arm64" | "x64";
  gapDays: number;
  upgradedFromVersion?: string;
};

const NEPAL_OFFSET_MILLISECONDS = (5 * 60 + 45) * 60 * 1_000;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function nepalDay(now = Date.now()): string {
  return new Date(now + NEPAL_OFFSET_MILLISECONDS).toISOString().slice(0, 10);
}

function isPing(value: unknown): value is Ping {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const ping = value as Record<string, unknown>;
  return (
    typeof ping.version === "string" &&
    VERSION_PATTERN.test(ping.version) &&
    ["macos", "windows", "linux"].includes(String(ping.platform)) &&
    ["arm64", "x64"].includes(String(ping.architecture)) &&
    Number.isInteger(ping.gapDays) &&
    Number(ping.gapDays) >= 0 &&
    Number(ping.gapDays) <= 45 &&
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
    if (Number(request.headers.get("content-length") ?? "0") > 1_024) return empty(413);

    let payload: unknown;
    try {
      payload = await request.json();
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
        nepalDay(),
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
