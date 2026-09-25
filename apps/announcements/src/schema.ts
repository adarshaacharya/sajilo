/**
 * The notice contract, and the rules for which notices are live.
 *
 * Shared by the Worker and by the publish script, so a notice that would be
 * rejected when served is rejected before it is ever saved. Mirrors
 * `sajilo_api::announcement` in Rust.
 */

export type AnnouncementLevel = "info" | "important" | "urgent";
export type AnnouncementPlatform = "windows" | "macos" | "linux";

export type LocalizedText = {
  en: string;
  ne: string;
};

export type AnnouncementAction = {
  url: string;
  label: LocalizedText;
};

export type Announcement = {
  id: string;
  level: AnnouncementLevel;
  title: LocalizedText;
  body: LocalizedText;
  startsAt?: string;
  expiresAt?: string;
  action?: AnnouncementAction;
  /** Omitted or empty: every platform. */
  platforms?: AnnouncementPlatform[];
};

/** The KV key holding every published notice, as one JSON array. */
export const NOTICES_KEY = "announcements";

/** At most this many notices are served; more than a few is noise. */
export const MAX_LIVE = 5;

const LEVELS: AnnouncementLevel[] = ["info", "important", "urgent"];
const PLATFORMS: AnnouncementPlatform[] = ["windows", "macos", "linux"];
const TITLE_MAX = 180;
const BODY_MAX = 320;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number, field: string): string | null {
  if (!isRecord(value)) return `${field} must have "en" and "ne"`;
  for (const language of ["en", "ne"] as const) {
    const line = value[language];
    if (typeof line !== "string" || line.trim().length === 0) {
      return `${field}.${language} is missing`;
    }
    if (line.length > max) return `${field}.${language} is longer than ${max} characters`;
  }
  return null;
}

function timestamp(value: unknown, field: string): string | null {
  if (value === undefined) return null;
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? null
    : `${field} must be an ISO 8601 time, like 2026-10-01T00:00:00Z`;
}

/** Why `value` is not a valid notice, or null when it is. */
export function problem(value: unknown): string | null {
  if (!isRecord(value)) return "a notice must be a JSON object";
  if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(value.id)) {
    return 'id must be lowercase letters, digits and dashes, like "ipo-2026-10"';
  }
  if (!LEVELS.includes(value.level as AnnouncementLevel)) {
    return `level must be one of ${LEVELS.join(", ")}`;
  }
  const wording =
    text(value.title, TITLE_MAX, "title") ??
    text(value.body, BODY_MAX, "body") ??
    timestamp(value.startsAt, "startsAt") ??
    timestamp(value.expiresAt, "expiresAt");
  if (wording) return wording;
  if (
    typeof value.startsAt === "string" &&
    typeof value.expiresAt === "string" &&
    Date.parse(value.startsAt) >= Date.parse(value.expiresAt)
  ) {
    return "startsAt must be before expiresAt";
  }
  if (value.platforms !== undefined) {
    if (
      !Array.isArray(value.platforms) ||
      !value.platforms.every((platform) => PLATFORMS.includes(platform))
    ) {
      return `platforms must list only ${PLATFORMS.join(", ")}`;
    }
  }
  if (value.action !== undefined) {
    if (!isRecord(value.action)) return "action must have a url and a label";
    const url = value.action.url;
    let https = false;
    try {
      https = typeof url === "string" && url.length <= 2_048 && new URL(url).protocol === "https:";
    } catch {
      https = false;
    }
    if (!https) return "action.url must be an https:// link";
    const label = text(value.action.label, TITLE_MAX, "action.label");
    if (label) return label;
  }
  return null;
}

export function isAnnouncement(value: unknown): value is Announcement {
  return problem(value) === null;
}

export function isLive(announcement: Announcement, now: number): boolean {
  return (
    (announcement.startsAt === undefined || Date.parse(announcement.startsAt) <= now) &&
    (announcement.expiresAt === undefined || Date.parse(announcement.expiresAt) > now)
  );
}

const URGENCY: Record<AnnouncementLevel, number> = { urgent: 0, important: 1, info: 2 };

/**
 * The notices to serve from what is stored: valid ones only (one bad record
 * never hides the rest), live now, most pressing first and newest first
 * within a level, capped at {@link MAX_LIVE}.
 */
export function liveNotices(stored: unknown, now: number): Announcement[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(isAnnouncement)
    .filter((notice) => isLive(notice, now))
    .sort(
      (a, b) =>
        URGENCY[a.level] - URGENCY[b.level] ||
        Date.parse(b.startsAt ?? "0") - Date.parse(a.startsAt ?? "0"),
    )
    .slice(0, MAX_LIVE);
}

/**
 * What versions of Sajilo from before the list read: they know only a single
 * `announcement`. Every notice now goes to the list, so they are shown this
 * one, standing, until they update.
 */
export const UPDATE_NOTICE: Announcement = {
  id: "update-sajilo",
  level: "important",
  title: {
    en: "Update Sajilo",
    ne: "सजिलो अपडेट गर्नुहोस्",
  },
  body: {
    en: "A newer version is out. Click Update or Restart to update at the top of Sajilo. Don't see either? Quit Sajilo and open it again.",
    ne: "नयाँ संस्करण आएको छ। सजिलोको माथि रहेको Update वा Restart to update थिच्नुहोस्। देखिएन भने सजिलो बन्द गरेर फेरि खोल्नुहोस्।",
  },
  action: {
    url: "https://sajilo.fyi/docs/updating.html",
    label: { en: "How updating works", ne: "अपडेट कसरी हुन्छ" },
  },
};
