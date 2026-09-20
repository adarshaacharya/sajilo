import { invoke } from "@tauri-apps/api/core";
import type { AnnouncementResponse } from "../../types/api/AnnouncementResponse";
import type { DividendSnapshot } from "../../types/api/DividendSnapshot";
import type { ForexSnapshot } from "../../types/api/ForexSnapshot";
import type { FuelPriceSnapshot } from "../../types/api/FuelPriceSnapshot";
import type { IndexIntraday } from "../../types/api/IndexIntraday";
import type { IpoSnapshot } from "../../types/api/IpoSnapshot";
import type { LoadState } from "../../types/api/LoadState";
import type { MetalRateSnapshot } from "../../types/api/MetalRateSnapshot";
import type { MutualFundSnapshot } from "../../types/api/MutualFundSnapshot";
import type { NewsDigest } from "../../types/api/NewsDigest";
import type { NewsSourceInfo } from "../../types/api/NewsSourceInfo";
import type { Place } from "../../types/api/Place";
import type { RadioDirectory } from "../../types/api/RadioDirectory";
import type { RashifalSnapshot } from "../../types/api/RashifalSnapshot";
import type { SipStatus } from "../../types/api/SipStatus";
import type { StockAcquisitionSource } from "../../types/api/StockAcquisitionSource";
import type { StockMarketSnapshot } from "../../types/api/StockMarketSnapshot";
import type { StockPortfolio } from "../../types/api/StockPortfolio";
import type { StockPrice } from "../../types/api/StockPrice";
import type { StockTradeEstimate } from "../../types/api/StockTradeEstimate";
import type { StockTransactionKind } from "../../types/api/StockTransactionKind";
import type { VegetableMarketSnapshot } from "../../types/api/VegetableMarketSnapshot";
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
  /** Auspicious days (saait) from the official calendar. */
  marriage?: boolean;
  bratabandha?: boolean;
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
  /** Saturday, or Sunday while that rule lasts. Decided in Rust. */
  weeklyHoliday?: "saturday" | "sunday" | null;
}

export interface SupportedRange {
  firstYear: number;
  lastYear: number;
  firstEventYear: number;
  lastEventYear: number;
}

/** Mirrors `sajilo_core::calendar::panchanga::Panchanga`. Computed for Kathmandu. */
/** A panchang element in both languages, and when it gives way to the next. */
export interface AlmanacName {
  index: number;
  en: string;
  ne: string;
  ends: string | null;
}

export interface Almanac {
  tithi: AlmanacName;
  paksha: AlmanacName;
  nakshatra: AlmanacName;
  yoga: AlmanacName;
  karana: AlmanacName;
  moon: {
    phase: AlmanacName;
    /** Share of the disc lit, 0–1. */
    illumination: number;
    waxing: boolean;
    rashi: AlmanacName;
    rise: string | null;
    set: string | null;
  };
  ritu: AlmanacName;
  ayan: AlmanacName;
  nepalSambat: string;
}

export interface Chaughadiya {
  start: string;
  end: string;
  name: AlmanacName;
  quality: "good" | "neutral" | "bad";
}

