import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { NoteDocument } from "../../../types/api/NoteDocument";
import type { NoteFolder } from "../../../types/api/NoteFolder";
import {
  editorExtensions,
  formatBold,
  formatChecklist,
  formatHeading,
  formatLink,
  setNepali,
} from "../_lib/editor";
import { NepaliToggle } from "./nepali-toggle";
import { Menu, MenuItem } from "./note-list";
import type { Toast } from "./toast";

/** How long after the last keystroke a note is saved, and the cursor's place
 * remembered. */
const SAVE_AFTER_MS = 600;
const CURSOR_AFTER_MS = 1500;

type SaveState = "saved" | "saving" | "failed";

/**
 * One note, being edited. Saved a moment after typing stops, and again on
 * the way out, so nothing typed is ever lost to closing the popover. Each save
 * names the revision it started from; the shell refuses one that would
 * overwrite a newer version.
 */
export function NoteEditor({
  id,
  pinned,
  folders,
  folderName,
  onOpenTitle,
  onChanged,
  onClosed,
  onToast,
}: {
  id: string;
  pinned: boolean;
  folders: NoteFolder[];
  folderName: (folder: NoteFolder | undefined) => string;
  onOpenTitle: (title: string) => void;
  onChanged: () => void;
  onClosed: () => void;
  onToast: (toast: Toast) => void;
}) {
  const { t } = useSettings();
  const [doc, setDoc] = useState<NoteDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [nepali, setNepaliState] = useState(false);
  const [menu, setMenu] = useState(false);
  const [isPinned, setPinned] = useState(pinned);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const revision = useRef(0);
  const pending = useRef<string | null>(null);
  const saveTimer = useRef(0);
  const cursorTimer = useRef(0);
  const saving = useRef<Promise<void>>(Promise.resolve());

  // The latest callbacks, for the editor made once per note.
  const latest = useRef({ onOpenTitle, onChanged, placeholder: t("notes.placeholder") });
  latest.current = { onOpenTitle, onChanged, placeholder: t("notes.placeholder") };

  useEffect(() => {
    let live = true;
    api
      .notesOpen(id)
      .then((opened) => {
        if (!live) return;
        revision.current = opened.revision;
        setDoc(opened);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id]);

  /** Saves whatever is waiting, one save at a time and in order. */
  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const body = pending.current;
    if (body === null) return saving.current;
    pending.current = null;
    setSaveState("saving");
    saving.current = saving.current.then(() =>
      api
        .notesSave(id, body, revision.current)
        .then((saved) => {
          revision.current = saved.revision;
          setSaveState(pending.current === null ? "saved" : "saving");
          latest.current.onChanged();
        })
        .catch((error) => {
          setSaveState("failed");
          onToast({ text: String(error) });
        }),
    );
    return saving.current;
  }, [id, onToast]);

  // The editor, made once the note has loaded.
  useEffect(() => {
    if (!doc || !host.current) return;
    const start = Math.min(doc.cursor ?? doc.body.length, doc.body.length);
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: doc.body,
        selection: { anchor: start },
        extensions: editorExtensions({
          doc: doc.body,
          cursor: doc.cursor,
          placeholder: latest.current.placeholder,
          onChange: (body) => {
            pending.current = body;
            setSaveState("saving");
            window.clearTimeout(saveTimer.current);
            saveTimer.current = window.setTimeout(() => void flush(), SAVE_AFTER_MS);
          },
          onCursor: (pos) => {
            window.clearTimeout(cursorTimer.current);
            cursorTimer.current = window.setTimeout(
              () => void api.notesRememberCursor(id, pos).catch(() => {}),
              CURSOR_AFTER_MS,
            );
          },
          onLink: (title) => {
            void flush().then(() => latest.current.onOpenTitle(title));
          },
          transliterate: (word) => api.notesTransliterate(word, true),
        }),
      }),
    });
    view.current = editor;
    editor.dispatch({ effects: EditorView.scrollIntoView(start, { y: "center" }) });
    editor.focus();
    return () => {
      void flush();
      window.clearTimeout(cursorTimer.current);
      editor.destroy();
      view.current = null;
    };
  }, [doc, id, flush]);

  const toggleNepali = () => {
    const next = !nepali;
    setNepaliState(next);
    view.current?.dispatch({ effects: setNepali.of(next) });
    view.current?.focus();
  };

  const togglePin = useCallback(async () => {
    const next = !isPinned;
    setPinned(next);
    await api.notesPin(id, next).catch(() => setPinned(!next));
    onChanged();
  }, [id, isPinned, onChanged]);

  const moveTo = async (folderId: string) => {
    setMenu(false);
    await flush();
    await api.notesMove(id, folderId);
    setDoc((current) => current && { ...current, folderId });
    onChanged();
    const target = folders.find((item) => item.id === folderId);
    onToast({ text: t("notes.moved").replace("{folder}", folderName(target)) });
  };

  const copy = async () => {
    setMenu(false);
    await flush();
    const text = await api.notesAsText(id);
    await navigator.clipboard.writeText(text).catch(() => {});
    onToast({ text: t("notes.copied") });
  };

  const removeTicked = async () => {
    setMenu(false);
    await flush();
    try {
      await api.notesRemoveTicked(id, revision.current);
      const reopened = await api.notesOpen(id);
      revision.current = reopened.revision;
      const editor = view.current;
      editor?.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: reopened.body },
      });
      // That replacement isn't an edit to save.
      pending.current = null;
      window.clearTimeout(saveTimer.current);
      setSaveState("saved");
      onChanged();
      onToast({ text: t("notes.removed-ticked") });
    } catch (error) {
      onToast({ text: String(error) });
    }
  };

  const trash = async () => {
    setMenu(false);
    await flush();
    await api.notesTrash(id);
    onClosed();
    onToast({
      text: t("notes.trashed"),
      action: { label: t("notes.undo"), run: () => void api.notesRestore(id).then(onChanged) },
    });
  };

  const tools: { icon: IconName; label: string; run: () => void }[] = [
    {
      icon: "heading",
      label: t("notes.format-heading"),
      run: () => view.current && formatHeading(view.current),
    },
    {
      icon: "bold",
      label: t("notes.format-bold"),
      run: () => view.current && formatBold(view.current),
    },
    {
      icon: "checklist",
      label: t("notes.format-checklist"),
      run: () => view.current && formatChecklist(view.current),
    },
    {
      icon: "link",
      label: t("notes.format-link"),
      run: () => view.current && formatLink(view.current),
    },
  ];

  if (failed) {
    return (
      <p className="px-2 py-8 text-center text-[12px] text-text-muted">{t("notes.open-failed")}</p>
    );
  }

  return (
    <div className="notes-editor">
      {/* The note's own bar, in the screen rather than the app's header:
          whether it's saved, pin, and the rest in ⋯. */}
      <div className="notes-editor__bar">
        <span className={`notes-save-state is-${saveState}`}>
          {saveState === "saving"
            ? t("notes.saving")
            : saveState === "failed"
              ? t("notes.save-failed")
              : t("notes.saved")}
        </span>
        <button
          type="button"
          onClick={() => void togglePin()}
          aria-pressed={isPinned}
          className="notes-pin-chip"
        >
          {isPinned && <Icon name="pinFill" className="size-2.5" />}
          {isPinned ? t("notes.pinned-one") : t("notes.pin")}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="icon-btn"
          aria-label={t("notes.more")}
          title={t("notes.more")}
          aria-expanded={menu}
          onClick={() => setMenu((open) => !open)}
        >
          <Icon name="ellipsis" className="size-3.5" />
        </button>
      </div>
      {menu && (
        <Menu onClose={() => setMenu(false)}>
          <p className="notes-menu__label">{t("notes.move-to")}</p>
          {folders.map((item) => (
            <MenuItem
              key={item.id}
              label={folderName(item)}
              checked={doc?.folderId === item.id}
              onClick={() => void moveTo(item.id)}
            />
          ))}
          <div className="notes-menu__divider" />
          <MenuItem label={t("notes.copy-text")} onClick={() => void copy()} />
          <MenuItem label={t("notes.remove-ticked")} onClick={() => void removeTicked()} />
          <MenuItem label={t("notes.trash")} danger onClick={() => void trash()} />
        </Menu>
      )}

      <div ref={host} className="notes-editor__body" />

      {doc && doc.linkedFrom.length > 0 && (
        <section className="notes-backlinks">
          <h3 className="notes-group-label">{t("notes.linked-from")}</h3>
          {doc.linkedFrom.map((link) => (
            <button
              type="button"
              key={link.id}
              className="notes-backlink"
              onClick={() => void flush().then(() => onOpenTitle(link.title))}
            >
              <span className="block truncate text-[12.5px] font-semibold">{link.title}</span>
              <span className="block truncate text-[11.5px] text-text-secondary">{link.line}</span>
            </button>
          ))}
        </section>
      )}

      <div className="notes-format" role="toolbar" aria-label={t("notes.format")}>
        {tools.map((tool) => (
          <button
            type="button"
            key={tool.label}
            // Keep the editor's selection: act on it, don't blur it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={tool.run}
            aria-label={tool.label}
            title={tool.label}
            className="notes-format__btn"
          >
            <Icon name={tool.icon} className="size-3.5" />
          </button>
        ))}
        <span className="flex-1" />
        <NepaliToggle on={nepali} onToggle={toggleNepali} />
      </div>
    </div>
  );
}
