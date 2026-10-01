import { useState } from "react";
import { Icon, type IconName } from "../../../shared/components/icon";
import { Menu, MenuItem } from "../../../shared/components/menu";
import { Select } from "../../../shared/components/select";
import { Switch } from "../../../shared/components/switch";
import { TABS } from "../../../shared/components/tab-bar";
import { type ModulePrefs, useSettings } from "../../../shared/context/settings-context";
import { digits } from "../../../shared/lib/numerals";
import { placeLabel, usePlaces } from "../../../shared/lib/places";
import { MAX_BAR_TABS, tabLayout } from "../../../shared/lib/tab-layout";
import { CurrencyPicker } from "./currency-picker";

type Tab = (typeof TABS)[number];
type Place = "bar" | "more" | "hidden";

/**
 * Settings › Customize: what Sajilo shows, and where.
 *
 * Every tab is listed once, under where it lives now — the tab bar, More, or
 * hidden — and one ⋯ menu moves it between them. Where a row sits is the
 * explanation, so rows carry no notes. The cards on the Today screen, which
 * aren't tabs, get plain switches of their own below.
 */
export function ModulesTab() {
  const { t, language, modules, setModules } = useSettings();
  const places = usePlaces();
  const [menu, setMenu] = useState<string | null>(null);
  const numerals = language === "ne" ? "devanagari" : "latin";

  const { bar, more } = tabLayout(TABS, modules);
  const onBar = bar.filter((tab) => tab.to !== "/");
  const hidden = TABS.filter((tab) => tab.module && modules[tab.module] !== true);
  const order = onBar.map((tab) => tab.to);
  const full = onBar.length >= MAX_BAR_TABS;

  const setOrder = (next: string[]) => setModules((current) => ({ ...current, tabBar: next }));
  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    const [taken] = next.splice(index, 1);
    if (taken) next.splice(index + by, 0, taken);
    setOrder(next);
  };
  const place = (tab: Tab, to: Place) => {
    setMenu(null);
    setModules((current) => {
      const rest = order.filter((path) => path !== tab.to);
      const next: ModulePrefs = {
        ...current,
        tabBar: to === "bar" ? [...rest, tab.to] : rest,
      };
      if (tab.module) next[tab.module] = to !== "hidden";
      return next;
    });
  };

  const row = (tab: Tab, where: Place, index = 0) => (
    <li key={tab.to} className={`tab-editor__row${where === "bar" ? "" : " is-more"}`}>
      <Icon name={tab.icon} className="size-3.5" />
      <span className="min-w-0 flex-1 truncate">{t(tab.labelKey)}</span>
      {where === "bar" && (
        <>
          <button
            type="button"
            className="icon-btn"
            disabled={index === 0}
            onClick={() => move(index, -1)}
            aria-label={`${t(tab.labelKey)}: ${t("settings.move-up")}`}
          >
            <Icon name="chevronUp" className="size-3" />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={index === onBar.length - 1}
            onClick={() => move(index, 1)}
            aria-label={`${t(tab.labelKey)}: ${t("settings.move-down")}`}
          >
            <Icon name="chevronDown" className="size-3" />
          </button>
        </>
      )}
      <span className="relative">
        <button
          type="button"
          className="icon-btn"
          aria-haspopup="menu"
          aria-expanded={menu === tab.to}
          onClick={() => setMenu((open) => (open === tab.to ? null : tab.to))}
          aria-label={`${t(tab.labelKey)}: ${t("customize.options")}`}
        >
          <Icon name="ellipsis" className="size-3" />
        </button>
        {menu === tab.to && (
          <Menu onClose={() => setMenu(null)}>
            {where !== "bar" && !full && (
              <MenuItem label={t("customize.to-bar")} onClick={() => place(tab, "bar")} />
            )}
            {where !== "more" && (
              <MenuItem label={t("customize.to-more")} onClick={() => place(tab, "more")} />
            )}
            {where !== "hidden" && tab.module && (
              <MenuItem label={t("customize.hide")} danger onClick={() => place(tab, "hidden")} />
            )}
          </Menu>
        )}
      </span>
    </li>
  );

  const card = (
    title: string,
    icon: IconName,
    key: "weatherEnabled" | "forexEnabled" | "clocksEnabled",
    detail?: React.ReactNode,
  ) => (
    <li key={key}>
      <div className="flex min-h-[30px] items-center gap-2 px-2">
        <Icon
          name={icon}
          className={`size-3.5 shrink-0 ${modules[key] ? "text-accent-mark" : "text-text-muted"}`}
        />
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{title}</span>
        <Switch
          checked={modules[key]}
          ariaLabel={title}
          onChange={(value) => setModules((current) => ({ ...current, [key]: value }))}
        />
      </div>
      {modules[key] && detail ? <div className="pb-1.5 pl-[30px] pr-2">{detail}</div> : null}
    </li>
  );

  return (
    <div className="space-y-2.5">
      <section className="surface-card space-y-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="tab-editor__label">{t("settings.tab-bar")}</p>
          <p className="text-[10.5px] text-text-muted">
            {t("customize.bar-limit").replace("{n}", digits(MAX_BAR_TABS, numerals))}
          </p>
        </div>
        <ul className="space-y-0.5">
          <li className="tab-editor__row is-fixed">
            <Icon name="today" className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">{t("tab.today")}</span>
          </li>
          {onBar.map((tab, index) => row(tab, "bar", index))}
        </ul>

        {more.length > 0 && (
          <>
            <p className="tab-editor__label pt-1">{t("settings.tab-bar-in-more")}</p>
            <ul className="space-y-0.5">{more.map((tab) => row(tab, "more"))}</ul>
          </>
        )}

        {hidden.length > 0 && (
          <>
            <p className="tab-editor__label pt-1">{t("customize.hidden")}</p>
            <ul className="space-y-0.5 opacity-70">{hidden.map((tab) => row(tab, "hidden"))}</ul>
          </>
        )}
      </section>

      <section className="surface-card space-y-1 p-3">
        <p className="tab-editor__label pb-1">{t("customize.today-screen")}</p>
        <ul className="space-y-0.5">
          {card(
            t("feature.weather"),
            "weather",
            "weatherEnabled",
            <>
              <Select
                label={t("settings.city")}
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
              />
              <p className="mt-1 text-[10px] text-text-muted">{t("settings.city-pins-hint")}</p>
            </>,
          )}
          {card(
            t("feature.forex"),
            "forex",
            "forexEnabled",
            <CurrencyPicker
              title={t("settings.currencies")}
              hint={t("settings.currencies-hint")}
              selected={modules.forexFavourites}
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
          {card(t("tools.clock"), "clock", "clocksEnabled")}
        </ul>
      </section>
    </div>
  );
}
