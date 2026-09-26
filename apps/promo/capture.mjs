/**
 * Captures the real app for the promo video: every screen a chapter shows,
 * from the showcase (the desktop app's own React tree with the recorded data
 * answering its commands), at three times the popover's size so the video can
 * zoom in and stay sharp.
 *
 *   cd apps/showcase && bunx vite --port 8767   # in another terminal
 *   cd apps/promo && bun run capture
 *
 * Market data, news, weather and the calendar are the recording's. Only what
 * belongs to a viewer, which no recording can hold (their Keeper papers, their
 * Routine being on), is set here, through the stub's promo hook. The browser
 * clock is pinned to the recording's moment so "3 days left" and the calendar
 * agree.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "public", "shots");
const BASE = process.env.SHOWCASE_URL ?? "http://localhost:8767/";
const CHROME =
  process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const recording = JSON.parse(
  readFileSync(join(here, "../showcase/src/data/scenes.json"), "utf8"),
);
const recorded = recording.commands;
const RECORDED_AT = recording.recordedAt;

// ---------------------------------------------------------------- a viewer's own data

/** A Keeper date on the recorded Bhadra 2083 (Bhadra 10 is 26 August 2026). */
function bhadra(day) {
  const ad = new Date(Date.UTC(2026, 7, 26 + (day - 10))).toISOString().slice(0, 10);
  return {
    calendar: "bs",
    year: 2083,
    month: 5,
    day,
    ad,
    bs: { year: 2083, month: 5, day, monthName: "भदौ" },
  };
}

