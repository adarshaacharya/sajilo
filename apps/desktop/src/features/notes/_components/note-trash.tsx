import { useState } from "react";
import useSWR from "swr";
import { Icon } from "../../../shared/components/icon";
import type { Toast } from "../../../shared/components/toast";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import type { NoteTrashed } from "../../../types/api/NoteTrashed";
import { useSentenceNumerals } from "../../focus/_lib/format";

/**
 * The Trash: notes deleted in the last 30 days, each with the days it has
 * left. Put one back, delete one now, or empty it all. Deleting for good
 * asks twice, since it can't be undone.
 */
export function NoteTrash({
  onChanged,
  onToast,
}: {
  onChanged: () => void;
  onToast: (toast: Toast) => void;
}) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const { data, mutate } = useSWR("notes-trash", () => api.notesTrashList());
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const done = () => {
    setOpen(null);
    setConfirm(null);
    void mutate();
    onChanged();
  };

  const restore = async (note: NoteTrashed) => {
    await api.notesRestore(note.id);
    done();
    onToast({ text: t("notes.restored") });
  };

  const deleteNow = async (id: string | null) => {
    if (confirm !== (id ?? "all")) {
      setConfirm(id ?? "all");
      return;
    }
    await api.notesDeleteForever(id);
    done();
    onToast({ text: id ? t("notes.deleted-forever") : t("notes.trash-emptied") });
  };

  if (!data) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 px-1">
        <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-text-muted">
          {t("notes.trash-note")}
        </p>
        {data.length > 0 && (
          <button
            type="button"
            onClick={() => void deleteNow(null)}
            className={`notes-trash-empty${confirm === "all" ? " is-confirming" : ""}`}
          >
            {confirm === "all" ? t("notes.empty-trash-confirm") : t("notes.empty-trash")}
          </button>
        )}
      </div>

      {data.length === 0 && (
        <p className="px-2 py-10 text-center text-[12px] text-text-muted">
          {t("notes.trash-empty")}
        </p>
      )}

      <ul>
        {data.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              className="notes-row"
              aria-expanded={open === note.id}
              onClick={() => {
                setOpen(open === note.id ? null : note.id);
                setConfirm(null);
              }}
            >
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-secondary">
                  {note.title || t("notes.untitled")}
                </span>
                <span className="shrink-0 text-[11px] text-text-muted">
                  {(note.daysLeft === 1 ? t("notes.day-left") : t("notes.days-left")).replace(
                    "{n}",
                    digits(note.daysLeft, numerals),
                  )}
                </span>
              </span>
              {note.preview && (
                <span className="mt-0.5 block truncate text-[12px] text-text-muted">
                  {note.preview}
                </span>
              )}
            </button>
            {open === note.id && (
              <div className="notes-trash-actions">
                <button
                  type="button"
                  onClick={() => void restore(note)}
                  className="notes-trash-restore"
                >
                  <Icon name="rotate" className="size-3" />
                  {t("notes.restore")}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteNow(note.id)}
                  className={`notes-trash-delete${confirm === note.id ? " is-confirming" : ""}`}
                >
                  {confirm === note.id ? t("notes.delete-now-confirm") : t("notes.delete-now")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
