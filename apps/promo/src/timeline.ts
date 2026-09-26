import bazar from "../public/clips/bazar.json";
import calendar from "../public/clips/calendar.json";
import converter from "../public/clips/converter.json";
import keeper from "../public/clips/keeper.json";
import news from "../public/clips/news.json";
import routine from "../public/clips/routine.json";
import tools from "../public/clips/tools.json";
import weather from "../public/clips/weather.json";
import yours from "../public/clips/yours.json";
import facts from "../public/facts.json";
import { s } from "./theme";

/**
 * The film, as data: every chapter is a problem people recognise, then someone
 * using Sajilo to answer it. The footage is `bun run record`'s; each caption
 * lands on a mark the recording set at the moment the thing happens.
 */

export type Clip = {
  width: number;
  height: number;
  frames: number;
  /** Per frame: cursor x, y in the popover's CSS pixels, and 1 while pressed. */
  cursor: number[][];
  clicks: number[];
  marks: Record<string, number>;
};

export type Beat = {
  /** A mark in the clip; the caption lands there. */
  at: string;
  title: string;
  line?: string;
};

export type Chapter = {
  id: string;
  /** Shown small above each caption. */
  label: string;
  /** The problem, in Nepali first and English under it. */
  problemNe: string;
  problemEn: string;
  /** The footage, played in the panel, one after another. */
  clips: { name: string; clip: Clip; beats: Beat[] }[];
  /** Instead of footage: a system notification, with the panel closed. */
  notification?: { title: string; body: string; seconds: number; beats: Beat[] };
};

const gold = new Intl.NumberFormat("en-IN").format(facts.goldPerTola);
const nepse = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
  facts.nepse.value,
);

export const CHAPTERS: Chapter[] = [
  {
    id: "calendar",
    label: "Calendar",
    problemNe: "आज कति गते?",
    problemEn: "What's the date today?",
    clips: [
      {
        name: "calendar",
        clip: calendar,
        beats: [
          { at: "today", title: "Today's date, always one click away.", line: "Bikram Sambat and AD, side by side." },
          { at: "upNext", title: "What's coming up.", line: "Festivals, holidays and your own bills." },
          { at: "dashain", title: "Flip through the months.", line: "Every festival and holiday, offline." },
          { at: "day", title: "Everything about a day.", line: "Tithi, Rahu Kaal, chaughadiya, panchang." },
        ],
      },
      {
        name: "converter",
        clip: converter,
        beats: [{ at: "converter", title: "BS to AD, and back.", line: "Copy it in Nepali or English numbers." }],
      },
    ],
  },
  {
    id: "reminders",
    label: "Reminders",
    problemNe: "बिदा छुट्यो?",
    problemEn: "Missed a holiday again?",
    clips: [],
    notification: {
      title: facts.holiday.name,
      body: `Public holiday in ${facts.holiday.daysAway} days`,
      seconds: 4.5,
      beats: [{ at: "start", title: "Sajilo tells you first.", line: "Without you opening anything." }],
    },
  },
  {
    id: "bazar",
    label: "Bazar",
    problemNe: "एउटा भाउ हेर्न पाँचवटा साइट",
    problemEn: "Five websites to check one price.",
    clips: [
      {
        name: "bazar",
        clip: bazar,
        beats: [
          { at: "nepse", title: `NEPSE ${nepse}.`, line: "Gainers, losers, IPOs and your funds." },
          { at: "forex", title: `Dollar Rs ${facts.usdBuy}.`, line: "NRB's rates for every currency." },
          { at: "gold", title: `Gold Rs ${gold} a tola.`, line: "And silver, per tola and 10 grams." },
          { at: "vegetables", title: "Kalimati prices, today.", line: "Every vegetable and fruit." },
        ],
      },
    ],
  },
  {
    id: "news",
    label: "News",
    problemNe: "दसवटा साइट, एउटै खबर",
    problemEn: "Ten sites for the same news.",
    clips: [
      {
        name: "news",
        clip: news,
        beats: [{ at: "news", title: "Ten newsrooms, one list.", line: "What you've read fades away." }],
      },
    ],
  },
  {
    id: "weather",
    label: "Weather",
    problemNe: "आज पानी पर्छ?",
    problemEn: "Will it rain today?",
    clips: [
      {
        name: "weather",
        clip: weather,
        beats: [{ at: "weather", title: "Any district, any town.", line: "Air quality and the week ahead." }],
      },
    ],
  },
  {
    id: "keeper",
    label: "Keeper",
    problemNe: "पासपोर्टको म्याद कहिले सकिन्छ?",
    problemEn: "When does your passport expire?",
    clips: [
      {
        name: "keeper",
        clip: keeper,
        beats: [
          { at: "bill", title: "Electricity bill, 3 days left.", line: "Sajilo keeps the dates you'd forget." },
          { at: "paid", title: "Paid. See you next month." },
          { at: "papers", title: "Passport, licence, bluebook.", line: "Kept on your device, never uploaded." },
        ],
      },
    ],
  },
  {
    id: "routine",
    label: "Routine",
    problemNe: "आठ घण्टा स्क्रिनमा, एउटा पनि ब्रेक छैन",
    problemEn: "Eight hours at the screen. Not one break.",
    clips: [
      {
        name: "routine",
        clip: routine,
        beats: [
          { at: "breaks", title: "Rest your eyes. Stand up. Drink water.", line: "Gentle nudges while you work." },
          { at: "calls", title: "It waits while you're in a call." },
          { at: "week", title: "Your week at the screen.", line: "Days off counted apart." },
        ],
      },
    ],
  },
  {
    id: "tools",
    label: "And the small things",
    problemNe: "सधैं गुगल गर्ने सानातिना कुरा",
    problemEn: "The small things you always google.",
    clips: [
      {
        name: "tools",
        clip: tools,
        beats: [
          { at: "tools", title: "Ropani, tola, VAT, interest.", line: "Emergency numbers, one tap away." },
          { at: "rashifal", title: "Your rashifal, every morning." },
          { at: "radio", title: "Nepali FM, a click away." },
        ],
      },
    ],
  },
  {
    id: "yours",
    label: "Made yours",
    problemNe: "नेपाली कि अङ्ग्रेजी?",
    problemEn: "Nepali or English?",
    clips: [
      {
        name: "yours",
        clip: yours,
        beats: [
          { at: "language", title: "नेपाली or English." },
          { at: "numerals", title: "१ २ ३ or 1 2 3." },
          { at: "theme", title: "Light or dark.", line: "No account. No ads. Works offline." },
        ],
      },
    ],
  },
];

/** Opening, per-chapter card, and closing lengths. */
export const OPEN = s(4);
export const CARD = s(1.8);
export const END = s(6);
/** Frames between one clip and the next inside a chapter. */
export const CUT = 8;

export const footageLength = (chapter: Chapter) =>
  chapter.notification
    ? s(chapter.notification.seconds)
    : chapter.clips.reduce((sum, { clip }) => sum + clip.frames, 0);

export const chapterLength = (chapter: Chapter) => CARD + footageLength(chapter);

export const TOTAL =
  OPEN + CHAPTERS.reduce((sum, chapter) => sum + chapterLength(chapter), 0) + END;

export { calendar as openingClip, facts };
