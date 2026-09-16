import { useState } from "react";
import { CONTROL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { Segmented } from "../../../shared/components/segmented";
import { Select } from "../../../shared/components/select";
import type {
  KeeperField,
  KeeperPerson,
  KeeperRecord,
  KeeperRecordInput,
} from "../../../shared/lib/ipc";
import {
  documentSpec,
  fieldValue,
  isVehicleInsurance,
  NUMBER,
  RECURRENCE_LABELS,
  recordName,
} from "../_lib/documents";
import { DOCUMENT_ICONS } from "../_lib/icons";
import type { TFn } from "../_lib/shared";
import { DateField } from "./date-picker";
import { EditorActions, FormHeader } from "./item-editor";
import { type NewPerson, PersonSelect } from "./person-select";
import { PhotoStrip } from "./photo-strip";
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
  const bluebooks = records.filter((other) => other.documentType === "bluebook");
  const setField = (key: string, value: string) => {
    if (key === NUMBER) {
      onChange({ ...record, number: value });
      return;
    }
    const next = { ...record, details: { ...record.details, [key]: value } };
    // A different kind of insurance (or a custom document switched between
    // never / expires / repeats) renews differently; take its defaults rather
    // than keep a yearly cycle on a travel policy.
    if (key === "insuranceType" || key === "customKind") {
      const nextSpec = documentSpec(next);
      next.recurrence = nextSpec.defaultRecurrence;
      next.remindDays = [...nextSpec.defaultRemindDays];
    }
    onChange(next);
  };

  return (
    <section className="surface-card space-y-2.5 p-3">
      <FormHeader
        icon={DOCUMENT_ICONS[record.documentType]}
        title={recordName(t, record)}
        hint={
          spec.kind === "repeats"
            ? t(
                RECURRENCE_LABELS[
                  record.recurrence === "none" ? spec.defaultRecurrence : record.recurrence
                ],
              )
            : spec.kind === "expires"
              ? t("keeper.hint.renews")
              : t("keeper.hint.on-file")
        }
      />
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
            {field.key === "insured" && isVehicleInsurance(record) && bluebooks.length > 0 ? (
              <VehiclePicker record={record} bluebooks={bluebooks} onChange={onChange} t={t} />
            ) : field.options ? (
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

      {record.documentType === "custom" && (
        <>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">
              {t("keeper.custom.kind")}
            </span>
            <Segmented
              label={t("keeper.custom.kind")}
              size="sm"
              scrollable={false}
              value={spec.kind}
              onChange={(kind) => setField("customKind", kind)}
              options={(["record", "expires", "repeats"] as const).map((kind) => ({
                id: kind,
                label: t(`keeper.custom.kind.${kind}`),
              }))}
            />
          </div>
          <CustomFields record={record} onChange={onChange} t={t} />
        </>
      )}

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

      <PhotoStrip ownerKind="record" ownerId={record.id} t={t} />

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

/** A vehicle policy picks its vehicle from the bluebooks already saved — which
 * links the two, so the bluebook can warn when its cover runs out — or takes a
 * typed number for a vehicle kept elsewhere. */
function VehiclePicker({
  record,
  bluebooks,
  onChange,
  t,
}: {
  record: KeeperRecordInput;
  bluebooks: readonly KeeperRecord[];
  onChange: (record: KeeperRecordInput) => void;
  t: TFn;
}) {
  const OTHER = "__other__";
  const linked = bluebooks.find((bluebook) => record.links.includes(bluebook.id));
  const [typing, setTyping] = useState(!linked && Boolean(record.details.insured));
  const bluebookIds = new Set(bluebooks.map((bluebook) => bluebook.id));
  const withoutVehicles = record.links.filter((link) => !bluebookIds.has(link));

  return (
    <div className="space-y-1.5">
      <Select
        label={linked || typing ? t("keeper.insurance.pick-vehicle") : undefined}
        ariaLabel={t("keeper.insurance.pick-vehicle")}
        placeholder={t("keeper.insurance.pick-vehicle")}
        value={linked?.id ?? (typing ? OTHER : "")}
        onChange={(next) => {
          if (next === OTHER) {
            setTyping(true);
            onChange({ ...record, links: withoutVehicles });
            return;
          }
          const bluebook = bluebooks.find((entry) => entry.id === next);
          if (!bluebook) return;
          setTyping(false);
          onChange({
            ...record,
            links: [...withoutVehicles, bluebook.id],
            details: { ...record.details, insured: bluebook.number },
          });
        }}
        options={[
          ...bluebooks.map((bluebook) => ({
            id: bluebook.id,
            label: [bluebook.number, bluebook.details.makeModel].filter(Boolean).join(" · "),
          })),
          { id: OTHER, label: t("keeper.insurance.other-vehicle") },
        ]}
      />
      {typing && (
        <input
          value={record.details.insured ?? ""}
          onChange={(event) =>
            onChange({ ...record, details: { ...record.details, insured: event.target.value } })
          }
          placeholder={t("keeper.insurance.vehicle")}
          aria-label={t("keeper.insurance.vehicle")}
          className={`${CONTROL} w-full`}
        />
      )}
    </div>
  );
}

/** The user's own label/value rows on a custom document. */
function CustomFields({
  record,
  onChange,
  t,
}: {
  record: KeeperRecordInput;
  onChange: (record: KeeperRecordInput) => void;
  t: TFn;
}) {
  const fields = record.customFields;
  const update = (index: number, patch: Partial<KeeperField>) =>
    onChange({
      ...record,
      customFields: fields.map((field, at) => (at === index ? { ...field, ...patch } : field)),
    });

  return (
    <div className="space-y-1.5">
      {fields.length > 0 && (
        <p className="text-[10px] font-medium text-text-secondary">{t("keeper.custom.fields")}</p>
      )}
      {fields.map((field, index) => (
        // Rows have no identity beyond their position; they're only ever
        // appended or removed, never reordered.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <div key={index} className="flex items-center gap-1">
          <input
            value={field.label}
            onChange={(event) => update(index, { label: event.target.value })}
            placeholder={t("keeper.custom.field-label")}
            aria-label={t("keeper.custom.field-label")}
            className={`${CONTROL} min-w-0 flex-[2]`}
          />
          <input
            value={field.value}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder={t("keeper.custom.field-value")}
            aria-label={t("keeper.custom.field-value")}
            className={`${CONTROL} min-w-0 flex-[3]`}
          />
          <button
            type="button"
            onClick={() =>
              onChange({ ...record, customFields: fields.filter((_, at) => at !== index) })
            }
            aria-label={t("keeper.custom.remove-field")}
            className="icon-btn size-6 shrink-0"
          >
            <span className="text-[14px] leading-none">×</span>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...record, customFields: [...fields, { label: "", value: "" }] })}
        className="flex items-center gap-1 text-[10px] font-medium text-accent-mark hover:underline"
      >
        <Icon name="plus" className="size-2.5" />
        {t("keeper.custom.add-field")}
      </button>
    </div>
  );
}
