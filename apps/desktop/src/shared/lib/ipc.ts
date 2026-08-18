import { invoke } from "@tauri-apps/api/core";
import type { ForexSnapshot } from "../../types/api/ForexSnapshot";
import type { FuelPriceSnapshot } from "../../types/api/FuelPriceSnapshot";
import type { LoadState } from "../../types/api/LoadState";
import type { MetalRateSnapshot } from "../../types/api/MetalRateSnapshot";
import type { NewsDigest } from "../../types/api/NewsDigest";
import type { RadioDirectory } from "../../types/api/RadioDirectory";
import type { RashifalSnapshot } from "../../types/api/RashifalSnapshot";
import type { StockMarketSnapshot } from "../../types/api/StockMarketSnapshot";
import type { VegetableMarketSnapshot } from "../../types/api/VegetableMarketSnapshot";
import type { WeatherLocation } from "../../types/api/WeatherLocation";
import type { WeatherSnapshot } from "../../types/api/WeatherSnapshot";

/** Mirrors `commands::bazar::Bazar`. */
export interface Bazar {
  metals: LoadState<MetalRateSnapshot>;
  fuel: LoadState<FuelPriceSnapshot>;
  vegetables: LoadState<VegetableMarketSnapshot>;
}

/** Mirrors `sajilo_core::NepaliDate`. */
export interface NepaliDate {
  year: number;
  month: number;
  day: number;
}

export interface Today {
  nepali: NepaliDate;
  gregorian: string;
  nepaliMonthName: string;
  englishMonthName: string;
  weekday: number;
}

export interface CalendarDay {
  id: string;
  date: NepaliDate | null;
  adDay: number | null;
  isToday: boolean;
  isHoliday: boolean;
  eventName: string | null;
  tithi: string | null;
}

export interface CalendarMonth {
  firstDate: NepaliDate;
  title: string;
  days: CalendarDay[];
}

export interface CalendarEvent {
  name: string | null;
  tithi: string | null;
  is_public_holiday: boolean;
}

export interface UpcomingEvent {
  date: NepaliDate;
  gregorian: string;
  name: string;
  is_public_holiday: boolean;
  days_away: number;
}

export interface Conversion {
  nepali: NepaliDate;
  gregorian: string;
  nepaliMonthName: string;
  englishMonthName: string;
  weekday: number;
}

export interface SupportedRange {
  firstYear: number;
  lastYear: number;
  firstEventYear: number;
  lastEventYear: number;
}

/** Mirrors `sajilo_core::calendar::panchanga::Panchanga`. Computed for Kathmandu. */
export interface Panchanga {
  sunrise: string;
  sunset: string;
  rahuKaalStart: string | null;
  rahuKaalEnd: string | null;
  daylightSeconds: number;
}

export interface PlanTime {
  hour: number;
  minute: number;
}

export interface DayPlan {
  id: string;
  date: NepaliDate;
  title: string;
  time: PlanTime | null;
  reminder: number | null;
  note: string;
  recurrence: "none" | "yearlyBikramSambat";
  createdAt: string;
}

/** Mirrors `sajilo_core::tools::land::LandUnit`. */
export type LandUnit =
  | "ropani"
  | "aana"
  | "paisa"
  | "daam"
  | "bigha"
  | "kattha"
  | "dhur"
  | "squareFeet"
  | "squareMetre";

export type WeightUnit = "tola" | "gram" | "tenGram" | "ounce";

export interface LandBreakdown {
  hill: { ropani: number; aana: number; paisa: number; daam: number };
  hillCompact: string;
  terai: { bigha: number; kattha: number; dhur: number };
  teraiCompact: string;
  squareFeet: number;
  squareMetres: number;
}

export interface VatBreakdown {
  base: number;
  vat: number;
  total: number;
}

export interface InterestResult {
  principal: number;
  interest: number;
  total: number;
}

export type PermissionState = "granted" | "denied" | "unknown";

export interface NotificationOptions {
  eveOfPublicHoliday: boolean;
  eveOfFestival: boolean;
  hour: number;
}

export interface PlannedNotification {
  id: string;
  title: string;
  body: string;
  fireAt: string;
}

/*
 * Every calendar computation is a command. The frontend owns no copy of the
 * year-length table, so there is nothing here that can drift from the engine.
 */
