import { Icon } from "../../shared/components/icon";
import { SkeletonBlock } from "../../shared/components/skeleton";
import { StateBanner } from "../../shared/components/state-banner";
import { useSettings } from "../../shared/context/settings-context";
import { api } from "../../shared/lib/ipc";
import { RemindersCard } from "./_components/reminders-card";
import { ScheduleCard } from "./_components/schedule-card";
import { TodayCard } from "./_components/today-card";
import { useFocus } from "./_lib/use-focus";

/** Shown until a reminder is on: what Focus does, and one tap to start. */
function SetupCard({ onEnable }: { onEnable: () => void }) {
  const { t } = useSettings();
  return (
    <section className="surface-card relative overflow-hidden p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] text-accent-mark">
          <Icon name="focus" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[12px] font-semibold">{t("focus.setup.title")}</h2>
          <p className="mt-1 text-[11px] leading-snug text-text-secondary">
            {t("focus.setup.body")}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onEnable}
        className="settings-btn settings-btn--accent mt-3 w-full text-[12px]"
      >
        {t("focus.setup.action")}
      </button>
    </section>
  );
}

function FocusSkeleton() {
  return (
    <div className="space-y-2.5">
      <SkeletonBlock className="h-[188px] w-full rounded-[10px]" />
      <SkeletonBlock className="h-[150px] w-full rounded-[10px]" />
    </div>
  );
}

export function Focus() {
  const { t } = useSettings();
  const { load, refresh, act } = useFocus();

  if (load.status === "loading") return <FocusSkeleton />;
  if (load.status === "failed") {
    return (
      <StateBanner
        state={{ status: "failed", message: t("focus.unavailable") }}
        onRetry={refresh}
      />
    );
  }

  const { snapshot } = load;
  const anyOn = snapshot.breaks.some((item) => item.enabled);

  return (
    <div className="space-y-2.5">
      <TodayCard snapshot={snapshot} onWater={(delta) => act(() => api.logFocusWater(delta))} />
      {!anyOn && <SetupCard onEnable={() => act(api.enableRecommendedBreaks)} />}
      <RemindersCard
        snapshot={snapshot}
        onSettings={(settings) => act(() => api.setFocusSettings(settings))}
        onPause={(choice) => act(() => api.pauseFocus(choice))}
      />
      {anyOn && (
        <ScheduleCard
          settings={snapshot.settings}
          onSettings={(settings) => act(() => api.setFocusSettings(settings))}
        />
      )}
      <p className="px-1 text-[10px] leading-snug text-text-muted">
        {snapshot.idleSupported ? t("focus.how") : t("focus.no-idle")}
      </p>
    </div>
  );
}
