import { Icon } from "../../../shared/components/icon";
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

export function HeadlineRow({
  item,
  showSource = true,
  onOpen,
}: {
  item: NewsItem;
  /** False when the list is already filtered to one publisher. */
  showSource?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-card group w-full cursor-pointer p-2 text-left transition-colors hover:bg-surface-hover"
    >
      <p className="text-[13px] leading-snug">{item.title}</p>
      <div className="mt-1 flex items-center gap-1 text-[10px]">
        {showSource && (
          <span className="font-medium text-[color:var(--color-accent-mark)]">
            {item.sourceName}
          </span>
        )}
        {item.published && (
          <>
            {showSource && <span className="text-text-muted">·</span>}
            <span className="text-text-secondary">{age(item)}</span>
          </>
        )}
        <Icon
          name="openExternal"
          className="ml-auto size-2.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </button>
  );
}
