import bazar from "../public/clips/bazar.json";
import breakEyes from "../public/clips/break-eyes.json";
import breakWater from "../public/clips/break-water.json";
import calendar from "../public/clips/calendar.json";
import converter from "../public/clips/converter.json";
import keeper from "../public/clips/keeper.json";
import news from "../public/clips/news.json";
import reminder from "../public/clips/reminder.json";
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
  /** False when the mouse was never touched: no cursor is drawn. */
  pointer?: boolean;
  /** Per frame: cursor x, y in the popover's CSS pixels, and 1 while pressed. */
  cursor: number[][];
  clicks: number[];
  marks: Record<string, number>;
  /** For a card: its height each frame, in CSS pixels. */
  heights?: number[];
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
  /**
   * Sajilo's own cards (a reminder, a break), each its own small window at
   * the top of the screen, played first with the panel closed. Each arrives
   * with the app's chime.
   */
  cards?: { name: string; clip: Clip; beats: Beat[] }[];
  /** The footage, played in the panel, one after another. */
  clips: { name: string; clip: Clip; beats: Beat[] }[];
  /** The menu bar's date, when the scene is another day. */
  date?: string;
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
    date: facts.eveDate,
    cards: [
      {
        name: "reminder",
        clip: reminder,
        beats: [{ at: "start", title: "Sajilo tells you the evening before.", line: "Holidays, festivals, IPOs and your bills." }],
      },
    ],
    clips: [],
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
          { at: "nepse", title: `NEPSE ${nepse}.`, line: "Gainers, losers, sectors and your funds." },
          { at: "ipos", title: "Every IPO, and when it opens.", line: "A reminder on closing day, so you never miss one." },
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
    cards: [
      {
        name: "break-eyes",
        clip: breakEyes,
        beats: [{ at: "start", title: "Look away.", line: "Take your hands off the mouse and the ring runs down." }],
      },
      {
        name: "break-water",
        clip: breakWater,
        beats: [{ at: "start", title: "Drink some water.", line: "One tap, and a joke in Nepali or English." }],
      },
    ],
    clips: [
      {
        name: "routine",
        clip: routine,
        beats: [
          { at: "breaks", title: "Set it once.", line: "Eyes, water, standing up, meals, bedtime." },
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
          { at: "radio", title: "Nepali FM, a click away.", line: "Kantipur, Ujyaalo, Radio Nepal and more." },
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

/**
 * The edit's bar: 1.6 seconds, 48 frames (6/8 at 75, or 4/4 at 150). Every
 * section starts on a bar, so a track at a matching tempo puts each problem
 * card on a downbeat; footage that ends mid-bar holds its last frame.
 */
export const BAR = 48;
export const bars = (frames: number) => Math.ceil(frames / BAR) * BAR;

/** Opening, per-chapter card, and closing lengths. */
export const OPEN = 3 * BAR;
export const CARD = BAR;
export const END = 4 * BAR;
/** Frames between one clip and the next inside a chapter. */
export const CUT = 8;

/** Frames between one card and the next, the desktop empty. */
export const CARD_GAP = 10;

export const cardsLength = (chapter: Chapter) =>
  (chapter.cards ?? []).reduce((sum, { clip }) => sum + clip.frames + CARD_GAP, 0);

export const footageLength = (chapter: Chapter) =>
  bars(cardsLength(chapter) + chapter.clips.reduce((sum, { clip }) => sum + clip.frames, 0));

export const chapterLength = (chapter: Chapter) => CARD + footageLength(chapter);

export const TOTAL =
  OPEN + CHAPTERS.reduce((sum, chapter) => sum + chapterLength(chapter), 0) + END;

export { calendar as openingClip, facts, s };