const record = (id, documentType, expiryDate, recurrence, details = {}) => ({
  id,
  documentType,
  personId: null,
  number: "",
  issuedDate: null,
  expiryDate,
  recurrence,
  remindDays: [30, 7],
  office: "",
  note: "",
  details,
  links: [],
  customFields: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const KEEPER = {
  people: [],
  records: [
    record("passport", "passport", bhadra(30), "none"),
    record("bluebook", "bluebook", bhadra(28), "yearlyBs"),
    record("licence", "drivingLicence", { ...bhadra(10), ad: "2029-02-10" }, "none"),
    record("citizenship", "citizenship", null, "none"),
  ],
  items: [
    {
      id: "electricity",
      personId: null,
      title: "Electricity bill",
      category: "home",
      status: "active",
      dueDate: bhadra(13),
      recurrence: "monthlyBs",
      remindDays: [3, 0],
      note: "",
      officialUrl: "https://nea.org.np/",
      officeLocation: "",
      fee: "",
      applicationStatus: "",
      checklist: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      completedAt: null,
      template: "electricity",
    },
  ],
};

/** Routine switched on, a few hours into a working day. */
function focusOn() {
  const snap = structuredClone(recorded.focus_snapshot);
  snap.settings.eyes.enabled = true;
  snap.settings.move.enabled = true;
  snap.settings.water.enabled = true;
  snap.settings.routineAsked = true;
  for (const b of snap.breaks) {
    if (b.kind === "eyes") Object.assign(b, { enabled: true, minutesLeft: 12 });
    if (b.kind === "move") Object.assign(b, { enabled: true, minutesLeft: 34 });
    if (b.kind === "water") Object.assign(b, { enabled: true, minutesLeft: 20 });
  }
  const today = snap.today;
  today.screenSeconds = 3 * 3600 + 25 * 60;
  today.longestStretchSeconds = 58 * 60;
  today.waterMl = 1000;
  today.eyes = { ...today.eyes, reminded: 9, taken: 8 };
  today.move = { ...today.move, reminded: 3, taken: 3 };
  const hours = [5.2, 6.1, 4.8, 7.0, 6.4, 2.1, 3.4];
  snap.summary.days.forEach((day, index) => {
    day.screenSeconds = Math.round((hours[index] ?? 3) * 3600);
  });
  Object.assign(snap.summary, {
    trackedDays: 7,
    waterGoalDays: 4,
    breaksReminded: 64,
    breaksTaken: 51,
  });
  return snap;
}

const BASE_PROMO = {
  keeper_snapshot: KEEPER,
  focus_snapshot: focusOn(),
  "get_setting:selectedRashi": "simha",
  // A second clock for family abroad, as someone would set it.
  "get_setting:clocksEnabled": true,
  "get_setting:clocks": ["Australia/Sydney"],
};

/** Past the one-time "How Routine works" tip, as anyone is after day one. */
async function dismissRoutineTip(page) {
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.count()) await gotIt.first().click();
  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------- the shots

/**
 * Each shot: a name, a route, and optionally a theme, a language, extra
 * answers, and what to do on screen before the picture is taken.
 */
const SHOTS = [
  { name: "today", route: "/" },
  { name: "today-ne", route: "/", lang: "ne" },
  { name: "today-light", route: "/", theme: "light" },
  { name: "setup-en", route: "/", promo: { "get_setting:setupCardPending": true } },
  {
    name: "setup-ne",
    route: "/",
    lang: "ne",
    promo: { "get_setting:setupCardPending": true, "get_setting:numeralStyle": "devanagari" },
  },
  { name: "today-scrolled", route: "/", scroll: 520 },
  { name: "events", route: "/events" },
  { name: "day", route: "/day" },
  { name: "converter", route: "/converter" },
  { name: "weather", route: "/weather" },
  { name: "news", route: "/news" },
  { name: "nepse", route: "/bazar?tab=stocks&view=nepse" },
  { name: "nepse-scrolled", route: "/bazar?tab=stocks&view=nepse", scroll: 600 },
  { name: "ipos", route: "/bazar?tab=stocks&view=nepse&ipos=1" },
  { name: "funds", route: "/bazar?tab=stocks&view=funds" },
  { name: "forex", route: "/bazar?tab=forex" },
  { name: "metals", route: "/bazar?tab=metals" },
  { name: "fuel", route: "/bazar?tab=fuel" },
  { name: "vegetables", route: "/bazar?tab=vegetables" },
  { name: "keeper", route: "/keeper" },
  { name: "keeper-scrolled", route: "/keeper", scroll: 500 },
  { name: "focus", route: "/focus", act: dismissRoutineTip },
  { name: "focus-scrolled", route: "/focus", act: dismissRoutineTip, scroll: 700 },
  {
    name: "focus-week",
    route: "/focus",
    scroll: 5000,
    act: async (page) => {
      await dismissRoutineTip(page);
      await page.getByText("This week", { exact: true }).first().click();
      await page.waitForTimeout(600);
    },
  },
  { name: "tools", route: "/tools" },
  { name: "rashifal", route: "/rashifal" },
  { name: "radio", route: "/radio" },
  { name: "settings", route: "/settings?tab=display" },
];

// ---------------------------------------------------------------- facts

/**
 * The few recorded figures the video's captions quote, so a caption never
 * says a price or a holiday the screen beside it doesn't show.
 */
const DEVANAGARI = "०१२३४५६७८९";
const deva = (n) => String(n).replace(/\d/g, (d) => DEVANAGARI[Number(d)]);
const today = recorded.today;
const holiday = recorded.upcoming_events.find((event) => event.is_public_holiday);
const nepse = recorded.get_stocks.value.nepse;
const gold = recorded.get_bazar.metals.value.rates.find(
  (rate) => rate.metal === "fineGold" && rate.unit === "tola",
);
const usd = recorded.get_forex.value.rates.find((rate) => rate.currencyCode === "USD");
const facts = {
  menuBarDate: `${today.nepaliMonthName} ${deva(today.nepali.day)}, ${deva(today.nepali.year)}`,
  holiday: { name: holiday.name, daysAway: holiday.days_away },
  nepse: { value: nepse.value, changePercent: nepse.changePercent },
  goldPerTola: gold.price,
  usdBuy: usd.buy,
};

// ---------------------------------------------------------------- capture

const WIDTH = 380;
const HEIGHT = 640;
const SCALE = 3;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(here, "public", "facts.json"), `${JSON.stringify(facts, null, 2)}\n`);
const browser = await chromium.launch({ executablePath: CHROME });
const only = process.argv[2];

for (const shot of SHOTS) {
  if (only && !shot.name.startsWith(only)) continue;
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    colorScheme: shot.theme === "light" ? "light" : "dark",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.warn(`${shot.name}: ${error.message}`));
  await page.clock.setFixedTime(new Date(RECORDED_AT));
  const promo = {
    ...BASE_PROMO,
    ...(shot.lang ? { "get_setting:language": shot.lang } : {}),
    ...shot.promo,
  };
  await page.addInitScript((answers) => {
    globalThis.__SAJILO_PROMO__ = answers;
  }, promo);

  const url = new URL(BASE);
  url.searchParams.set("route", shot.route);
  url.searchParams.set("theme", shot.theme ?? "dark");
  await page.goto(url.toString());
  await page.waitForTimeout(2200);
  if (shot.act) await shot.act(page);
  if (shot.scroll) {
    await page.evaluate((top) => {
      document.querySelector("main")?.scrollTo({ top });
    }, shot.scroll);
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
  console.log(`captured ${shot.name}`);
  await context.close();
}

await browser.close();
