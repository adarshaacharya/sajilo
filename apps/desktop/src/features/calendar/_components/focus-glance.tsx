import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../../../shared/components/icon";
import { Pressable } from "../../../shared/components/motion";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type FocusSnapshot } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { kindLabel, litres, STATUS_LABELS, useSentenceNumerals } from "../../focus/_lib/format";

const REFRESH_MS = 60_000;

/** One line of Routine on the home screen: when the next break is. */
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

  const next = snapshot.breaks
    .filter((item) => item.minutesLeft !== null)
    .sort((a, b) => (a.minutesLeft ?? 0) - (b.minutesLeft ?? 0))[0];
  const headline = next
    ? t("focus.glance-next").replace("{n}", digits(next.minutesLeft ?? 0, numerals))
    : t(STATUS_LABELS[snapshot.status]);
  const detail = next ? kindLabel(next.kind, snapshot.settings, t) : t("focus.glance-quiet");

  return (
    <Pressable>
      <button
        type="button"
        onClick={() => navigate("/focus")}
        className="surface-card flex w-full items-center gap-2.5 p-2.5 text-left"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] text-accent-mark">
          <Icon name="focus" className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium tabular-nums">{headline}</span>
          <span className="mt-0.5 block truncate text-[10px] text-text-muted">{detail}</span>
        </span>
        {snapshot.settings.water.enabled && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-text-secondary">
            <Icon name="drop" className="size-3 text-[color:var(--color-weather-tint)]" />
            {litres(snapshot.today.waterMl, numerals)} /{" "}
            {litres(snapshot.settings.waterGoalMl, numerals)} {t("focus.litres-unit")}
          </span>
        )}
      </button>
    </Pressable>
  );
}
