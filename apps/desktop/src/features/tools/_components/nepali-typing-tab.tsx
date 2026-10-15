import { useEffect, useState } from "react";
import { CONTROL, CONTROL_LABEL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { Segmented } from "../../../shared/components/segmented";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type TypingMode } from "../../../shared/lib/ipc";
import { LIMITS } from "../../../shared/lib/limits";
import { copyText } from "./result-card";

/** How long typing has to pause before the text is converted again. */
const SETTLE_MS = 120;

/**
 * What was typed in each mode, kept for as long as the app runs: leaving for
 * another screen and coming back finds the text still there, and each mode
 * keeps its own, since English letters are no use as Preeti. Never written
 * to disk.
 */
const draft: { mode: TypingMode; texts: Record<TypingMode, string> } = {
  mode: "romanized",
  texts: { romanized: "", preetiToUnicode: "", unicodeToPreeti: "" },
};

/** The letters English has no key for, as the romanized scheme types them.
 * Signs sit on ◌, the usual placeholder, so they never float on their own. */
const TRICKY = [
  ["T", "ट"],
  ["Th", "ठ"],
  ["D", "ड"],
  ["Dh", "ढ"],
  ["N", "ण"],
  ["Sh", "ष"],
  ["chh", "छ"],
  ["M", "◌ं"],
  ["H", "◌ः"],
  ["~", "◌ँ"],
  ["aa", "◌ा"],
  ["ee", "◌ी"],
  ["oo", "◌ू"],
] as const;

/**
 * Nepali typing: English letters to Devanagari, and Preeti to Unicode and
 * back. What was typed stays as typed; the converted text sits below it,
 * ready to copy. All the converting is `sajilo-core`'s, through a command.
 */
export function NepaliTypingTab() {
  const { t } = useSettings();
  const [mode, setMode] = useState<TypingMode>(draft.mode);
  const [texts, setTexts] = useState(draft.texts);
  const text = texts[mode];
  const setText = (value: string) => setTexts((all) => ({ ...all, [mode]: value }));
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    draft.texts = texts;
    draft.mode = mode;
    if (!text.trim()) {
      setOutput("");
      return;
    }
    let current = true;
    const timer = window.setTimeout(() => {
      api
        .convertTyping(text, mode)
        .then((value) => {
          if (current) setOutput(value);
        })
        .catch(() => {
          if (current) setOutput("");
        });
    }, SETTLE_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [text, mode, texts]);

  const copy = async () => {
    if (!output) return;
    await copyText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const toPreeti = mode === "unicodeToPreeti";

  return (
    <div className="space-y-2.5">
      <Segmented
        label={t("typing.mode")}
        value={mode}
        onChange={setMode}
        options={[
          { id: "romanized", label: t("typing.romanized") },
          { id: "preetiToUnicode", label: t("typing.preeti-to-unicode") },
          { id: "unicodeToPreeti", label: t("typing.unicode-to-preeti") },
        ]}
      />

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="typing-input" className={CONTROL_LABEL}>
            {t(`typing.input-${mode}`)}
          </label>
          {text && (
            <button
              type="button"
              onClick={() => setText("")}
              className="text-[10px] text-text-muted transition-colors hover:text-text-secondary"
            >
              {t("typing.clear")}
            </button>
          )}
        </div>
        <textarea
          id="typing-input"
          value={text}
          // Long enough for a whole Preeti document pasted in at once.
          maxLength={LIMITS.NOTE_BODY}
          onChange={(event) => setText(event.target.value)}
          placeholder={t(`typing.placeholder-${mode}`)}
          rows={4}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          // biome-ignore lint/a11y/noAutofocus: the tool is one field; opening it is asking to type.
          autoFocus
          className={`${CONTROL} h-auto resize-none py-1.5 text-[12px]`}
        />
      </div>

      <section className="surface-card overflow-hidden" aria-live="polite">
        <div className="flex items-center justify-between px-3 pt-2">
          <p className="text-[10px] text-text-muted">{t(`typing.output-${mode}`)}</p>
          <button
            type="button"
            onClick={copy}
            disabled={!output}
            className="flex items-center gap-1 text-[10px] font-medium text-text-secondary transition-colors hover:text-text disabled:opacity-40"
          >
            <Icon
              name={copied ? "checkmark" : "copy"}
              className={`size-3 ${copied ? "text-[color:var(--color-accent-mark)]" : ""}`}
            />
            {t(copied ? "typing.copied" : "typing.copy")}
          </button>
        </div>
        <p
          className={`min-h-[64px] select-text whitespace-pre-wrap break-words px-3 pt-1 pb-2.5 ${
            toPreeti ? "font-mono text-[12px]" : "text-[16px] leading-relaxed"
          } ${output ? "" : "text-text-muted"}`}
        >
          {output || t(`typing.empty-${mode}`)}
        </p>
      </section>

      {toPreeti && <p className="px-0.5 text-[10px] text-text-muted">{t("typing.preeti-paste")}</p>}

      {mode === "romanized" && (
        <details className="surface-card group px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-medium text-text-secondary">
            {t("typing.tricky")}
            <Icon
              name="chevronDown"
              className="size-3 text-text-muted transition-transform group-open:rotate-180"
            />
          </summary>
          <dl className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1.5">
            {TRICKY.map(([latin, nepali]) => (
              <div key={latin} className="flex items-baseline gap-1.5 text-[11px]">
                <dt className="font-mono text-text-secondary">{latin}</dt>
                <dd className="text-[13px]">{nepali}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[10px] text-text-muted">{t("typing.tricky-note")}</p>
        </details>
      )}
    </div>
  );
}
