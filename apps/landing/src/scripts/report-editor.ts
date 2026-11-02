/**
 * The report's "what happened" box: a rich editor that writes Markdown, so a
 * reporter gets bold, lists, code and links from a toolbar or the usual
 * shortcuts, and the email that arrives still reads as plain text.
 *
 * Images pasted or dropped into it are not inlined; they are handed to
 * `onImages`, which attaches them to the report as screenshots.
 */

import { Editor } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

interface Options {
  mount: HTMLElement;
  toolbar: HTMLElement;
  placeholder: string;
  onChange: (markdown: string) => void;
  onImages: (files: File[]) => void;
}

type Command = (editor: Editor) => void;

/** What each toolbar button does, and how it tells that it's on. */
const COMMANDS: Record<string, { run: Command; active?: [string, Record<string, unknown>?] }> = {
  bold: { run: (e) => e.chain().focus().toggleBold().run(), active: ["bold"] },
  italic: { run: (e) => e.chain().focus().toggleItalic().run(), active: ["italic"] },
  strike: { run: (e) => e.chain().focus().toggleStrike().run(), active: ["strike"] },
  code: { run: (e) => e.chain().focus().toggleCode().run(), active: ["code"] },
  heading: {
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    active: ["heading", { level: 3 }],
  },
  bullets: { run: (e) => e.chain().focus().toggleBulletList().run(), active: ["bulletList"] },
  numbers: { run: (e) => e.chain().focus().toggleOrderedList().run(), active: ["orderedList"] },
  quote: { run: (e) => e.chain().focus().toggleBlockquote().run(), active: ["blockquote"] },
  codeblock: { run: (e) => e.chain().focus().toggleCodeBlock().run(), active: ["codeBlock"] },
  link: { run: toggleLink, active: ["link"] },
};

function toggleLink(editor: Editor) {
  if (editor.isActive("link")) {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  const url = window.prompt("Link address", "https://")?.trim();
  if (!url || url === "https://") return;
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

function imagesIn(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
}

export function createReportEditor({ mount, toolbar, placeholder, onChange, onImages }: Options) {
  const editor = new Editor({
    element: mount,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({ placeholder }),
      Markdown,
    ],
    editorProps: {
      attributes: { class: "md-editor__body", "aria-label": "What happened", role: "textbox" },
      handlePaste: (_view, event) => {
        const images = imagesIn(event.clipboardData?.files);
        if (!images.length) return false;
        onImages(images);
        return true;
      },
      handleDrop: (_view, event) => {
        const images = imagesIn((event as DragEvent).dataTransfer?.files);
        if (!images.length) return false;
        event.preventDefault();
        onImages(images);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getMarkdown()),
  });

  const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("[data-cmd]"));
  for (const button of buttons) {
    const command = COMMANDS[button.dataset.cmd ?? ""];
    // Keeps the selection: a click on the toolbar would otherwise blur it first.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => command?.run(editor));
  }

  const syncToolbar = () => {
    for (const button of buttons) {
      const active = COMMANDS[button.dataset.cmd ?? ""]?.active;
      button.setAttribute("aria-pressed", String(!!active && editor.isActive(...active)));
    }
  };
  editor.on("selectionUpdate", syncToolbar);
  editor.on("transaction", syncToolbar);

  return {
    clear: () => editor.commands.clearContent(true),
    focus: () => editor.commands.focus(),
  };
}
