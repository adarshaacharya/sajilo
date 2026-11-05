import { type ReactNode, useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { EVERY_HOURS, followSummary, parseTime, timeLabel } from "../../../shared/lib/news-follow";
import { track } from "../../../shared/lib/usage";
import type { NewsFollowMode } from "../../../types/api/NewsFollowMode";
import type { NewsFollows } from "../../../types/api/NewsFollows";

const DEFAULTS: NewsFollows = { sources: {}, dailyTimes: [660, 900], everyHours: 3 };
/** See `NewsFollows::MAX_DAILY_HOURS`. */
const MAX_DAILY = 6;

/** The followed newsrooms, read once and saved optimistically: shown at
 * once, and the shell's answer, when there is one, is the truth. */
export function useNewsFollows() {
  const [follows, setFollows] = useState<NewsFollows | null>(null);
  useEffect(() => {
    api
      .newsFollows()
      .then(setFollows)
      .catch(() => {});
  }, []);
  const current = follows ?? DEFAULTS;
  const save = (next: NewsFollows, call: Promise<NewsFollows | null>) => {
    const before = follows;
    setFollows(next);
    call.then((saved) => saved && setFollows(saved)).catch(() => setFollows(before));
  };
  return { follows: current, save };
}

type Follows = ReturnType<typeof useNewsFollows>;

/** The bell beside News's source picker; lit, with a dot, while followed. */
export function FollowBell({
  source,
  follows,
  open,
  onToggle,
}: {
  source: string;
  follows: NewsFollows;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useSettings();
  const mode = follows.sources[source] ?? null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={t("news.follow")}
      aria-expanded={open}
      title={mode ? followSummary(t, mode, follows) : t("news.follow")}
      className={`icon-btn size-[22px] ${open ? "bg-surface-hover" : ""}`}
    >
      <Icon name="bell" className={`size-3 ${mode ? "text-accent-mark" : ""}`} />
      {mode && <span className="news-follow-dot" aria-hidden="true" />}
    </button>
  );
}

/**
 * How the chosen newsroom, or all of them, is heard from: four lines under
 * the source picker, the chosen one opening its own small choices in place.
 */
export function FollowPanel({
  source,
  follows: { follows, save },
  onClose,
}: {
  source: string;
  follows: Follows;
  onClose: () => void;
}) {
  const { t } = useSettings();
  const mode = follows.sources[source] ?? null;

  const choose = (next: NewsFollowMode | null) => {
    // Nothing more to pick for these two, so the panel is done.
    if (next === null || next === "each") onClose();
    if (next === mode) return;
    if (next) {
      track("action.news-follow");
      // Following is the moment notifications start to matter.
      void api.requestNotificationPermission().catch(() => {});
    }
    const sources = { ...follows.sources };
    if (next) sources[source] = next;
    else delete sources[source];
    save({ ...follows, sources }, api.setNewsFollow(source, next));
  };

  return (
    <section className="news-follow-panel" aria-label={t("news.follow")}>
      <Line checked={!mode} onClick={() => choose(null)}>
        {t("news.follow.off")}
      </Line>
      <Line checked={mode === "each"} onClick={() => choose("each")}>
        {t("news.follow.each")}
      </Line>
      <Line checked={mode === "hours"} onClick={() => choose("hours")}>
        {t("news.follow.hours-line")}
      </Line>
      {mode === "hours" && (
        <div className="news-follow-chips">
          {EVERY_HOURS.map((hours) => (
            <button
              key={hours}
              type="button"
              aria-pressed={follows.everyHours === hours}
              onClick={() => save({ ...follows, everyHours: hours }, api.setNewsEveryHours(hours))}
              className="news-follow-chip"
            >
              {t("news.hours-short").replace("{n}", String(hours))}
            </button>
          ))}
        </div>
      )}
      <Line checked={mode === "daily"} onClick={() => choose("daily")}>
        {t("news.follow.daily-line")}
      </Line>
      {mode === "daily" && <DailyTimes follows={follows} save={save} />}
    </section>
  );
}

/** The times of day a daily summary comes, as chips: ✕ takes one away; +
 * turns into a small box to type another in. One always stays. */
export function DailyTimes({ follows, save }: Follows) {
  const { t } = useSettings();
  const times = follows.dailyTimes;
  const [adding, setAdding] = useState(false);
  const set = (next: number[]) => {
    const sorted = [...new Set(next)].sort((a, b) => a - b);
    save({ ...follows, dailyTimes: sorted }, api.setNewsDailyTimes(sorted));
  };
  return (
    <div className="news-follow-chips">
      {times.map((time) => (
        <span key={time} className="news-follow-chip news-follow-chip--on">
          {timeLabel(time)}
          {times.length > 1 && (
            <button
              type="button"
              onClick={() => set(times.filter((each) => each !== time))}
              aria-label={`${t("action.remove")} ${timeLabel(time)}`}
              className="news-follow-chip__x"
            >
              <Icon name="close" className="size-2" />
            </button>
          )}
        </span>
      ))}
      {times.length < MAX_DAILY &&
        (adding ? (
          <TimeBox
            taken={times}
            onAdd={(time) => {
              set([...times, time]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label={t("news.add-time")}
            title={t("news.add-time")}
            className="news-follow-chip news-follow-chip--add"
          >
            <Icon name="plus" className="size-2.5" />
          </button>
        ))}
    </div>
  );
}

/** A chip-sized box a time is typed into: Enter or clicking away adds it,
 * Esc lets it go. A time it can't read, or one already there, shakes it. */
function TimeBox({
  taken,
  onAdd,
  onCancel,
}: {
  taken: number[];
  onAdd: (time: number) => void;
  onCancel: () => void;
}) {
  const { t } = useSettings();
  const [text, setText] = useState("");
  const [wrong, setWrong] = useState(false);
  const [shaking, setShaking] = useState(false);
  const commit = () => {
    if (!text.trim()) return onCancel();
    const time = parseTime(text);
    if (time === null || taken.includes(time)) {
      setWrong(true);
      setShaking(true);
      return;
    }
    onAdd(time);
  };
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: it appears because + was just pressed
      autoFocus
      maxLength={8}
      value={text}
      placeholder="9:30"
      aria-label={t("news.add-time")}
      aria-invalid={wrong}
      onChange={(event) => {
        setText(event.target.value);
        setWrong(false);
      }}
      onAnimationEnd={() => setShaking(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") onCancel();
      }}
      onBlur={commit}
      className={`news-follow-time${wrong ? " is-wrong" : ""}${shaking ? " is-shaking" : ""}`}
    />
  );
}

function Line({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={checked} onClick={onClick} className="news-follow-line">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {checked && <Icon name="checkmark" className="size-3 text-accent-mark" />}
    </button>
  );
}
