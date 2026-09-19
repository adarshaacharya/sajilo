/**
 * Every number the landing page prints comes from here, and here reads only
 * the recording: `apps/showcase/src/data/scenes.json`, produced by
 * `apps/showcase-data` from the real calendar engine and the real parsers over
 * `fixtures/`. The panels embedded on the page run on the same file, so the
 * copy and the screens always describe the same day. Nothing on the page is
 * typed in by hand — refresh with `cd apps/showcase && bun run data`.
 */
import scenes from "../../../showcase/src/data/scenes.json";
import { SIGNS } from "../../../desktop/src/features/rashifal/_lib/signs";

type Commands = typeof scenes.commands;
const c: Commands = scenes.commands;

export const recordedAt = scenes.recordedAt;

// ---------- Calendar ----------

export const today = c.today;

export const upcoming = (c.upcoming_events as UpcomingEvent[]).slice(0, 5);

export interface UpcomingEvent {
  date: { day: number; month: number; year: number };
  days_away: number;
  gregorian: string;
  is_public_holiday: boolean;
  name: string;
}

const todayKey = `events_for:${today.nepali.year}:${today.nepali.month}:${today.nepali.day}`;
const todayEvents = (c as unknown as Record<string, { tithi: string | null; is_public_holiday: boolean } | undefined>)[todayKey];
export const todayTithi: string | null = todayEvents?.tithi ?? null;
export const todayIsHoliday = todayEvents?.is_public_holiday ?? false;

export const supportedRange = c.supported_range;

// ---------- Holidays ----------

export interface HolidayMonth {
  year: number;
  month: number;
  name: string;
  days: number;
  firstWeekday: number;
  holidays: { day: number; name: string; gregorian: string; daysAway: number }[];
}

/** The recorded BS months ahead, trimmed where the bundled festival data ends
 * (a month with no holiday at all is past it, not a year off work). */
const holidayMonths = scenes.holidayYear.months as HolidayMonth[];
const lastWithHoliday = holidayMonths.findLastIndex((m) => m.holidays.length > 0);
export const holidayYear = holidayMonths.slice(0, lastWithHoliday + 1);
const aheadHolidays = holidayYear.flatMap((m) => m.holidays).filter((h) => h.daysAway >= 0);
export const holidaysAhead = aheadHolidays.length;
const firstNamed = (pattern: RegExp) => aheadHolidays.find((h) => pattern.test(h.name));
export const dashain = firstNamed(/दशैं?को टिका|विजया दशमी/);
export const tihar = firstNamed(/भाइटीका/);
export const chhath = firstNamed(/छठ/);

// ---------- Weather ----------

const weather = c.get_weather.value;
export const kathmandu = {
  temperature: Math.round(weather.temperatureCelsius),
  condition: weather.condition,
  aqi: weather.airQuality.usAqi,
  pm25: weather.airQuality.pm25,
  sunrise: weather.sunrise,
  sunset: weather.sunset,
  days: weather.daily.length,
};

const places = c.list_places as { name: string; district: string; elevation: number }[];
export const placeCount = places.length;
export const highestPlace = places.reduce((a, b) => (b.elevation > a.elevation ? b : a));
export const lowestPlace = places.reduce((a, b) => (b.elevation < a.elevation ? b : a));

// ---------- Bazar ----------

const metals = c.get_bazar.metals.value.rates;
const gold = metals.find((r) => r.metal === "fineGold" && r.unit === "tola")!;
const silver = metals.find((r) => r.metal === "silver" && r.unit === "tola")!;
export const bullion = {
  gold: gold.price,
  goldDelta: gold.price - gold.previousPrice,
  silver: silver.price,
  silverDelta: silver.price - silver.previousPrice,
};

const fuelPrices = c.get_bazar.fuel.value.prices;
export const fuel = {
  petrol: fuelPrices.find((p) => p.fuel === "petrol")!.price,
  diesel: fuelPrices.find((p) => p.fuel === "diesel")!.price,
  lpg: fuelPrices.find((p) => p.fuel === "lpg")!.price,
  effectiveFrom: c.get_bazar.fuel.value.effectiveFrom,
};

const veg = c.get_bazar.vegetables.value.prices;
export const vegetables = {
  count: veg.length,
  first: veg[0],
};
/** A tarkari stall's worth: the first recorded variety of each everyday
 * vegetable, by its English name. */
export const vegetableTags = ["Tomato", "Potato", "Onion", "Cauli", "Cucumber", "Chilli"]
  .map((word) => veg.find((v) => v.englishName?.toLowerCase().includes(word.toLowerCase())))
  .filter((v) => v !== undefined);
/** The dearest thing on the Kalimati list that day, whatever it was. */
export const priciestVegetable = veg.reduce((top, v) => (v.average > top.average ? v : top));
export const bazarPrices = {
  gold,
  silver,
  fuel: fuelPrices,
  fuelEffectiveFrom: c.get_bazar.fuel.value.effectiveFrom,
  vegetablesOn: c.get_bazar.vegetables.value.publishedOn,
};

// ---------- Stocks ----------

