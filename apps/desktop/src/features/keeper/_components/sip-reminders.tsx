import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { SipStatus } from "../../../types/api/SipStatus";
import { dueTone, type TFn } from "../_lib/shared";

const amountFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function when(t: TFn, days: number) {
  if (days === 0) return t("funds.sip-today");
  if (days === 1) return t("funds.sip-tomorrow");
  if (days > 1) return t("funds.sip-in-days").replace("{n}", String(days));
  if (days === -1) return t("funds.sip-missed-yesterday");
  return t("funds.sip-missed-days").replace("{n}", String(-days));
}

function SipDate({ sip }: { sip: SipStatus }) {
  const { language } = useSettings();
  const month = language === "ne" ? sip.dueBsMonthNe : sip.dueBsMonth;

  if (!sip.dueBs || !month) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-divider bg-surface-hover text-text-secondary">
        <Icon name="upcoming" className="size-3.5" />
      </span>
    );
  }

  return (
    <span className="flex size-8 shrink-0 flex-col items-center justify-center rounded-[5px] border border-divider bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)] leading-none text-accent-mark">
      <span className="text-[13px] font-semibold tabular-nums">{sip.dueBs.day}</span>
      <span className="mt-[2px] max-w-full truncate px-0.5 text-[8px] font-medium opacity-80">
        {month}
      </span>
    </span>
  );
}

/** The SIP schedules already owned by Bazar, presented alongside Keeper's
 * other reminders without copying them into a second store or notifying twice. */
export function SipReminders({
  sips,
  onOpen,
  onAdd,
  t,
}: {
  sips: readonly SipStatus[];
  onOpen: (symbol: string) => void;
  onAdd: () => void;
  t: TFn;
}) {
  return (
    <div className="space-y-2.5">
      <section className="surface-card px-3">
        {sips.map((sip) => (
          <button
            key={sip.symbol}
            type="button"
            onClick={() => onOpen(sip.symbol)}
            className="group flex w-full items-center gap-2.5 border-b border-divider py-2.5 text-left last:border-0"
          >
            <SipDate sip={sip} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium">{sip.name}</span>
              <span className="mt-0.5 block truncate text-[10px] text-text-muted">
                {sip.symbol}
                {sip.amount != null && ` · Rs ${amountFormat.format(sip.amount)}`}
                {` · ${t("keeper.recurrence.monthly")}`}
              </span>
            </span>
            <span className={`shrink-0 text-[10px] font-medium tabular-nums ${dueTone(sip.days)}`}>
              {when(t, sip.days)}
            </span>
            <Icon
              name="chevronLeft"
              className="size-2.5 shrink-0 rotate-180 text-text-muted transition-transform group-hover:translate-x-0.5"
            />
          </button>
        ))}
      </section>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1 px-0.5 text-[10px] font-medium text-accent-mark hover:underline"
      >
        <Icon name="plus" className="size-2.5" />
        {t("keeper.sip.add-another")}
      </button>
      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">
        {t("keeper.sip.source-note")}
      </p>
    </div>
  );
}

export function SipGroupRow({
  sips,
  onOpen,
  t,
}: {
  sips: readonly SipStatus[];
  onOpen: () => void;
  t: TFn;
}) {
  const next = sips[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 border-b border-divider py-2.5 text-left last:border-0"
    >
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-divider bg-surface-hover text-accent-mark">
        <Icon name="banknote" className="size-3.5" />
        <span className="absolute -top-1 -right-1 min-w-3.5 rounded-full bg-accent-fill px-1 text-center text-[8px] font-bold leading-3.5 text-accent-ink tabular-nums">
          {sips.length}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">{t("keeper.sip.title")}</span>
        <span className="mt-0.5 block truncate text-[10px] text-text-muted">
          {sips.map((sip) => sip.name).join(" · ")}
        </span>
      </span>
      {next && (
        <span className={`shrink-0 text-[10px] font-medium tabular-nums ${dueTone(next.days)}`}>
          {when(t, next.days)}
        </span>
      )}
    </button>
  );
}
