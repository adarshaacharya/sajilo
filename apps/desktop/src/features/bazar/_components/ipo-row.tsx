import { useSettings } from "../../../shared/context/settings-context";
import {
  companyName,
  type IpoPhase,
  issueDate,
  issueDetail,
  type PhasedIssue,
  ratioText,
  shortCompanyName,
  subscriptionRatio,
} from "../_lib/ipo";

type TFn = ReturnType<typeof useSettings>["t"];

export function phaseLabel(phase: IpoPhase, t: TFn): string | null {
  switch (phase.kind) {
    case "open":
      if (phase.daysLeft === 0) return t("stocks.ipo-closes-today");
      if (phase.daysLeft === 1) return t("stocks.ipo-closes-tomorrow");
      return t("stocks.ipo-closes-in").replace("{n}", String(phase.daysLeft));
    case "upcoming":
      if (phase.daysUntil === 1) return t("stocks.ipo-opens-tomorrow");
      return t("stocks.ipo-opens-in").replace("{n}", String(phase.daysUntil));
    case "closed":
      return t("stocks.ipo-closed");
    default:
      return null;
  }
}

/** Open is the one state worth the accent; the rest step back. */
export function PhasePill({ phase }: { phase: IpoPhase }) {
  const { t } = useSettings();
  const label = phaseLabel(phase, t);
  if (!label) return null;

  const tone =
    phase.kind === "open"
      ? "bg-[color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] text-[color:var(--color-accent-mark)]"
      : phase.kind === "upcoming"
        ? "bg-surface-hover text-text-secondary"
        : "text-text-muted";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-[14px] ${tone}`}
    >
      {phase.kind === "open" && <span aria-hidden className="size-1 rounded-full bg-current" />}
      {label}
    </span>
  );
}

/** How far through its application window an issue is. */
export function WindowBar({ progress }: { progress: number }) {
  const width = `${Math.min(1, Math.max(0, progress)) * 100}%`;
  return (
    <div className="h-[3px] overflow-hidden rounded-full bg-surface-hover">
      <div className="h-full rounded-full bg-[color:var(--color-accent-mark)]" style={{ width }} />
    </div>
  );
}

export function IpoRow({ entry, onOpen }: { entry: PhasedIssue; onOpen: () => void }) {
  const { t, language } = useSettings();
  const { issue, phase } = entry;
  const name = shortCompanyName(companyName(issue));
  const ratio = subscriptionRatio(issue);
  const closed = phase.kind === "closed";

  const title = issue.symbol ?? name;
  const subtitle = issue.symbol ? name : issueDetail(issue);

  const opens = issueDate(issue.openDate, language);
  const closes = issueDate(issue.closeDate, language);
  const aside =
    ratio != null && phase.kind !== "upcoming"
      ? t("stocks.ipo-subscribed").replace("{x}", ratioText(ratio))
      : opens && closes
        ? `${opens} – ${closes}`
        : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="row-line flex w-full flex-col gap-1.5 py-2 text-left"
    >
      <span className="flex w-full items-start gap-2">
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[13px] font-semibold leading-4 ${closed ? "text-text-secondary" : "text-text"}`}
          >
            {title}
          </span>
          {subtitle && (
            <span className="mt-0.5 block truncate text-[10px] leading-[14px] text-text-muted">
              {subtitle}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <PhasePill phase={phase} />
          {aside && (
            <span className="px-1.5 text-[10px] leading-[14px] tabular-nums text-text-secondary">
              {aside}
            </span>
          )}
        </span>
      </span>
      {phase.kind === "open" && <WindowBar progress={phase.progress} />}
    </button>
  );
}