export interface Panchanga {
  sunrise: string;
  sunset: string;
  rahuKaalStart: string | null;
  rahuKaalEnd: string | null;
  daylightSeconds: number;
  /** Absent outside the bundled calendar, and in recordings made before it. */
  almanac?: Almanac | null;
  chaughadiyaDay?: Chaughadiya[];
  chaughadiyaNight?: Chaughadiya[];
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

export interface KeeperPerson {
  id: string;
  name: string;
  relationship: string;
  createdAt: string;
}

export interface KeeperDateInput {
  calendar: "ad" | "bs";
  year: number;
  month: number;
  day: number;
}

export interface KeeperDate extends KeeperDateInput {
  ad: string;
  /** `monthName` is the engine's Nepali month name, e.g. भदौ. */
  bs: { year: number; month: number; day: number; monthName: string };
}

export interface KeeperChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface KeeperItem {
  id: string;
  personId: string | null;
  title: string;
  category: string;
  status: "active" | "completed" | "archived";
  /** Null for things with no deadline of their own (a citizenship
   * application). Undated items never notify. */
  dueDate: KeeperDate | null;
  recurrence: "none" | "monthly" | "yearlyAd" | "yearlyBs";
  remindDays: number[];
  note: string;
  officialUrl: string;
  officeLocation: string;
  fee: string;
  applicationStatus: string;
  checklist: KeeperChecklistItem[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** The template it was started from, if any; groups reminders of a kind. */
  template: string | null;
}

export type KeeperDocumentType =
  | "citizenship"
  | "passport"
  | "drivingLicence"
  | "nid"
  | "pan"
  | "bluebook"
  | "insurance"
  | "warranty"
  | "custom";

/** A label/value pair the user added to a custom document. */
export interface KeeperField {
  label: string;
  value: string;
}

export type KeeperRecurrence =
  | "none"
  | "monthly"
  | "quarterly"
  | "halfYearly"
  | "yearlyAd"
  | "yearlyBs";

/** A document the household holds. Its own date (expiry, tax due, premium
 * due) notifies directly — there's no separate reminder behind it. */
export interface KeeperRecord {
  id: string;
  documentType: KeeperDocumentType;
  /** Whose document; null for the user / household. */
  personId: string | null;
  number: string;
  issuedDate: KeeperDate | null;
  /** When it next needs action; null for documents that never expire. */
  expiryDate: KeeperDate | null;
  /** How `expiryDate` moves when marked paid or renewed. */
  recurrence: KeeperRecurrence;
  remindDays: number[];
  office: string;
  note: string;
  /** Type-specific fields, e.g. `chassisNumber`, `insurer`, `product`. */
  details: Record<string, string>;
  /** Ids of records this one points at. Stored one way. */
  links: string[];
  customFields: KeeperField[];
  createdAt: string;
  updatedAt: string;
}

export interface KeeperRecordInput {
  id: string;
  documentType: KeeperDocumentType;
  personId: string | null;
  number: string;
  /** Sent as full KeeperDate objects; the backend only reads the
   * calendar/year/month/day fields and recomputes ad/bs itself. */
  issuedDate: KeeperDate | null;
  expiryDate: KeeperDate | null;
  recurrence: KeeperRecurrence;
  remindDays: number[];
  office: string;
  note: string;
  details: Record<string, string>;
  links: string[];
  customFields: KeeperField[];
  createdAt: string;
}

export type KeeperOwnerKind = "record" | "item";

/** A photo on a document or reminder. The full image is fetched separately. */
export interface KeeperAttachment {
  id: string;
  ownerKind: KeeperOwnerKind;
  ownerId: string;
  width: number;
  height: number;
  /** A small JPEG as a data URL, ready for an `<img>`. */
  thumbnail: string;
  createdAt: string;
}

/** One document's or reminder's photo count and first thumbnail. */
export interface KeeperAttachmentSummary {
  ownerId: string;
  count: number;
  thumbnail: string;
}

export interface KeeperSnapshot {
  people: KeeperPerson[];
  items: KeeperItem[];
  records: KeeperRecord[];
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
  ipoClosingDay: boolean;
  /** Master switch for SIP payment reminders; each fund's is opt-in. */
  sipPayment: boolean;
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

