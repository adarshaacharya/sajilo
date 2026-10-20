import type { ReactNode } from "react";
import useSWR from "swr";
import { Icon, type IconName } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { useDirectory } from "../../../shared/lib/directory";
import { api } from "../../../shared/lib/ipc";
import { useNepalDay } from "../../../shared/lib/nepal-day";
import { digits } from "../../../shared/lib/numerals";
import * as stopwatch from "../../../shared/lib/stopwatch";
import { cityFor, flagFor, formatDayOffset, useWorldClocks } from "../../../shared/lib/world-clock";
import type { DirectorySection } from "../_lib/directory";
import { clockText } from "./stopwatch-tab";

export type ToolId =
  | "date"
  | "land"
  | "weight"
  | "vat"
  | "interest"
  | "clock"
  | "stopwatch"
  | "emergency"
  | "nepali";

/** A tool's row: icon, name, one line of live detail, and where it goes. */
type Row = { id: ToolId; icon: IconName; label: string; detail: ReactNode };

/**
 * Tools' front page: one row style throughout, grouped by what the tools
 * are for, so the page reads as a list rather than a collage. Each row's
 * second line carries its live answer — today's date, a city's time, the
 * stopwatch — where it used to take a tile of its own. Emergency numbers
 * stay first, in the only red on the page.
 */
export function ToolsHome({
  onOpen,
}: {
  /** `section` picks which half of the Directory a link lands on. */
  onOpen: (tool: ToolId, section?: DirectorySection) => void;
}) {
  const { t } = useSettings();

  const everyday: Row[] = [
    { id: "date", icon: "calendar", label: t("tools.date"), detail: <TodayDetail /> },
    {
      id: "nepali",
      icon: "keyboard",
      label: t("tools.typing"),
      detail: "mero naam → मेरो नाम",
    },
    { id: "clock", icon: "clock", label: t("tools.clock"), detail: <ClockDetail /> },
  ];
  const calculators: Row[] = [
    { id: "land", icon: "land", label: t("tools.land"), detail: t("tools.land-hint-short") },
    {
      id: "weight",
      icon: "weight",
      label: t("tools.weight"),
      detail: t("tools.weight-hint-short"),
    },
    { id: "vat", icon: "percent", label: t("tools.vat"), detail: t("tools.vat-hint-short") },
    {
      id: "interest",
      icon: "interest",
      label: t("tools.interest"),
      detail: t("tools.interest-hint-short"),
    },
  ];

  return (
    <div className="space-y-3 pt-0.5">
      <EmergencyStrip onOpen={() => onOpen("emergency", "phones")} />

      <Group title={t("tools.everyday")}>
        {everyday.map((row) => (
          <ToolRow key={row.id} row={row} onOpen={() => onOpen(row.id)} />
        ))}
        <StopwatchRow onOpen={() => onOpen("stopwatch")} />
      </Group>

      <Group title={t("tools.calculators")}>
        {calculators.map((row) => (
          <ToolRow key={row.id} row={row} onOpen={() => onOpen(row.id)} />
        ))}
      </Group>

      <Group title={t("tools.directory")}>
        <ToolRow
          row={{
            id: "emergency",
            icon: "phone",
            label: t("tools.directory-more-numbers"),
            detail: t("tools.directory-numbers-hint"),
          }}
          onOpen={() => onOpen("emergency", "phones")}
        />
        <ToolRow
          row={{
            id: "emergency",
            icon: "openExternal",
            label: t("tools.directory-more-sites"),
            detail: t("tools.directory-sites-hint"),
          }}
          onOpen={() => onOpen("emergency", "websites")}
        />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5" aria-label={title}>
      <h2 className="px-0.5 text-[11px] font-semibold text-text-secondary">{title}</h2>
      <ul className="surface-card overflow-hidden">{children}</ul>
    </section>
  );
}

