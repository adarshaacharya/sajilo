import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import {
  type EditorState,
  type Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder as placeholderExt,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { GFM } from "@lezer/markdown";

/**
 * The Notes editor: Markdown that reads as formatted text.
 *
 * The note is kept as the Markdown the user typed (CodeMirror edits plain
 * text, which is also what keeps Devanagari input dependable), and the
 * syntax is hidden everywhere except the line being edited: a heading's
 * `#`, `**` around bold, a checklist's `- [ ]`, which shows as a box to tick.
 * Nobody has to learn Markdown: `[]` and a space starts a checklist, Enter
 * carries a list or checklist on, and the format bar does the rest.
 */

/** Ticks or unticks the checklist box at `pos` (the `[` of `[ ]`). */
function toggleTask(view: EditorView, pos: number) {
  const mark = view.state.sliceDoc(pos + 1, pos + 2);
  view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: mark === " " ? "x" : " " } });
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-note-check";
    box.setAttribute("aria-label", this.checked ? "Ticked" : "Not ticked");
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      toggleTask(view, this.pos);
    });
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const dot = document.createElement("span");
    dot.className = "cm-note-bullet";
    dot.textContent = "•";
    return dot;
  }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const lineClass = (name: string) => Decoration.line({ class: name });
const HEADING_LINE: Record<string, Decoration> = {
  ATXHeading1: lineClass("cm-note-h1"),
  ATXHeading2: lineClass("cm-note-h2"),
  ATXHeading3: lineClass("cm-note-h3"),
  ATXHeading4: lineClass("cm-note-h3"),
};
const TITLE_LINE = lineClass("cm-note-title");
const DONE_LINE = lineClass("cm-note-done");
const LINK = Decoration.mark({ class: "cm-note-link" });
const TAG = Decoration.mark({ class: "cm-note-tag" });

/** Lines holding the cursor or a selection: their Markdown stays visible. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let line = first; line <= last; line++) lines.add(line);
  }
  return lines;
}

const WIKILINK = /\[\[[^\]\n]+\]\]/g;
const HASHTAG = /(^|\s)(#[\p{L}\p{M}\p{N}_/-]*\p{L}[\p{L}\p{M}\p{N}_/-]*)/gu;

function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  const active = activeLines(state);
  // Collected unsorted, then sorted: line decorations, replaces and marks
  // from separate passes interleave.
  const found: { from: number; to: number; deco: Decoration }[] = [];
  const add = (from: number, to: number, deco: Decoration) => found.push({ from, to, deco });

  // The first line is the title, as in Apple Notes.
  if (state.doc.lines > 0 && state.doc.line(1).length > 0) add(0, 0, TITLE_LINE);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const line = state.doc.lineAt(node.from);
        const editing = active.has(line.number);
        const heading = HEADING_LINE[node.name];
        if (heading) add(line.from, line.from, heading);
        switch (node.name) {
          case "HeaderMark":
            if (!editing) add(node.from, Math.min(node.to + 1, line.to), hide);
            break;
          case "EmphasisMark":
          case "StrikethroughMark":
          case "CodeMark":
            if (!editing) add(node.from, node.to, hide);
            break;
          case "TaskMarker": {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to));
            if (checked) add(line.from, line.from, DONE_LINE);
            if (!editing) {
              // Hide the list's `- ` in front of the box, too.
              const listMark = state.sliceDoc(line.from, node.from);
              const start = line.from + listMark.search(/\S/);
              add(
                start,
                node.to,
                Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }),
              );
            }
            break;
          }
          case "ListMark": {
            const after = state.sliceDoc(node.to, node.to + 4);
            const isTask = /^ \[[ xX]\]/.test(after);
            const ordered = /\d/.test(state.sliceDoc(node.from, node.to));
            if (!editing && !isTask && !ordered) add(node.from, node.to, bullet);
            break;
          }
        }
      },
    });

    // [[Links]] and #tags aren't part of Markdown's syntax tree.
    const text = state.sliceDoc(from, to);
    for (const match of text.matchAll(WIKILINK)) {
      const start = from + (match.index ?? 0);
      add(start, start + match[0].length, LINK);
      if (!active.has(state.doc.lineAt(start).number)) {
        add(start, start + 2, hide);
        add(start + match[0].length - 2, start + match[0].length, hide);
      }
    }
    for (const match of text.matchAll(HASHTAG)) {
      const lead = match[1] ?? "";
      const tag = match[2] ?? "";
      const start = from + (match.index ?? 0) + lead.length;
      const line = state.doc.lineAt(start);
      // A heading's `# ` isn't a tag.
      if (start === line.from && /^#+\s/.test(line.text)) continue;
      add(start, start + tag.length, TAG);
    }
  }

  found.sort(
    (a, b) => a.from - b.from || (a.deco.startSide ?? 0) - (b.deco.startSide ?? 0) || a.to - b.to,
  );
  const builder = new RangeSetBuilder<Decoration>();
  let lastEnd = -1;
  for (const { from, to, deco } of found) {
    // Replacements may not overlap; the first wins.
    const replaces = from !== to && (deco.spec.widget || deco === hide);
    if (replaces && from < lastEnd) continue;
    builder.add(from, to, deco);
    if (replaces) lastEnd = to;
  }
  return builder.finish();
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = decorate(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** `[]` or `[ ]` and a space at a line's start becomes a checklist item. */
const checklistShortcut = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== " ") return false;
  const line = view.state.doc.lineAt(from);
  const before = view.state.sliceDoc(line.from, from);
  const match = /^(\s*)\[ ?\]$/.exec(before);
  if (!match) return false;
  const indent = match[1] ?? "";
  view.dispatch({
    changes: { from: line.from, to, insert: `${indent}- [ ] ` },
    selection: { anchor: line.from + indent.length + 6 },
  });
  return true;
});