  keeperSnapshot: () => invoke<KeeperSnapshot>("keeper_snapshot"),
  resolveKeeperDate: (input: KeeperDateInput) =>
    invoke<KeeperDate>("resolve_keeper_date", { input }),
  saveKeeperPerson: (person: KeeperPerson) =>
    invoke<KeeperSnapshot>("save_keeper_person", { person }),
  deleteKeeperPerson: (id: string) => invoke<KeeperSnapshot>("delete_keeper_person", { id }),
  saveKeeperItem: (item: KeeperItem) => invoke<KeeperSnapshot>("save_keeper_item", { item }),
  deleteKeeperItem: (id: string) => invoke<KeeperSnapshot>("delete_keeper_item", { id }),
  saveKeeperRecord: (record: KeeperRecordInput) =>
    invoke<KeeperSnapshot>("save_keeper_record", { record }),
  deleteKeeperRecord: (id: string) => invoke<KeeperSnapshot>("delete_keeper_record", { id }),
  advanceKeeperRecord: (id: string) => invoke<KeeperSnapshot>("advance_keeper_record", { id }),
  completeKeeperItem: (id: string) => invoke<KeeperSnapshot>("complete_keeper_item", { id }),
  listKeeperAttachments: (ownerKind: KeeperOwnerKind, ownerId: string) =>
    invoke<KeeperAttachment[]>("list_keeper_attachments", { ownerKind, ownerId }),
  summarizeKeeperAttachments: (ownerKind: KeeperOwnerKind) =>
    invoke<KeeperAttachmentSummary[]>("summarize_keeper_attachments", { ownerKind }),
  addKeeperAttachmentsFromPaths: (ownerKind: KeeperOwnerKind, ownerId: string, paths: string[]) =>
    invoke<KeeperAttachment[]>("add_keeper_attachments_from_paths", { ownerKind, ownerId, paths }),
  /** Raw bytes as the body — a pasted screenshot, without a JSON number array. */
  addKeeperAttachmentBytes: (ownerKind: KeeperOwnerKind, ownerId: string, bytes: Uint8Array) =>
    invoke<KeeperAttachment>("add_keeper_attachment_bytes", bytes, {
      headers: { "x-owner-kind": ownerKind, "x-owner-id": ownerId },
    }),
  /** The stored JPEG. */
  getKeeperAttachment: (id: string) => invoke<ArrayBuffer>("get_keeper_attachment", { id }),
  deleteKeeperAttachment: (id: string) => invoke<void>("delete_keeper_attachment", { id }),
  rotateKeeperAttachment: (id: string) =>
    invoke<KeeperAttachment>("rotate_keeper_attachment", { id }),
  exportKeeperAttachment: (id: string, destination: string) =>
    invoke<void>("export_keeper_attachment", { id, destination }),
  discardKeeperAttachments: (ownerKind: KeeperOwnerKind, ownerId: string) =>
    invoke<void>("discard_keeper_attachments", { ownerKind, ownerId }),
  openKeeperViewer: (ownerKind: KeeperOwnerKind, ownerId: string, index: number) =>
    invoke<void>("open_keeper_viewer", { ownerKind, ownerId, index }),

  getSetting: <T>(key: string) => invoke<T | null>("get_setting", { key }),
  setSetting: (key: string, value: unknown) => invoke<void>("set_setting", { key, value }),
  deleteSetting: (key: string) => invoke<void>("delete_setting", { key }),

  usageInsightsEnabled: () => invoke<boolean>("usage_insights_enabled"),
  setUsageInsightsEnabled: (enabled: boolean) =>
    invoke<boolean>("set_usage_insights_enabled", { enabled }),

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

