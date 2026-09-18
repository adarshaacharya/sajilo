import { useEffect, useState } from "react";
import useSWR from "swr";
import type { Language } from "../../../shared/lib/i18n";
import { api } from "../../../shared/lib/ipc";
import type { MutualFund } from "../../../types/api/MutualFund";
import type { SipStatus } from "../../../types/api/SipStatus";
import { daysUntil } from "./ipo";

/**
 * Presentation helpers for the mutual funds view.
 *
 * Every fund carries its own NAV date: most managers publish daily, a few only
 * weekly, and some fall behind. The view compares each fund against its own
 * dates rather than one "as of" for the whole list.
 */

/**
 * Past this many days a NAV has been missed, not merely not yet published. A
 * scheme that publishes daily is late within the week; one that publishes only
 * each Friday is a week old by design, so it is late once it misses one.
 */
const LATE_AFTER_DAYS = { daily: 5, weekly: 10 };

export function isLate(fund: MutualFund, ageDays: number | null): boolean {
  // A matured scheme has stopped publishing for good; its last NAV is final.
  if (fund.kind === "matured") return false;
  return ageDays != null && ageDays > LATE_AFTER_DAYS[fund.daily ? "daily" : "weekly"];
}

/** NAVs are quoted to the paisa, so 10.1 reads 10.10 like its neighbours. */
export const navFormat = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type NavMove = { change: number; previous: number };

/** How far the latest NAV moved from the weekly one before it, if the fund published both. */
export function navMove(fund: MutualFund): NavMove | null {
  if (!fund.previous) return null;
  return { change: fund.latest.nav - fund.previous.nav, previous: fund.previous.nav };
}

function movePercent(move: NavMove | null): number | null {
  return move && move.previous > 0 ? (move.change / move.previous) * 100 : null;
}

/** Whole days since the fund's latest NAV, against today in Kathmandu. */
export function navAgeDays(fund: MutualFund, today: number): number | null {
  const until = daysUntil(fund.latest.date, today);
  return until == null ? null : -until;
}

export function searchFunds(funds: readonly MutualFund[], query: string): MutualFund[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...funds];
  return funds.filter(
    (fund) =>
      fund.symbol.toLowerCase().includes(needle) || fund.name.toLowerCase().includes(needle),
  );
}

/** Open-end: biggest move this week first; a fund with nothing to compare goes last. */
export function byWeeklyMove(a: MutualFund, b: MutualFund): number {
  const left = movePercent(navMove(a));
  const right = movePercent(navMove(b));
  if (left == null || right == null) return left == null ? (right == null ? 0 : 1) : -1;
  return right - left;
}

/** Closed-end: deepest discount first, since that is what a buyer on NEPSE is looking for. */
export function byDiscount(a: MutualFund, b: MutualFund): number {
  const left = a.premiumPercent;
  const right = b.premiumPercent;
  if (left == null || right == null) return left == null ? (right == null ? 0 : 1) : -1;
  return left - right;
}

/** Matured: the most recently wound up first, since those are still being paid out. */
export function byMaturity(a: MutualFund, b: MutualFund): number {
  return (b.maturityDate ?? "").localeCompare(a.maturityDate ?? "");
}

/** Rupees the way Nepali finance pages state a fund's size: in arba or crore. */
export function rupeesCompact(amount: number, language: Language): string {
  const format = (value: number) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
  if (amount >= 1e9) {
    return `Rs ${format(amount / 1e9)} ${language === "ne" ? "अर्ब" : "arba"}`;
  }
  if (amount >= 1e7) {
    return `Rs ${format(amount / 1e7)} ${language === "ne" ? "करोड" : "crore"}`;
  }
  return `Rs ${format(amount)}`;
}

/**
 * What the holder values a unit at: the NAV for an open-end scheme, which is
 * what the manager redeems it for; the market price for a closed-end one,
 * which is what selling it on NEPSE would fetch; and the refund NAV for a
 * matured one, which is what winding it up pays.
 */
export function unitValue(fund: MutualFund): number {
  if (fund.kind === "closedEnd" && fund.ltp != null) return fund.ltp;
  if (fund.kind === "matured" && fund.refundNav != null) return fund.refundNav;
  return fund.latest.nav;
}

