import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Icon } from "../../shared/components/icon";
import { Segmented } from "../../shared/components/segmented";
import { StateBanner } from "../../shared/components/state-banner";
import { Toggle } from "../../shared/components/toggle";
import { useSettings } from "../../shared/context/settings-context";
import { api } from "../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../shared/lib/load-state";
import { digits } from "../../shared/lib/numerals";
import { track } from "../../shared/lib/usage";
import type { JobGroup } from "../../types/api/JobGroup";
import type { JobSource } from "../../types/api/JobSource";
import type { JobSourceInfo } from "../../types/api/JobSourceInfo";
import type { JobVacancy } from "../../types/api/JobVacancy";
import type { LoadState } from "../../types/api/LoadState";

/** A federal commission on its own; every other source by its group. */
type Filter = "all" | JobSource | JobGroup;
type Loaded = { info: JobSourceInfo; state: LoadState<JobVacancy[]> }[];

/**
 * A notice with no deadline in its data counts as open this long after it
 * was published: commissions give about a month to apply.
 */
const NOTICE_OPEN_DAYS = 35;
/** Days left at which a deadline is drawn as urgent. */
const URGENT_DAYS = 3;

function filterOf(info: JobSourceInfo): Filter {
  return info.group === "federal" ? info.source : info.group;
}

async function loadAll(refresh: boolean): Promise<Loaded> {
  const sources = await api.jobSources();
  return Promise.all(
    sources.map(async (info) => ({
      info,
      state: await catchAsFailed(api.getJobs(info.source, refresh)),
    })),
  );
}

/**
 * Government vacancies: Lok Sewa, Shikshak Sewa and the provincial
 * commissions. Each source loads and fails on its own; a commission whose
 * site is down is named at the foot of the list, not allowed to empty it.
 */
export function Jobs() {
  const { t, language } = useSettings();
  const { data, error, isValidating, mutate } = useSWR("jobs", () => loadAll(false));
  const [filter, setFilter] = useState<Filter>("all");
  const [openOnly, setOpenOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const short = (info: JobSourceInfo) => (language === "ne" ? info.shortNe : info.shortEn);

  const all = useMemo(
    () => (data ?? []).flatMap(({ state }) => loadedValue(state) ?? []).sort(byUrgency),
    [data],
  );
  const infoOf = (source: JobSource) => data?.find((s) => s.info.source === source)?.info;
  const shown = all.filter((vacancy) => {
    const info = infoOf(vacancy.source);
    const inFilter = filter === "all" || (info !== undefined && filterOf(info) === filter);
    return inFilter && (!openOnly || isOpen(vacancy));
  });
  const filters = [...new Set((data ?? []).map(({ info }) => filterOf(info)))];
  const filterLabel = (id: Filter) => {
    if (id === "federal" || id === "province" || id === "security" || id === "public")
      return t(`jobs.group-${id}`);
    const info = data?.find((s) => s.info.source === id)?.info;
    return info ? short(info) : id;
  };
  const broken = (data ?? []).filter(({ state }) =>
    ["failed", "unavailable"].includes(state.status),
  );
  const stale = (data ?? []).some(({ state }) => state.status === "stale");

  // What was on screen this visit stops being "new" once the screen is left.
  const onScreen = useRef<string[]>([]);
  onScreen.current = all.map((vacancy) => vacancy.id);
  useEffect(
    () => () => {
      if (onScreen.current.length) api.markJobsSeen(onScreen.current).catch(() => {});
    },
    [],
  );

  const pick = (next: Filter) => {
    setFilter(next);
    track(`tab.jobs.${next}`);
  };

  const refresh = () => mutate(loadAll(true), { revalidate: false });

  // A failure on the way to the shell (no source list at all) is a failed
  // state like any other, never an endless skeleton.
  const banner =
    data === undefined
      ? error
        ? ({ status: "failed", message: String(error) } as const)
        : ({ status: "loading" } as const)
      : all.length === 0 && broken.length === data.length
        ? ({ status: "failed", message: "every source failed" } as const)
        : stale
          ? ({ status: "stale" } as const)
          : ({ status: "fresh" } as const);

  return (
    <div className="space-y-2.5">
      <Segmented
        label={t("jobs.source")}
        value={filter}
        onChange={pick}
        scrollable
        options={[
          { id: "all", label: t("jobs.all") },
          ...filters.map((id) => ({ id, label: filterLabel(id) })),
        ]}
      />

      <div className="flex items-center justify-between gap-2 px-0.5">
        <Toggle label={t("jobs.open-only")} checked={openOnly} onChange={setOpenOnly} />
        <button
          type="button"
          onClick={refresh}
          className="icon-btn"
          aria-label={t("action.refresh")}
          disabled={isValidating}
        >
          <Icon name="refresh" className={`size-3.5 ${isValidating ? "animate-spin" : ""}`} />
        </button>
      </div>

      <StateBanner state={banner} onRetry={refresh}>
        {shown.length === 0 ? (
          <section className="surface-card p-3">
            <p className="text-[12px] text-text-secondary">
              {t(openOnly ? "jobs.none-open" : "jobs.none")}
            </p>
            {openOnly && all.length > 0 && (
              <button
                type="button"
                onClick={() => setOpenOnly(false)}
                className="settings-btn mt-2"
              >
                {t("jobs.show-closed")}
              </button>
            )}
          </section>
        ) : (
          <ul className="surface-card divide-y divide-border/55 overflow-hidden">
            {shown.map((vacancy) => (
              <JobRow
                key={vacancy.id}
                vacancy={vacancy}
                source={infoOf(vacancy.source)}
                expanded={expanded === vacancy.id}
                onToggle={() => {
                  setExpanded((open) => (open === vacancy.id ? null : vacancy.id));
                  if (expanded !== vacancy.id) track("action.job-open");
                }}
                onChanged={() => mutate()}
              />
            ))}
          </ul>
        )}

        {broken.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 px-0.5 text-[10px] text-text-muted">
            <Icon name="warning" className="mt-px size-3 shrink-0" />
            {t("jobs.source-failed")} {broken.map(({ info }) => short(info)).join(", ")}
          </p>
        )}
      </StateBanner>
    </div>
  );
}

