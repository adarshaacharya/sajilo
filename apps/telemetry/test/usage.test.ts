import { describe, expect, test } from "bun:test";
import { usageEvents, usageSettings } from "../src/usage";

describe("usageEvents", () => {
  test("keeps screen, tab and action counts", () => {
    expect(
      usageEvents({ "screen.news": 3, "tab.bazar.metals": 1, "action.radio-play": 2 }),
    ).toEqual([
      ["screen.news", 3],
      ["tab.bazar.metals", 1],
      ["action.radio-play", 2],
    ]);
  });

  test("drops anything that could carry free text", () => {
    expect(
      usageEvents({
        "search.nabil bank": 1,
        "screen.News": 1,
        "screen.news?q=x": 1,
        "note.hello": 1,
        [`screen.${"a".repeat(60)}`]: 1,
      }),
    ).toEqual([]);
  });

  test("drops counts that are not small positive integers", () => {
    expect(
      usageEvents({ "screen.a": 0, "screen.b": -1, "screen.c": 1.5, "screen.d": "2", "screen.e": 100_001 }),
    ).toEqual([]);
  });

  test("ignores a missing, wrong-shaped or oversized map", () => {
    expect(usageEvents(undefined)).toEqual([]);
    expect(usageEvents(["screen.news"])).toEqual([]);
    const many = Object.fromEntries(Array.from({ length: 81 }, (_, i) => [`screen.s${i}`, 1]));
    expect(usageEvents(many)).toEqual([]);
  });
});

describe("usageSettings", () => {
  test("keeps one-word choices", () => {
    expect(usageSettings({ language: "ne", numerals: "latin", reminderStyle: "notification" })).toEqual([
      ["language", "ne"],
      ["numerals", "latin"],
      ["reminderStyle", "notification"],
    ]);
  });

  test("drops values that are not a short word", () => {
    expect(
      usageSettings({ city: "Kathmandu", note: "call aama", n: 3, weatherLocation: "pokhara-lakeside-x" }),
    ).toEqual([]);
  });
});
