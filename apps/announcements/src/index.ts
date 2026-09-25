import { type Announcement, liveNotices, NOTICES_KEY, UPDATE_NOTICE } from "./schema";

const KV_CACHE_TTL_SECONDS = 60;

type AnnouncementResponse = {
  /** What current Sajilo reads: the live notices, most pressing first. */
  announcements: Announcement[];
  /** What versions before the list read; see `UPDATE_NOTICE`. */
  announcement: Announcement;
};

type Environment = {
  SAJILO_ANNOUNCEMENTS: KVNamespace;
};

function json(body: AnnouncementResponse, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  // The desktop app refreshes every half hour. A short CDN cache keeps the
  // endpoint cheap without delaying a newly published notice for long.
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=60, s-maxage=60");
  }
  return Response.json(body, { ...init, headers });
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
      const stored = await env.SAJILO_ANNOUNCEMENTS.get(NOTICES_KEY, {
        type: "json",
        cacheTtl: KV_CACHE_TTL_SECONDS,
      });
      if (stored !== null && !Array.isArray(stored)) {
        console.error("announcements-not-a-list");
      }
      const announcements = liveNotices(stored, Date.now());
      if (request.method === "HEAD") {
        return new Response(null, { headers: { "cache-control": "public, max-age=60" } });
      }
      return json({ announcements, announcement: UPDATE_NOTICE });
    } catch (error) {
      console.error("announcement-read-failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return json(
        { announcements: [], announcement: UPDATE_NOTICE },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  },
} satisfies ExportedHandler<Environment>;
