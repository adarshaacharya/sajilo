import { useNavigate } from "react-router";
import useSWR from "swr";
import { Icon } from "../../../shared/components/icon";
import { Pressable } from "../../../shared/components/motion";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../../shared/lib/load-state";
import { usePersistedString } from "../../../shared/lib/persisted";
import { SIGNS, validSign } from "../../rashifal/_lib/signs";

/** The Rashifal screen's key for the chosen sign, read here, never written. */
const SIGN_KEY = "selectedRashi";

/**
 * Today's reading for the user's own sign, on the home screen: rashifal is
 * read every morning, and this saves the trip to its tab. The reading is only
 * clamped for display, never cut or reworded; the full text is one tap away.
 * Shares the Rashifal screen's cache key, so the two never disagree.
 */
export function RashifalGlance() {
  const { t, language, modules } = useSettings();
  const navigate = useNavigate();
  const [storedSign] = usePersistedString(SIGN_KEY);
  const sign = validSign(storedSign);
  const { data: state } = useSWR(modules.rashifalEnabled ? "rashifal" : null, () =>
    catchAsFailed(api.getRashifal(false)),
  );

  if (!modules.rashifalEnabled) return null;

  const info = sign ? SIGNS.find((entry) => entry.id === sign) : undefined;
  const snapshot = loadedValue(state);
  const reading = sign ? snapshot?.readings.find((entry) => entry.sign === sign) : undefined;
  const failed = state !== undefined && !snapshot;

  return (
    <Pressable>
      <button
        type="button"
        onClick={() => navigate("/rashifal")}
        className="surface-card flex w-full flex-col gap-1 p-2.5 text-left"
      >
        <div className="flex items-center gap-1 text-text-muted">
          <Icon name="rashifal" className="size-3 text-[color:var(--color-accent-mark)]" />
          <span className="text-[10px]">
            {info
              ? language === "ne"
                ? info.ne
                : `${info.en} · ${info.ne}`
              : t("dashboard.rashifal")}
          </span>
          <span className="ml-auto text-[10px]">›</span>
        </div>
        {!sign ? (
          <p className="text-[11px] text-text-secondary">{t("dashboard.rashifal-pick")}</p>
        ) : reading ? (
          <p className="line-clamp-2 text-[12px] leading-snug">{reading.prediction}</p>
        ) : failed ? (
          <p className="text-[11px] text-text-muted">{t("rashifal.unavailable")}</p>
        ) : (
          <SkeletonBlock className="h-[30px] w-full" />
        )}
      </button>
    </Pressable>
  );
}
