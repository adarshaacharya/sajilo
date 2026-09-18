import { useSettings } from "../../../shared/context/settings-context";
import type { MutualFund } from "../../../types/api/MutualFund";
import type { SipStatus } from "../../../types/api/SipStatus";
import { money } from "../_lib/format";
import {
  headlineNav,
  isLate,
  monthYear,
  navAgeDays,
  navFormat,
  navMove,
  sipDueDate,
  sipIsClose,
  sipWhen,
} from "../_lib/funds";
import { issueDate } from "../_lib/ipo";
import { ChangeBadge } from "./change-badge";
import { FollowButton } from "./follow-button";
import { FundLogo } from "./fund-logo";

/**
 * A closed-end fund's market price against its NAV. Below NAV is the usual
 * state on NEPSE and not a loss, so it is tinted as a fact rather than a fall.
 */
export function PremiumBadge({ percent }: { percent: number }) {
  const { t } = useSettings();
  const shown = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
    Math.abs(percent),
  );
  return (
    <span className="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text-secondary">
      {t(percent < 0 ? "funds.discount" : "funds.premium").replace("{n}", shown)}
    </span>
  );
}

/**
 * The fund's latest NAV date, and how late it is once it has been missed. A
 * matured scheme shows when it matured instead: its last NAV is final.
 * `labelled` says what the date is ("NAV of Sep 17"), for where nothing
 * around it does.
 */
export function NavDate({
  fund,
  today,
  labelled = false,
}: {
  fund: MutualFund;
  today: number;
  labelled?: boolean;
}) {
  const { t, language } = useSettings();
  if (fund.kind === "matured" && fund.maturityDate) {
    return (
      <span>{t("funds.matured-on").replace("{date}", monthYear(fund.maturityDate, language))}</span>
    );
  }
  const age = navAgeDays(fund, today);
  const late = isLate(fund, age);
  const date = issueDate(fund.latest.date, language) ?? fund.latest.date;
  return (
    <span className={late ? "text-[color:var(--color-accent-mark)]" : undefined}>
      {labelled ? t("funds.nav-of").replace("{date}", date) : date}
      {late && ` · ${t("funds.days-old").replace("{n}", String(age))}`}
    </span>
  );
}

/** What sits under a fund's NAV: its weekly move, its discount, or what the figure is. */
export function FundBadge({ fund }: { fund: MutualFund }) {
  const { t } = useSettings();
  const move = navMove(fund);
  switch (fund.kind) {
    case "closedEnd":
      return fund.premiumPercent != null ? <PremiumBadge percent={fund.premiumPercent} /> : null;
    case "matured":
      return (
        <span className="shrink-0 text-[10px] text-text-muted">
          {t(fund.refundNav != null ? "funds.refund-nav" : "funds.final-nav")}
        </span>
      );
    default:
      return move ? (
        <ChangeBadge change={move.change} previous={move.previous} percentOnly />
      ) : null;
  }
}

/** The row's second line for a fund with a SIP: when it is paid next, amber
 * once the payment is close. */
function SipLine({ sip }: { sip: SipStatus }) {
  const { t, language } = useSettings();
  const close = sipIsClose(sip);
  const amount = sip.amount ? ` Rs ${money.format(sip.amount)}` : "";
  return (
    <span className={close ? "text-[color:var(--color-accent-mark)]" : undefined}>
      {t("funds.sip-short")}
      {amount} · {sipDueDate(sip, language)}
      {close && ` · ${sipWhen(t, sip.days)}`}
    </span>
  );
}

export function FundRow({
  fund,
  today,
  followed,
  sip,
  onOpen,
  onToggle,
}: {
  fund: MutualFund;
  today: number;
  followed: boolean;
  /** Shown instead of the NAV date, in "Your funds". */
  sip?: SipStatus;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="row-line flex items-center gap-1 py-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-hover"
      >
        <FundLogo url={fund.logoUrl} symbol={fund.symbol} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{fund.name}</span>
          <span className="block truncate text-[10px] text-text-muted tabular-nums">
            {sip ? (
              <SipLine sip={sip} />
            ) : (
              <>
                {fund.symbol} · <NavDate fund={fund} today={today} labelled />
              </>
            )}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-[13px] font-medium tabular-nums">
            Rs {navFormat.format(headlineNav(fund))}
          </span>
          <FundBadge fund={fund} />
        </span>
      </button>
      <FollowButton followed={followed} onToggle={onToggle} />
    </div>
  );
}
