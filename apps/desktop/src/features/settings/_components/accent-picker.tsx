import { useState } from "react";
import { CONTROL_LABEL } from "../../../shared/components/control";
import { ACCENTS, type Accent, useSettings } from "../../../shared/context/settings-context";

/**
 * The accent: eight dots round the colour wheel, each a preset named for
 * something every Nepali knows. The name below follows the pointer, so a
 * dot can be read before it is picked, and settles back on the chosen one.
 * The whole app, the card windows included, takes it at once. Native radios,
 * so arrow keys move between the dots.
 */
export function AccentPicker() {
  const { t, accent, setAccent } = useSettings();
  const [hovered, setHovered] = useState<Accent | null>(null);
  const named = hovered ?? accent;
  return (
    <fieldset>
      <legend className={CONTROL_LABEL}>{t("settings.accent")}</legend>
      <div className="flex items-center gap-2.5 py-1">
        {ACCENTS.map((id) => (
          <label
            key={id}
            title={t(`accent.${id}`)}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
            className={`accent-swatch accent-swatch--${id}`}
          >
            <input
              type="radio"
              name="accent"
              value={id}
              checked={accent === id}
              onChange={() => setAccent(id)}
              aria-label={t(`accent.${id}`)}
              className="sr-only"
            />
          </label>
        ))}
      </div>
      <p
        className={`text-[11px] ${hovered && hovered !== accent ? "text-text-muted" : "text-text-secondary"}`}
      >
        {t(`accent.${named}`)}
      </p>
    </fieldset>
  );
}