export const api = {
  today: () => invoke<Today>("today"),
  monthGrid: (year: number, monthNumber: number) =>
    invoke<CalendarMonth>("month_grid", { year, monthNumber }),
  shiftMonth: (year: number, monthNumber: number, offset: number) =>
    invoke<NepaliDate>("shift_month", { year, monthNumber, offset }),
  bsToAd: (year: number, monthNumber: number, day: number) =>
    invoke<Conversion>("bs_to_ad", { year, monthNumber, day }),
  adToBs: (year: number, monthNumber: number, day: number) =>
    invoke<Conversion>("ad_to_bs", { year, monthNumber, day }),
  eventsFor: (year: number, monthNumber: number, day: number) =>
    invoke<CalendarEvent | null>("events_for", { year, monthNumber, day }),
  upcomingEvents: (limit?: number, horizonDays?: number) =>
    invoke<UpcomingEvent[]>("upcoming_events", { limit, horizonDays }),
  supportedRange: () => invoke<SupportedRange>("supported_range"),
  panchangaFor: (isoDate: string) => invoke<Panchanga>("panchanga_for", { isoDate }),

  listPlans: () => invoke<DayPlan[]>("list_plans"),
  plansForDay: (year: number, month: number, day: number) =>
    invoke<DayPlan[]>("plans_for_day", { year, month, day }),
  savePlan: (plan: DayPlan) => invoke<DayPlan[]>("save_plan", { plan }),
  deletePlan: (id: string) => invoke<DayPlan[]>("delete_plan", { id }),

  groupNumber: (value: number, fractionDigits: number) =>
    invoke<string>("group_number", { value, fractionDigits }),

  convertLand: (value: number, from: LandUnit, to: LandUnit) =>
    invoke<number>("convert_land", { value, from, to }),
  landBreakdown: (value: number, from: LandUnit) =>
    invoke<LandBreakdown>("land_breakdown", { value, from }),
  convertWeight: (value: number, from: WeightUnit, to: WeightUnit) =>
    invoke<number>("convert_weight", { value, from, to }),
  computeVat: (amount: number, inclusive: boolean) =>
    invoke<VatBreakdown>("compute_vat", { amount, inclusive }),
  computeInterest: (principal: number, annualRatePercent: number, years: number) =>
    invoke<InterestResult>("compute_interest", { principal, annualRatePercent, years }),

  exportBackup: () => invoke<string>("export_backup"),
  importBackup: (contents: string) =>
    invoke<{ dayPlans: number; exportedAt: string }>("import_backup", { contents }),
  isFirstRun: () => invoke<boolean>("is_first_run"),
  markLaunched: () => invoke<void>("mark_launched"),

  notificationPermission: () => invoke<PermissionState>("notification_permission"),
  requestNotificationPermission: () => invoke<PermissionState>("request_notification_permission"),
  getNotificationOptions: () => invoke<NotificationOptions>("get_notification_options"),
  setNotificationOptions: (options: NotificationOptions) =>
    invoke<PlannedNotification[]>("set_notification_options", { options }),
  pendingNotifications: () => invoke<PlannedNotification[]>("pending_notifications"),

  isAutostartEnabled: () => invoke<boolean>("is_autostart_enabled"),
  setAutostart: (enabled: boolean) => invoke<boolean>("set_autostart", { enabled }),
  setDockIconVisible: (visible: boolean) => invoke<void>("set_dock_icon_visible", { visible }),
  isDockIconVisible: () => invoke<boolean>("is_dock_icon_visible"),
  /** False in every dev build and any release built without a signing key. */
  updaterEnabled: () => invoke<boolean>("updater_enabled"),

  /** All three bazar feeds. Cached in Rust; `refresh` forces a refetch. */
  getBazar: (refresh = false) => invoke<Bazar>("get_bazar", { refresh }),

  getStocks: (refresh = false) => invoke<LoadState<StockMarketSnapshot>>("get_stocks", { refresh }),

  getRashifal: (refresh = false) =>
    invoke<LoadState<RashifalSnapshot>>("get_rashifal", { refresh }),

  getWeather: (refresh = false, location?: WeatherLocation) =>
    invoke<LoadState<WeatherSnapshot>>("get_weather", { refresh, location }),

  getForex: (refresh = false) => invoke<LoadState<ForexSnapshot>>("get_forex", { refresh }),

  getNews: (refresh = false) => invoke<LoadState<NewsDigest>>("get_news", { refresh }),

  getStations: (refresh = false) => invoke<LoadState<RadioDirectory>>("get_stations", { refresh }),
  /** Resolved per station, on play — the directory lists around 270 of them. */
  stationStream: (slug: string) => invoke<string>("station_stream", { slug }),

  /** Redraws the menu-bar label after a preference it reads has changed. */
  refreshTray: () => invoke<void>("refresh_tray"),
};
