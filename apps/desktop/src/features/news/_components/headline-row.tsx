import type { NewsItem } from "../../../types/api/NewsItem";

function age(item: NewsItem): string {
  if (!item.published) return "";
  const date = new Date(item.published);
  if (item.precision === "day") {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round((date.getTime() - Date.now()) / 3_600_000),
    "hour",
  );
}

/** A steady colour per publisher, so each is recognisable at a glance. */
export function sourceColor(source: string): string {
  let hash = 0;
  for (const char of source) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return `hsl(${hash} 60% 50%)`;
}

/**
 * One headline in the list: its publisher's dot, name and age above, the
 * title below. Read ones dim and lose their marker, so what is new since the
 * last visit stands out.
 */
export function HeadlineRow({
  item,
  showSource = true,
  read,
  onOpen,
}: {
  item: NewsItem;
  /** False when the list is already filtered to one publisher. */
  showSource?: boolean;
  read: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative block w-full cursor-pointer py-2.5 pr-7 pl-3 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
        {showSource && (
          <>
            <span
              className="size-[7px] shrink-0 rounded-full"
              style={{ background: sourceColor(item.source) }}
              aria-hidden="true"
            />
            <span className="font-semibold text-text-secondary">{item.sourceName}</span>
          </>
        )}
        {item.published && (
          <>
            {showSource && <span aria-hidden="true">·</span>}
            <span>{age(item)}</span>
          </>
        )}
      </span>
      <span
        className={`mt-0.5 block text-[13px] leading-snug ${
          read ? "text-text-muted" : "font-medium text-text"
        }`}
      >
        {item.title}
      </span>
      {!read && (
        <span
          className="absolute top-[15px] right-3 size-1.5 rounded-full bg-[color:var(--color-accent-fill)]"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
