import type { ReactNode } from "react";
import { Icon, type IconName } from "../../../shared/components/icon";
import type { KeeperDocumentType } from "../../../shared/lib/ipc";
import { DOCUMENT_TYPES, docTypeLabel, documentSpec, RECURRENCE_LABELS } from "../_lib/documents";
import { DOCUMENT_ICONS, REMINDER_ICONS } from "../_lib/icons";
import type { TFn } from "../_lib/shared";
import { REMINDER_TEMPLATES, type ReminderTemplate } from "../_lib/templates";

/** The one way in. People think "Aama's passport" or "the electricity bill",
 * not "is this a record or a reminder?" — so they pick the thing, and the
 * app decides which it is. */
export function AddPicker({
  only,
  onDocument,
  onReminder,
  onSip,
  t,
}: {
  /** Just one half — from a tab that already says which it wants. */
  only?: "documents" | "reminders";
  onDocument: (type: KeeperDocumentType) => void;
  /** `null` starts a blank reminder. */
  onReminder: (template: ReminderTemplate | null) => void;
  /** SIP schedules belong to Bazar; Keeper links to that single source. */
  onSip: () => void;
  t: TFn;
}) {
  /** A few words on how each kind of paper behaves, so the choice says what
   * Keeper will do with it. */
  const documentHint = (type: KeeperDocumentType) => {
    if (type === "custom") return t("keeper.hint.custom");
    const spec = documentSpec({ documentType: type, details: {} });
    if (type === "insurance") return t("keeper.hint.insurance");
    return spec.kind === "repeats"
      ? t(RECURRENCE_LABELS[spec.defaultRecurrence])
      : spec.kind === "expires"
        ? t("keeper.hint.renews")
        : t("keeper.hint.on-file");
  };

  return (
    <div className="space-y-4">
      {only !== "reminders" && (
        <Group title={t("keeper.add.documents")} note={t("keeper.add.documents-note")}>
          {DOCUMENT_TYPES.map((type) => (
            <Tile
              key={type}
              icon={DOCUMENT_ICONS[type]}
              label={docTypeLabel(t, type)}
              hint={documentHint(type)}
              onClick={() => onDocument(type)}
            />
          ))}
        </Group>
      )}
      {only !== "documents" && (
        <Group title={t("keeper.add.reminders")} note={t("keeper.add.reminders-note")}>
          {REMINDER_TEMPLATES.map((template) => (
            <Tile
              key={template.id}
              icon={REMINDER_ICONS[template.id] ?? "keeper"}
              label={template.title}
              hint={template.recurrence ? t(RECURRENCE_LABELS[template.recurrence]) : undefined}
              onClick={() => onReminder(template)}
            />
          ))}
          <Tile
            icon={REMINDER_ICONS.sip ?? "banknote"}
            label={t("keeper.sip.add")}
            hint={t("keeper.sip.add-hint")}
            onClick={onSip}
          />
          <Tile
            icon="ellipsis"
            label={t("keeper.add.other")}
            hint={t("keeper.hint.your-own")}
            onClick={() => onReminder(null)}
          />
        </Group>
      )}
    </div>
  );
}

function Group({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="px-0.5">
        <h2 className="text-[12px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-[10px] text-text-muted">{note}</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </section>
  );
}

function Tile({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-card group flex items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] text-accent-mark transition-colors group-hover:bg-[color:color-mix(in_srgb,var(--color-accent-mark)_22%,transparent)]">
        <Icon name={icon} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium">{label}</span>
        {hint && <span className="mt-px block truncate text-[9.5px] text-text-muted">{hint}</span>}
      </span>
    </button>
  );
}
