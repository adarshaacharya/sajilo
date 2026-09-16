import type { KeeperDocumentType } from "../../../shared/lib/ipc";
import { DOCUMENT_TYPES, docTypeLabel } from "../_lib/documents";
import type { TFn } from "../_lib/shared";
import { REMINDER_TEMPLATES, type ReminderTemplate } from "../_lib/templates";

/** The one way in. People think "Aama's passport" or "the electricity bill",
 * not "is this a record or a reminder?" — so they pick the thing, and the
 * app decides which it is. */
export function AddPicker({
  only,
  onDocument,
  onReminder,
  t,
}: {
  /** Just one half — from a tab that already says which it wants. */
  only?: "documents" | "reminders";
  onDocument: (type: KeeperDocumentType) => void;
  /** `null` starts a blank reminder. */
  onReminder: (template: ReminderTemplate | null) => void;
  t: TFn;
}) {
  return (
    <div className="space-y-3">
      {only !== "reminders" && (
        <Group title={t("keeper.add.documents")} note={t("keeper.add.documents-note")}>
          {DOCUMENT_TYPES.map((type) => (
            <Tile key={type} label={docTypeLabel(t, type)} onClick={() => onDocument(type)} />
          ))}
        </Group>
      )}
      {only !== "documents" && (
        <Group title={t("keeper.add.reminders")} note={t("keeper.add.reminders-note")}>
          {REMINDER_TEMPLATES.map((template) => (
            <Tile key={template.id} label={template.title} onClick={() => onReminder(template)} />
          ))}
          <Tile label={t("keeper.add.other")} onClick={() => onReminder(null)} muted />
        </Group>
      )}
    </div>
  );
}

function Group({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-1.5">
      <div className="px-0.5">
        <h2 className="text-[12px] font-medium">{title}</h2>
        <p className="text-[10px] text-text-muted">{note}</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </section>
  );
}

function Tile({ label, onClick, muted }: { label: string; onClick: () => void; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`surface-card truncate px-2.5 py-2 text-left text-[11px] font-medium transition-colors hover:bg-surface-hover ${muted ? "text-text-secondary" : ""}`}
    >
      {label}
    </button>
  );
}