  exportBackup: (destination: string) => invoke<void>("export_backup", { destination }),
  importBackup: (source: string) => invoke<{ database: boolean }>("import_backup", { source }),
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
  stockPortfolio: (prices: StockPrice[]) => invoke<StockPortfolio>("stock_portfolio", { prices }),
  estimateStockTrade: (
    id: string | null,
    symbol: string,
    kind: StockTransactionKind,
    source: StockAcquisitionSource | null,
    tradeDate: string,
    quantity: number,
    price: number,
    fees: number | null,
  ) =>
    invoke<StockTradeEstimate>("estimate_stock_trade", {
      id,
      symbol,
      kind,
      source,
      tradeDate,
      quantity,
      price,
      fees,
    }),
  saveStockTransaction: (
    input: {
      id: string;
      symbol: string;
      kind: StockTransactionKind;
      source: StockAcquisitionSource | null;
      tradeDate: string;
      quantity: number;
      price: number;
      fees: number | null;
      note: string;
    },
    prices: StockPrice[],
  ) => invoke<StockPortfolio>("save_stock_transaction", { ...input, prices }),
  deleteStockTransaction: (id: string, prices: StockPrice[]) =>
    invoke<StockPortfolio>("delete_stock_transaction", { id, prices }),
  /** CDSC's current-issue list; cached for half an hour, `refresh` forces a live pull. */
  getIpos: (refresh = false) => invoke<LoadState<IpoSnapshot>>("get_ipos", { refresh }),
  /** ShareHub's upcoming book closures; cached for an hour, `refresh` forces a live pull. */
  getDividends: (refresh = false) =>
    invoke<LoadState<DividendSnapshot>>("get_dividends", { refresh }),
  /** Every mutual fund's latest NAV, from ShareHub or ShareSansar; `refresh` forces a live pull. */
  getMutualFunds: (refresh = false) =>
    invoke<LoadState<MutualFundSnapshot>>("get_mutual_funds", { refresh }),
  /** Every fund's SIP payment schedule, soonest first. Each change below
   * answers with the same list, already updated. */
  sipStatuses: () => invoke<SipStatus[]>("sip_statuses"),
  setSip: (
    symbol: string,
    name: string,
    day: number,
    amount: number | null,
    remindDays: number[],
  ) => invoke<SipStatus[]>("set_sip", { symbol, name, day, amount, remindDays }),
  removeSip: (symbol: string) => invoke<SipStatus[]>("remove_sip", { symbol }),
  markSipPaid: (symbol: string) => invoke<SipStatus[]>("mark_sip_paid", { symbol }),
  remindSipTomorrow: (symbol: string) => invoke<SipStatus[]>("remind_sip_tomorrow", { symbol }),
  /** NEPSE a minute at a time through its latest session, from ShareHub. */
  getNepseIntraday: (refresh = false) =>
    invoke<LoadState<IndexIntraday>>("get_nepse_intraday", { refresh }),

  getRashifal: (refresh = false) =>
    invoke<LoadState<RashifalSnapshot>>("get_rashifal", { refresh }),

  /** Weather for a place id; the home place when `location` is left out. */
  getWeather: (refresh = false, location?: string) =>
    invoke<LoadState<WeatherSnapshot>>("get_weather", { refresh, location }),
  /** Every place weather can be shown for, bundled in the app. */
  listPlaces: () => invoke<Place[]>("list_places"),

  getForex: (refresh = false) => invoke<LoadState<ForexSnapshot>>("get_forex", { refresh }),

  getNews: (refresh = false) => invoke<LoadState<NewsDigest>>("get_news", { refresh }),
  getAnnouncement: (refresh = false) =>
    invoke<LoadState<AnnouncementResponse>>("get_announcement", { refresh }),
  /** The source picker's options — static, named in Rust. */
  newsSources: () => invoke<NewsSourceInfo[]>("news_sources"),

  getStations: (refresh = false) => invoke<LoadState<RadioDirectory>>("get_stations", { refresh }),
  /** Resolved per station, on play — the directory lists around 270 of them. */
  stationStream: (slug: string) => invoke<string>("station_stream", { slug }),

  /** Redraws the menu-bar label after a preference it reads has changed. */
  refreshTray: () => invoke<void>("refresh_tray"),
  /** Shows "Restart to update" in the tray menu, or removes it with `null`. */
  setTrayUpdate: (label: string | null) => invoke<void>("set_tray_update", { label }),

  /** The popover is alwaysOnTop, so it must dismiss itself after opening an
   * external link or it buries the newly opened browser window. */
  openExternalUrl: (url: string) => invoke<void>("open_external_url", { url }),
  hidePopover: () => invoke<void>("hide_popover"),
  pinPopover: (pinned: boolean) => invoke<void>("pin_popover", { pinned }),
};
