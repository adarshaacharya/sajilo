import { useEffect, useState } from "react";
import { BackButton } from "../../../shared/components/back-button";
import { CONTROL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { Segmented } from "../../../shared/components/segmented";
import { Select } from "../../../shared/components/select";
import { Switch } from "../../../shared/components/switch";
import { useSettings } from "../../../shared/context/settings-context";
import {
  api,
  type BreakKind,
  type DeckEdits,
  type FocusSettings,
  type Joke,
  type JokeDeck,
} from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { kindLabel } from "../_lib/format";

/** Fewest lines a deck keeps switched on (`jokes::MIN_LINES`), so the card
 * still rotates. */
const MIN_LINES = 5;
/** Longest line of one's own (`jokes::MAX_OWN_LINE`). */
const MAX_LINE = 120;

/** The cards with a main line the user can replace; see `OwnMessage`. */
type MessageKind = "eyes" | "move" | "water";
const MESSAGE_KINDS: readonly BreakKind[] = ["eyes", "move", "water"];

const NO_EDITS: DeckEdits = { off: [], edited: {}, added: [] };

/** One row of the list: Sajilo's line (with the user's rewording, if any),
 * or one of the user's own. */
type Row =
  | { source: "sajilo"; key: string; original: Joke; shown: Joke; on: boolean }
  | { source: "own"; index: number; shown: Joke };

/**
 * Every line a reminder's card can say, to read, reword, switch off, or add
 * to, in English, Nepali or both. Sajilo's own lines stay built in; only the
 * changes are saved, so an update's new jokes arrive without undoing any.
 */
export function MessagesPanel({
  settings,
  onSettings,
  onBack,
}: {
  settings: FocusSettings;
  onSettings: (settings: FocusSettings) => void;
  onBack: () => void;
}) {
  const { t, language, numerals } = useSettings();
  const [decks, setDecks] = useState<JokeDeck[] | null>(null);
  const [kind, setKind] = useState<BreakKind>("eyes");
  // Which row is open for editing: a Sajilo line's key, an own line's
  // index, or "new" for the add form.
  const [editing, setEditing] = useState<string | number | null>(null);
  // Rotating lines, or one fixed line (look away, stand up and water only).
  // Fixed while a line is saved; picking "fixed" opens an empty box first.
  const hasFixed = MESSAGE_KINDS.includes(kind);
  const saved = hasFixed ? (settings.messages?.[kind as MessageKind] ?? "") : "";
  const [fixedPicked, setFixedPicked] = useState(false);
  const fixed = hasFixed && (fixedPicked || saved.length > 0);

  useEffect(() => {
    api
      .focusJokeDecks()
      .then(setDecks)
      .catch(() => setDecks([]));
  }, []);

  const deck = decks?.find((item) => item.kind === kind);
  const edits = settings.jokeEdits?.[kind] ?? NO_EDITS;
  const rows: Row[] = [
    ...(deck?.lines ?? []).map(
      (line): Row => ({
        source: "sajilo",
        key: line.en,
        original: line,
        shown: edits.edited[line.en] ?? line,
        on: !edits.off.includes(line.en),
      }),
    ),
    ...edits.added.map((line, index): Row => ({ source: "own", index, shown: line })),
  ];
  const onCount = rows.filter((row) => row.source === "own" || row.on).length;
  const atMinimum = onCount <= MIN_LINES;
  const changed = edits.off.length + Object.keys(edits.edited).length + edits.added.length > 0;

  const save = (next: DeckEdits) => {
    const jokeEdits = { ...settings.jokeEdits, [kind]: next };
    onSettings({ ...settings, jokeEdits });
  };
  const reword = (key: string, line: Joke) =>
    save({ ...edits, edited: { ...edits.edited, [key]: line } });
  const unword = (key: string) => {
    const { [key]: _, ...rest } = edits.edited;
    save({ ...edits, edited: rest });
  };
  const toggle = (key: string, on: boolean) =>
    save({
      ...edits,
      off: on ? edits.off.filter((item) => item !== key) : [...edits.off, key],
    });
  const setOwn = (index: number, line: Joke | null) =>
    save({
      ...edits,
      added:
        line === null
          ? edits.added.filter((_, at) => at !== index)
          : edits.added.map((item, at) => (at === index ? line : item)),
    });

  const count = t("focus.messages.count")
    .replace("{on}", digits(onCount, numerals))
    .replace("{all}", digits(rows.length, numerals));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <BackButton onClick={onBack} />
        <h2 className="text-[13px] font-semibold">{t("focus.messages.title")}</h2>
      </div>

      <section className="surface-card space-y-2.5 p-3">
        <Select
          label={t("focus.messages.reminder")}
          value={kind}
          onChange={(next) => {
            setKind(next);
            setEditing(null);
            setFixedPicked(false);
          }}
          options={(decks ?? []).map((item) => ({
            id: item.kind,
            label: kindLabel(item.kind, settings, t),
          }))}
        />
        {hasFixed && (
          <Segmented
            label={t("focus.messages.mode")}
            value={fixed ? "fixed" : "rotate"}
            onChange={(mode) => {
              setEditing(null);
              setFixedPicked(mode === "fixed");
              // Back to rotating: the fixed line goes, or it would still win.
              if (mode === "rotate" && saved) {
                onSettings({ ...settings, messages: { ...settings.messages, [kind]: "" } });
              }
            }}
            options={[
              { id: "rotate", label: t("focus.messages.mode-rotate") },
              { id: "fixed", label: t("focus.messages.mode-fixed") },
            ]}
          />
        )}
        <p className="text-[10px] leading-snug text-text-muted">
          {fixed
            ? t("focus.messages.fixed-note")
            : t(settings.jokes ? "focus.messages.note" : "focus.messages.note-off")}
        </p>
      </section>

      {fixed && (
        <section className="surface-card p-3">
          <OwnMessage kind={kind as MessageKind} settings={settings} onSettings={onSettings} />
        </section>
      )}

      {!fixed && (
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
            <h3 className="text-[11px] font-semibold text-text-secondary">
              {t("focus.messages.jokes")}
            </h3>
            <span className="text-[10px] text-text-muted tabular-nums">{count}</span>
          </div>
          <ul className="divide-y divide-divider">
            {rows.map((row) => {
              const id = row.source === "sajilo" ? row.key : row.index;
              if (editing === id) {
                return (
                  <li key={`edit-${id}`} className="px-3 py-2">
                    <LineForm
                      initial={row.shown}
                      onCancel={() => setEditing(null)}
                      onSave={(line) => {
                        if (row.source === "sajilo") reword(row.key, line);
                        else setOwn(row.index, line);
                        setEditing(null);
                      }}
                      onReset={
                        row.source === "sajilo" && row.key in edits.edited
                          ? () => {
                              unword(row.key);
                              setEditing(null);
                            }
                          : undefined
                      }
                    />
                  </li>
                );
              }
              const on = row.source === "own" || row.on;
              const other = language === "ne" ? row.shown.en : row.shown.ne;
              const main = (language === "ne" ? row.shown.ne : row.shown.en) || other;
              return (
                <li
                  key={row.source === "sajilo" ? `s-${row.key}` : `o-${row.index}`}
                  className={`flex items-start gap-2 px-3 py-2 ${on ? "" : "opacity-50"}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-snug text-text">{main}</p>
                    {other && other !== main && (
                      <p className="mt-0.5 text-[10.5px] leading-snug text-text-muted">{other}</p>
                    )}
                    {(row.source === "own" ||
                      (row.source === "sajilo" && row.key in edits.edited)) && (
                      <p className="mt-0.5 text-[10px] text-accent-mark">
                        {t(row.source === "own" ? "focus.messages.yours" : "focus.messages.edited")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(id)}
                    aria-label={t("focus.messages.edit")}
                    className="icon-btn size-6 shrink-0"
                  >
                    <Icon name="pencil" className="size-3.5" />
                  </button>
                  {row.source === "sajilo" ? (
                    <Switch
                      checked={row.on}
                      disabled={row.on && atMinimum}
                      onChange={(value) => toggle(row.key, value)}
                      className="mt-0.5"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOwn(row.index, null)}
                      disabled={atMinimum}
                      aria-label={t("focus.messages.delete")}
                      className="icon-btn size-6 shrink-0 disabled:opacity-40"
                    >
                      <Icon name="trash" className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {atMinimum && (
            <p className="px-3 pt-1 text-[10px] leading-snug text-text-muted">
              {t("focus.messages.minimum").replace("{n}", digits(MIN_LINES, numerals))}
            </p>
          )}
          <div className="space-y-2 p-3">
            {editing === "new" ? (
              <LineForm
                initial={{ en: "", ne: "" }}
                onCancel={() => setEditing(null)}
                onSave={(line) => {
                  save({ ...edits, added: [...edits.added, line] });
                  setEditing(null);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="settings-btn settings-btn--accent w-full justify-center"
              >
                <Icon name="plus" className="size-3.5" />
                {t("focus.messages.add")}
              </button>
            )}
            {changed && (
              <button
                type="button"
                onClick={() => {
                  const { [kind]: _, ...rest } = settings.jokeEdits ?? {};
                  onSettings({ ...settings, jokeEdits: rest });
                  setEditing(null);
                }}
                className="settings-btn w-full justify-center text-[11px]"
              >
                {t("focus.messages.reset")}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** A line in both languages; either may be left empty, and then the other
 * is said in its place. */
function LineForm({
  initial,
  onSave,
  onCancel,
  onReset,
}: {
  initial: Joke;
  onSave: (line: Joke) => void;
  onCancel: () => void;
  onReset?: () => void;
}) {
  const { t } = useSettings();
  const [en, setEn] = useState(initial.en);
  const [ne, setNe] = useState(initial.ne);
  const empty = !en.trim() && !ne.trim();

  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!empty) onSave({ en: en.trim(), ne: ne.trim() });
      }}
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: opened by the user's own click, to type into
        autoFocus
        value={en}
        maxLength={MAX_LINE}
        placeholder={t("focus.messages.english")}
        aria-label={t("focus.messages.english")}
        onChange={(event) => setEn(event.target.value)}
        className={`${CONTROL} w-full`}
      />
      <input
        value={ne}
        maxLength={MAX_LINE}
        placeholder={t("focus.messages.nepali")}
        aria-label={t("focus.messages.nepali")}
        onChange={(event) => setNe(event.target.value)}
        className={`${CONTROL} w-full`}
      />
      <p className="text-[10px] leading-snug text-text-muted">{t("focus.messages.one-is-fine")}</p>
      <div className="flex items-center gap-2">
        {onReset && (
          <button type="button" onClick={onReset} className="settings-btn text-[11px]">
            {t("focus.messages.original")}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className="settings-btn text-[11px]">
          {t("focus.messages.cancel")}
        </button>
        <button
          type="submit"
          disabled={empty}
          className="settings-btn settings-btn--accent text-[11px]"
        >
          {t("focus.messages.save")}
        </button>
      </div>
    </form>
  );
}

/** The card's main line in the user's own words, in place of Sajilo's plain
 * instruction and its jokes. Empty is Sajilo's own. Saved on leaving the
 * field, so typing never fires a save per key. */
function OwnMessage({
  kind,
  settings,
  onSettings,
}: {
  kind: MessageKind;
  settings: FocusSettings;
  onSettings: (settings: FocusSettings) => void;
}) {
  const { t } = useSettings();
  const saved = settings.messages?.[kind] ?? "";
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);

  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-text-secondary">{t("focus.edit.message")}</span>
      <input
        value={draft}
        maxLength={MAX_LINE}
        placeholder={t("focus.edit.message-placeholder")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const text = draft.trim();
          if (text !== saved) {
            onSettings({ ...settings, messages: { ...settings.messages, [kind]: text } });
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className={`${CONTROL} w-full`}
      />
    </label>
  );
}
