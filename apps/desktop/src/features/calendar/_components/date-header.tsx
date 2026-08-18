import { useNavigate } from "react-router";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { Today } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { useNepalClock } from "../_lib/nepal-clock";

const WEEKDAYS_NE = ["आइत", "सोम", "मंगल", "बुध", "बिहि", "शुक्र", "शनि"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatGregorian(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function quitApp() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("quit_app");
  } catch {
    window.close();
  }
}

export function DateHeader({ today }: { today: Today }) {
  const { numerals, language, t } = useSettings();
  const navigate = useNavigate();
  const weekday = language === "en" ? WEEKDAYS_EN[today.weekday] : WEEKDAYS_NE[today.weekday];
  const clock = useNepalClock();
  const clockText = `${digits(clock.hour, numerals, 2)}:${digits(clock.minute, numerals, 2)}:${digits(clock.second, numerals, 2)}`;

  return (
    <div className="flex items-start gap-3 px-0.5 pt-0.5">
      <button
        type="button"
        onClick={() =>
          navigate(`/day?y=${today.nepali.year}&m=${today.nepali.month}&d=${today.nepali.day}`)
        }
        className="surface-card date-plate flex w-[54px] shrink-0 flex-col items-center py-1.5"
      >
        <span className="text-[30px] font-bold leading-none text-[color:var(--color-accent-mark)]">
          {digits(today.nepali.day, numerals)}
        </span>
        <span className="mt-0.5 text-[11px] text-text-secondary">{weekday}</span>
      </button>

      <div className="min-w-0 flex-1 pt-1">
        <p className="text-[19px] font-semibold leading-tight">
          {today.nepaliMonthName} {digits(today.nepali.year, numerals)}
        </p>
        <p className="mt-0.5 text-[11px] tracking-[0.3px] text-text-secondary">
          {formatGregorian(today.gregorian)}
        </p>
        <p className="mt-0.5 text-[11px] tabular-nums tracking-[0.3px] text-text-muted">
          {clockText}
        </p>
      </div>

      <div className="flex shrink-0 gap-0.5 pt-0.5">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          aria-label={t("screen.settings")}
          className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <Icon name="settings" />
        </button>
        <button
          type="button"
          onClick={() => quitApp()}
          aria-label={t("action.quit")}
          className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <Icon name="power" />
        </button>
      </div>
    </div>
  );
}
