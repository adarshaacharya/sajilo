import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Icon, type IconName } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type KeeperSnapshot, type NepaliDate } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import type { IpoSnapshot } from "../../../types/api/IpoSnapshot";
import type { LoadState } from "../../../types/api/LoadState";
import { money } from "../../bazar/_lib/format";
import { sipIsClose, sipWhen, useSips } from "../../bazar/_lib/funds";
import {
  companyName,
  groupIssues,
  nepalToday,
  ratioText,
  shortCompanyName,
  subscriptionRatio,
} from "../../bazar/_lib/ipo";
import { useAppliedIpos } from "../../bazar/_lib/ipo-applied";
import { phaseLabel } from "../../bazar/_lib/ipo-labels";
import { personName, recordName } from "../../keeper/_lib/documents";
import { dueLabel } from "../../keeper/_lib/shared";
import { upcomingOf } from "../../keeper/_lib/upcoming";

/** Home is a glance: only what's due within a week earns a row. Keeper's own
 * list looks further ahead. */
const KEEPER_HORIZON_DAYS = 7;

/** Enough to glance over without the card crowding the home screen; the
 * rest lives on each item's own screen. */
const MAX_ROWS = 4;

type Row = {
  id: string;
  icon: IconName;
  title: string;
  detail: string | null;
  when: string;
  urgent: boolean;
  open: () => void;
};

/**
 * The home screen's "what's coming" list.
 *
 * The next observances by name, the IPO you can still apply to while one is
 * open, whatever Keeper has due this week, and a SIP payment close at hand —
 * each a row, all visible at once. It used to be one row taking turns, which
 * hid most of them most of the time and made the events screen, reachable
 * only through it, a wait. Anything due today leads, in gold; then the next
 * observance, the next public holiday, and the rest. "All events" is always
 * in the header.
 */
