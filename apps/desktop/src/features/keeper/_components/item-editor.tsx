import { CONTROL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { Select } from "../../../shared/components/select";
import { openExternalLink } from "../../../shared/lib/external-link";
import type { KeeperItem, KeeperPerson } from "../../../shared/lib/ipc";
import type { TFn } from "../_lib/shared";
import { DateField } from "./date-picker";
import { type NewPerson, PersonSelect } from "./person-select";
import { RemindDays } from "./remind-days";

/**
 * A thing to do or pay: what, for whom, when, how often, and when to be told.
 * Nothing else is asked. What a template knows — what to have ready, where to
 * pay, what lateness costs — is shown as tips, not handed back as fields.
 */
export function ItemEditor({
  item,
  people,
  onChange,
  onSave,
  onCancel,
  onDelete,
  newPerson,
  onNewPerson,
  t,
}: {
  item: KeeperItem;
  people: readonly KeeperPerson[];
  onChange: (item: KeeperItem) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  newPerson: NewPerson | null;
  onNewPerson: (person: NewPerson | null) => void;
  t: TFn;
}) {
  const tips = item.checklist.map((entry) => entry.label);

  return (
    <div className="space-y-2.5">
      <section className="surface-card space-y-2.5 p-3">
        <input
          value={item.title}
          onChange={(event) => onChange({ ...item, title: event.target.value })}
          placeholder={t("keeper.what-should-remember")}
          aria-label={t("keeper.what-should-remember")}
          className={`${CONTROL} w-full`}
        />
        <PersonSelect
          value={item.personId}
          people={people}
          onChange={(personId) => onChange({ ...item, personId })}
          newPerson={newPerson}
          onNewPerson={onNewPerson}
          t={t}
        />

        <div className="border-y border-divider py-1">
          <DateField
            label={t("keeper.due-date")}
            value={item.dueDate}
            onChange={(dueDate) => onChange({ ...item, dueDate })}
            optional
            t={t}
          />
          {item.dueDate ? (
            <div className="flex min-h-7 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">
                {t("keeper.repeat")}
              </span>
              <div className="w-36 shrink-0">
                <Select
                  ariaLabel={t("keeper.repeat")}
                  value={item.recurrence}
                  onChange={(next) => onChange({ ...item, recurrence: next })}
                  options={(["none", "monthly", "yearlyAd", "yearlyBs"] as const).map((id) => ({
                    id,
                    label: t(`keeper.recurrence.${id}`),
                  }))}
                />
              </div>
            </div>
          ) : (
            <p className="pb-1 text-[10px] text-text-muted">{t("keeper.no-deadline-note")}</p>
          )}
        </div>

        {item.dueDate && (
          <RemindDays
            value={item.remindDays}
            onChange={(remindDays) => onChange({ ...item, remindDays })}
            span={item.recurrence === "monthly" ? 14 : 90}
            t={t}
          />
        )}

        <textarea
          value={item.note}
          onChange={(event) => onChange({ ...item, note: event.target.value })}
          placeholder={t("keeper.note-placeholder")}
          aria-label={t("keeper.note-placeholder")}
          rows={2}
          className={`${CONTROL} h-auto w-full py-1.5`}
        />

        <EditorActions
          onCancel={onCancel}
          onSave={onSave}
          onDelete={onDelete}
          canSave={Boolean(item.title.trim())}
          saveLabel={t("keeper.save")}
          t={t}
        />
      </section>

      {(tips.length > 0 || item.officialUrl) && (
        <section className="surface-card space-y-1.5 p-3">
          <p className="text-[10px] font-medium text-text-secondary">{t("keeper.good-to-know")}</p>
          <ul className="space-y-0.5">
            {tips.map((tip) => (
              <li key={tip} className="flex gap-1.5 text-[11px] text-text-secondary">
                <span aria-hidden="true" className="text-text-muted">
                  ·
                </span>
                {tip}
              </li>
            ))}
          </ul>
          {item.officialUrl && (
            <button
              type="button"
              onClick={() => openExternalLink(item.officialUrl)}
              className="flex items-center gap-1 text-[10px] font-medium text-accent-mark hover:underline"
            >
              {t("keeper.official-site")}
              <Icon name="openExternal" className="size-2.5" />
            </button>
          )}
        </section>
      )}
    </div>
  );
}

export function EditorActions({
  onCancel,
  onSave,
  onDelete,
  canSave,
  saveLabel,
  t,
}: {
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
  canSave: boolean;
  saveLabel: string;
  t: TFn;
}) {
  return (
    <div className="flex items-center gap-1.5 pt-0.5">
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="btn-ghost flex items-center gap-1 text-[11px] text-text-muted hover:text-holiday"
        >
          <Icon name="trash" className="size-3" />
          {t("keeper.delete")}
        </button>
      )}
      <span className="flex-1" />
      <button type="button" onClick={onCancel} className="btn-ghost text-[11px]">
        {t("keeper.cancel")}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave}
        className="settings-btn settings-btn--accent text-[11px]"
      >
        {saveLabel}
      </button>
    </div>
  );
}
