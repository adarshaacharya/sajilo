import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "../../../shared/components/segmented";
import { Select } from "../../../shared/components/select";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { placeName, usePlaces } from "../../../shared/lib/places";
import { track } from "../../../shared/lib/usage";

/** Set by the shell on a brand-new install only, so people who already use
 * Sajilo never see this; cleared by Done. */
const PENDING_KEY = "setupCardPending";

/** Dev builds: show welcome card on Today until you set this to false. */
const DEV_ALWAYS_SHOW_SETUP = import.meta.env.DEV;

export const SETUP_PREVIEW_SESSION_KEY = "sajilo-preview-setup";
export const SETUP_PREVIEW_EVENT = "sajilo-preview-setup";

/** Opens the first-run setup on Today without touching install prefs. Dev builds only. */
export function triggerSetupPreview() {
  if (!import.meta.env.DEV) return;
  sessionStorage.setItem(SETUP_PREVIEW_SESSION_KEY, "1");
  window.dispatchEvent(new Event(SETUP_PREVIEW_EVENT));
}

/** Whether the one-time setup card is due, and the way to put it away. */
export function useSetupCard() {
  const [visible, setVisible] = useState(
    () => import.meta.env.DEV && DEV_ALWAYS_SHOW_SETUP,
  );
  const previewRef = useRef(import.meta.env.DEV && DEV_ALWAYS_SHOW_SETUP);

  useEffect(() => {
    let cancelled = false;
    const show = () => {
      if (cancelled) return;
      previewRef.current = true;
      setVisible(true);
    };

    const onPreview = () => show();
    const sessionPreview =
      import.meta.env.DEV && sessionStorage.getItem(SETUP_PREVIEW_SESSION_KEY) === "1";

    if (sessionPreview) {
      show();
    } else if (!DEV_ALWAYS_SHOW_SETUP) {
      api
        .getSetting<boolean>(PENDING_KEY)
        .then((pending) => {
          if (!cancelled) setVisible(pending === true);
        })
        .catch(() => {});
    }

    if (import.meta.env.DEV) {
      window.addEventListener(SETUP_PREVIEW_EVENT, onPreview);
    }

    return () => {
      cancelled = true;
      if (import.meta.env.DEV) {
        window.removeEventListener(SETUP_PREVIEW_EVENT, onPreview);
      }
    };
  }, []);

  const dismiss = () => {
    track("action.setup-done");
    setVisible(false);
    if (previewRef.current || (import.meta.env.DEV && DEV_ALWAYS_SHOW_SETUP)) {
      previewRef.current = false;
      sessionStorage.removeItem(SETUP_PREVIEW_SESSION_KEY);
      return;
    }
    void api.deleteSetting(PENDING_KEY).catch(() => {});
  };

  return { visible, dismiss };
}

/**
 * First-run welcome: language, digits, and home place. Sits above Today —
 * the calendar stays visible underneath. Each choice saves immediately; Done
 * only dismisses the card. Everything is also in Settings.
 */
export function SetupCard({ onDone }: { onDone: () => void }) {
  const { t, language, numerals, modules, setLanguage, setNumerals, setModules } = useSettings();
  const places = usePlaces();

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
      className="surface-card border p-2.5"
      style={{
        borderColor: "color-mix(in srgb, var(--color-accent-mark) 22%, var(--color-border))",
      }}
    >
      <p className="text-[13px] font-semibold leading-snug">{t("setup.title")}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{t("setup.body")}</p>

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
              { id: "en", label: t("language.english") },
              { id: "ne", label: t("language.nepali") },
            ]}
          />
        </Row>
        <Row label={t("setup.digits")}>
          <Segmented
            label={t("setup.digits")}
            size="sm"
            value={numerals}
            onChange={setNumerals}
            options={[
              { id: "latin", label: t("setup.digits-latin") },
              { id: "devanagari", label: t("setup.digits-devanagari") },
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
      <span className="shrink-0 text-[11px] text-text-secondary">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
