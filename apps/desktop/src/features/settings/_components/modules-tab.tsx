import { Select } from "../../../shared/components/select";
import { useSettings } from "../../../shared/context/settings-context";
import { placeLabel, usePlaces } from "../../../shared/lib/places";
import { CurrencyPicker } from "./currency-picker";
import { ModuleRow } from "./module-row";

export function ModulesTab() {
  const { t, language, modules, setModules } = useSettings();
  const places = usePlaces();

  const toggleForex = (code: string) => {
    setModules((current) => ({
      ...current,
      forexFavourites: current.forexFavourites.includes(code)
        ? current.forexFavourites.filter((item) => item !== code)
        : [...current.forexFavourites, code],
    }));
  };

  const noneOn =
    !modules.weatherEnabled &&
    !modules.forexEnabled &&
    !modules.newsEnabled &&
    !modules.bazarEnabled &&
    !modules.rashifalEnabled &&
    !modules.radioEnabled;

  return (
    <div className="space-y-1.5">
      <ModuleRow
        title={t("feature.weather")}
        note={t("settings.module-weather-note")}
        icon="weather"
        checked={modules.weatherEnabled}
        onChange={(value) => setModules((current) => ({ ...current, weatherEnabled: value }))}
      >
        {/* Pinning happens on the weather screen; here the home place is
            picked from what is already pinned. */}
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
      </ModuleRow>

      <ModuleRow
        title={t("feature.forex")}
        note={t("settings.module-forex-note")}
        icon="forex"
        checked={modules.forexEnabled}
        onChange={(value) => setModules((current) => ({ ...current, forexEnabled: value }))}
      >
        <CurrencyPicker
          title={t("settings.currencies")}
          hint={t("settings.currencies-hint")}
          selected={modules.forexFavourites}
          onToggle={toggleForex}
        />
      </ModuleRow>

      <ModuleRow
        title={t("screen.news")}
        note={t("settings.module-news-note")}
        icon="news"
        checked={modules.newsEnabled}
        onChange={(value) => setModules((current) => ({ ...current, newsEnabled: value }))}
      />

      <ModuleRow
        title={t("screen.bazar")}
        note={t("settings.module-bazar-note")}
        icon="bazar"
        checked={modules.bazarEnabled}
        onChange={(value) => setModules((current) => ({ ...current, bazarEnabled: value }))}
      />

      <ModuleRow
        title={t("screen.rashifal")}
        note={t("settings.module-rashifal-note")}
        icon="rashifal"
        checked={modules.rashifalEnabled}
        onChange={(value) => setModules((current) => ({ ...current, rashifalEnabled: value }))}
      />

      <ModuleRow
        title={t("screen.radio")}
        note={t("settings.module-radio-note")}
        icon="radio"
        checked={modules.radioEnabled}
        onChange={(value) => setModules((current) => ({ ...current, radioEnabled: value }))}
      />

      <ModuleRow
        title={t("tools.clock")}
        note={t("settings.module-clocks-note")}
        icon="clock"
        checked={modules.clocksEnabled}
        onChange={(value) => setModules((current) => ({ ...current, clocksEnabled: value }))}
      />

      <ModuleRow
        title={t("keeper.title")}
        note={t("settings.module-keeper-note")}
        icon="keeper"
        checked={modules.keeperEnabled}
        onChange={(value) => setModules((current) => ({ ...current, keeperEnabled: value }))}
      />

      {noneOn && (
        <p className="px-0.5 text-[10px] text-text-muted">{t("settings.nothing-enabled")}</p>
      )}
    </div>
  );
}