export function UpNext({
  events,
}: {
  events: { name: string; when: string; holiday: boolean; date: NepaliDate }[];
}) {
  const { t, numerals, modules } = useSettings();
  const navigate = useNavigate();
  const { applied, loaded } = useAppliedIpos();
  const [ipos, setIpos] = useState<LoadState<IpoSnapshot>>();
  const [keeper, setKeeper] = useState<KeeperSnapshot>();
  const { sips } = useSips();

  useEffect(() => {
    if (!modules.keeperEnabled) return;
    api
      .keeperSnapshot()
      .then(setKeeper)
      .catch(() => {});
  }, [modules.keeperEnabled]);

  useEffect(() => {
    if (!modules.bazarEnabled) return;
    api
      .getIpos(false)
      .then(setIpos)
      .catch(() => {});
  }, [modules.bazarEnabled]);

  const today = nepalToday();
  // Only a fresh list may put a deadline on home. CDSC closes an oversubscribed
  // issue early, so an older copy could call an issue open after it shut —
  // Bazar still shows that copy, labelled; home just stays quiet.
  const open = useMemo(() => {
    if (!modules.bazarEnabled || !loaded || ipos?.status !== "fresh") return [];
    return groupIssues(ipos.value.issues, today).open.filter(
      (entry) => entry.issue.openToPublic && !applied.has(entry.key),
    );
  }, [applied, ipos, loaded, modules.bazarEnabled, today]);

  const count = (n: number) => digits(n, numerals);
  const upcoming: Row[] = [];
  const soonest = open[0];
  let ipoRow: Row | null = null;

  if (soonest) {
    const urgent = soonest.phase.kind === "open" && soonest.phase.daysLeft === 0;
    const name = soonest.issue.symbol ?? shortCompanyName(companyName(soonest.issue));
    const when = phaseLabel(soonest.phase, t, count) ?? "";

    if (open.length === 1) {
      const ratio = subscriptionRatio(soonest.issue);
      ipoRow = {
        id: `ipo:${soonest.key}`,
        icon: "interest",
        title: t("dashboard.ipo-title").replace("{name}", name),
        detail: ratio != null ? t("stocks.ipo-subscribed").replace("{x}", ratioText(ratio)) : null,
        when,
        urgent,
        open: () => navigate(`/bazar?tab=stocks&ipo=${encodeURIComponent(soonest.key)}`),
      };
    } else {
      ipoRow = {
        id: `ipos:${open.map((entry) => entry.key).join("|")}`,
        icon: "interest",
        title: t("dashboard.ipos-open").replace("{n}", count(open.length)),
        detail: name,
        when,
        urgent,
        open: () => navigate("/bazar?tab=stocks&ipos=1"),
      };
    }
  }

  const due =
    modules.keeperEnabled && keeper
      ? upcomingOf(keeper.records, keeper.items).filter(
          (entry) => entry.days <= KEEPER_HORIZON_DAYS,
        )
      : [];
  let keeperRow: Row | null = null;
  const first = due[0];
  if (first) {
    const name = first.record ? recordName(t, first.record) : (first.item?.title ?? "");
    const personId = first.record?.personId ?? first.item?.personId ?? null;
    keeperRow = {
      id: `keeper:${due.map((entry) => `${entry.key}:${entry.days}`).join("|")}`,
      icon: "keeper",
      title: due.length === 1 ? name : t("dashboard.keeper-due").replace("{n}", count(due.length)),
      detail:
        due.length === 1 ? (personId ? personName(t, keeper?.people ?? [], personId) : null) : name,
      when: dueLabel(t, first.days),
      // Today, tomorrow, or already late: lead with it.
      urgent: first.days <= 1,
      open: () => navigate("/keeper"),
    };
  }

  // A SIP payment three days out or less, from the same schedule the funds
  // screen counts down. Due today, or missed and still owed, leads the row.
  const sipDue = modules.bazarEnabled ? sips.filter(sipIsClose) : [];
  let sipRow: Row | null = null;
  const nextSip = sipDue[0];
  if (nextSip) {
    const urgent = nextSip.days <= 0;
    sipRow = {
      id: `sip:${sipDue.map((sip) => `${sip.symbol}:${sip.due}`).join("|")}`,
      icon: "banknote",
      title:
        sipDue.length === 1
          ? t("dashboard.sip-title").replace("{name}", nextSip.name)
          : t("funds.sip-chip-many").replace("{n}", count(sipDue.length)),
      detail: sipDue.length === 1 && nextSip.amount ? `Rs ${money.format(nextSip.amount)}` : null,
      when: sipWhen(t, nextSip.days),
      urgent,
      open: () => navigate("/bazar?tab=stocks&view=funds"),
    };
  }

  if (sipRow?.urgent) upcoming.push(sipRow);
  if (keeperRow?.urgent) upcoming.push(keeperRow);
  if (ipoRow?.urgent) upcoming.push(ipoRow);
  for (const event of events) {
    upcoming.push({
      id: `event:${event.holiday ? "holiday" : "day"}:${event.name}:${event.when}`,
      icon: event.holiday ? "holiday" : "festival",
      title: event.name,
      detail: event.holiday ? t("calendar.public-holiday") : null,
      when: event.when,
      urgent: false,
      open: () => navigate(`/day?y=${event.date.year}&m=${event.date.month}&d=${event.date.day}`),
    });
  }
  if (ipoRow && !ipoRow.urgent) upcoming.push(ipoRow);
  if (keeperRow && !keeperRow.urgent) upcoming.push(keeperRow);
  if (sipRow && !sipRow.urgent) upcoming.push(sipRow);

  const rows = upcoming.slice(0, MAX_ROWS);
  if (rows.length === 0) return null;

  return (
    <section aria-label={t("dashboard.up-next")} className="surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-2 pb-1.5">
        <h2 className="text-[10px] font-normal text-text-muted">{t("dashboard.up-next")}</h2>
        <button
          type="button"
          onClick={() => navigate("/events")}
          className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-text"
        >
          {t("dashboard.all-events")}
          <span aria-hidden className="text-[12px] leading-none">
            ›
          </span>
        </button>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="section-divider">
            <button
              type="button"
              onClick={row.open}
              className="flex h-8 w-full cursor-pointer items-center gap-2 px-2.5 text-left transition-colors hover:bg-surface-hover active:bg-surface-hover"
            >
              <Icon
                name={row.icon}
                className="size-3.5 shrink-0 text-[color:var(--color-accent-mark)]"
              />
              <span className="min-w-0 flex-1 truncate text-[12px]">
                {row.title}
                {row.detail && (
                  <span className="ml-1.5 text-[10px] text-text-muted">{row.detail}</span>
                )}
              </span>
              <span
                className={`flex shrink-0 items-center gap-1 text-[11px] ${
                  row.urgent
                    ? "font-medium text-[color:var(--color-accent-mark)]"
                    : "text-text-muted"
                }`}
              >
                {row.when}
                <span aria-hidden className="text-[13px] leading-none">
                  ›
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
