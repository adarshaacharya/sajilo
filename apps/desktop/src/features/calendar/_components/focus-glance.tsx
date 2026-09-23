import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../../../shared/components/icon";
import { Pressable } from "../../../shared/components/motion";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type FocusSnapshot } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { KIND_LABELS, STATUS_LABELS, screenTime } from "../../focus/_lib/format";

const REFRESH_MS = 60_000;

/** One line of Focus on the home screen: today's screen time and what's next. */
export function FocusGlance() {
  const { modules, numerals, t } = useSettings();
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

  const next = snapshot.breaks
    .filter((item) => item.minutesLeft !== null)
    .sort((a, b) => (a.minutesLeft ?? 0) - (b.minutesLeft ?? 0))[0];
  const detail = next
    ? t("focus.glance-next")
        .replace("{kind}", t(KIND_LABELS[next.kind]))
        .replace("{n}", digits(next.minutesLeft ?? 0, numerals))
    : t(STATUS_LABELS[snapshot.status]);

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
          <span className="block truncate text-[12px] font-medium tabular-nums">
            {screenTime(snapshot.today.screenSeconds, t, numerals)}{" "}
            <span className="font-normal text-text-muted">{t("focus.on-screen")}</span>
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-text-muted">{detail}</span>
        </span>
        {snapshot.settings.water.enabled && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-text-secondary">
            <Icon name="drop" className="size-3 text-[color:var(--color-weather-tint)]" />
            {digits(snapshot.today.waterGlasses, numerals)}/
            {digits(snapshot.settings.waterGoal, numerals)}
          </span>
        )}
      </button>
    </Pressable>
  );
}
