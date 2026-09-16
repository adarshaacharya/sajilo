import { type ReactNode, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { openExternalLink } from "../../../shared/lib/external-link";
import type { KeeperDate, KeeperPerson, KeeperRecord } from "../../../shared/lib/ipc";
import {
  docTypeLabel,
  documentSpec,
  fieldValue,
  isVehicleInsurance,
  personName,
  RECURRENCE_LABELS,
  recordName,
  recordSummary,
} from "../_lib/documents";
import { daysUntil, dueLabel, dueTone, formatBs, formatDate, type TFn } from "../_lib/shared";
import { RENEWAL_GUIDES } from "../_lib/templates";
import { DateField } from "./date-picker";

/** One document: when it next needs you and what to do about it first, then
 * what's on the paper, what it's tied to, and how renewal works. */
export function RecordDetail({
  record,
  records,
  people,
  onEdit,
  onDelete,
  onAddAnother,
  onAdvance,
  onRenew,
  onOpen,
  t,
}: {
  record: KeeperRecord;
  records: readonly KeeperRecord[];
  people: readonly KeeperPerson[];
  onEdit: () => void;
  onDelete: () => void;
  /** Starts a blank document of the same kind. */
  onAddAnother: () => void;
  onAdvance: () => void;
  onRenew: (expiryDate: KeeperDate) => void;
  onOpen: (id: string) => void;
  t: TFn;
}) {
  const spec = documentSpec(record);
  const guide = RENEWAL_GUIDES[record.documentType];
  // Links are stored on one side; show both, so a policy knows its bluebook.
  const linked = records.filter(
    (other) =>
      other.id !== record.id &&
      (record.links.includes(other.id) || other.links.includes(record.id)),
  );
  const facts = [
    ...spec.fields
      // The insurance type is already in the name above.
      .filter((field) => field.key !== "insuranceType")
      .map((field) => {
        const value = fieldValue(record, field.key);
        const option = field.options?.find((entry) => entry.id === value);
        return [t(field.label), option ? t(option.label) : value] as const;
      }),
    [t(spec.issued), record.issuedDate ? formatDate(record.issuedDate.ad) : ""] as const,
    [spec.office ? t(spec.office) : "", record.office] as const,
    ...record.customFields.map((field) => [field.label || "—", field.value] as const),
  ]
    .filter(([label, value]) => label && value)
    .map(([label, value]) => [label.replace(/\s*\([^)]*\)\s*$/, ""), value] as const);
  const warning = record.documentType === "bluebook" ? insuranceWarning(record, linked) : null;

  return (
    <div className="space-y-2.5">
      <section className="surface-card space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{recordName(t, record)}</p>
            <p className="mt-0.5 truncate text-[10px] text-text-muted">
              {[personName(t, people, record.personId), recordSummary(record)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onDelete}
              aria-label={t("keeper.delete")}
              title={t("keeper.delete")}
              className="icon-btn size-7 hover:bg-[color:color-mix(in_srgb,var(--color-holiday)_12%,transparent)]"
            >
              {/* On the icon itself: `.icon-btn` sets its own text colour,
                  which a utility on the button can't override. */}
              <Icon name="trash" className="size-3.5 text-holiday" />
            </button>
            <button
              type="button"
              onClick={onEdit}
              aria-label={t("keeper.edit")}
              title={t("keeper.edit")}
              className="icon-btn size-7 text-text-secondary hover:text-text"
            >
              <Icon name="pencil" className="size-3.5" />
            </button>
          </div>
        </div>
        {/* A paper that never lapses has no date to show — and nothing to say
            about it either. */}
        {spec.kind !== "record" && (
          <DueBlock record={record} onAdvance={onAdvance} onRenew={onRenew} onEdit={onEdit} t={t} />
        )}
        {warning && (
          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-accent-mark">
            <Icon name="warning" className="mt-px size-3 shrink-0" />
            {t(warning)}
          </p>
        )}
        {/* What's on the paper sits in the same card: one document, one card. */}
        {(facts.length > 0 || record.note) && (
          <div className="border-t border-divider pt-0.5">
            {facts.map(([label, value]) => (
              <Fact key={label} label={label}>
                {value}
              </Fact>
            ))}
            {record.note && (
              <p className="whitespace-pre-wrap border-t border-divider py-2 text-[11px] text-text-secondary first:border-0">
                {record.note}
              </p>
            )}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={onAddAnother}
        className="flex items-center gap-1 px-0.5 text-[10px] font-medium text-accent-mark hover:underline"
      >
        <Icon name="plus" className="size-2.5" />
        {t("keeper.add-another").replace("{type}", docTypeLabel(t, record.documentType))}
      </button>

      {linked.length > 0 && (
        <section className="surface-card px-3 py-1">
          <p className="pt-2 text-[10px] font-medium text-text-secondary">{t("keeper.linked")}</p>
          {linked.map((other) => (
            <button
              key={other.id}
              type="button"
              onClick={() => onOpen(other.id)}
              className="flex w-full items-center gap-2 border-b border-divider py-2 text-left last:border-0"
            >
              <Icon name="link" className="size-3 shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {recordName(t, other)}
                <span className="text-text-muted"> · {recordSummary(other)}</span>
              </span>
              <RecordDue record={other} t={t} />
            </button>
          ))}
        </section>
      )}

      {guide && (
        <section className="surface-card space-y-1.5 p-3">
          <p className="text-[10px] font-medium text-text-secondary">{t("keeper.how-to-renew")}</p>
          <ul className="space-y-0.5">
            {guide.checklist.map((entry) => (
              <li key={entry} className="flex gap-1.5 text-[11px] text-text-secondary">
                <span aria-hidden="true" className="text-text-muted">
                  ·
                </span>
                {entry}
              </li>
            ))}
          </ul>
          {(guide.fee || guide.location) && (
            <p className="text-[10px] text-text-muted">
              {[guide.fee, guide.location].filter(Boolean).join(" · ")}
            </p>
          )}
          {guide.note && (
            <p className="text-[10px] leading-relaxed text-text-muted">{guide.note}</p>
          )}
          {guide.url && (
            <button
              type="button"
              onClick={() => openExternalLink(guide.url)}
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

function DueBlock({
  record,
  onAdvance,
  onRenew,
  onEdit,
  t,
}: {
  record: KeeperRecord;
  onAdvance: () => void;
  onRenew: (expiryDate: KeeperDate) => void;
  onEdit: () => void;
  t: TFn;
}) {
  const spec = documentSpec(record);
  const [renewing, setRenewing] = useState(false);
  const due = record.expiryDate;

  if (!due) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="text-left text-[11px] font-medium text-accent-mark hover:underline"
      >
        {t("keeper.add-date-prompt")} {spec.due ? t(spec.due).toLowerCase() : ""}
      </button>
    );
  }

  const days = daysUntil(due.ad);
  return (
    <div className="space-y-2 rounded-md border border-divider p-2.5">
      <p className="text-[10px] text-text-muted">{spec.due ? t(spec.due) : ""}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-[15px] font-semibold tabular-nums">{formatDate(due.ad)}</p>
        <span className={`text-[11px] font-medium tabular-nums ${dueTone(days)}`}>
          {dueLabel(t, days)}
        </span>
      </div>
      <p className="text-[10px] text-text-muted">
        {formatBs(due)}
        {spec.kind === "repeats" && ` · ${t(RECURRENCE_LABELS[record.recurrence])}`}
      </p>

      {spec.kind === "repeats" && spec.action && (
        <button type="button" onClick={onAdvance} className="settings-btn text-[11px]">
          {t(spec.action)}
        </button>
      )}
      {spec.kind === "expires" &&
        spec.action &&
        (renewing ? (
          <DateField
            label={t("keeper.new-expiry")}
            value={null}
            defaultOpen
            onChange={(date) => {
              setRenewing(false);
              if (date) onRenew(date);
            }}
            t={t}
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenewing(true)}
            className="settings-btn text-[11px]"
          >
            {t(spec.action)}
          </button>
        ))}
    </div>
  );
}

/** A record's compact due state for lists. */
export function RecordDue({ record, t }: { record: KeeperRecord; t: TFn }) {
  const spec = documentSpec(record);
  if (spec.kind === "record") {
    return null;
  }
  if (!record.expiryDate) {
    return <span className="shrink-0 text-[10px] text-text-muted">{t("keeper.not-set")}</span>;
  }
  const days = daysUntil(record.expiryDate.ad);
  return (
    <span className={`shrink-0 text-[10px] font-medium tabular-nums ${dueTone(days)}`}>
      {days > 60 ? formatDate(record.expiryDate.ad) : dueLabel(t, days)}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-divider py-2 last:border-0">
      <span className="shrink-0 text-[10px] text-text-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-[11px]">{children}</span>
    </div>
  );
}

/** Renewing a bluebook needs a valid policy, so the bluebook is where a missing
 * or lapsing vehicle policy should surface. */
function insuranceWarning(bluebook: KeeperRecord, linked: readonly KeeperRecord[]) {
  const policies = linked.filter(isVehicleInsurance);
  if (policies.length === 0) return "keeper.bluebook.no-insurance" as const;
  const taxDue = bluebook.expiryDate?.ad;
  if (!taxDue) return null;
  // Covered if any linked policy is still running on the day the tax is due.
  const covered = policies.some((policy) => !policy.expiryDate || policy.expiryDate.ad >= taxDue);
  return covered ? null : ("keeper.bluebook.insurance-lapses" as const);
}