/** Opens a `[[link]]` on click, by the note it names. */
function linkClicks(onLink: (title: string) => void) {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".cm-note-link")) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const line = view.state.doc.lineAt(pos);
      for (const match of line.text.matchAll(WIKILINK)) {
        const start = line.from + (match.index ?? 0);
        if (pos >= start && pos <= start + match[0].length) {
          const title = (match[0].slice(2, -2).split(/[|#]/)[0] ?? "").trim();
          if (!title) return false;
          event.preventDefault();
          onLink(title);
          return true;
        }
      }
      return false;
    },
  });
}

/**
 * Typing Nepali in English letters. When a word ends (a space or
 * punctuation), it's sent to the shell to turn into Devanagari and put back
 * if nothing moved meanwhile. The word being typed is never touched.
 */
export const setNepali = StateEffect.define<boolean>();
export const nepaliField = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => {
    for (const effect of tr.effects) if (effect.is(setNepali)) return effect.value;
    return value;
  },
});

function nepaliTyping(transliterate: (word: string) => Promise<string>) {
  return EditorView.inputHandler.of((view, from, _to, text) => {
    if (!view.state.field(nepaliField) || !/^[\s.,!?;:)]$/.test(text)) return false;
    const line = view.state.doc.lineAt(from);
    const before = view.state.sliceDoc(line.from, from);
    const word = /[A-Za-z~]+$/.exec(before)?.[0];
    if (!word) return false;
    const start = from - word.length;
    transliterate(word)
      .then((nepali) => {
        if (nepali === word || view.state.sliceDoc(start, start + word.length) !== word) return;
        view.dispatch({ changes: { from: start, to: start + word.length, insert: nepali } });
      })
      .catch(() => {});
    return false;
  });
}

const markdownHighlight = HighlightStyle.define([
  { tag: tags.strong, fontWeight: "650", color: "var(--color-text)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: tags.monospace,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: "0.92em",
  },
  { tag: tags.quote, color: "var(--color-text-secondary)", fontStyle: "italic" },
  { tag: tags.url, color: "var(--color-accent-mark)" },
  { tag: [tags.processingInstruction, tags.meta], color: "var(--color-text-muted)" },
]);

const theme = EditorView.theme({
  "&": { fontSize: "14px", color: "var(--color-text)", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.55", overflow: "visible" },
  ".cm-content": { padding: "4px 0 40px", caretColor: "var(--color-accent-mark)" },
  ".cm-line": { padding: "0 2px" },
  ".cm-cursor": { borderLeftColor: "var(--color-accent-mark)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--color-accent-mark) 28%, transparent) !important",
  },
  ".cm-placeholder": { color: "var(--color-text-muted)" },
});

export interface EditorOptions {
  doc: string;
  cursor: number | null;
  placeholder: string;
  onChange: (doc: string) => void;
  onCursor: (pos: number) => void;
  onLink: (title: string) => void;
  transliterate: (word: string) => Promise<string>;
}

export function editorExtensions(options: EditorOptions): Extension[] {
  return [
    formatKeymap,
    history(),
    markdown({ base: markdownLanguage, extensions: [GFM] }),
    syntaxHighlighting(markdownHighlight),
    livePreview,
    checklistShortcut,
    nepaliField,
    nepaliTyping(options.transliterate),
    linkClicks(options.onLink),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      spellcheck: "true",
      autocorrect: "off",
      "aria-label": "Note",
    }),
    placeholderExt(options.placeholder),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    theme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString());
      if (update.selectionSet) options.onCursor(update.state.selection.main.head);
    }),
  ];
}

// ---------------------------------------------------------------- format bar

/** Puts `prefix` at the start of the cursor's line, or takes it away. */
export function toggleLinePrefix(view: EditorView, prefix: string, others: RegExp) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const existing = others.exec(line.text)?.[0] ?? "";
  const insert = existing === prefix ? "" : prefix;
  view.dispatch({
    changes: { from: line.from, to: line.from + existing.length, insert },
    selection: {
      anchor: Math.max(line.from, view.state.selection.main.head - existing.length + insert.length),
    },
  });
  view.focus();
}

export const formatHeading = (view: EditorView) => toggleLinePrefix(view, "## ", /^#{1,6} /);
export const formatChecklist = (view: EditorView) =>
  toggleLinePrefix(view, "- [ ] ", /^(\s*)(- \[[ xX]\] |- |\* )/);

/** Wraps the selection in `**`, or puts an empty pair at the cursor. */
export function formatBold(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `**${text}**` },
    selection: text ? { anchor: from, head: to + 4 } : { anchor: from + 2 },
  });
  view.focus();
}

/** Starts a `[[link]]` with the cursor inside it. */
export function formatLink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `[[${text}]]` },
    selection: { anchor: from + 2 + text.length },
  });
  view.focus();
}

/** Runs a format command and reports it handled, for a keymap. */
const handled = (format: (view: EditorView) => void) => (view: EditorView) => {
  format(view);
  return true;
};

export const formatKeymap = keymap.of([
  { key: "Mod-b", run: handled(formatBold) },
  { key: "Mod-Shift-l", run: handled(formatChecklist) },
  { key: "Mod-Shift-h", run: handled(formatHeading) },
  { key: "Mod-k", run: handled(formatLink) },
]);
