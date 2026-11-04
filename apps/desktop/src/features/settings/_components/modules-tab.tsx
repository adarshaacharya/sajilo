import { type ReactNode, useState } from "react";
import { AddCityField } from "../../../shared/components/city-results";
import { Icon, type IconName } from "../../../shared/components/icon";
import { Select } from "../../../shared/components/select";
import { Switch } from "../../../shared/components/switch";
import { useSettings } from "../../../shared/context/settings-context";
import { placeLabel, usePlaces } from "../../../shared/lib/places";
import { cityFor, flagFor } from "../../../shared/lib/world-clock";
import { CurrencyPicker } from "./currency-picker";
import { TabArranger } from "./tab-arranger";

type CardKey = "weatherEnabled" | "nepseCardEnabled" | "forexEnabled" | "clocksEnabled";

/**
 * Settings › Customize: what Sajilo shows, and where.
 *
 * Every tab is listed once, under where it lives now — the tab bar, More, or
 * hidden — and dragged between them (see `TabArranger`). The cards on the
 * Today screen, which aren't tabs, get a line each below: a switch, and what
 * the card shows in a word or two. Tapping that opens the choices behind it,
 * so the section stays four lines until something is being changed.
 */
export function ModulesTab() {
  const { t, language, modules, setModules } = useSettings();
  const places = usePlaces();
  const [open, setOpen] = useState<CardKey | null>(null);

  const card = (
    key: CardKey,
    title: string,
    icon: IconName,
    summary?: string,
    detail?: ReactNode,
  ) => {
    const on = modules[key];
    const expanded = on && open === key && detail;
    return (
      <li key={key}>
        <div className="flex min-h-[30px] items-center gap-2 px-2">
          <Icon
            name={icon}
            className={`size-3.5 shrink-0 ${on ? "text-accent-mark" : "text-text-muted"}`}
          />
          <span className="shrink-0 text-[12.5px]">{title}</span>
          {on && summary && detail ? (
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : key)}
              aria-expanded={Boolean(expanded)}
              className="flex min-w-0 flex-1 items-center justify-end gap-1 text-[11px] text-text-muted hover:text-text-secondary"
            >
              <span className="truncate">{summary}</span>
              <Icon
                name="chevronRight"
                className={`size-2.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            </button>
          ) : (
            <span className="flex-1" />
          )}
          <Switch
            checked={on}
            ariaLabel={title}
            onChange={(value) => {
              setModules((current) => ({ ...current, [key]: value }));
              // Turned on with nothing to show yet: straight to choosing.
              if (value && key === "clocksEnabled" && modules.clocks.length === 0) setOpen(key);
            }}
          />
        </div>
        {expanded ? <div className="pb-2 pl-[30px] pr-2">{detail}</div> : null}
      </li>
    );
  };

  const currencies = modules.forexFavourites;
  const clocks = modules.clocks;

  return (
    <div className="space-y-2.5">
      <TabArranger />

      <section className="surface-card space-y-1 p-3">
        <p className="tab-editor__label pb-1">{t("customize.today-screen")}</p>
        <ul className="space-y-0.5">
          {card(
            "weatherEnabled",
            t("feature.weather"),
            "weather",
            placeLabel(places, modules.weatherLocation, language),
            <Select
              ariaLabel={t("settings.city")}
              value={modules.weatherLocation}
              onChange={(next) =>
                setModules((current) => ({
                  ...current,
                  weatherPins: [next, ...current.weatherPins.filter((id) => id !== next)],
                }))
              }
              options={modules.weatherPins.map((id) => ({
                id,
                label: placeLabel(places, id, language),
              }))}
            />,
          )}
          {card("nepseCardEnabled", t("dashboard.nepse"), "interest")}
          {card(
            "forexEnabled",
            t("feature.forex"),
            "forex",
            currencies.length > 3
              ? `${currencies.slice(0, 3).join(" · ")} +${currencies.length - 3}`
              : currencies.join(" · ") || t("customize.pick"),
            <CurrencyPicker
              title={t("settings.currencies")}
              selected={currencies}
              onToggle={(code) =>
                setModules((current) => ({
                  ...current,
                  forexFavourites: current.forexFavourites.includes(code)
                    ? current.forexFavourites.filter((item) => item !== code)
                    : [...current.forexFavourites, code],
                }))
              }
            />,
          )}
          {card(
            "clocksEnabled",
            t("mini.line.clock"),
            "clock",
            clocks.length > 0 ? clocks.map((tz) => cityFor(tz).city).join(" · ") : t("clock.add"),
            <ClockCities />,
          )}
        </ul>
      </section>
    </div>
  );
}

/** The clocks on Today, each removable, and a field to add another. */
function ClockCities() {
  const { t, modules, setModules } = useSettings();
  const [adding, setAdding] = useState(modules.clocks.length === 0);
  const remove = (tz: string) =>
    setModules((current) => ({
      ...current,
      clocks: current.clocks.filter((item) => item !== tz),
    }));
  const add = (tz: string) => {
    setModules((current) =>
      current.clocks.includes(tz) ? current : { ...current, clocks: [...current.clocks, tz] },
    );
    setAdding(false);
  };

  return (
    <div className="space-y-1.5">
      {modules.clocks.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {modules.clocks.map((tz) => (
            <span
              key={tz}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]"
            >
              {flagFor(tz)} {cityFor(tz).city}
              <button
                type="button"
                onClick={() => remove(tz)}
                aria-label={`${t("action.remove")} ${cityFor(tz).city}`}
                className="text-text-muted hover:text-text"
              >
                ✕
              </button>
            </span>
          ))}
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label={t("clock.add")}
              className="flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-text-muted hover:text-text"
            >
              <Icon name="plus" className="size-2.5" />
            </button>
          )}
        </div>
      )}
      {adding && (
        <AddCityField
          chosen={modules.clocks}
          onPick={add}
          onClose={() => setAdding(modules.clocks.length === 0)}
        />
      )}
    </div>
  );
}
