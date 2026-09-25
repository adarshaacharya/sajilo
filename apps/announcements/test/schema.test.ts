import { describe, expect, test } from "bun:test";
import { type Announcement, liveNotices, MAX_LIVE, problem, UPDATE_NOTICE } from "../src/schema";

const NOW = Date.parse("2026-09-25T12:00:00Z");

function notice(id: string, extra: Partial<Announcement> = {}): Announcement {
  return {
    id,
    level: "info",
    title: { en: `Title ${id}`, ne: `शीर्षक ${id}` },
    body: { en: `Body ${id}`, ne: `विवरण ${id}` },
    ...extra,
  };
}

describe("problem", () => {
  test("accepts a complete notice", () => {
    expect(problem(notice("ipo-2026-10", { platforms: ["windows"] }))).toBeNull();
  });

  test("names what is wrong, so the publish script can say it", () => {
    expect(problem({ ...notice("a"), id: "Has Spaces" })).toContain("id must be");
    expect(problem({ ...notice("a"), level: "loud" })).toContain("level must be");
    expect(problem({ ...notice("a"), title: { en: "Only English" } })).toBe("title.ne is missing");
    expect(problem({ ...notice("a"), platforms: ["android"] })).toContain("platforms");
    expect(
      problem({ ...notice("a"), action: { url: "http://plain.example", label: { en: "x", ne: "x" } } }),
    ).toContain("https");
    expect(
      problem({ ...notice("a"), startsAt: "2026-10-02T00:00:00Z", expiresAt: "2026-10-01T00:00:00Z" }),
    ).toBe("startsAt must be before expiresAt");
  });

  test("the standing update notice for older versions is itself valid", () => {
    expect(problem(UPDATE_NOTICE)).toBeNull();
  });
});

describe("liveNotices", () => {
  test("serves only live notices, most pressing and then newest first", () => {
    const stored = [
      notice("old-info", { startsAt: "2026-09-01T00:00:00Z" }),
      notice("new-info", { startsAt: "2026-09-20T00:00:00Z" }),
      notice("urgent", { level: "urgent" }),
      notice("important", { level: "important" }),
      notice("expired", { expiresAt: "2026-09-24T00:00:00Z" }),
      notice("scheduled", { startsAt: "2026-10-01T00:00:00Z" }),
    ];
    expect(liveNotices(stored, NOW).map((n) => n.id)).toEqual([
      "urgent",
      "important",
      "new-info",
      "old-info",
    ]);
  });

  test("one broken record never hides the rest", () => {
    const stored = [notice("good"), { id: "broken" }, "not even an object"];
    expect(liveNotices(stored, NOW).map((n) => n.id)).toEqual(["good"]);
  });

  test("nothing stored, or something that is not a list, serves nothing", () => {
    expect(liveNotices(null, NOW)).toEqual([]);
    expect(liveNotices(notice("single"), NOW)).toEqual([]);
  });

  test(`serves at most ${MAX_LIVE}`, () => {
    const stored = Array.from({ length: MAX_LIVE + 3 }, (_, i) => notice(`n-${i}`));
    expect(liveNotices(stored, NOW)).toHaveLength(MAX_LIVE);
  });
});
