import type { ReactNode } from "react";
import type { KeeperDocumentType } from "../../../shared/lib/ipc";
import { DOCUMENT_TYPES, docTypeLabel, documentSpec, RECURRENCE_LABELS } from "../_lib/documents";
import { DOCUMENT_ICONS } from "../_lib/icons";
import type { TFn } from "../_lib/shared";
import { PickerTile } from "../bill-reminders";

/** The one way in: people think "Aama's passport", so they pick the paper,
 * and the app knows how it behaves. */
export function AddPicker({
  onDocument,
  t,
}: {
  onDocument: (type: KeeperDocumentType) => void;
  t: TFn;
}) {
  /** A few words on how each kind of paper behaves, so the choice says what
   * Sajilo will do with it. */
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
    <Group title={t("keeper.add.documents")} note={t("keeper.add.documents-note")}>
      {DOCUMENT_TYPES.map((type) => (
        <PickerTile
          key={type}
          icon={DOCUMENT_ICONS[type]}
          label={docTypeLabel(t, type)}
          hint={documentHint(type)}
          onClick={() => onDocument(type)}
        />
      ))}
    </Group>
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
