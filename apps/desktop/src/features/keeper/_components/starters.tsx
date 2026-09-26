import { Icon, type IconName } from "../../../shared/components/icon";
import type { KeeperDocumentType } from "../../../shared/lib/ipc";
import { docTypeLabel, documentSpec, RECURRENCE_LABELS } from "../_lib/documents";
import { DOCUMENT_ICONS, REMINDER_ICONS } from "../_lib/icons";
import type { TFn } from "../_lib/shared";
import { REMINDER_TEMPLATES, type ReminderTemplate } from "../_lib/templates";

/** What most households keep first: the car's papers and the monthly bill. */
const STARTER_DOCUMENTS: KeeperDocumentType[] = ["bluebook", "drivingLicence"];
const STARTER_REMINDER = "electricity";

/**
 * Keeper with nothing in it: a welcome, three one-tap starts, and the full
 * list one tap further. Twenty choices on a first visit is a form; three is
 * an invitation.
 */
export function Starters({
  onDocument,
  onReminder,
  onSeeAll,
  t,
}: {
  onDocument: (type: KeeperDocumentType) => void;
  onReminder: (template: ReminderTemplate) => void;
  onSeeAll: () => void;
  t: TFn;
}) {
  const reminder = REMINDER_TEMPLATES.find((entry) => entry.id === STARTER_REMINDER);
  const rows: { key: string; icon: IconName; title: string; hint: string; onPick: () => void }[] = [
    ...STARTER_DOCUMENTS.map((type) => {
      const spec = documentSpec({ documentType: type, details: {} });
      return {
        key: type,
        icon: DOCUMENT_ICONS[type],
        title: docTypeLabel(t, type),
        hint:
          spec.kind === "repeats"
            ? t(RECURRENCE_LABELS[spec.defaultRecurrence])
            : t("keeper.hint.renews"),
        onPick: () => onDocument(type),
      };
    }),
    ...(reminder
      ? [
          {
            key: reminder.id,
            icon: REMINDER_ICONS[reminder.id] ?? "bolt",
            title: reminder.title,
            hint: t(RECURRENCE_LABELS[reminder.recurrence ?? "none"]),
            onPick: () => onReminder(reminder),
          },
        ]
      : []),
  ];

  return (
    <>
      <section className="surface-card space-y-3 p-3.5">
        <div className="flex items-start gap-3">
          <span className="keeper-welcome-mark">
            <Icon name="keeper" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight">{t("keeper.welcome")}</h2>
            <p className="mt-1 text-[11px] leading-snug text-text-secondary">
              {t("keeper.tagline")}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-text-secondary">{t("keeper.start-with")}</p>
          {rows.map((row) => (
            <button key={row.key} type="button" onClick={row.onPick} className="keeper-starter">
              <span className="keeper-doc__icon">
                <Icon name={row.icon} className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold">{row.title}</span>
                <span className="block truncate text-[10px] text-text-muted">{row.hint}</span>
              </span>
              <Icon name="plus" className="size-3.5 shrink-0 text-accent-mark" />
            </button>
          ))}
        </div>

        <button type="button" onClick={onSeeAll} className="settings-btn">
          {t("keeper.see-all-types")}
        </button>
      </section>
      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">
        {t("keeper.footer-note")}
      </p>
    </>
  );
}
