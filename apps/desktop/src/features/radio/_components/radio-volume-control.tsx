import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import * as player from "../../../shared/lib/audio";

export function RadioVolumeControl({ className = "" }: { className?: string }) {
  const { t } = useSettings();
  const [volume, setVolume] = useState(() => player.getState().volume);

  useEffect(() => player.subscribe((state) => setVolume(state.volume)), []);

  return (
    <div className={`radio-volume flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => player.toggleMute()}
        aria-label={volume > 0 ? t("radio.mute") : t("radio.unmute")}
        className="icon-btn shrink-0"
      >
        <Icon name={volume > 0 ? "speaker" : "speakerMute"} className="size-3.5" />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(volume * 100)}
        onChange={(event) => player.setVolume(Number(event.target.value) / 100)}
        aria-label={t("radio.volume")}
        className="radio-volume-slider"
      />
    </div>
  );
}
