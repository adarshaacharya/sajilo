const ACTIVE_ANNOUNCEMENT_KEY = "active-announcement";
const KV_CACHE_TTL_SECONDS = 60;

type AnnouncementLevel = "info" | "important" | "urgent";

type LocalizedText = {
  en: string;
  ne: string;
};

type AnnouncementAction = {
  url: string;
  label: LocalizedText;
};

type Announcement = {
  id: string;
  level: AnnouncementLevel;
  title: LocalizedText;
  body: LocalizedText;
  startsAt?: string;
  expiresAt?: string;
  action?: AnnouncementAction;
};

type AnnouncementResponse = {
  announcement: Announcement | null;
};

type Environment = {
  SAJILO_ANNOUNCEMENTS: KVNamespace;
};

function response(body: AnnouncementResponse, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  // The desktop app refreshes hourly. A short CDN cache keeps the endpoint
  // cheap without delaying a newly published notice for long.
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=60, s-maxage=60");
  }
  return Response.json(body, { ...init, headers });
}

function emptyResponse(init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "public, max-age=60, s-maxage=60");
  return new Response(null, { ...init, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function localizedText(value: unknown): value is LocalizedText {
  return (
    isRecord(value) &&
    nonEmptyString(value.en) &&
    nonEmptyString(value.ne) &&
    value.en.length <= 180 &&
    value.ne.length <= 180
  );
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isAnnouncement(value: unknown): value is Announcement {
  if (!isRecord(value)) return false;
  if (
    !nonEmptyString(value.id) ||
    value.id.length > 120 ||
    !["info", "important", "urgent"].includes(String(value.level)) ||
    !localizedText(value.title) ||
    !localizedText(value.body) ||
    value.body.en.length > 320 ||
    value.body.ne.length > 320
  ) {
    return false;
  }
  if (value.startsAt !== undefined && !validTimestamp(value.startsAt)) return false;
  if (value.expiresAt !== undefined && !validTimestamp(value.expiresAt)) return false;
  if (
    value.startsAt !== undefined &&
    value.expiresAt !== undefined &&
    Date.parse(value.startsAt) >= Date.parse(value.expiresAt)
  ) {
    return false;
  }
  if (value.action === undefined) return true;
  return (
    isRecord(value.action) &&
    httpsUrl(value.action.url) &&
    localizedText(value.action.label)
  );
}

function isActive(announcement: Announcement, now: number): boolean {
  return (
    (announcement.startsAt === undefined || Date.parse(announcement.startsAt) <= now) &&
    (announcement.expiresAt === undefined || Date.parse(announcement.expiresAt) > now)
  );
}

async function activeAnnouncement(env: Environment): Promise<Announcement | null> {
  const raw = await env.SAJILO_ANNOUNCEMENTS.get(ACTIVE_ANNOUNCEMENT_KEY, {
    type: "json",
    cacheTtl: KV_CACHE_TTL_SECONDS,
  });
  if (raw === null) return null;
  if (!isAnnouncement(raw)) {
    throw new Error("active-announcement does not match the expected schema");
  }
  return isActive(raw, Date.now()) ? raw : null;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/v1/announcement") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    try {
      const announcement = await activeAnnouncement(env);
      if (request.method === "HEAD") {
        return emptyResponse();
      }
      return response({ announcement });
    } catch (error) {
      console.error("announcement-read-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return response(
        { announcement: null },
        {
          status: 503,
          headers: { "cache-control": "no-store" },
        },
      );
    }
  },
} satisfies ExportedHandler<Environment>;
