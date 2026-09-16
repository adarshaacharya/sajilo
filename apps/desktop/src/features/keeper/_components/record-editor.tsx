import { useState } from "react";
import { CONTROL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { Select } from "../../../shared/components/select";
import type { KeeperPerson, KeeperRecord, KeeperRecordInput } from "../../../shared/lib/ipc";
import {
  documentSpec,
  fieldValue,
  NUMBER,
  personName,
  RECURRENCE_LABELS,
  recordName,
  recordSummary,
} from "../_lib/documents";
import type { TFn } from "../_lib/shared";
import { DateField } from "./date-picker";
import { EditorActions } from "./item-editor";
import { type NewPerson, PersonSelect } from "./person-select";
import { RemindDays } from "./remind-days";

export function RecordEditor({
  record,
  records,
  people,
  onChange,
  onSave,
  onCancel,
  onDelete,
  newPerson,
  onNewPerson,
  t,
}: {
  record: KeeperRecordInput;
  /** Every saved record, for the link picker. */
  records: readonly KeeperRecord[];
  people: readonly KeeperPerson[];
  onChange: (record: KeeperRecordInput) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  newPerson: NewPerson | null;
  onNewPerson: (person: NewPerson | null) => void;
  t: TFn;
}) {
  const spec = documentSpec(record);
  const setField = (key: string, value: string) => {
    if (key === NUMBER) {
      onChange({ ...record, number: value });
      return;
    }
    const next = { ...record, details: { ...record.details, [key]: value } };
    // A different kind of insurance renews differently; take its defaults
    // rather than keep a yearly cycle on a travel policy.
    if (key === "insuranceType") {
      const nextSpec = documentSpec(next);
      next.recurrence = nextSpec.defaultRecurrence;
      next.remindDays = [...nextSpec.defaultRemindDays];
    }
    onChange(next);
  };

  return (
    <section className="surface-card space-y-2.5 p-3">
      <PersonSelect
        value={record.personId}
        people={people}
        onChange={(personId) => onChange({ ...record, personId })}
        newPerson={newPerson}
        onNewPerson={onNewPerson}
        t={t}
      />

      <div className="grid grid-cols-2 gap-1.5">
        {spec.fields.map((field) => (
          <div key={field.key} className={field.wide ? "col-span-2" : "min-w-0"}>
            {field.options ? (
              <Select
                // Empty, the prompt names the field; once chosen, a value like
                // "Life" needs the caption to say what it is.
                label={fieldValue(record, field.key) ? t(field.label) : undefined}
                ariaLabel={t(field.label)}
                placeholder={t(field.label)}
                value={fieldValue(record, field.key)}
                onChange={(next) => setField(field.key, next)}
                options={field.options.map((option) => ({ id: option.id, label: t(option.label) }))}
              />
            ) : (
              <input
                value={fieldValue(record, field.key)}
                onChange={(event) => setField(field.key, event.target.value)}
                placeholder={t(field.label)}
                aria-label={t(field.label)}
                className={`${CONTROL} w-full`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="border-y border-divider py-1">
        <DateField
          label={t(spec.issued)}
          value={record.issuedDate}
          onChange={(issuedDate) => onChange({ ...record, issuedDate })}
          optional
          t={t}
        />
        {spec.kind !== "record" && spec.due && (
          <DateField
            label={t(spec.due)}
            value={record.expiryDate}
            onChange={(expiryDate) => onChange({ ...record, expiryDate })}
            optional
            t={t}
          />
        )}
      </div>

      {spec.kind !== "record" && record.expiryDate && (
        <div className="space-y-2">
          {spec.cycles &&
            (spec.cycles.length > 1 ? (
              <Select
                value={record.recurrence}
                onChange={(recurrence) => onChange({ ...record, recurrence })}
                options={spec.cycles.map((cycle) => ({
                  id: cycle,
                  label: t(RECURRENCE_LABELS[cycle]),
                }))}
              />
            ) : (
              <p className="text-[10px] text-text-muted">
                {t(RECURRENCE_LABELS[spec.cycles[0] ?? "none"])}
              </p>
            ))}
          <RemindDays
            value={record.remindDays}
            onChange={(remindDays) => onChange({ ...record, remindDays })}
            span={record.recurrence === "monthly" ? 14 : 365}
            t={t}
          />
        </div>
      )}

      {spec.office && (
        <input
          value={record.office}
          onChange={(event) => onChange({ ...record, office: event.target.value })}
          placeholder={t(spec.office)}
          aria-label={t(spec.office)}
          className={`${CONTROL} w-full`}
        />
      )}

      <LinkPicker record={record} records={records} people={people} onChange={onChange} t={t} />

      <textarea
        value={record.note}
        onChange={(event) => onChange({ ...record, note: event.target.value })}
        placeholder={t("keeper.note-placeholder")}
        aria-label={t("keeper.note-placeholder")}
        rows={2}
        className={`${CONTROL} h-auto w-full py-1.5`}
      />

      <EditorActions
        onCancel={onCancel}
        onSave={onSave}
        onDelete={onDelete}
        canSave={Boolean(fieldValue(record, spec.required).trim())}
        saveLabel={t("keeper.save-record")}
        t={t}
      />
    </section>
  );
}

/** Ties this document to others — a bluebook to its insurance policy, a
 * warranty to the bill's owner's passport if it matters. Collapsed until
 * wanted; most documents stand alone. */
function LinkPicker({
  record,
  records,
  people,
  onChange,
  t,
}: {
  record: KeeperRecordInput;
  records: readonly KeeperRecord[];
  people: readonly KeeperPerson[];
  onChange: (record: KeeperRecordInput) => void;
  t: TFn;
}) {
  const candidates = records.filter((other) => other.id !== record.id);
  const [open, setOpen] = useState(record.links.length > 0);
  if (candidates.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 text-[10px] font-medium text-accent-mark hover:underline"
      >
        <Icon name="link" className="size-3" />
        {t("keeper.link-documents")}
        {record.links.length > 0 && ` · ${record.links.length}`}
      </button>
      {open && (
        <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-divider p-1.5">
          {candidates.map((other) => {
            const linked = record.links.includes(other.id);
            return (
              <label
                key={other.id}
                className="flex items-center gap-1.5 rounded px-1 py-1 text-[10px] text-text-secondary hover:bg-surface-hover"
              >
                <input
                  type="checkbox"
                  checked={linked}
                  onChange={() =>
                    onChange({
                      ...record,
                      links: linked
                        ? record.links.filter((link) => link !== other.id)
                        : [...record.links, other.id],
                    })
                  }
                  className="accent-[color:var(--color-accent-mark)]"
                />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-text">{recordName(t, other)}</span>
                  {" · "}
                  {[personName(t, people, other.personId), recordSummary(other)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
