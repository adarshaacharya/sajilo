import { useEffect, useState } from "react";
import { BackButton } from "../../../shared/components/back-button";
import { CONTROL } from "../../../shared/components/control";
import { useSettings } from "../../../shared/context/settings-context";
import { openExternalLink } from "../../../shared/lib/external-link";
import type { MutualFund } from "../../../types/api/MutualFund";
import { money } from "../_lib/format";
import {
  headlineNav,
  monthYear,
  navFormat,
  navMove,
  rupeesCompact,
  unitValue,
  useSips,
} from "../_lib/funds";
import { issueDate } from "../_lib/ipo";
import { FollowButton } from "./follow-button";
import { FundBadge, NavDate } from "./fund-row";
import { SipSetup } from "./sip-setup";

/** Shares are counted whole, grouped the Nepali way: 78,73,248. */
const shareCount = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function FundDetail({
  fund,
  today,
  followed,
  units,
  onBack,
  onToggle,
  onUnits,
}: {
  fund: MutualFund;
  today: number;
  followed: boolean;
  units: number;
  onBack: () => void;
  onToggle: () => void;
  onUnits: (units: number) => void;
}) {
  const { t, language } = useSettings();
  const sips = useSips();
  const move = navMove(fund);
  const closed = fund.kind === "closedEnd";
  const matured = fund.kind === "matured";
  const date = (iso: string) => issueDate(iso, language) ?? iso;

  // The field holds what is typed, so "12." survives until the next digit;
  // only a parsed number is saved. It follows the stored value only when that
  // says something else, e.g. once the saved holdings finish loading.
  const [draft, setDraft] = useState(units > 0 ? String(units) : "");
  useEffect(() => {
    setDraft((current) => ((Number(current) || 0) === units ? current : String(units || "")));
  }, [units]);

  const worth = units > 0 ? units * unitValue(fund) : null;
  const weekly = fund.kind === "openEnd" && move && units > 0 ? units * move.change : null;

  const tiles = [
    fund.daily && {
      label: t("funds.nav-daily"),
      nav: fund.daily.nav,
      note: date(fund.daily.date),
    },
    fund.weekly && {
      label: t("funds.nav-weekly"),
      nav: fund.weekly.nav,
      note: date(fund.weekly.date),
    },
    fund.monthly && {
      label: t("funds.monthly"),
      nav: fund.monthly.nav,
      note: `${language === "ne" ? fund.monthly.monthNameNe : fund.monthly.monthName} ${fund.monthly.bsYear}`,
    },
  ].filter((tile): tile is { label: string; nav: number; note: string } => Boolean(tile));

  const facts = [
    closed &&
      fund.ltp != null && {
        label: t("funds.ltp"),
        // The day it last traded: a thin fund's price, and so its discount,
        // can be days old.
        value: fund.ltpDate
          ? `Rs ${navFormat.format(fund.ltp)} · ${t("funds.as-of").replace("{date}", date(fund.ltpDate))}`
          : `Rs ${navFormat.format(fund.ltp)}`,
      },
    fund.fundSize != null && {
      label: t("funds.fund-size"),
      value: rupeesCompact(fund.fundSize, language),
    },
    fund.holdings != null && {
      label: t("funds.holdings"),
      value: t("funds.holdings-count").replace("{n}", String(fund.holdings)),
    },
    fund.heldShares != null && {
      label: t("funds.held-shares"),
      value: `${shareCount.format(fund.heldShares)} ${t("funds.shares-unit")}`,
    },
    // A matured scheme already says when it matured, under its NAV.
    !matured &&
      fund.maturityDate && {
        label: t("funds.matures"),
        value: monthYear(fund.maturityDate, language),
      },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

  return (
    <div className="space-y-2.5">
      <section className="surface-card p-2.5">
        <div className="flex items-start gap-2">
          <BackButton onClick={onBack} />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight">{fund.name}</p>
            <p className="mt-0.5 text-[10px] text-text-muted">
              {fund.symbol} ·{" "}
              {t(matured ? "funds.kind-matured" : closed ? "funds.kind-closed" : "funds.kind-open")}
            </p>
          </div>
          <FollowButton followed={followed} onToggle={onToggle} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-[28px] font-semibold leading-none tabular-nums">
            Rs {navFormat.format(headlineNav(fund))}
          </p>
          <FundBadge fund={fund} />
        </div>
        <p className="mt-1.5 text-[11px] text-text-muted tabular-nums">
          {!matured && `${t("funds.latest-nav")} · `}
          <NavDate fund={fund} today={today} />
          {move &&
            fund.previous &&
            ` · ${t("funds.since").replace("{date}", date(fund.previous.date))}`}
        </p>

        {tiles.length > 0 && (
          <div className="section-divider mt-2.5 grid grid-cols-3 gap-2 pt-2">
            {tiles.map((tile) => (
              <div key={tile.label}>
                <p className="text-[10px] text-text-muted">{tile.label}</p>
                <p className="text-[13px] font-semibold tabular-nums">
                  Rs {navFormat.format(tile.nav)}
                </p>
                <p className="text-[10px] text-text-muted tabular-nums">{tile.note}</p>
              </div>
            ))}
          </div>
        )}

        {facts.length > 0 && (
          <div className="section-divider mt-2.5 grid grid-cols-2 gap-2 pt-2">
            {facts.map((fact) => (
              <div key={fact.label}>
                <p className="text-[10px] text-text-muted">{fact.label}</p>
                <p className="text-[11px] font-medium tabular-nums">{fact.value}</p>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            openExternalLink(`https://www.sharesansar.com/company/${fund.symbol.toLowerCase()}`)
          }
          className="mt-2 text-[11px] text-[color:var(--color-accent-mark)] hover:opacity-80"
        >
          {t("stocks.open-sharesansar")}
        </button>
      </section>

      <section className="surface-card p-2.5">
        <p className="mb-2 text-[11px] font-semibold text-text-secondary">{t("funds.units")}</p>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={draft}
          placeholder="0"
          aria-label={t("funds.units")}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onUnits(parsed);
          }}
          className={`${CONTROL} w-full tabular-nums`}
        />
        {worth != null && (
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-text-muted">
              {t(matured ? "funds.worth-refund" : closed ? "funds.worth-at-ltp" : "funds.worth")}
            </span>
            <span className="text-[16px] font-semibold tabular-nums">Rs {money.format(worth)}</span>
          </div>
        )}
        {weekly != null && Math.abs(weekly) >= 0.005 && (
          <p
            className={`mt-0.5 text-right text-[11px] tabular-nums ${weekly > 0 ? "text-positive" : "text-holiday"}`}
          >
            {weekly > 0 ? "+" : "−"}Rs {money.format(Math.abs(weekly))} {t("funds.this-week")}
          </p>
        )}
        {fund.kind === "openEnd" && (
          <SipSetup
            sip={sips.of(fund.symbol)}
            onSet={(day, amount) => {
              // A SIP belongs with the funds you keep, where its countdown shows.
              if (!followed) onToggle();
              sips.set(fund.symbol, fund.name, day, amount);
            }}
            onRemove={() => sips.remove(fund.symbol)}
          />
        )}
        <p className="mt-2 text-[10px] text-text-muted">{t("funds.on-device")}</p>
      </section>
    </div>
  );
}
