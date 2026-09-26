import type { CSSProperties } from "react";
import useSWR from "swr";
import { Icon, type IconName } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { openExternalLink } from "../../../shared/lib/external-link";
import { api } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { cityFor, flagFor, formatDayOffset, useWorldClocks } from "../../../shared/lib/world-clock";
import { CONTACTS, type DirectorySection, WEBSITES } from "../_lib/directory";

export type ToolId = "date" | "land" | "weight" | "vat" | "interest" | "clock" | "emergency";

type Calculator = { id: ToolId; label: string; hint: string; icon: IconName; tint: string };

const tinted = (tint: string) => ({ "--tint": tint }) as CSSProperties;

/**
 * Tools' front page. The two everyday tools show their answer before they
 * are opened: today in both calendars, and the time in the city you follow.
 * The Directory shows what it holds: the emergency numbers, readable right
 * here because nobody should tap twice to find 100, and the official sites
 * people look up most, one tap from opening. Calculators sit below, each in its own colour so
 * they read as four different things rather than one repeated tile.
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
      <div className="grid grid-cols-2 gap-2">
        <DateCard onOpen={() => onOpen("date")} />
        <ClockCard onOpen={() => onOpen("clock")} />
      </div>

      <DirectoryCard onOpen={(section) => onOpen("emergency", section)} />

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
              className="tool-card"
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

/** Today in both calendars — the converter's most common answer, given free. */
function DateCard({ onOpen }: { onOpen: () => void }) {
  const { t, numerals } = useSettings();
  const { data: today } = useSWR("tools:today", () => api.today());
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
      className="tool-card tool-feature"
      style={tinted("var(--color-accent-mark)")}
    >
      <span className="flex items-center justify-between">
        <span className="tool-card__icon">
          <Icon name="upcoming" className="size-3.5" />
        </span>
        <span className="text-[10px] text-text-muted">{t("tools.date-hint-short")}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] text-text-muted">{t("tools.date")}</span>
        {today ? (
          <>
            <span className="block truncate text-[18px] font-bold leading-tight">
              {today.nepaliMonthName} {digits(today.nepali.day, numerals)}
            </span>
            <span className="block truncate text-[10px] text-text-secondary">
              {digits(today.nepali.year, numerals)} · {ad}
            </span>
          </>
        ) : (
          <span className="block text-[18px] font-bold leading-tight">—</span>
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
      className="tool-card tool-feature"
      style={tinted("var(--color-weather-tint)")}
    >
      <span className="flex items-center justify-between">
        <span className="tool-card__icon">
          <Icon name="clock" className="size-3.5" />
        </span>
        {zone && reading && reading.dayOffset !== 0 && (
          <span className="text-[10px] text-text-muted">{formatDayOffset(reading.dayOffset)}</span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] text-text-muted">
          {zone ? `${flagFor(zone)} ${cityFor(zone).city}` : t("tools.clock")}
        </span>
        {zone ? (
          <span className="block text-[18px] font-bold leading-tight tabular-nums">
            {reading?.time ?? "--:--"}
          </span>
        ) : (
          <span className="block text-[13px] font-semibold leading-tight">
            {t("tools.clock-add")}
          </span>
        )}
        <span className="block truncate text-[10px] text-text-secondary">
          {zone ? t("tools.clock") : t("tools.clock-hint-short")}
        </span>
      </span>
    </button>
  );
}

/**
 * The Directory at a glance: how much is in it, the three numbers that
 * matter in a hurry, and the official web services people reach for most.
 * Each part opens the matching half of the full Directory.
 */
function DirectoryCard({ onOpen }: { onOpen: (section: DirectorySection) => void }) {
  const { t, language } = useSettings();
  const ne = language === "ne";
  const emergency = CONTACTS.filter((contact) => contact.category === "emergency").slice(0, 3);
  const featured = WEBSITES.filter((site) => site.featured);

  return (
    <section
      aria-labelledby="tools-directory"
      className="tool-card tool-directory"
      style={tinted("var(--color-holiday)")}
    >
      <button
        type="button"
        onClick={() => onOpen("phones")}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="tool-card__icon">
          <Icon name="directory" className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span id="tools-directory" className="block text-[12px] font-semibold">
            {t("tools.directory")}
          </span>
          <span className="block truncate text-[10px] text-text-muted">
            {t("tools.directory-counts")
              .replace("{numbers}", String(CONTACTS.length))
              .replace("{sites}", String(WEBSITES.length))}
          </span>
        </span>
        <Icon name="chevronLeft" className="size-3 shrink-0 rotate-180 text-text-muted" />
      </button>

      <div className="grid grid-cols-3 gap-1.5">
        {emergency.map((contact) => (
          <button
            key={contact.number}
            type="button"
            onClick={() => onOpen("phones")}
            className="tool-emergency__number text-left"
          >
            <b>{contact.number}</b>
            <span className="truncate">{ne ? contact.nameNe : contact.name}</span>
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] font-semibold tracking-wide text-text-muted uppercase">
            {t("tools.online-services")}
          </p>
          <button
            type="button"
            onClick={() => onOpen("websites")}
            className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-accent-mark hover:underline"
          >
            {t("tools.all-sites").replace("{n}", String(WEBSITES.length))}
            <Icon name="chevronLeft" className="size-2.5 rotate-180" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {featured.map((site) => (
            <button
              key={site.url}
              type="button"
              onClick={() => openExternalLink(site.url)}
              title={ne ? site.descriptionNe : site.description}
              className="tool-site"
            >
              <Icon
                name={site.type === "app" ? "phone" : "openExternal"}
                className="size-3 shrink-0 opacity-70"
              />
              {ne ? site.nameNe : site.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
