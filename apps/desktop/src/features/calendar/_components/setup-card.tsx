import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Segmented } from "../../../shared/components/segmented";
import { Select } from "../../../shared/components/select";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { placeName, usePlaces } from "../../../shared/lib/places";
import { track } from "../../../shared/lib/usage";

/** Set by the shell on a brand-new install only, so people who already use
 * Sajilo never see this; cleared by Done. */
const PENDING_KEY = "setupCardPending";

/** Whether the one-time setup card is due, and the way to put it away. */
export function useSetupCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getSetting<boolean>(PENDING_KEY)
      .then((pending) => {
        if (!cancelled) setVisible(pending === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    track("action.setup-done");
    setVisible(false);
    void api.deleteSetting(PENDING_KEY).catch(() => {});
  };

  return { visible, dismiss };
}

/**
 * The three choices that change what a new user sees on every screen: which
 * place the weather is for, the language, and the digits. Each saves the moment
 * it is picked, so closing the window halfway loses nothing; Done only puts the
 * card away. Everything here is also in Settings.
 */
export function SetupCard({ onDone }: { onDone: () => void }) {
  const { t, language, numerals, modules, setLanguage, setNumerals, setModules } = useSettings();
  const places = usePlaces();

  // Grouped by province, in the order the data keeps (east to west), with
  // the towns alphabetical inside each.
  const groups = useMemo(() => {
    const byProvince = new Map<string, { id: string; label: string }[]>();
    for (const place of places) {
      const province = language === "ne" ? place.provinceNe : place.province;
      const option = { id: place.id, label: placeName(place, language) };
      byProvince.set(province, [...(byProvince.get(province) ?? []), option]);
    }
    return [...byProvince].map(([label, options]) => ({
      label,
      options: [...options].sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [places, language]);

  const makeHome = (id: string) =>
    setModules((current) => ({
      ...current,
      weatherLocation: id,
      weatherPins: [id, ...current.weatherPins.filter((pin) => pin !== id)],
    }));

  return (
    <section
      className="rounded-[10px] border p-2.5"
      style={{
        borderColor: "color-mix(in srgb, var(--color-accent-mark) 35%, transparent)",
        background: "color-mix(in srgb, var(--color-accent-mark) 8%, transparent)",
      }}
    >
      <p className="text-[12px] font-semibold leading-snug">{t("setup.title")}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{t("setup.body")}</p>

      <div className="mt-2.5 grid gap-2">
        {places.length > 0 && (
          <Select
            label={t("setup.place")}
            value={modules.weatherLocation}
            onChange={makeHome}
            options={[]}
            groups={groups}
          />
        )}
        <Row label={t("setup.language")}>
          <Segmented
            label={t("setup.language")}
            size="sm"
            value={language}
            onChange={setLanguage}
            options={[
              { id: "en", label: "English" },
              { id: "ne", label: "नेपाली" },
            ]}
          />
        </Row>
        <p className="-mt-1 text-[10px] leading-snug text-text-muted">{t("setup.language-note")}</p>
        <Row label={t("setup.digits")}>
          <Segmented
            label={t("setup.digits")}
            size="sm"
            value={numerals}
            onChange={setNumerals}
            options={[
              { id: "latin", label: "1 2 3" },
              { id: "devanagari", label: "१ २ ३" },
            ]}
          />
        </Row>
      </div>

      <div className="mt-2.5 flex justify-end">
        <button type="button" onClick={onDone} className="settings-btn settings-btn--accent">
          {t("setup.done")}
        </button>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-text-secondary">{label}</span>
      {children}
    </div>
  );
}
