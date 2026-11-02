import { Icon, type IconName } from "../../../shared/components/icon";
import { Select } from "../../../shared/components/select";
import { Switch } from "../../../shared/components/switch";
import { useSettings } from "../../../shared/context/settings-context";
import { placeLabel, usePlaces } from "../../../shared/lib/places";
import { CurrencyPicker } from "./currency-picker";
import { TabArranger } from "./tab-arranger";

/**
 * Settings › Customize: what Sajilo shows, and where.
 *
 * Every tab is listed once, under where it lives now — the tab bar, More, or
 * hidden — and dragged between them (see `TabArranger`). Where a row sits is
 * the explanation, so rows carry no notes. The cards on the Today screen,
 * which aren't tabs, get plain switches of their own below.
 */
export function ModulesTab() {
  const { t, language, modules, setModules } = useSettings();
  const places = usePlaces();

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
      <TabArranger />

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
