import { useState } from "react";
import { SkeletonBlock } from "../../shared/components/skeleton";
import { StateBanner } from "../../shared/components/state-banner";
import { useSettings } from "../../shared/context/settings-context";
import { api } from "../../shared/lib/ipc";
import { Intro } from "./_components/intro";
import { Overview } from "./_components/overview";
import { RoutineAsk, routineOn } from "./_components/routine";
import { SettingsPanel } from "./_components/settings-panel";
import { useFocus } from "./_lib/use-focus";

function FocusSkeleton() {
  return (
    <div className="space-y-2.5">
      <SkeletonBlock className="h-[96px] w-full rounded-[10px]" />
      <SkeletonBlock className="h-[150px] w-full rounded-[10px]" />
    </div>
  );
}

/**
 * The Breaks tab. Before any reminder is on it explains itself and offers an
 * example; after, it answers one question — when is the next break — with
 * everything else behind Settings.
 */
export function Focus() {
  const { t } = useSettings();
  const { load, refresh, act } = useFocus();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const save = (settings: typeof snapshot.settings) => act(() => api.setFocusSettings(settings));

  if (settingsOpen) {
    return (
      <SettingsPanel
        snapshot={snapshot}
        onSettings={save}
        onTurnOff={() => {
          // Back to the first screen, which is what "off" looks like.
          setSettingsOpen(false);
          act(api.disableBreaks);
        }}
        onBack={() => setSettingsOpen(false)}
      />
    );
  }

  const anyOn =
    snapshot.breaks.some((item) => item.enabled) || routineOn(snapshot.settings.routine);
  if (!anyOn) {
    return (
      <Intro
        snapshot={snapshot}
        onTurnOn={() => act(api.enableRecommendedBreaks)}
        onExample={(kind) => act(() => api.previewFocusBreak(kind))}
      />
    );
  }

  // One question, once, right after turning on: when do you eat and sleep?
  if (!snapshot.settings.routineAsked) {
    return <RoutineAsk settings={snapshot.settings} onSave={save} />;
  }

  return (
    <Overview
      snapshot={snapshot}
      onSettings={save}
      onWater={(steps) => act(() => api.logFocusWater(steps))}
      onPause={(pause) => act(() => api.pauseFocus(pause ? "hour" : "resume"))}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  );
}