/** A matured scheme's headline figure is what it pays out, once that is published. */
export function headlineNav(fund: MutualFund): number {
  return fund.kind === "matured" && fund.refundNav != null ? fund.refundNav : fund.latest.nav;
}

/** `Aug 2026`, for maturity dates, which matter to the month. */
export function monthYear(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(language === "ne" ? "ne-NP-u-nu-latn" : "en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

const HOLDINGS_KEY = "fundHoldings";

/**
 * The funds the user keeps, and how many units of each. A starred fund with no
 * units yet is stored as 0. Kept on this device only, like the watchlist.
 */
export function useFundHoldings() {
  const [holdings, setHoldings] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    api
      .getSetting<Record<string, number>>(HOLDINGS_KEY)
      .then((saved) => {
        if (cancelled || !saved || typeof saved !== "object") return;
        const clean: Record<string, number> = {};
        for (const [symbol, units] of Object.entries(saved)) {
          if (typeof units === "number" && Number.isFinite(units) && units >= 0) {
            clean[symbol] = units;
          }
        }
        setHoldings(clean);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (next: (current: Record<string, number>) => Record<string, number>) => {
    setHoldings((current) => {
      const resolved = next(current);
      api.setSetting(HOLDINGS_KEY, resolved).catch(() => {});
      return resolved;
    });
  };

  const toggle = (symbol: string) =>
    update((current) => {
      if (symbol in current) {
        const { [symbol]: _, ...rest } = current;
        return rest;
      }
      return { ...current, [symbol]: 0 };
    });

  const setUnits = (symbol: string, units: number) =>
    update((current) => ({
      ...current,
      [symbol]: Number.isFinite(units) && units > 0 ? units : 0,
    }));

  return { holdings, toggle, setUnits };
}

/**
 * Every fund's SIP schedule, soonest payment first, with the setters that
 * change it. Each setter's answer is the whole updated list, so the countdown
 * everywhere redraws from one reply. Due dates and their BS days are worked out
 * in Rust; this only holds what came back.
 */
export function useSips() {
  const { data, mutate } = useSWR("sip-statuses", () => api.sipStatuses());
  const sips = data ?? [];
  const apply = (request: Promise<SipStatus[]>) =>
    mutate(request, { revalidate: false }).catch(() => {});

  return {
    sips,
    of: (symbol: string) => sips.find((sip) => sip.symbol === symbol),
    set: (symbol: string, name: string, day: number, amount: number | null) =>
      apply(api.setSip(symbol, name, day, amount)),
    remove: (symbol: string) => apply(api.removeSip(symbol)),
    markPaid: (symbol: string) => apply(api.markSipPaid(symbol)),
    remindTomorrow: (symbol: string) => apply(api.remindSipTomorrow(symbol)),
  };
}

/** Close enough to count down: three days out, or missed and still owed. */
export function sipIsClose(sip: SipStatus): boolean {
  return sip.days <= 3;
}

type SipKey =
  | "funds.sip-today"
  | "funds.sip-tomorrow"
  | "funds.sip-in-days"
  | "funds.sip-missed-yesterday"
  | "funds.sip-missed-days";

/** "in 3 days", "tomorrow", "today", "yesterday", "2 days ago". */
export function sipWhen(t: (key: SipKey) => string, days: number): string {
  if (days === 0) return t("funds.sip-today");
  if (days === 1) return t("funds.sip-tomorrow");
  if (days > 1) return t("funds.sip-in-days").replace("{n}", String(days));
  if (days === -1) return t("funds.sip-missed-yesterday");
  return t("funds.sip-missed-days").replace("{n}", String(-days));
}

/** `15th` in English; Nepali says the number alone, with तारिख after it. */
export function dayOfMonth(day: number, language: Language): string {
  if (language === "ne") return String(day);
  const tens = day % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  return `${day}${suffix}`;
}

/** `Thu, Oct 15` for the payment's AD date. */
export function sipDueDate(sip: SipStatus, language: Language): string {
  return new Intl.DateTimeFormat(language === "ne" ? "ne-NP-u-nu-latn" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${sip.due}T00:00:00Z`));
}

/** `Asoj 29` / `असोज 29`, from the BS day Rust sent. */
export function sipDueBs(sip: SipStatus, language: Language): string | null {
  const month = language === "ne" ? sip.dueBsMonthNe : sip.dueBsMonth;
  return sip.dueBs && month ? `${month} ${sip.dueBs.day}` : null;
}
