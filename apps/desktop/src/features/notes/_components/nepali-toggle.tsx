import nepalFlag from "../../../../src-tauri/assets/nepal-flag.svg";
import { useSettings } from "../../../shared/context/settings-context";

/**
 * The switch for typing Nepali in English letters: the Nepal flag and ने, so
 * it reads as "Nepali" at a glance. The flag is Sajilo's own drawing, the
 * one the tray uses, not the 🇳🇵 emoji, which Windows shows as the letters
 * "NP".
 */
export function NepaliToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { t } = useSettings();
  return (
    <button
      type="button"
      onClick={onToggle}
      // Keep the editor's selection when pressed from the format bar.
      onMouseDown={(event) => event.preventDefault()}
      aria-pressed={on}
      aria-label={t("notes.nepali-typing")}
      title={t("notes.nepali-typing")}
      className="notes-ne"
    >
      <img src={nepalFlag} alt="" className="notes-ne__flag" />
      <span>ने</span>
    </button>
  );
}