const stocks = c.get_stocks.value;
export const nepse = {
  value: stocks.nepse.value,
  change: stocks.nepse.change,
  changePercent: stocks.nepse.changePercent,
  listed: stocks.quotes.length,
  subIndices: stocks.subIndices.length,
  topGainer: stocks.movers.find((m) => m.board === "gainers")!,
  turnover: stocks.nepse.turnover,
  breadth: stocks.breadth,
  closedAt: stocks.marketStatus.asOf,
  gainers: stocks.movers.filter((m) => m.board === "gainers").slice(0, 3),
  losers: stocks.movers.filter((m) => m.board === "losers").slice(0, 3),
};
/** The recorded IPO: the first issue open to the general public, with how
 * many applied against how many units were on offer. */
const ipoIssue = c.get_ipos.value.issues.find((issue) => issue.issueType === "IPO") ?? null;
export const ipo = ipoIssue && {
  name: ipoIssue.name,
  symbol: ipoIssue.symbol,
  closeDate: ipoIssue.closeDate,
  units: Number(ipoIssue.issuedUnits),
  applied: Number(ipoIssue.appliedUnits),
  applications: Number(ipoIssue.applicationCount),
};
/** Mutual funds: how many of each kind, and the largest open-ended funds —
 * the ones a SIP goes into — with their latest NAV against the one before. */
const funds = c.get_mutual_funds.value.funds;
export const mutualFunds = {
  total: funds.length,
  openEnd: funds.filter((fund) => fund.kind === "openEnd").length,
  closedEnd: funds.filter((fund) => fund.kind === "closedEnd").length,
  largest: funds
    .filter((fund) => fund.kind === "openEnd" && fund.latest && fund.previous)
    .sort((a, b) => (b.fundSize ?? 0) - (a.fundSize ?? 0))
    .slice(0, 4)
    .map((fund) => ({
      symbol: fund.symbol,
      name: fund.name,
      nav: fund.latest!.nav,
      navDate: fund.latest!.date,
      change: fund.latest!.nav - fund.previous!.nav,
    })),
};
/** The index through the recorded session, a sample a minute. */
export const nepseIntraday = c.get_nepse_intraday.value.points;

// ---------- Forex ----------

const forex = c.get_forex.value;
export const usd = forex.rates.find((r) => r.currencyCode === "USD")!;
export const forexCount = forex.rates.length;

// ---------- News ----------

export const newsSources = c.news_sources;
export const newsItems = c.get_news.value.items.length;

// ---------- Radio, rashifal ----------

export const stationCount = c.get_stations.value.stations.length;

/**
 * The recorded stations placed on an FM dial. Frequencies arrive as the
 * directory typed them ("95.2 MHz, 91 MHz", "१०४.४ MHz", "90.8Mhz", or not at
 * all), so each station's first number is read — Devanagari digits included —
 * and kept only if it is a real FM frequency. Stations sharing a frequency
 * (the same number in different towns) share a stop on the dial.
 */
const DEVANAGARI = "०१२३४५६७८९";
function firstFrequency(raw: string | null): number | null {
  if (!raw) return null;
  const latin = raw.replace(/[०-९]/g, (digit) => String(DEVANAGARI.indexOf(digit)));
  const match = latin.match(/\d{2,3}(?:\.\d)?/);
  const value = match ? Number(match[0]) : Number.NaN;
  return value >= 87.5 && value <= 108 ? Math.round(value * 10) / 10 : null;
}
export const radioDial = (() => {
  const stops = new Map<number, string[]>();
  for (const station of c.get_stations.value.stations) {
    const frequency = firstFrequency(station.frequency);
    if (frequency === null) continue;
    stops.set(frequency, [...(stops.get(frequency) ?? []), station.name]);
  }
  return [...stops.entries()]
    .sort(([a], [b]) => a - b)
    .map(([frequency, names]) => ({ frequency, names }));
})();
export const rashifalSigns = c.get_rashifal.value.readings.length;

/**
 * The recorded day's readings, one per sign, in the app's own sign order and
 * with the app's own sign table (names, western names, first syllables) — the
 * same file the Rashifal screen and its name lookup read. Each reading closes
 * with "आजको शुभ रंग … हो भने शुभ अंक … रहेको छ।"; that sentence is split off
 * so the page can set the colour and number apart. A reading that doesn't
 * follow the pattern keeps its whole text and no lucky fields.
 */
export const rashifal = SIGNS.map((sign) => {
  const reading = c.get_rashifal.value.readings.find((r) => r.sign === sign.id);
  const text = reading?.prediction ?? "";
  const lucky = text.match(/आजको शुभ रंग\s*(.+?)\s*हो भने शुभ अंक\s*(\S+?)\s*रहेको छ।?\s*$/);
  return {
    id: sign.id,
    ne: sign.ne,
    en: sign.en,
    western: sign.western,
    syllables: [...sign.syllables],
    reading: lucky ? text.slice(0, lucky.index).trim() : text,
    colour: lucky?.[1] ?? null,
    number: lucky?.[2] ?? null,
  };
});

// ---------- Tools ----------

export const ropaniInSqFt = c.convert_land;
export const tolaInGrams = c.convert_weight;
/** One ropani broken into both systems, as the Land tool shows it. */
export const landBreakdown = c.land_breakdown;
export const vatExample = c.compute_vat;
export const interestExample = c.compute_interest;
/** The date converter's answer for the recorded day. */
export const convertedDate = c.bs_to_ad;
