import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type FocusSnapshot } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { Chip, Ring } from "../../focus/_components/ring";
import {
  HOLD_ICONS,
  HOLD_LABELS,
  KIND_TINTS,
  kindLabel,
  upcoming,
  useSentenceNumerals,
} from "../../focus/_lib/format";

const REFRESH_MS = 60_000;

/**
 * Routine on the home screen, as light as it can be: one line saying when
 * the next break is, or that breaks are waiting on a call. No card of its
 * own, no second line, no numbers to decode; tap it for the Routine tab.
 * When there is nothing to say, it is not there at all.
 */
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

  const { settings, status } = snapshot;
  const [next] = upcoming(snapshot);

  let lead: React.ReactNode;
  let line: string;
  if (status === "held" && snapshot.hold) {
    lead = <Chip icon={HOLD_ICONS[snapshot.hold]} tint="var(--color-accent-mark)" size={20} />;
    line = t("focus.held.title").replace("{what}", t(HOLD_LABELS[snapshot.hold]));
  } else if (next && next.minutesLeft !== null) {
    lead = (
      <Ring
        fraction={1 - next.minutesLeft / Math.max(1, next.everyMinutes)}
        color={KIND_TINTS[next.kind]}
        label=""
        size={20}
        resting={status === "away"}
      />
    );
    line = t("focus.next.title")
      .replace("{kind}", kindLabel(next.kind, settings, t))
      .replace("{n}", digits(next.minutesLeft, numerals));
  } else {
    return null;
  }

  return (
    <button type="button" onClick={() => navigate("/focus")} className="focus-glance">
      {lead}
      <span className="min-w-0 flex-1 truncate text-[12px] tabular-nums">{line}</span>
      <Icon name="chevronRight" className="size-2.5 shrink-0 text-text-muted" />
    </button>
  );
}
