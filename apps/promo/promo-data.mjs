/**
 * What the promo's recording answers beyond the showcase's own recording:
 * only what belongs to a viewer, which no recording can hold (their Keeper
 * papers, their Routine being on, their rashi). Market data, news, weather
 * and the calendar always come from the showcase recording.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const recording = JSON.parse(
  readFileSync(join(here, "../showcase/src/data/scenes.json"), "utf8"),
);
const recorded = recording.commands;
export const RECORDED_AT = recording.recordedAt;

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

export const KEEPER = {
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

/** The electricity bill once it's paid: it moves to the same day next month. */
export const PAID = {
  ...KEEPER,
  items: KEEPER.items.map((item) =>
    item.id === "electricity"
      ? {
          ...item,
          dueDate: {
            calendar: "bs",
            year: 2083,
            month: 6,
            day: 13,
            ad: "2026-09-29",
            bs: { year: 2083, month: 6, day: 13, monthName: "असोज" },
          },
        }
      : item,
  ),
};

export const BASE_PROMO = {
  keeper_snapshot: KEEPER,
  complete_keeper_item: PAID,
  focus_snapshot: focusOn(),
  "get_setting:selectedRashi": "simha",
  // A second clock for family abroad, as someone would set it.
  "get_setting:clocksEnabled": true,
  "get_setting:clocks": ["Australia/Sydney"],
};

/** Past the one-time "How Routine works" tip, as anyone is after day one. */
export async function dismissRoutineTip(page) {
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.count()) await gotIt.first().click();
  await page.waitForTimeout(400);
}

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
export const facts = {
  menuBarDate: `${today.nepaliMonthName} ${deva(today.nepali.day)}, ${deva(today.nepali.year)}`,
  holiday: { name: holiday.name, daysAway: holiday.days_away },
  nepse: { value: nepse.value, changePercent: nepse.changePercent },
  goldPerTola: gold.price,
  usdBuy: usd.buy,
};


// ---------------------------------------------------------------- cards

/**
 * A joke exactly as the engine deals it: the English line looked up in the
 * bundled jokes pack (`data/config/jokes.json`), with the Nepali beside it.
 * A line the pack doesn't have is an error, not a stand-in.
 */
const JOKES = JSON.parse(readFileSync(join(here, "../../data/config/jokes.json"), "utf8"));
const ALL_LINES = [...Object.values(JOKES.decks), ...Object.values(JOKES.done)].flat();
function joke(en) {
  const line = ALL_LINES.find((candidate) => candidate.en === en);
  if (!line) throw new Error(`not one of the engine's lines: ${en}`);
  return { en, ne: line.ne };
}

/**
 * Routine with a break card up, the way the engine hands it to the card
 * window. It starts when the recording does, after three seconds of loading.
 */
export function withBreak(kind) {
  const snap = focusOn();
  const startedAt = new Date(Date.parse(RECORDED_AT) + 3000).toISOString();
  snap.activeBreak =
    kind === "eyes"
      ? {
          kind,
          startedAt,
          seconds: 20,
          preview: false,
          joke: joke("Rest your eyes. NEPSE will still be red when you look back."),
          cheer: null,
          canSnooze: false,
          afterHold: null,
        }
      : {
          kind,
          startedAt,
          seconds: 0,
          preview: false,
          joke: joke("Water is the one thing in Kathmandu not stuck in traffic. Drink it."),
          cheer: joke("Well done. You've earned a chiya. Kidding. Water."),
          canSnooze: true,
          afterHold: null,
        };
  return snap;
}

/** The holiday's reminder, as the engine plans it for the evening before. */
export const HOLIDAY_REMINDER = {
  reminder: {
    id: `festival:${holiday.date.year}-${holiday.date.month}-${holiday.date.day}`,
    kind: "holiday",
    title: "Public holiday tomorrow",
    body: holiday.name,
    fireAt: RECORDED_AT,
  },
  waiting: 0,
  preview: false,
};

/** The menu bar on the reminder's evening, the day before the holiday. */
facts.eveDate = `${today.nepaliMonthName} ${deva(holiday.date.day - 1)}, ${deva(holiday.date.year)}`;
