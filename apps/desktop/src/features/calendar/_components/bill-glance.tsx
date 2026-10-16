import { useNavigate } from "react-router";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import { useBoidReport } from "../../bazar/boid-due";
import { dueLine, dueToneOf, rupees, useElectricity } from "../../bills/electricity-due";
import { internetTone, soonest, useInternet } from "../../bills/internet-due";

/**
 * The electricity bill on the home screen, only while there is one to pay:
 * the amount, and what paying it now costs. Paid, or never set up, and it is
 * not there at all. Tap it for the bill in Bills & status.
 */
export function BillGlance() {
  return (
    <>
      <ElectricityGlance />
      <InternetGlance />
      <AllotmentGlance />
    </>
  );
}

/** A newly found IPO allotment, for the fortnight it counts as new. */
function AllotmentGlance() {
  const { t, modules } = useSettings();
  const navigate = useNavigate();
  const { data } = useBoidReport();
  const report = loadedValue(data);
  const fresh = report?.ipos.filter((ipo) => ipo.isNew) ?? [];
  const first = fresh[0];
  const holder = first?.holders.find((h) => h.isNew);
  if (!modules.bazarEnabled || !first || holder?.allotted == null) return null;
  const named = (report?.accounts.length ?? 0) > 1;

  return (
    <button
      type="button"
      onClick={() => navigate("/bazar?tab=stocks&view=nepse&boid=1")}
      className="surface-card flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Icon name="interest" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold">
          {(named
            ? t("boid.glance-named").replace("{name}", holder.name)
            : t("boid.glance")
          ).replace("{n}", String(holder.allotted))}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-text-secondary">
          {first.company}
          {fresh.length > 1 && ` +${fresh.length - 1}`}
        </span>
      </span>
      <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
    </button>
  );
}

/** WorldLink on the home screen, only when an account's renewal is a week
 * away or past: the one that runs out first. */
function InternetGlance() {
  const { t, modules } = useSettings();
  const navigate = useNavigate();
  const { data } = useInternet();
  const first = data ? soonest(data) : undefined;
  if (!modules.billsEnabled || !first) return null;
  const { account, status } = first;
  const days = status.daysLeft ?? 0;
  const named = (data?.length ?? 0) > 1;

  return (
    <button
      type="button"
      onClick={() =>
        navigate(`/bills?open=internet&username=${encodeURIComponent(account.username)}`)
      }
      className="surface-card flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Icon name="wifi" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold">
          {named
            ? t("internet.glance-named").replace("{name}", account.name)
            : t("internet.glance")}
        </span>
        <span className={`mt-0.5 block truncate text-[10.5px] font-medium ${internetTone(status)}`}>
          {status.disabled || days < 0
            ? t("internet.expired")
            : days === 0
              ? t("internet.last-day")
              : t("internet.days-left").replace("{n}", String(days))}
          {status.renewalRate != null && (
            <span className="text-text-muted"> · {rupees(status.renewalRate)}</span>
          )}
        </span>
      </span>
      <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
    </button>
  );
}

function ElectricityGlance() {
  const { t, modules } = useSettings();
  const navigate = useNavigate();
  const { data } = useElectricity();
  const due = loadedValue(data)?.due;
  if (!modules.billsEnabled || !due) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/bills?open=electricity")}
      className="surface-card flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Icon name="bolt" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold">
          {t("electricity.glance").replace("{month}", due.month)}
          <span className="ml-1.5 tabular-nums">{rupees(due.withRebate ?? due.total)}</span>
        </span>
        <span className={`mt-0.5 block truncate text-[10.5px] font-medium ${dueToneOf(due)}`}>
          {dueLine(t, due)}
        </span>
      </span>
      <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
    </button>
  );
}
