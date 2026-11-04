import { type ReactNode, useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { Menu } from "../../../shared/components/menu";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import {
  EVERY_HOURS,
  everyLabel,
  followSummary,
  HOUR_OPTIONS,
} from "../../../shared/lib/news-follow";
import { track } from "../../../shared/lib/usage";
import type { NewsFollowMode } from "../../../types/api/NewsFollowMode";
import type { NewsFollows } from "../../../types/api/NewsFollows";

const DEFAULTS: NewsFollows = { sources: {}, dailyHour: 8, everyHours: 3 };

/**
 * The bell beside News's source picker: how the chosen newsroom, or all of
 * them, is heard from. Four lines; the two with a time carry it inline, as a
 * small picker inside the line itself, so nothing opens a second level.
 */
export function FollowBell({ source }: { source: string }) {
  const { t } = useSettings();
  const [follows, setFollows] = useState<NewsFollows | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .newsFollows()
      .then(setFollows)
      .catch(() => {});
  }, []);

  const current = follows ?? DEFAULTS;
  const mode = current.sources[source] ?? null;

  /** Shown at once; the shell's answer, when there is one, is the truth. */
  const save = (next: NewsFollows, call: Promise<NewsFollows | null>) => {
    const before = follows;
    setFollows(next);
    call.then((saved) => saved && setFollows(saved)).catch(() => setFollows(before));
  };

  const choose = (next: NewsFollowMode | null, close = true) => {
    if (close) setOpen(false);
    if (next === mode) return;
    if (next) {
      track("action.news-follow");
      // Following is the moment notifications start to matter.
      void api.requestNotificationPermission().catch(() => {});
    }
    const sources = { ...current.sources };
    if (next) sources[source] = next;
    else delete sources[source];
    save({ ...current, sources }, api.setNewsFollow(source, next));
  };

  const setEvery = (hours: number) => {
    save({ ...current, everyHours: hours }, api.setNewsEveryHours(hours));
    choose("hours", false);
  };
  const setHour = (hour: number) => {
    save({ ...current, dailyHour: hour }, api.setNewsDailyHour(hour));
    choose("daily", false);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        // Its own click toggles; the menu's outside-click must not reopen it.
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => setOpen((was) => !was)}
        aria-label={t("news.follow")}
        aria-expanded={open}
        title={mode ? followSummary(t, mode, current) : t("news.follow")}
        className="icon-btn size-[22px]"
      >
        <Icon name="bell" className={`size-3 ${mode ? "text-accent-mark" : ""}`} />
        {mode && <span className="news-follow-dot" aria-hidden="true" />}
      </button>
      {open && (
        <Menu onClose={() => setOpen(false)}>
          <Choice checked={!mode} onClick={() => choose(null)}>
            {t("news.follow.off")}
          </Choice>
          <Choice checked={mode === "each"} onClick={() => choose("each")}>
            {t("news.follow.each")}
          </Choice>
          <Choice
            checked={mode === "hours"}
            onClick={() => choose("hours")}
            label={t("news.follow.hours-menu")}
            pick={
              <InlinePick
                ariaLabel={t("news.follow.hours-menu").replace("{pick}", "").trim()}
                value={String(current.everyHours)}
                options={EVERY_HOURS.map((hours) => ({
                  id: String(hours),
                  label: everyLabel(t, hours),
                }))}
                onChange={(value) => setEvery(Number(value))}
              />
            }
          />
          <Choice
            checked={mode === "daily"}
            onClick={() => choose("daily")}
            label={t("news.follow.daily-menu")}
            pick={
              <InlinePick
                ariaLabel={t("news.daily-at")}
                value={String(current.dailyHour)}
                options={HOUR_OPTIONS}
                onChange={(value) => setHour(Number(value))}
              />
            }
          />
        </Menu>
      )}
    </div>
  );
}

/** One line of the menu. With `label` and `pick`, `{pick}` in the label is
 * where the picker sits, so each language keeps its own word order. */
function Choice({
  checked,
  onClick,
  children,
  label,
  pick,
}: {
  checked: boolean;
  onClick: () => void;
  children?: ReactNode;
  label?: string;
  pick?: ReactNode;
}) {
  const [before, after] = label ? label.split("{pick}") : [undefined, undefined];
  return (
    <div className="notes-menu__item news-follow-choice">
      <button
        type="button"
        role="menuitemradio"
        aria-checked={checked}
        onClick={onClick}
        className="min-w-0 truncate text-left"
      >
        {children ?? before}
      </button>
      {pick}
      {after ? (
        <button type="button" onClick={onClick} className="truncate text-left">
          {after}
        </button>
      ) : null}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClick}
        className="flex flex-1 justify-end self-stretch"
      >
        {checked && <Icon name="checkmark" className="size-3 text-accent-mark" />}
      </button>
    </div>
  );
}

/** A small native picker that reads as part of the sentence it sits in. */
function InlinePick({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <span className="news-follow-pick">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" className="size-2 shrink-0" />
    </span>
  );
}
