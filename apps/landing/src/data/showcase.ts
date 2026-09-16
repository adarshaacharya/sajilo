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
