import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { LIMITS } from "../../../shared/lib/limits";
import type { NoteFolder } from "../../../types/api/NoteFolder";
import type { NoteSearchHit } from "../../../types/api/NoteSearchHit";
import type { NoteSummary } from "../../../types/api/NoteSummary";
import type { NoteTextPart } from "../../../types/api/NoteTextPart";

/** A pause in typing before searching, so each keystroke isn't a query. */
const SEARCH_AFTER_MS = 180;

function Marked({ parts }: { parts: NoteTextPart[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed line
          <mark key={index} className="notes-hit">
            {part.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed line
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Search, over the list. Recent notes before anything is typed; then every
 * note whose words match, English or Nepali, best first, with the matching
 * words marked, and a way to make a note by that name when nothing fits.
 */
export function NoteSearch({
  notes,
  folders,
  folderName,
  onOpen,
  onCreate,
  onClose,
}: {
  notes: NoteSummary[];
  folders: NoteFolder[];
  folderName: (folder: NoteFolder | undefined) => string;
  onOpen: (id: string) => void;
  onCreate: (title: string) => void;
  onClose: () => void;
}) {
  const { t } = useSettings();
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [hits, setHits] = useState<NoteSearchHit[] | null>(null);

  useEffect(() => {
    const typed = query.trim();
    if (!typed) {
      setHits(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      api
        .notesSearch(typed, folder)
        .then((found) => live && setHits(found))
        .catch(() => live && setHits([]));
    }, SEARCH_AFTER_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query, folder]);

  const folderOf = (id: string) => folderName(folders.find((item) => item.id === id));
  const recent = notes.slice(0, 5);

  return (
    <div className="notes-search" role="dialog" aria-label={t("notes.search")}>
      <div className="flex items-center gap-2 px-2.5 pt-2.5">
        <div className="notes-search__field field-shell">
          <Icon name="search" className="size-3.5 shrink-0 text-text-muted" />
          <input
            // biome-ignore lint/a11y/noAutofocus: search opens to be typed into
            autoFocus
            type="search"
            autoComplete="off"
            value={query}
            maxLength={LIMITS.SEARCH}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "Enter") {
                const first = hits?.[0];
                if (first) onOpen(first.id);
                else if (query.trim()) onCreate(query.trim());
              }
            }}
            placeholder={t("notes.search-placeholder")}
            aria-label={t("notes.search-placeholder")}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-muted"
          />
        </div>
        <button type="button" onClick={onClose} className="text-[12.5px] text-accent-mark">
          {t("notes.cancel")}
        </button>
      </div>

      <div className="notes-chips px-2.5 pt-2">
        <button
          type="button"
          aria-pressed={folder === null}
          onClick={() => setFolder(null)}
          className="notes-chip"
        >
          {t("notes.all")}
        </button>
        {folders.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={folder === item.id}
            onClick={() => setFolder(item.id)}
            className="notes-chip"
          >
            {folderName(item)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {hits === null ? (
          <>
            <h3 className="notes-group-label">{t("notes.search-recent")}</h3>
            {recent.map((note) => (
              <button
                type="button"
                key={note.id}
                className="notes-row"
                onClick={() => onOpen(note.id)}
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {note.title || t("notes.untitled")}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-muted">
                    {folderOf(note.folderId)}
                  </span>
                </span>
              </button>
            ))}
          </>
        ) : (
          <>
            {hits.map((hit) => (
              <button
                type="button"
                key={hit.id}
                className="notes-row"
                onClick={() => onOpen(hit.id)}
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {hit.title.length > 0 ? <Marked parts={hit.title} /> : t("notes.untitled")}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-muted">
                    {folderOf(hit.folderId)}
                  </span>
                </span>
                {hit.snippet.length > 0 && (
                  <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-text-secondary">
                    <Marked parts={hit.snippet} />
                  </span>
                )}
              </button>
            ))}
            {hits.length === 0 && (
              <p className="px-2 py-4 text-center text-[12px] text-text-muted">
                {t("notes.search-none")}
              </p>
            )}
            <button type="button" className="notes-row" onClick={() => onCreate(query.trim())}>
              <span className="flex items-center gap-2 text-[13px] text-accent-mark">
                <Icon name="plus" className="size-3" />
                {t("notes.search-create").replace("{title}", query.trim())}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
