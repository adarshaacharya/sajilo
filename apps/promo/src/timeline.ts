import facts from "../public/facts.json";
import { s } from "./theme";

/**
 * The film, as data: every chapter is a problem people recognise, then the
 * part of Sajilo that answers it. Changing the story means editing this list;
 * the scenes read it.
 */

export type Beat = {
  /** A capture in `public/shots/`, without `.png`. */
  shot: string;
  title: string;
  line?: string;
  seconds?: number;
};

export type Chapter = {
  id: string;
  /** Shown small above each beat's title. */
  label: string;
  /** The problem, in Nepali first and English under it. */
  problemNe: string;
  problemEn: string;
  beats: Beat[];
  /** A system notification slides in during this chapter. */
  notification?: { title: string; body: string };
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
    beats: [
      { shot: "today", title: "Today's date, always in your menu bar.", line: "One click opens the month." },
      { shot: "today-scrolled", title: "Festivals and holidays, coming up.", line: "Plus your own plans for the day." },
      { shot: "day", title: "Tithi, panchang, sunrise, Rahu Kaal.", line: "Everything about any day." },
      { shot: "events", title: "Every festival and public holiday.", line: "Years of the Bikram Sambat calendar, offline." },
      { shot: "converter", title: "BS ⇄ AD in a second.", line: "Copy it in Nepali or English numbers." },
    ],
  },
  {
    id: "reminders",
    label: "Reminders",
    problemNe: "बिदा छुट्यो?",
    problemEn: "Missed a holiday again?",
    beats: [
      { shot: "today", title: "Sajilo tells you before it comes.", line: "Holidays, festivals and your own plans.", seconds: 5 },
    ],
    notification: {
      title: facts.holiday.name,
      body: `Public holiday in ${facts.holiday.daysAway} days`,
    },
  },
  {
    id: "bazar",
    label: "Bazar",
    problemNe: "एउटा भाउ हेर्न पाँचवटा साइट",
    problemEn: "Five websites to check one price.",
    beats: [
      { shot: "nepse", title: `NEPSE at a glance: ${nepse}.`, line: "Index, turnover and the day's chart.", seconds: 2.6 },
      { shot: "nepse-scrolled", title: "Gainers, losers, sectors.", line: "And the companies you follow.", seconds: 2.6 },
      { shot: "ipos", title: "Open IPOs, with the closing day.", seconds: 2.4 },
      { shot: "funds", title: "Mutual funds and your SIP.", seconds: 2.4 },
      { shot: "forex", title: `Dollar at NRB: Rs ${facts.usdBuy}.`, line: "Every currency, with a converter.", seconds: 2.6 },
      { shot: "metals", title: `Gold: Rs ${gold} per tola.`, line: "Silver too, with a calculator.", seconds: 2.6 },
      { shot: "fuel", title: "Petrol, diesel, gas cylinder.", seconds: 2.2 },
      { shot: "vegetables", title: "Today's Kalimati prices.", seconds: 2.4 },
    ],
  },
  {
    id: "news",
    label: "News",
    problemNe: "दसवटा साइट, एउटै खबर",
    problemEn: "Ten sites for the same news.",
    beats: [
      { shot: "news", title: "Ten newsrooms, one list.", line: "What you've read fades. Government notices included.", seconds: 4 },
    ],
  },
  {
    id: "weather",
    label: "Weather",
    problemNe: "आज पानी पर्छ?",
    problemEn: "Will it rain today?",
    beats: [
      { shot: "weather", title: "Weather for any district.", line: "Air quality and the week ahead.", seconds: 4 },
    ],
  },
  {
    id: "keeper",
    label: "Keeper",
    problemNe: "पासपोर्टको म्याद कहिले सकिन्छ?",
    problemEn: "When does your passport expire?",
    beats: [
      { shot: "keeper", title: "Electricity bill due in 3 days.", line: "Sajilo keeps the dates you'd forget.", seconds: 3.4 },
      { shot: "keeper-scrolled", title: "Passport, licence, bluebook tax.", line: "With how to renew each one. All on your device.", seconds: 3.6 },
    ],
  },
  {
    id: "routine",
    label: "Routine",
    problemNe: "आठ घण्टा स्क्रिनमा, एउटा पनि ब्रेक छैन",
    problemEn: "Eight hours at the screen. Not one break.",
    beats: [
      { shot: "focus", title: "Rest your eyes. Stand up. Drink water.", line: "Gentle reminders while you work.", seconds: 3.4 },
      { shot: "focus-scrolled", title: "It waits while you're in a call.", line: "Meals, bedtime and a nudge to stop work.", seconds: 3.2 },
      { shot: "focus-week", title: "See your week at the screen.", seconds: 2.8 },
    ],
  },
  {
    id: "tools",
    label: "And the small things",
    problemNe: "सधैं गुगल गर्ने सानातिना कुरा",
    problemEn: "The small things you always google.",
    beats: [
      { shot: "tools", title: "Ropani, tola, VAT, interest.", line: "Emergency numbers and official sites, one tap away.", seconds: 3.4 },
      { shot: "today", title: "A second clock for family abroad.", seconds: 2.6 },
      { shot: "rashifal", title: "Your rashifal, every morning.", seconds: 2.6 },
      { shot: "radio", title: "Nepali FM radio, a click away.", seconds: 2.6 },
    ],
  },
  {
    id: "yours",
    label: "Made for you",
    problemNe: "नेपाली कि अङ्ग्रेजी?",
    problemEn: "Nepali or English?",
    beats: [
      { shot: "setup-en", title: "English or नेपाली.", line: "1 2 3 or १ २ ३. Your choice.", seconds: 2.4 },
      { shot: "setup-ne", title: "English or नेपाली.", line: "1 2 3 or १ २ ३. Your choice.", seconds: 2.4 },
      { shot: "today-light", title: "Light or dark.", line: "Works offline. No account. No ads.", seconds: 3.2 },
    ],
  },
];

/** Opening, per-chapter card, and closing lengths. */
export const OPEN = s(5);
export const CARD = s(2.2);
export const END = s(6);
export const DEFAULT_BEAT = 3;

export const chapterLength = (chapter: Chapter) =>
  CARD + chapter.beats.reduce((sum, beat) => sum + s(beat.seconds ?? DEFAULT_BEAT), 0);

export const TOTAL =
  OPEN + CHAPTERS.reduce((sum, chapter) => sum + chapterLength(chapter), 0) + END;

export { facts };
