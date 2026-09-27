import bazar from "../public/clips/bazar.json";
import breakEyes from "../public/clips/break-eyes.json";
import breakWater from "../public/clips/break-water.json";
import calendar from "../public/clips/calendar.json";
import keeper from "../public/clips/keeper.json";
import reminder from "../public/clips/reminder.json";
import tools from "../public/clips/tools.json";
import yours from "../public/clips/yours.json";
import { s } from "./theme";
import type { Clip } from "./timeline";

/**
 * The vertical cut, for TikTok, Reels and Shorts: about forty seconds of the
 * same recordings, the strongest moment of each feature back to back. It
 * carries only the app's own sounds (clicks, the chime), so the music can be
 * chosen on the platform.
 */

export const V_WIDTH = 1080;
export const V_HEIGHT = 1920;

export type Segment = {
  /** A recording in `public/clips/`. */
  name: string;
  clip: Clip;
  /** The frames of the recording to play, `from` inclusive. */
  from: number;
  to: number;
  /** A card window (reminder, break) rather than the popover. */
  card?: boolean;
  label: string;
  title: string;
  line?: string;
};

export const HOOK = s(1.8);
export const OUTRO = s(3.2);

export const SEGMENTS: Segment[] = [
  {
    name: "calendar",
    clip: calendar,
    from: 12,
    to: 205,
    label: "Calendar",
    title: "Today's date, one click away.",
    line: "Festivals, holidays, every month.",
  },
  {
    name: "reminder",
    clip: reminder,
    from: 0,
    to: reminder.frames,
    card: true,
    label: "Reminders",
    title: "Told the evening before.",
  },
  {
    name: "bazar",
    clip: bazar,
    from: 40,
    to: 135,
    label: "Bazar",
    title: "NEPSE at a glance.",
  },
  {
    name: "bazar",
    clip: bazar,
    from: 300,
    to: 385,
    label: "Bazar",
    title: "Gold, per tola.",
  },
  {
    name: "keeper",
    clip: keeper,
    from: 50,
    to: 160,
    label: "Keeper",
    title: "Bills you'd forget. Paid.",
  },
  {
    name: "break-eyes",
    clip: breakEyes,
    from: 0,
    to: 90,
    card: true,
    label: "Routine",
    title: "Rest your eyes.",
  },
  {
    name: "break-water",
    clip: breakWater,
    from: 0,
    to: breakWater.frames,
    card: true,
    label: "Routine",
    title: "Drink some water.",
  },
  {
    name: "tools",
    clip: tools,
    from: 190,
    to: 320,
    label: "Radio",
    title: "Nepali FM, a click away.",
  },
  {
    name: "yours",
    clip: yours,
    from: 0,
    to: 120,
    label: "Made yours",
    title: "नेपाली or English.",
  },
];

export const segmentLength = (segment: Segment) => segment.to - segment.from;

export const V_TOTAL =
  HOOK + SEGMENTS.reduce((sum, segment) => sum + segmentLength(segment), 0) + OUTRO;

/** Where each segment starts in the cut. */
export function segmentStarts() {
  let at = HOOK;
  return SEGMENTS.map((segment) => {
    const start = at;
    at += segmentLength(segment);
    return start;
  });
}
