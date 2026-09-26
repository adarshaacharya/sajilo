import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../../../shared/components/icon";
import { Pressable } from "../../../shared/components/motion";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type FocusSnapshot } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { Chip, Ring } from "../../focus/_components/ring";
import {
  duration,
  HOLD_ICONS,
  HOLD_LABELS,
  KIND_TINTS,
  kindLabel,
  STATUS_LABELS,
  upcoming,
  useSentenceNumerals,
} from "../../focus/_lib/format";

const REFRESH_MS = 60_000;

/** One line of Routine on the home screen: what's next, and today's water. */
export function FocusGlance() {
  const { modules, t } = useSettings();
  const numerals = useSentenceNumerals();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<FocusSnapshot | null>(null);

  useEffect(() => {
    if (!modules.focusEnabled) return;
    const load = () =>
      api
        .focusSnapshot()
        .then(setSnapshot)
        .catch(() => setSnapshot(null));
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [modules.focusEnabled]);

  if (!modules.focusEnabled || !snapshot) return null;
  // Nothing to say until reminders are on; the tab itself explains them.
  if (!snapshot.breaks.some((item) => item.enabled)) return null;

  const { settings, status } = snapshot;
  const [next] = upcoming(snapshot);
  const screen = t("focus.glance-screen").replace(
    "{d}",
    duration(snapshot.today.screenSeconds, numerals, t),
  );

  let lead = <Chip icon="focus" tint="var(--color-accent-mark)" size={36} />;
  let headline = t(STATUS_LABELS[status]);
  if (status === "held" && snapshot.hold) {
    lead = <Chip icon={HOLD_ICONS[snapshot.hold]} tint="var(--color-accent-mark)" size={36} />;
    headline = t("focus.held.title").replace("{what}", t(HOLD_LABELS[snapshot.hold]));
  } else if (next && next.minutesLeft !== null) {
    lead = (
      <Ring
        fraction={1 - next.minutesLeft / Math.max(1, next.everyMinutes)}
        color={KIND_TINTS[next.kind]}
        label={`${digits(next.minutesLeft, numerals)}${t("focus.m-short")}`}
        size={36}
        resting={status === "away"}
      />
    );
    headline = t("focus.next.title")
      .replace("{kind}", kindLabel(next.kind, settings, t))
      .replace("{n}", digits(next.minutesLeft, numerals));
  }
  const detail =
    snapshot.dayOff && settings.daysOff === "lighter" && status !== "held"
      ? t(
          snapshot.dayOff === "publicHoliday"
            ? "focus.day-off.holiday-lighter"
            : "focus.day-off.weekly-lighter",
        )
      : screen;
  const step = Math.max(1, snapshot.waterStepMl);

  return (
    <Pressable>
      <button
        type="button"
        onClick={() => navigate("/focus")}
        className="surface-card flex w-full items-center gap-2.5 p-2.5 text-left"
      >
        {lead}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium tabular-nums">{headline}</span>
          <span className="mt-0.5 block truncate text-[10px] text-text-muted">{detail}</span>
        </span>
        {settings.water.enabled && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-text-secondary">
            <Icon name="drop" className="size-3 text-[color:var(--color-weather-tint)]" />
            {digits(Math.floor(snapshot.today.waterMl / step), numerals)}/
            {digits(Math.max(1, Math.round(settings.waterGoalMl / step)), numerals)}
          </span>
        )}
      </button>
    </Pressable>
  );
}
