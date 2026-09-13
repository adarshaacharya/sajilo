import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { openExternalLink } from "../../../shared/lib/external-link";
import { money0 } from "../_lib/format";
import {
  companyName,
  issueDate,
  issueDetail,
  type PhasedIssue,
  parseCount,
  ratioText,
  subscriptionRatio,
} from "../_lib/ipo";
import { PhasePill, WindowBar } from "./ipo-row";

const MEROSHARE_URL = "https://meroshare.cdsc.com.np/";

function countText(text: string): string {
  const count = parseCount(text);
  if (count != null) return money0.format(count);
  return text.trim() || "—";
}

export function IpoDetail({ entry, onBack }: { entry: PhasedIssue; onBack: () => void }) {
  const { t, language } = useSettings();
  const { issue, phase } = entry;
  const name = companyName(issue);
  const detail = issueDetail(issue);
  const ratio = subscriptionRatio(issue);
  const amount = parseCount(issue.amount);

  const progress = phase.kind === "open" ? phase.progress : phase.kind === "closed" ? 1 : 0;

  const stats: { label: string; value: string }[] = [
    { label: t("stocks.ipo-units"), value: countText(issue.issuedUnits) },
    { label: t("stocks.ipo-applied"), value: countText(issue.appliedUnits) },
    { label: t("stocks.ipo-applications"), value: countText(issue.applicationCount) },
    {
      label: t("stocks.ipo-amount"),
      value: amount != null ? `Rs ${money0.format(amount)}` : issue.amount.trim() || "—",
    },
  ];

  return (
    <section className="surface-card p-2.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("action.back")}
          className="icon-btn shrink-0"
        >
          <Icon name="chevronLeft" className="size-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-tight">{issue.symbol ?? name}</p>
          {issue.symbol && <p className="text-[11px] text-text-muted">{name}</p>}
          {detail && (
            <span className="mt-1 inline-block rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] leading-[14px] text-text-secondary">
              {detail}
            </span>
          )}
        </div>
        <PhasePill phase={phase} />
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        {ratio != null ? (
          <>
            <p className="text-[22px] font-semibold leading-none tabular-nums">
              {ratioText(ratio)}×
            </p>
            <p className="text-[11px] text-text-secondary">{t("stocks.ipo-subscribed-label")}</p>
          </>
        ) : (
          <p className="text-[12px] text-text-secondary">{t("stocks.ipo-no-applications")}</p>
        )}
      </div>

      <div className="mt-3">
        <p className="text-[10px] text-text-muted">{t("stocks.ipo-window")}</p>
        <div className="mt-1">
          <WindowBar progress={progress} />
        </div>
        <div className="mt-1 flex justify-between gap-2 text-[10px] tabular-nums">
          <span className="text-text-muted">
            {t("stocks.ipo-opens")}{" "}
            <span className="text-text-secondary">
              {issueDate(issue.openDate, language) ?? "—"}
            </span>
          </span>
          <span className="text-text-muted">
            {t("stocks.ipo-closes")}{" "}
            <span className="text-text-secondary">
              {issueDate(issue.closeDate, language) ?? "—"}
            </span>
          </span>
        </div>
      </div>

      <div className="section-divider mt-3 grid grid-cols-2 gap-x-3 gap-y-2 pt-2">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <p className="truncate text-[10px] text-text-muted">{stat.label}</p>
            <p className="truncate text-[11px] font-medium tabular-nums">{stat.value}</p>
          </div>
        ))}
        {issue.issueManager && (
          <div className="col-span-2 min-w-0">
            <p className="text-[10px] text-text-muted">{t("stocks.ipo-manager")}</p>
            <p className="text-[11px] font-medium">{issue.issueManager}</p>
          </div>
        )}
      </div>

      {issue.lastUpdate && (
        <p className="mt-2.5 text-[10px] tabular-nums text-text-muted">
          {t("stocks.ipo-updated")} {issue.lastUpdate.slice(0, 16)}
        </p>
      )}

      {phase.kind === "open" && (
        <button
          type="button"
          onClick={() => openExternalLink(MEROSHARE_URL)}
          className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-accent-fill text-[12px] font-semibold text-accent-ink transition-opacity duration-150 hover:opacity-90 active:opacity-80"
        >
          {t("stocks.ipo-apply")}
          <Icon name="openExternal" className="size-3" />
        </button>
      )}
    </section>
  );
}
