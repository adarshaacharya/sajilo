import type { CSSProperties } from "react";
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
  | "emergency";

type Calculator = { id: ToolId; label: string; hint: string; icon: IconName; tint: string };

const tinted = (tint: string) => ({ "--tint": tint }) as CSSProperties;

/**
 * Tools' front page. The Directory leads: it is the tool people open most,
 * and 100/101/102 should never be a scroll away. Then the three live tools
 * as one row of small tiles, each showing its answer before it is opened —
 * today in both calendars, the time where you follow, the stopwatch's run.
 * Calculators sit below, each in its own colour so they read as four
 * different things rather than one repeated tile.
 */
export function ToolsHome({
  onOpen,
}: {
  /** `section` picks which half of the Directory a link lands on. */
  onOpen: (tool: ToolId, section?: DirectorySection) => void;
}) {
  const { t } = useSettings();

  const calculators: readonly Calculator[] = [
    {
      id: "land",
      label: t("tools.land"),
      hint: t("tools.land-hint-short"),
      icon: "land",
      tint: "var(--color-positive)",
    },
    {
      id: "weight",
      label: t("tools.weight"),
      hint: t("tools.weight-hint-short"),
      icon: "weight",
      tint: "var(--color-accent-mark)",
    },
    {
      id: "vat",
      label: t("tools.vat"),
      hint: t("tools.vat-hint-short"),
      icon: "percent",
      tint: "var(--color-weather-tint)",
    },
    {
      id: "interest",
      label: t("tools.interest"),
      hint: t("tools.interest-hint-short"),
      icon: "interest",
      tint: "var(--color-violet)",
    },
  ];

  return (
    <div className="space-y-3 pt-0.5">
      <DirectoryCard onOpen={(section) => onOpen("emergency", section)} />

      <div className="grid grid-cols-3 gap-2">
        <DateCard onOpen={() => onOpen("date")} />
        <ClockCard onOpen={() => onOpen("clock")} />
        <StopwatchCard onOpen={() => onOpen("stopwatch")} />
      </div>

      <section aria-labelledby="tools-calculators" className="space-y-1.5">
        <h2 id="tools-calculators" className="px-0.5 text-[11px] font-semibold text-text-secondary">
          {t("tools.calculators")}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {calculators.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => onOpen(tool.id)}
              className="tool-card tool-calc"
              style={tinted(tool.tint)}
            >
              <span className="tool-card__icon">
                <Icon name={tool.icon} className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold">{tool.label}</span>
                <span className="block truncate text-[10px] text-text-muted">{tool.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * The stopwatch, live on its card while it has time on it, so a run started
 * earlier is visible from the Tools page. The play button starts or pauses it
 * without opening the tool.
 */
function StopwatchCard({ onOpen }: { onOpen: () => void }) {
  const { t, numerals } = useSettings();
  const watch = stopwatch.useStopwatch();
  const ms = stopwatch.useElapsed(watch, 4);
  const running = stopwatch.isRunning(watch);
  const started = running || ms > 0;
  return (
    <div className="tool-card tool-live relative" style={tinted("var(--color-violet)")}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 text-left"
      >
        <span className="tool-live__label pr-6">{t("tools.stopwatch")}</span>
        <span
          className={`block truncate text-[15px] font-bold leading-none tabular-nums ${
            started ? "" : "text-text-muted"
          }`}
        >
          {clockText(ms, numerals)}
        </span>
      </button>
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
        className="icon-btn tool-live__action"
      >
        <Icon name={running ? "pause" : "play"} className="size-3" />
      </button>
    </div>
  );
}

/** Today in both calendars — the converter's most common answer, given free. */
function DateCard({ onOpen }: { onOpen: () => void }) {
  const { t, numerals } = useSettings();
  const day = useNepalDay();
  const { data: today } = useSWR(["tools:today", day], () => api.today());
  const ad = today
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${today.gregorian}T00:00:00`))
    : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="tool-card tool-live"
      style={tinted("var(--color-accent-mark)")}
    >
      <span className="tool-live__label">{t("tools.date-short")}</span>
      <span className="min-w-0">
        {today ? (
          <>
            <span className="block truncate text-[15px] font-bold leading-tight">
              {today.nepaliMonthName} {digits(today.nepali.day, numerals)}
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-text-muted">{ad}</span>
          </>
        ) : (
          <span className="block text-[15px] font-bold leading-tight">—</span>
        )}
      </span>
    </button>
  );
}

/** The first city you follow, ticking; or an invitation to pick one. */
function ClockCard({ onOpen }: { onOpen: () => void }) {
  const { t, modules } = useSettings();
  const zone = modules.clocks[0] ?? null;
  const readings = useWorldClocks(zone ? [zone] : []);
  const reading = zone ? readings[zone] : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="tool-card tool-live"
      style={tinted("var(--color-weather-tint)")}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="tool-live__label">{t("tools.clock-short")}</span>
        {zone && reading && reading.dayOffset !== 0 && (
          <span className="shrink-0 text-[10px] text-text-muted">
            {formatDayOffset(reading.dayOffset)}
          </span>
        )}
      </span>
      <span className="min-w-0">
        {zone ? (
          <>
            <span className="block text-[15px] font-bold leading-none tabular-nums">
              {reading?.time ?? "--:--"}
            </span>
            <span className="mt-1 block truncate text-[10px] text-text-muted">
              {flagFor(zone)} {cityFor(zone).city}
            </span>
          </>
        ) : (
          <>
            <span className="block text-[15px] font-bold leading-none tabular-nums text-text-muted">
              --:--
            </span>
            <span className="mt-1 block truncate text-[10px] text-text-muted">
              {t("tools.clock-add")}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

/**
 * The Directory at a glance: emergency lines up front; the rest is one tap
 * away under numbers or sites.
 */
function DirectoryCard({ onOpen }: { onOpen: (section: DirectorySection) => void }) {
  const { t, language } = useSettings();
  const ne = language === "ne";
  const { contacts } = useDirectory();
  const emergency = contacts.filter((contact) => contact.category === "emergency").slice(0, 3);

  return (
    <section
      aria-labelledby="tools-directory"
      className="tool-card flex flex-col gap-2.5 active:transform-none"
      style={tinted("var(--color-holiday)")}
    >
      <div className="flex items-center gap-2">
        <span className="tool-card__icon" style={tinted("var(--color-holiday)")}>
          <Icon name="directory" className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span id="tools-directory" className="block text-[12px] font-semibold">
            {t("tools.directory")}
          </span>
          <span className="block text-[10px] text-text-muted">
            {t("tools.directory-hint-short")}
          </span>
        </span>
      </div>

      <p className="px-0.5 text-[10px] font-medium text-text-muted">
        {t("tools.directory-emergency")}
      </p>
      <div className="-mt-1 grid grid-cols-3 gap-1.5 rounded-md border border-border bg-canvas p-2">
        {emergency.map((contact) => (
          <button
            key={contact.number}
            type="button"
            onClick={() => onOpen("phones")}
            className="grid min-w-0 gap-0.5 rounded-sm px-0.5 py-1 text-center text-[10px] leading-tight text-text-muted transition-colors hover:bg-surface-hover"
          >
            <span className="text-[17px] font-bold leading-none tabular-nums text-holiday">
              {contact.number}
            </span>
            <span className="truncate">{ne ? contact.nameNe : contact.name}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onOpen("phones")}
          className="rounded-md border border-border bg-canvas px-2 py-1.5 text-left text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
        >
          {t("tools.directory-more-numbers")}
        </button>
        <button
          type="button"
          onClick={() => onOpen("websites")}
          className="rounded-md border border-border bg-canvas px-2 py-1.5 text-left text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
        >
          {t("tools.directory-more-sites")}
        </button>
      </div>
    </section>
  );
}