function JobRow({
  vacancy,
  source,
  expanded,
  onToggle,
  onChanged,
}: {
  vacancy: JobVacancy;
  source: JobSourceInfo | undefined;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { t, language, numerals } = useSettings();
  const [busy, setBusy] = useState(false);
  const sourceName = source ? (language === "ne" ? source.shortNe : source.shortEn) : "";
  const openingsText = useOpenings();
  const meta = [
    sourceName,
    // Lok Sewa lists the same post under many advertisements; the number
    // tells them apart at a glance.
    vacancy.source === "psc" && vacancy.advertisementCode
      ? `${t("jobs.ad-number")} ${vacancy.advertisementCode.split("-")[0]}`
      : null,
    vacancy.level,
    vacancy.openings ? openingsText(vacancy.openings) : null,
  ].filter(Boolean);

  const toggleReminder = async () => {
    setBusy(true);
    try {
      if (vacancy.reminded) {
        await api.forgetJobDeadline(vacancy.id);
      } else {
        await api.remindJobDeadline(vacancy.id);
        track("action.job-remind");
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-1.5">
            {vacancy.isNew && (
              <span
                className="mt-[5px] size-1.5 shrink-0 rounded-full bg-[color:var(--color-accent-mark)]"
                role="img"
                aria-label={t("jobs.new")}
              />
            )}
            <span className="line-clamp-2 text-[12px] font-semibold leading-snug">
              {vacancy.title}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-text-muted">
            {meta.join(" · ")}
          </span>
        </span>
        <DeadlineBadge vacancy={vacancy} />
      </button>

      {expanded && (
        <div className="space-y-2 px-3 pb-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
            {vacancy.office && <Fact label={t("jobs.office")} value={vacancy.office} />}
            {vacancy.advertisementCode && (
              <Fact label={t("jobs.ad-number")} value={vacancy.advertisementCode} />
            )}
            {vacancy.deadlineLabel && (
              <Fact label={t("jobs.deadline")} value={vacancy.deadlineLabel} />
            )}
            {vacancy.doubleFeeDeadlineLabel && (
              <Fact label={t("jobs.double-fee")} value={vacancy.doubleFeeDeadlineLabel} />
            )}
            {vacancy.publishedLabel && (
              <Fact label={t("jobs.published")} value={vacancy.publishedLabel} />
            )}
            {vacancy.applicants != null && vacancy.applicants > 0 && (
              <Fact label={t("jobs.applicants")} value={digits(vacancy.applicants, numerals)} />
            )}
          </dl>
          {expanded && vacancy.source === "psc" && <PscDetail id={vacancy.id} />}
          {!vacancy.deadline && (
            <p className="text-[10px] text-text-muted">{t("jobs.deadline-in-notice")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => api.openExternalUrl(vacancy.url).catch(() => {})}
              className="settings-btn"
            >
              <Icon name="link" className="size-3" />
              {t("jobs.open-notice")}
            </button>
            {vacancy.deadline && (vacancy.daysLeft ?? -1) >= 0 && (
              <button
                type="button"
                onClick={toggleReminder}
                disabled={busy}
                className="settings-btn"
              >
                <Icon name={vacancy.reminded ? "checkmark" : "bell"} className="size-3" />
                {t(vacancy.reminded ? "jobs.reminder-set" : "jobs.remind")}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** `1 post`, `24 posts`, in the reader's digits. */
function useOpenings() {
  const { t, numerals } = useSettings();
  return (n: number) =>
    (n === 1 ? t("jobs.openings-one") : t("jobs.openings")).replace("{n}", digits(n, numerals));
}

/** The services and quotas a Lok Sewa advertisement covers: rows that read
 * alike in the list (उपसचिव, उपसचिव) differ here. */
function PscDetail({ id }: { id: string }) {
  const openingsText = useOpenings();
  const { data } = useSWR(["job-detail", id], () => api.jobDetail(id));
  if (!data?.length) return null;
  return (
    <ul className="space-y-0.5 rounded-md bg-surface-hover px-2 py-1.5 text-[11px]">
      {data.map((part) => (
        <li key={`${part.service}:${part.openType}`} className="flex justify-between gap-2">
          <span className="min-w-0 truncate">
            {part.service}
            {part.openType && <span className="text-text-muted"> · {part.openType}</span>}
          </span>
          <span className="shrink-0 text-text-muted">{openingsText(part.openings)}</span>
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-text">{value}</dd>
    </>
  );
}

/** Days left for a vacancy with a deadline; when it was published otherwise. */
function DeadlineBadge({ vacancy }: { vacancy: JobVacancy }) {
  const { t, numerals } = useSettings();
  const left = vacancy.daysLeft;

  // No deadline in the source's data: say when it was published, and say
  // plainly that the deadline is only in the notice, so the row never looks
  // like it knows more than it does.
  if (left == null) {
    return (
      <span className="flex shrink-0 flex-col items-end gap-0.5 pt-px">
        {vacancy.publishedLabel && (
          <span className="text-[10px] leading-tight text-text-muted">
            {vacancy.publishedLabel}
          </span>
        )}
        <span className="whitespace-nowrap rounded-md bg-surface-hover px-1.5 py-0.5 text-[9px] leading-[12px] text-text-muted">
          {t("jobs.deadline-tag")}
        </span>
      </span>
    );
  }

  const text =
    left < 0
      ? t("jobs.closed")
      : left === 0
        ? t("jobs.last-day")
        : t("jobs.days-left").replace("{n}", digits(left, numerals));
  const tone =
    left < 0
      ? "text-text-muted"
      : left <= URGENT_DAYS
        ? "bg-[color-mix(in_srgb,var(--color-negative)_14%,transparent)] text-[color:var(--color-negative)]"
        : "bg-[color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] text-[color:var(--color-accent-mark)]";
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-[14px] ${tone}`}
    >
      {text}
    </span>
  );
}

/** Open to apply: before its deadline, or a recent notice without one. */
function isOpen(vacancy: JobVacancy): boolean {
  if (vacancy.daysLeft != null) return vacancy.daysLeft >= 0;
  return vacancy.publishedDaysAgo != null && vacancy.publishedDaysAgo <= NOTICE_OPEN_DAYS;
}

/** Soonest deadline first among the open ones; then notices, newest first;
 * then everything closed. */
function byUrgency(a: JobVacancy, b: JobVacancy): number {
  const rank = (v: JobVacancy) =>
    v.daysLeft != null && v.daysLeft >= 0 ? 0 : v.daysLeft == null ? 1 : 2;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return (a.daysLeft ?? 0) - (b.daysLeft ?? 0);
  if (ra === 1) return (a.publishedDaysAgo ?? 9999) - (b.publishedDaysAgo ?? 9999);
  return (b.daysLeft ?? 0) - (a.daysLeft ?? 0);
}
