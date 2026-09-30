import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { useHeaderInner } from "../../shared/components/header-slot";
import { useSettings } from "../../shared/context/settings-context";
import { api } from "../../shared/lib/ipc";
import type { NoteFolder } from "../../types/api/NoteFolder";
import { NoteEditor } from "./_components/note-editor";
import { NoteList } from "./_components/note-list";
import { NoteSearch } from "./_components/note-search";
import { NoteTrash } from "./_components/note-trash";
import { type Toast, ToastBar } from "./_components/toast";

/** The note open when Notes was left, so switching tabs and back returns to
 * it. On a fresh start the shell's `lastOpen` does the same. */
let openInSession: string | null | undefined;
/** The folder picked in the list, for the same reason. */
let folderInSession = "all";

/**
 * Notes, in the popover. A list (a jot box that adds to today's note, folder
 * chips, notes grouped by when they were last edited) and one note open at a
 * time in an editor where Markdown reads as formatted text. Everything is
 * stored by the shell (`crate::notes`); this screen never works out a title,
 * a date or a search match itself.
 */
export function Notes() {
  const { t } = useSettings();
  const { data: list, mutate } = useSWR("notes-list", () => api.notesList());
  const [open, setOpenState] = useState<string | null>(openInSession ?? null);
  const [folder, setFolderState] = useState(folderInSession);
  const [searching, setSearching] = useState(false);
  const [inTrash, setInTrash] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const setOpen = useCallback((id: string | null) => {
    openInSession = id;
    setOpenState(id);
  }, []);
  const setFolder = (id: string) => {
    folderInSession = id;
    setFolderState(id);
  };

  // Open where you left off, the first time Notes is shown this run.
  useEffect(() => {
    if (openInSession !== undefined || !list) return;
    openInSession = list.lastOpen ?? null;
    if (list.lastOpen) setOpenState(list.lastOpen);
  }, [list]);

  const folders = list?.folders ?? [];
  const current = open ? list?.notes.find((note) => note.id === open) : undefined;
  const folderName = useCallback(
    (item: NoteFolder | undefined) =>
      item ? (item.role === "daily" ? t("notes.daily") : item.name) : t("notes.all"),
    [t],
  );
  const openFolder = folders.find((item) => item.id === current?.folderId);

  const refresh = useCallback(() => void mutate(), [mutate]);
  const back = useCallback(() => {
    setOpen(null);
    refresh();
  }, [setOpen, refresh]);

  useHeaderInner(
    open
      ? { title: folder === "all" ? t("notes.all") : folderName(openFolder), onBack: back }
      : inTrash
        ? { title: t("notes.trash-title"), onBack: () => setInTrash(false) }
        : null,
  );

  /** A new note in the folder being looked at (or the first of the user's own). */
  const newNote = useCallback(
    async (body?: string) => {
      const target =
        folders.find((item) => item.id === folder) ??
        folders.find((item) => item.role === "user") ??
        folders[0];
      if (!target) return;
      const id = await api.notesCreate(target.id, body);
      await mutate();
      setSearching(false);
      setOpen(id);
    },
    [folders, folder, mutate, setOpen],
  );

  /** A `[[link]]` or search pick: the note by that title, made if there's none. */
  const openTitle = useCallback(
    async (title: string) => {
      const wanted = title.trim().toLocaleLowerCase();
      const found = list?.notes.find((note) => note.title.trim().toLocaleLowerCase() === wanted);
      if (found) setOpen(found.id);
      else await newNote(`${title}\n`);
    },
    [list, newNote, setOpen],
  );

  if (open) {
    return (
      <>
        <NoteEditor
          key={open}
          id={open}
          pinned={current?.pinned ?? false}
          folders={folders}
          folderName={folderName}
          onOpenTitle={openTitle}
          onChanged={refresh}
          onClosed={back}
          onToast={setToast}
        />
        <ToastBar toast={toast} onDone={() => setToast(null)} />
      </>
    );
  }

  if (inTrash) {
    return (
      <>
        <NoteTrash onChanged={refresh} onToast={setToast} />
        <ToastBar toast={toast} onDone={() => setToast(null)} />
      </>
    );
  }

  return (
    <>
      <NoteList
        list={list}
        folder={folder}
        folderName={folderName}
        onFolder={setFolder}
        onOpen={setOpen}
        onNew={() => void newNote()}
        onSearch={() => setSearching(true)}
        onTrash={() => setInTrash(true)}
        onChanged={refresh}
        onToast={setToast}
      />
      {searching && (
        <NoteSearch
          notes={list?.notes ?? []}
          folders={folders}
          folderName={folderName}
          onOpen={(id) => {
            setSearching(false);
            setOpen(id);
          }}
          onCreate={(title) => void newNote(`${title}\n`)}
          onClose={() => setSearching(false)}
        />
      )}
      <ToastBar toast={toast} onDone={() => setToast(null)} />
    </>
  );
}
