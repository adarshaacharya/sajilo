import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { LIMITS } from "../../../shared/lib/limits";
import type { NoteFolder } from "../../../types/api/NoteFolder";
import type { NoteSummary } from "../../../types/api/NoteSummary";
import type { NotesList } from "../../../types/api/NotesList";
import { NepaliToggle } from "./nepali-toggle";
import type { Toast } from "./toast";

type FolderName = (folder: NoteFolder | undefined) => string;

/** Characters that end a word, when typing Nepali in English letters. */
const WORD_END = /[\s.,!?;:)]$/;

export function NoteList({
  list,
  folder,
  folderName,
  onFolder,
  onOpen,
  onNew,
  onSearch,
  onChanged,
  onToast,
}: {
  list: NotesList | undefined;
  folder: string;
  folderName: FolderName;
  onFolder: (id: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onSearch: () => void;
  onChanged: () => void;
  onToast: (toast: Toast) => void;
}) {
  const { t } = useSettings();
  const notes = (list?.notes ?? []).filter((note) => folder === "all" || note.folderId === folder);
  const pinned = notes.filter((note) => note.pinned);
  // Pinned first, then under the heading of when each was last edited, in
  // the shell's order (newest first).
  const groups: { key: string; label: string; notes: NoteSummary[] }[] = [];
  if (pinned.length > 0) groups.push({ key: "pinned", label: t("notes.pinned"), notes: pinned });
  for (const note of notes) {
    if (note.pinned) continue;
    const last = groups.at(-1);
    if (last && last.key === note.group) last.notes.push(note);
    else groups.push({ key: note.group, label: note.groupLabel, notes: [note] });
  }
  const showFolder = folder === "all";
  const folderOf = (id: string) => list?.folders.find((item) => item.id === id);

  return (
    <div className="space-y-2">
      <JotBox onOpen={onOpen} onChanged={onChanged} onToast={onToast} />
      <button type="button" onClick={onSearch} className="notes-search-open">
        <Icon name="search" className="size-3.5" />
        {t("notes.search-placeholder")}
      </button>
      <FolderChips
        folders={list?.folders ?? []}
        total={list?.notes.length ?? 0}
        folder={folder}
        folderName={folderName}
        onFolder={onFolder}
        onChanged={onChanged}
        onToast={onToast}
      />
      {list && notes.length === 0 && (
        <p className="px-2 py-8 text-center text-[12px] leading-relaxed text-text-muted">
          {t("notes.empty-folder")}
        </p>
      )}
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="notes-group-label">{group.label}</h3>
          <ul>
            {group.notes.map((note) => (
              <li key={note.id}>
                <NoteRow
                  note={note}
                  folder={showFolder ? folderName(folderOf(note.folderId)) : null}
                  onOpen={() => onOpen(note.id)}
                  onChanged={onChanged}
                  onToast={onToast}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {/* Where a thumb or a pointer finds it, as in Apple Notes: at the foot,
          always in view however long the list. */}
      <div className="notes-new">
        <button type="button" onClick={onNew} className="notes-new__btn">
          <Icon name="compose" className="size-3.5" />
          {t("notes.new-note")}
        </button>
      </div>
    </div>
  );
}

/** Time of day for a note edited today or yesterday; the list's heading
 * already says which. Older ones show only the heading. */
function editedAt(note: NoteSummary, language: string): string {
  if (note.group !== "today" && note.group !== "yesterday") return "";
  return new Date(note.updatedAt).toLocaleTimeString(language === "ne" ? "ne-NP" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NoteRow({
  note,
  folder,
  onOpen,
  onChanged,
  onToast,
}: {
  note: NoteSummary;
  folder: string | null;
  onOpen: () => void;
  onChanged: () => void;
  onToast: (toast: Toast) => void;
}) {
  const { t, language } = useSettings();
  const [menu, setMenu] = useState(false);
  const title = note.title || t("notes.untitled");

  const trash = async () => {
    setMenu(false);
    await api.notesTrash(note.id);
    onChanged();
    onToast({
      text: t("notes.trashed"),
      action: {
        label: t("notes.undo"),
        run: () => void api.notesRestore(note.id).then(onChanged),
      },
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu(true);
        }}
        className="notes-row"
      >
        <span className="flex items-baseline gap-2">
          {note.pinned && <Icon name="pinFill" className="size-2.5 shrink-0 text-accent-mark" />}
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</span>
          <span className="shrink-0 text-[11px] text-text-muted tabular-nums">
            {editedAt(note, language)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {folder && <span className="shrink-0 text-[10.5px] text-text-muted">{folder} ·</span>}
          <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">
            {note.preview || t("notes.no-text")}
          </span>
          {note.openTasks > 0 && (
            <span className="notes-badge" title={t("notes.open-tasks")}>
              ☐ {note.openTasks}
            </span>
          )}
        </span>
      </button>
      {menu && (
        <Menu onClose={() => setMenu(false)}>
          <MenuItem
            label={note.pinned ? t("notes.unpin") : t("notes.pin")}
            onClick={() => {
              setMenu(false);
              void api.notesPin(note.id, !note.pinned).then(onChanged);
            }}
          />
          <MenuItem label={t("notes.trash")} danger onClick={() => void trash()} />
        </Menu>
      )}
    </div>
  );
}

/** A small menu under whatever opened it; any click outside closes it. */
export function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" className="notes-menu">
      {children}
    </div>
  );
}

export function MenuItem({
  label,
  onClick,
  danger,
  checked,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`notes-menu__item${danger ? " is-danger" : ""}`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {checked && <Icon name="checkmark" className="size-3 text-accent-mark" />}
    </button>
  );
}

/** One line into today's note, under the time. With ने on, words typed in
 * English letters turn into Nepali as each one ends. */
function JotBox({
  onOpen,
  onChanged,
  onToast,
}: {
  onOpen: (id: string) => void;
  onChanged: () => void;
  onToast: (toast: Toast) => void;
}) {
  const { t } = useSettings();
  const [text, setText] = useState("");
  const [nepali, setNepali] = useState(false);
  const [busy, setBusy] = useState(false);

  const change = (value: string) => {
    setText(value);
    if (!nepali || !WORD_END.test(value)) return;
    api
      .notesTransliterate(value, false)
      .then((turned) => setText((current) => (current === value ? turned : current)))
      .catch(() => {});
  };

  const add = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const finished = nepali ? await api.notesTransliterate(value, true) : value;
      const id = await api.notesJot(finished);
      setText("");
      onChanged();
      onToast({
        text: t("notes.jotted"),
        action: { label: t("notes.open"), run: () => onOpen(id) },
      });
    } catch {
      onToast({ text: t("notes.save-failed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`notes-jot${text ? " is-active" : ""}`}>
      <Icon name="bolt" className="size-3 shrink-0 text-accent-mark" />
      <input
        type="text"
        value={text}
        maxLength={LIMITS.NOTE}
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) void add();
        }}
        placeholder={nepali ? t("notes.jot-placeholder-ne") : t("notes.jot-placeholder")}
        aria-label={t("notes.jot-placeholder")}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-muted"
      />
      <NepaliToggle on={nepali} onToggle={() => setNepali((on) => !on)} />
      {text.trim() && (
        <button type="button" onClick={() => void add()} className="notes-jot__add" disabled={busy}>
          {t("notes.add")}
        </button>
      )}
    </div>
  );
}

function FolderChips({
  folders,
  total,
  folder,
  folderName,
  onFolder,
  onChanged,
  onToast,
}: {
  folders: NoteFolder[];
  total: number;
  folder: string;
  folderName: FolderName;
  onFolder: (id: string) => void;
  onChanged: () => void;
  onToast: (toast: Toast) => void;
}) {
  const { t } = useSettings();
  const [naming, setNaming] = useState<{ id: string | null; name: string } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const save = async () => {
    if (!naming) return;
    const name = naming.name.trim();
    if (!name) {
      setNaming(null);
      return;
    }
    try {
      if (naming.id) await api.notesRenameFolder(naming.id, name);
      else onFolder(await api.notesCreateFolder(name));
      onChanged();
    } catch (error) {
      onToast({ text: String(error) });
    }
    setNaming(null);
  };

  const remove = async (id: string) => {
    setMenu(null);
    try {
      await api.notesDeleteFolder(id);
      if (folder === id) onFolder("all");
      onChanged();
    } catch (error) {
      onToast({ text: String(error) });
    }
  };

  const nameInput = (
    <input
      // biome-ignore lint/a11y/noAutofocus: opened by the user's own click, to type into
      autoFocus
      value={naming?.name ?? ""}
      maxLength={LIMITS.FOLDER}
      onChange={(event) =>
        setNaming((current) => current && { ...current, name: event.target.value })
      }
      onKeyDown={(event) => {
        if (event.key === "Enter") void save();
        if (event.key === "Escape") {
          event.preventDefault();
          setNaming(null);
        }
      }}
      onBlur={() => void save()}
      placeholder={t("notes.folder-name")}
      aria-label={t("notes.folder-name")}
      className="notes-chip is-editing"
    />
  );

  return (
    <div className="notes-chips" role="tablist" aria-label={t("notes.folders")}>
      <button
        type="button"
        role="tab"
        aria-selected={folder === "all"}
        onClick={() => onFolder("all")}
        className="notes-chip"
      >
        {t("notes.all")}
        <span className="notes-chip__count">{total}</span>
      </button>
      {folders.map((item) =>
        naming?.id === item.id ? (
          <span key={item.id}>{nameInput}</span>
        ) : (
          <span key={item.id} className="relative">
            <button
              type="button"
              role="tab"
              aria-selected={folder === item.id}
              onClick={() => onFolder(item.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (item.role !== "daily") setMenu(item.id);
              }}
              className="notes-chip"
            >
              <Icon name="folder" className="size-3" />
              {folderName(item)}
              <span className="notes-chip__count">{item.count}</span>
            </button>
            {menu === item.id && (
              <Menu onClose={() => setMenu(null)}>
                <MenuItem
                  label={t("notes.rename")}
                  onClick={() => {
                    setMenu(null);
                    setNaming({ id: item.id, name: item.name });
                  }}
                />
                <MenuItem
                  label={t("notes.delete-folder")}
                  danger
                  onClick={() => void remove(item.id)}
                />
              </Menu>
            )}
          </span>
        ),
      )}
      {naming && naming.id === null ? (
        nameInput
      ) : (
        <button
          type="button"
          onClick={() => setNaming({ id: null, name: "" })}
          aria-label={t("notes.new-folder")}
          title={t("notes.new-folder")}
          className="notes-chip is-add"
        >
          <Icon name="plus" className="size-3" />
        </button>
      )}
    </div>
  );
}