function ToolRow({
  row,
  onOpen,
  trailing,
}: {
  row: Row;
  onOpen: () => void;
  /** A control of its own at the end of the row, instead of the chevron. */
  trailing?: ReactNode;
}) {
  return (
    <li className="flex items-center border-b border-divider last:border-b-0">
      <button type="button" onClick={onOpen} className="more-row min-w-0 flex-1 text-left">
        <span className="more-row__icon">
          <Icon name={row.icon} className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium">{row.label}</span>
          <span className="mt-0.5 block truncate text-[10.5px] text-text-muted">{row.detail}</span>
        </span>
        {!trailing && <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />}
      </button>
      {trailing && <span className="shrink-0 pr-2.5">{trailing}</span>}
    </li>
  );
}

/** 100 · 101 · 102 in one slim line: never a scroll away, never the
 * biggest thing on the page. */
function EmergencyStrip({ onOpen }: { onOpen: () => void }) {
  const { t, language } = useSettings();
  const ne = language === "ne";
  const { contacts } = useDirectory();
  const emergency = contacts.filter((contact) => contact.category === "emergency").slice(0, 3);
  return (
    <section
      aria-label={t("tools.directory-emergency")}
      className="surface-card flex items-center gap-1 px-2 py-1.5"
    >
      <span className="shrink-0 px-1 text-[10px] font-semibold text-text-muted">
        {t("tools.directory-emergency")}
      </span>
      {emergency.map((contact) => (
        <button
          key={contact.number}
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 flex-col items-center rounded-md px-1 py-1 transition-colors hover:bg-surface-hover"
        >
          <span className="text-[14px] font-bold leading-tight tabular-nums text-holiday">
            {contact.number}
          </span>
          <span className="max-w-full truncate text-[10px] leading-tight text-text-muted">
            {ne ? contact.nameNe : contact.name}
          </span>
        </button>
      ))}
    </section>
  );
}

/** The stopwatch's row: its time as the detail, and play/pause at the end
 * so a run can start without opening it. */
function StopwatchRow({ onOpen }: { onOpen: () => void }) {
  const { t, numerals } = useSettings();
  const watch = stopwatch.useStopwatch();
  const ms = stopwatch.useElapsed(watch, 4);
  const running = stopwatch.isRunning(watch);
  const started = running || ms > 0;
  return (
    <ToolRow
      row={{
        id: "stopwatch",
        icon: "stopwatch",
        label: t("tools.stopwatch"),
        detail: (
          <span className={`tabular-nums ${running ? "text-accent-mark" : ""}`}>
            {started ? clockText(ms, numerals) : t("tools.stopwatch-hint")}
          </span>
        ),
      }}
      onOpen={onOpen}
      trailing={
        <button
          type="button"
          onClick={() => stopwatch.toggle()}
          aria-label={t(
            running
              ? "stopwatch.tap-pause"
              : started
                ? "stopwatch.tap-resume"
                : "stopwatch.tap-start",
          )}
          className="icon-btn"
        >
          <Icon name={running ? "pause" : "play"} className="size-3" />
        </button>
      }
    />
  );
}

/** Today in both calendars — the converter's most common answer, given free. */
function TodayDetail() {
  const { numerals } = useSettings();
  const day = useNepalDay();
  const { data: today } = useSWR(["tools:today", day], () => api.today());
  if (!today) return <>—</>;
  const ad = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${today.gregorian}T00:00:00`));
  return (
    <>
      {today.nepaliMonthName} {digits(today.nepali.day, numerals)} · {ad}
    </>
  );
}

/** The first city you follow and its time, or an invitation to pick one. */
function ClockDetail() {
  const { t, modules } = useSettings();
  const zone = modules.clocks[0] ?? null;
  const readings = useWorldClocks(zone ? [zone] : []);
  const reading = zone ? readings[zone] : undefined;
  if (!zone) return <>{t("tools.clock-add")}</>;
  return (
    <>
      {flagFor(zone)} {cityFor(zone).city} ·{" "}
      <span className="tabular-nums">{reading?.time ?? "--:--"}</span>
      {reading && reading.dayOffset !== 0 && ` (${formatDayOffset(reading.dayOffset)})`}
    </>
  );
}
