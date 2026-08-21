import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../shared/components/icon";
import { Segmented } from "../../shared/components/segmented";
import { useSettings } from "../../shared/context/settings-context";
import { openExternalLink } from "../../shared/lib/external-link";
import {
  api,
  type SamjhanaChecklistItem,
  type SamjhanaDate,
  type SamjhanaDateInput,
  type SamjhanaDocumentType,
  type SamjhanaItem,
  type SamjhanaPerson,
  type SamjhanaRecord,
  type SamjhanaRecordInput,
  type SamjhanaSnapshot,
} from "../../shared/lib/ipc";

type Category = "all" | "identity" | "vehicle" | "home" | "money" | "health" | "application";
type View = "reminders" | "records";
type TFn = ReturnType<typeof useSettings>["t"];

const CONTROL =
  "control-field h-8 rounded-md px-2 text-[11px] outline-none placeholder:text-text-muted focus:border-[color:var(--color-accent-mark)]";
const EMPTY_DATE = { calendar: "ad" as const, year: 2000, month: 1, day: 1 };

/** Template content (title/fee/location/checklist) is English-only for now —
 * these mirror official government form names, which Nepali speakers
 * commonly use in English day to day. Everything the user actually
 * interacts with around them (labels, buttons, categories) is localized. */
const TEMPLATES: readonly {
  id: string;
  title: string;
  category: Category;
  url: string;
  fee: string;
  location: string;
  checklist: string[];
}[] = [
  {
    id: "citizenship",
    title: "Citizenship certificate",
    category: "identity",
    url: "https://moha.gov.np/",
    fee: "Check DAO notice",
    location: "District Administration Office / local authority",
    checklist: [
      "Birth or relationship proof",
      "Parent’s citizenship copy",
      "Local recommendation",
      "Recent photographs",
    ],
  },
  {
    id: "passport",
    title: "Passport renewal",
    category: "identity",
    url: "https://nepalpassport.gov.np/en",
    fee: "Check current revenue",
    location: "Department of Passports / DAO",
    checklist: [
      "Online pre-enrolment barcode",
      "Original citizenship certificate",
      "National ID number",
      "Current or expired passport",
      "Revenue voucher",
    ],
  },
  {
    id: "licence",
    title: "Driving licence renewal",
    category: "vehicle",
    url: "https://dotm.gov.np/",
    fee: "Check current provincial fee",
    location: "Transport Management Office",
    checklist: ["Original licence", "Citizenship copy", "Medical certificate", "Revenue voucher"],
  },
  {
    id: "bluebook",
    title: "Bluebook renewal",
    category: "vehicle",
    url: "https://dotm.gov.np/",
    fee: "Check current tax and fee",
    location: "Transport Management Office",
    checklist: [
      "Original bluebook",
      "Third-party insurance",
      "Citizenship copy",
      "Vehicle inspection",
    ],
  },
  {
    id: "vehicleTax",
    title: "Vehicle tax",
    category: "vehicle",
    url: "https://dotm.gov.np/",
    fee: "Tax amount for your province",
    location: "Provincial transport office or online portal",
    checklist: ["Original bluebook", "Insurance renewal", "Tax payment receipt"],
  },
  {
    id: "pan",
    title: "PAN registration",
    category: "application",
    url: "https://ird.gov.np/",
    fee: "Usually free; verify online",
    location: "Inland Revenue Office",
    checklist: ["Citizenship copy", "Passport photo", "Business or employer details"],
  },
  {
    id: "internet",
    title: "Internet bill",
    category: "home",
    url: "",
    fee: "Monthly amount",
    location: "Provider app or counter",
    checklist: ["Customer or account number", "Payment receipt"],
  },
  {
    id: "electricity",
    title: "Electricity bill",
    category: "home",
    url: "https://nea.org.np/",
    fee: "Monthly amount",
    location: "NEA counter or online payment",
    checklist: ["NEA consumer number", "Meter reading", "Payment receipt"],
  },
  {
    id: "rent",
    title: "Rent payment",
    category: "home",
    url: "",
    fee: "Monthly amount",
    location: "Landlord or bank transfer",
    checklist: ["Payment receipt", "Agreement note"],
  },
  {
    id: "school",
    title: "School fee",
    category: "home",
    url: "",
    fee: "Term amount",
    location: "School office or portal",
    checklist: ["Student ID", "Payment receipt"],
  },
  {
    id: "loan",
    title: "Loan instalment",
    category: "money",
    url: "",
    fee: "Instalment amount",
    location: "Bank or finance provider",
    checklist: ["Loan account number", "Payment receipt"],
  },
  {
    id: "insurance",
    title: "Insurance renewal",
    category: "money",
    url: "",
    fee: "Premium amount",
    location: "Insurance provider",
    checklist: ["Policy number", "Renewal notice", "Payment receipt"],
  },
  {
    id: "medicine",
    title: "Medicine refill",
    category: "health",
    url: "",
    fee: "Prescription amount",
    location: "Pharmacy or hospital",
    checklist: ["Prescription", "Medicine name and dose"],
  },
];

function id() {
  return crypto.randomUUID();
}

function blankItem(date: SamjhanaDateInput = EMPTY_DATE): SamjhanaItem {
  return {
    id: id(),
    personId: null,
    title: "",
    category: "identity",
    status: "active",
    dueDate: { ...date, ad: "", bs: { year: date.year, month: date.month, day: date.day } },
    recurrence: "none",
    remindDays: [30, 7, 1],
    note: "",
    officialUrl: "",
    officeLocation: "",
    fee: "",
    applicationStatus: "notStarted",
    checklist: [],
    createdAt: "",
    updatedAt: "",
    completedAt: null,
  };
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function daysUntil(date: string) {
  const target = new Date(`${date}T00:00:00`).getTime();
  return Math.ceil((target - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
}

function dueTone(item: SamjhanaItem) {
  if (item.status === "completed") return "text-positive";
  const days = daysUntil(item.dueDate.ad);
  return days < 0 ? "text-holiday" : days <= 30 ? "text-accent-mark" : "text-text-secondary";
}

function categoryLabel(t: TFn, category: string) {
  switch (category) {
    case "identity":
      return t("samjhana.category.identity");
    case "vehicle":
      return t("samjhana.category.vehicle");
    case "home":
      return t("samjhana.category.home");
    case "money":
      return t("samjhana.category.money");
    case "health":
      return t("samjhana.category.health");
    case "application":
      return t("samjhana.category.application");
    default:
      return t("samjhana.category.other");
  }
}

function applyTemplate(item: SamjhanaItem, template: (typeof TEMPLATES)[number]) {
  return {
    ...item,
    title: template.title,
    category: template.category,
    officialUrl: template.url,
    fee: template.fee,
    officeLocation: template.location,
    checklist: template.checklist.map((label) => ({ id: id(), label, checked: false })),
  };
}

function Summary({ items, onAdd, t }: { items: SamjhanaItem[]; onAdd: () => void; t: TFn }) {
  const active = items.filter((item) => item.status === "active");
  const urgent = active.filter((item) => daysUntil(item.dueDate.ad) <= 30).length;
  return (
    <div className="flex items-center justify-between gap-3 px-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[color:color-mix(in_srgb,var(--color-accent-mark)_16%,transparent)] text-accent-mark">
          <Icon name="samjhana" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold">{t("samjhana.title")}</h2>
          {active.length > 0 && (
            <p className="mt-0.5 truncate text-[10px] text-text-muted">
              {active.length} {t("samjhana.active").toLowerCase()}
              {urgent > 0 && (
                <span className="text-accent-mark">
                  {" · "}
                  {urgent} {t("samjhana.due-soon").toLowerCase()}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="settings-btn flex shrink-0 items-center gap-1 text-[11px]"
      >
        <Icon name="plus" className="size-3" /> {t("samjhana.add")}
      </button>
    </div>
  );
}

function ItemRow({
  item,
  person,
  onEdit,
  onDelete,
  onComplete,
  t,
}: {
  item: SamjhanaItem;
  person?: SamjhanaPerson;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
  t: TFn;
}) {
  const days = daysUntil(item.dueDate.ad);
  return (
    <article className="group border-b border-divider py-2.5 last:border-0">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onComplete}
          aria-label={
            item.status === "completed" ? t("samjhana.reopen") : t("samjhana.mark-complete")
          }
          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${item.status === "completed" ? "border-positive bg-positive text-[#10151a]" : "border-control-border hover:border-accent-mark"}`}
        >
          {item.status === "completed" && <Icon name="checkmark" className="size-3" />}
        </button>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`truncate text-[12px] font-medium ${item.status === "completed" ? "text-text-muted line-through" : ""}`}
            >
              {item.title}
            </p>
            <span className={`shrink-0 text-[10px] font-medium tabular-nums ${dueTone(item)}`}>
              {item.status === "completed"
                ? t("samjhana.done")
                : days < 0
                  ? `${Math.abs(days)}d ${t("samjhana.days-overdue")}`
                  : days === 0
                    ? t("samjhana.today")
                    : `${days}d`}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-text-muted">
            {person?.name ? `${person.name} · ` : ""}
            {categoryLabel(t, item.category)} · {formatDate(item.dueDate.ad)} · BS{" "}
            {item.dueDate.bs.year}-{String(item.dueDate.bs.month).padStart(2, "0")}-
            {String(item.dueDate.bs.day).padStart(2, "0")}
          </p>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`${t("samjhana.delete")} ${item.title}`}
          className="icon-btn shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Icon name="trash" className="size-3 text-text-muted hover:text-holiday" />
        </button>
      </div>
      {item.checklist.length > 0 && (
        <p className="ml-6 mt-1 text-[10px] text-text-muted">
          {item.checklist.filter((entry) => entry.checked).length}/{item.checklist.length}{" "}
          {t("samjhana.checklist-ready")}
        </p>
      )}
    </article>
  );
}

function DateEditor({
  item,
  onChange,
  t,
}: {
  item: SamjhanaItem;
  onChange: (item: SamjhanaItem) => void;
  t: TFn;
}) {
  const { calendar, year, month, day } = item.dueDate;
  const update = (part: keyof SamjhanaDateInput, value: string) =>
    onChange({
      ...item,
      dueDate: {
        ...item.dueDate,
        [part]: part === "calendar" ? value : Number(value) || 0,
      } as SamjhanaItem["dueDate"],
    });
  const resolve = () =>
    api
      .resolveSamjhanaDate({ calendar, year, month, day })
      .then((date) => onChange({ ...item, dueDate: date }))
      .catch(() => {});
  const dateOptions: { id: "ad" | "bs"; label: string }[] = [
    { id: "ad", label: "AD" },
    { id: "bs", label: "BS" },
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-text-secondary">{t("samjhana.due-date")}</p>
        <Segmented
          options={dateOptions}
          value={calendar}
          onChange={(value) => update("calendar", value)}
          label={t("samjhana.due-date")}
          scrollable={false}
        />
      </div>
      <div className="flex gap-1.5">
        <input
          aria-label="Year"
          type="number"
          value={year || ""}
          onChange={(event) => update("year", event.target.value)}
          onBlur={resolve}
          className={`${CONTROL} min-w-0 flex-1`}
          placeholder="YYYY"
        />
        <input
          aria-label="Month"
          type="number"
          min="1"
          max="12"
          value={month || ""}
          onChange={(event) => update("month", event.target.value)}
          onBlur={resolve}
          className={`${CONTROL} w-14`}
          placeholder="MM"
        />
        <input
          aria-label="Day"
          type="number"
          min="1"
          max="32"
          value={day || ""}
          onChange={(event) => update("day", event.target.value)}
          onBlur={resolve}
          className={`${CONTROL} w-14`}
          placeholder="DD"
        />
      </div>
      {item.dueDate.ad && (
        <p className="text-[10px] text-text-muted">
          {calendar === "ad"
            ? `BS ${item.dueDate.bs.year}-${item.dueDate.bs.month}-${item.dueDate.bs.day}`
            : `AD ${item.dueDate.ad}`}
        </p>
      )}
    </div>
  );
}

const RECORD_TYPES: readonly SamjhanaDocumentType[] = [
  "citizenship",
  "passport",
  "drivingLicence",
  "nid",
  "pan",
];

function docTypeLabel(t: TFn, type: SamjhanaDocumentType) {
  switch (type) {
    case "citizenship":
      return t("samjhana.doc.citizenship");
    case "passport":
      return t("samjhana.doc.passport");
    case "drivingLicence":
      return t("samjhana.doc.drivingLicence");
    case "nid":
      return t("samjhana.doc.nid");
    case "pan":
      return t("samjhana.doc.pan");
    default:
      return type;
  }
}

/** An optional date field — unlike a reminder's due date, a document's
 * issued/expiry date may simply not be recorded. */
function OptionalDateField({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: SamjhanaDate | null;
  onChange: (value: SamjhanaDate | null) => void;
  t: TFn;
}) {
  const [draft, setDraft] = useState<SamjhanaDateInput>(
    value ?? { calendar: "ad", year: 0, month: 0, day: 0 },
  );
  const [expanded, setExpanded] = useState(value !== null);
  const update = (part: keyof SamjhanaDateInput, raw: string) =>
    setDraft((current) => ({
      ...current,
      [part]: part === "calendar" ? raw : Number(raw) || 0,
    }));
  const resolve = (next: SamjhanaDateInput) => {
    if (!next.year || !next.month || !next.day) return;
    api
      .resolveSamjhanaDate(next)
      .then(onChange)
      .catch(() => {});
  };
  const dateOptions: { id: "ad" | "bs"; label: string }[] = [
    { id: "ad", label: "AD" },
    { id: "bs", label: "BS" },
  ];
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[10px] font-medium text-text-secondary">
        <input
          type="checkbox"
          checked={expanded}
          onChange={(event) => {
            setExpanded(event.target.checked);
            if (!event.target.checked) onChange(null);
          }}
          className="accent-[color:var(--color-accent-mark)]"
        />
        {label}
        {!expanded && <span className="text-text-muted">· {t("samjhana.not-set")}</span>}
      </label>
      {expanded && (
        <>
          <Segmented
            options={dateOptions}
            value={draft.calendar}
            onChange={(next) => {
              const updated = { ...draft, calendar: next };
              setDraft(updated);
              resolve(updated);
            }}
            label={label}
            scrollable={false}
          />
          <div className="flex gap-1.5">
            <input
              aria-label="Year"
              type="number"
              value={draft.year || ""}
              onChange={(event) => update("year", event.target.value)}
              onBlur={() => resolve(draft)}
              className={`${CONTROL} min-w-0 flex-1`}
              placeholder="YYYY"
            />
            <input
              aria-label="Month"
              type="number"
              min="1"
              max="12"
              value={draft.month || ""}
              onChange={(event) => update("month", event.target.value)}
              onBlur={() => resolve(draft)}
              className={`${CONTROL} w-14`}
              placeholder="MM"
            />
            <input
              aria-label="Day"
              type="number"
              min="1"
              max="32"
              value={draft.day || ""}
              onChange={(event) => update("day", event.target.value)}
              onBlur={() => resolve(draft)}
              className={`${CONTROL} w-14`}
              placeholder="DD"
            />
          </div>
          {value?.ad && (
            <p className="text-[10px] text-text-muted">
              {draft.calendar === "ad"
                ? `BS ${value.bs.year}-${value.bs.month}-${value.bs.day}`
                : `AD ${value.ad}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function blankRecord(): SamjhanaRecordInput {
  return {
    id: id(),
    documentType: "citizenship",
    number: "",
    issuedDate: null,
    expiryDate: null,
    office: "",
    note: "",
    createdAt: "",
  };
}

function RecordRow({
  record,
  onEdit,
  onDelete,
  t,
}: {
  record: SamjhanaRecord;
  onEdit: () => void;
  onDelete: () => void;
  t: TFn;
}) {
  return (
    <article className="group flex items-start gap-2 border-b border-divider py-2.5 last:border-0">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[12px] font-medium">{docTypeLabel(t, record.documentType)}</p>
        <p className="mt-0.5 truncate text-[10px] text-text-muted">
          {record.number}
          {record.expiryDate && (
            <>
              {" · "}
              {t("samjhana.expiry-date")} {formatDate(record.expiryDate.ad)}
            </>
          )}
        </p>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${t("samjhana.delete")} ${docTypeLabel(t, record.documentType)}`}
        className="icon-btn shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Icon name="trash" className="size-3 text-text-muted hover:text-holiday" />
      </button>
    </article>
  );
}

function RecordEditor({
  record,
  onChange,
  onSave,
  onCancel,
  t,
}: {
  record: SamjhanaRecordInput;
  onChange: (record: SamjhanaRecordInput) => void;
  onSave: () => void;
  onCancel: () => void;
  t: TFn;
}) {
  return (
    <section className="surface-card space-y-2.5 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold">
          {record.number ? t("samjhana.edit-record") : t("samjhana.new-record")}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="icon-btn"
          aria-label={t("samjhana.close")}
        >
          <span className="text-[16px] leading-none text-text-muted">×</span>
        </button>
      </div>
      <select
        value={record.documentType}
        onChange={(event) =>
          onChange({
            ...record,
            documentType: event.target.value as SamjhanaDocumentType,
          })
        }
        className={`${CONTROL} w-full`}
      >
        {RECORD_TYPES.map((type) => (
          <option key={type} value={type}>
            {docTypeLabel(t, type)}
          </option>
        ))}
      </select>
      <input
        value={record.number}
        onChange={(event) => onChange({ ...record, number: event.target.value })}
        placeholder={t("samjhana.record-number")}
        className={`${CONTROL} w-full`}
      />
      <OptionalDateField
        label={t("samjhana.issued-date")}
        value={record.issuedDate}
        onChange={(issuedDate) => onChange({ ...record, issuedDate })}
        t={t}
      />
      <OptionalDateField
        label={t("samjhana.expiry-date")}
        value={record.expiryDate}
        onChange={(expiryDate) => onChange({ ...record, expiryDate })}
        t={t}
      />
      {record.expiryDate && (
        <p className="text-[10px] text-accent-mark">{t("samjhana.linked-reminder-note")}</p>
      )}
      <input
        value={record.office}
        onChange={(event) => onChange({ ...record, office: event.target.value })}
        placeholder={t("samjhana.office-placeholder")}
        className={`${CONTROL} w-full`}
      />
      <textarea
        value={record.note}
        onChange={(event) => onChange({ ...record, note: event.target.value })}
        placeholder={t("samjhana.note-placeholder")}
        rows={2}
        className={`${CONTROL} h-auto w-full py-1.5`}
      />
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onCancel} className="btn-ghost text-[11px]">
          {t("samjhana.cancel")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!record.number.trim()}
          className="settings-btn text-[11px] disabled:opacity-40"
        >
          {t("samjhana.save-record")}
        </button>
      </div>
    </section>
  );
}

function ItemEditor({
  item,
  people,
  onChange,
  onSave,
  onCancel,
  onAddPerson,
  t,
}: {
  item: SamjhanaItem;
  people: SamjhanaPerson[];
  onChange: (item: SamjhanaItem) => void;
  onSave: () => void;
  onCancel: () => void;
  onAddPerson: (name: string, relationship: string) => Promise<SamjhanaPerson | undefined>;
  t: TFn;
}) {
  const [personDraft, setPersonDraft] = useState("");
  const [relationshipDraft, setRelationshipDraft] = useState("");
  const [showPerson, setShowPerson] = useState(false);
  const [template, setTemplate] = useState("");
  const [showMore, setShowMore] = useState(
    Boolean(
      item.personId ||
        item.recurrence !== "none" ||
        item.applicationStatus !== "notStarted" ||
        item.fee ||
        item.officeLocation ||
        item.officialUrl ||
        item.note,
    ),
  );
  const toggleChecklist = (entry: SamjhanaChecklistItem) =>
    onChange({
      ...item,
      checklist: item.checklist.map((itemEntry) =>
        itemEntry.id === entry.id ? { ...itemEntry, checked: !itemEntry.checked } : itemEntry,
      ),
    });
  return (
    <section className="surface-card space-y-2.5 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold">
          {item.title ? t("samjhana.edit-title") : t("samjhana.new-title")}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="icon-btn"
          aria-label={t("samjhana.close")}
        >
          <span className="text-[16px] leading-none text-text-muted">×</span>
        </button>
      </div>

      <select
        value={template}
        onChange={(event) => {
          setTemplate(event.target.value);
          const found = TEMPLATES.find((entry) => entry.id === event.target.value);
          if (found) onChange(applyTemplate(item, found));
        }}
        className={`${CONTROL} w-full`}
      >
        <option value="">{t("samjhana.template-placeholder")}</option>
        {TEMPLATES.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.title}
          </option>
        ))}
      </select>
      <input
        value={item.title}
        onChange={(event) => onChange({ ...item, title: event.target.value })}
        placeholder={t("samjhana.what-should-remember")}
        className={`${CONTROL} w-full`}
      />
      <select
        value={item.category}
        onChange={(event) => onChange({ ...item, category: event.target.value })}
        className={`${CONTROL} w-full`}
      >
        <option value="identity">{t("samjhana.category.identity")}</option>
        <option value="vehicle">{t("samjhana.category.vehicle")}</option>
        <option value="home">{t("samjhana.category.home")}</option>
        <option value="money">{t("samjhana.category.money")}</option>
        <option value="health">{t("samjhana.category.health")}</option>
        <option value="application">{t("samjhana.category.application")}</option>
      </select>
      <DateEditor item={item} onChange={onChange} t={t} />

      <button
        type="button"
        onClick={() => setShowMore((value) => !value)}
        className="flex items-center gap-1 text-[10px] font-medium text-accent-mark hover:underline"
      >
        <Icon
          name="chevronLeft"
          className={`size-2.5 transition-transform ${showMore ? "-rotate-90" : "rotate-180"}`}
        />
        {showMore ? t("samjhana.hide-details") : t("samjhana.more-details")}
      </button>

      {showMore && (
        <div className="space-y-2.5 rounded-md border border-divider p-2.5">
          <div>
            <select
              value={item.personId ?? ""}
              onChange={(event) => onChange({ ...item, personId: event.target.value || null })}
              className={`${CONTROL} w-full`}
            >
              <option value="">{t("samjhana.for-me")}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.relationship ? ` · ${person.relationship}` : ""}
                </option>
              ))}
            </select>
            {showPerson ? (
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={personDraft}
                  onChange={(event) => setPersonDraft(event.target.value)}
                  placeholder={t("samjhana.family-name")}
                  className={`${CONTROL} min-w-0 flex-1`}
                />
                <input
                  value={relationshipDraft}
                  onChange={(event) => setRelationshipDraft(event.target.value)}
                  placeholder={t("samjhana.relationship-placeholder")}
                  className={`${CONTROL} w-20`}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const person = await onAddPerson(personDraft, relationshipDraft);
                    if (person) {
                      onChange({ ...item, personId: person.id });
                      setPersonDraft("");
                      setRelationshipDraft("");
                      setShowPerson(false);
                    }
                  }}
                  className="btn-ghost text-[11px]"
                >
                  {t("samjhana.add")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPerson(true)}
                className="mt-1.5 text-left text-[10px] text-accent-mark hover:underline"
              >
                {t("samjhana.add-family-profile")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={item.recurrence}
              onChange={(event) =>
                onChange({ ...item, recurrence: event.target.value as SamjhanaItem["recurrence"] })
              }
              className={`${CONTROL} w-full`}
            >
              <option value="none">{t("samjhana.recurrence.none")}</option>
              <option value="monthly">{t("samjhana.recurrence.monthly")}</option>
              <option value="yearlyAd">{t("samjhana.recurrence.yearlyAd")}</option>
              <option value="yearlyBs">{t("samjhana.recurrence.yearlyBs")}</option>
            </select>
            <select
              value={item.applicationStatus}
              onChange={(event) => onChange({ ...item, applicationStatus: event.target.value })}
              className={`${CONTROL} w-full`}
            >
              <option value="notStarted">{t("samjhana.status.notStarted")}</option>
              <option value="submitted">{t("samjhana.status.submitted")}</option>
              <option value="inReview">{t("samjhana.status.inReview")}</option>
              <option value="ready">{t("samjhana.status.ready")}</option>
              <option value="completed">{t("samjhana.status.completed")}</option>
            </select>
          </div>
          <div>
            <p className="mb-1 block text-[10px] font-medium text-text-secondary">
              {t("samjhana.remind-before")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[30, 14, 7, 1].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...item,
                      remindDays: item.remindDays.includes(days)
                        ? item.remindDays.filter((value) => value !== days)
                        : [...item.remindDays, days].sort((a, b) => b - a),
                    })
                  }
                  className={`rounded-md border px-2 py-1 text-[10px] ${item.remindDays.includes(days) ? "border-[color:var(--color-accent-mark)] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)] text-accent-mark" : "border-control-border text-text-muted hover:text-text"}`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={item.fee}
              onChange={(event) => onChange({ ...item, fee: event.target.value })}
              placeholder={t("samjhana.fee-placeholder")}
              className={`${CONTROL} w-full`}
            />
            <input
              value={item.officeLocation}
              onChange={(event) => onChange({ ...item, officeLocation: event.target.value })}
              placeholder={t("samjhana.location-placeholder")}
              className={`${CONTROL} w-full`}
            />
          </div>
          <div className="flex gap-1.5">
            <input
              value={item.officialUrl}
              onChange={(event) => onChange({ ...item, officialUrl: event.target.value })}
              placeholder={t("samjhana.link-placeholder")}
              className={`${CONTROL} min-w-0 flex-1`}
            />
            {item.officialUrl && (
              <button
                type="button"
                onClick={() => openExternalLink(item.officialUrl)}
                className="btn-ghost shrink-0 text-[10px]"
                aria-label={t("samjhana.open-link")}
              >
                <Icon name="openExternal" className="size-3" />
              </button>
            )}
          </div>
          <textarea
            value={item.note}
            onChange={(event) => onChange({ ...item, note: event.target.value })}
            placeholder={t("samjhana.notes-placeholder")}
            rows={2}
            className={`${CONTROL} h-auto w-full py-1.5`}
          />
          {item.checklist.length > 0 && (
            <div className="rounded-md border border-divider p-2">
              <p className="mb-1.5 text-[10px] font-medium text-text-secondary">
                {t("samjhana.required-documents")}
              </p>
              {item.checklist.map((entry) => (
                <label
                  key={entry.id}
                  className="flex items-center gap-1.5 py-0.5 text-[10px] text-text-secondary"
                >
                  <input
                    type="checkbox"
                    checked={entry.checked}
                    onChange={() => toggleChecklist(entry)}
                    className="accent-[color:var(--color-accent-mark)]"
                  />
                  {entry.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onCancel} className="btn-ghost text-[11px]">
          {t("samjhana.cancel")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!item.title.trim() || !item.dueDate.ad}
          className="settings-btn text-[11px] disabled:opacity-40"
        >
          {t("samjhana.save")}
        </button>
      </div>
    </section>
  );
}

export function Samjhana() {
  const { t } = useSettings();
  const [data, setData] = useState<SamjhanaSnapshot>({ people: [], items: [], records: [] });
  const [view, setView] = useState<View>("reminders");
  const [editing, setEditing] = useState<SamjhanaItem | null>(null);
  const [editingRecord, setEditingRecord] = useState<SamjhanaRecordInput | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .samjhanaSnapshot()
      .then(setData)
      .catch(() => setError(t("samjhana.error-load")));
  }, [t]);
  const people = useMemo(
    () => new Map(data.people.map((person) => [person.id, person])),
    [data.people],
  );
  const filtered = useMemo(
    () =>
      data.items
        .filter(
          (item) =>
            (category === "all" || item.category === category) &&
            `${item.title} ${item.note} ${people.get(item.personId ?? "")?.name ?? ""}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "completed" ? 1 : -1;
          return a.dueDate.ad.localeCompare(b.dueDate.ad);
        }),
    [category, data.items, people, search],
  );
  const add = async () => {
    const today = await api.today();
    const date = await api.resolveSamjhanaDate({
      calendar: "bs",
      year: today.nepali.year,
      month: today.nepali.month,
      day: today.nepali.day,
    });
    setEditing({
      ...blankItem({
        calendar: "bs",
        year: today.nepali.year,
        month: today.nepali.month,
        day: today.nepali.day,
      }),
      dueDate: date,
    });
  };
  const addPerson = async (name: string, relationship: string) => {
    if (!name.trim()) return undefined;
    const person: SamjhanaPerson = { id: id(), name: name.trim(), relationship, createdAt: "" };
    const next = await api.saveSamjhanaPerson(person);
    setData(next);
    return next.people.find((entry) => entry.id === person.id);
  };
  const save = async () => {
    if (!editing) return;
    try {
      setData(await api.saveSamjhanaItem(editing));
      setEditing(null);
      setError("");
    } catch {
      setError(t("samjhana.error-save"));
    }
  };
  const complete = async (item: SamjhanaItem) => {
    try {
      setData(
        await api.saveSamjhanaItem({
          ...item,
          status: item.status === "completed" ? "active" : "completed",
        }),
      );
    } catch {
      setError(t("samjhana.error-save"));
    }
  };
  const remove = async (item: SamjhanaItem) => {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const confirmed = await ask(t("samjhana.delete-confirm-body"), {
      title: `${t("samjhana.delete-confirm-title")} "${item.title}"`,
      kind: "warning",
    });
    if (confirmed) setData(await api.deleteSamjhanaItem(item.id));
  };

  const saveRecord = async () => {
    if (!editingRecord) return;
    try {
      setData(await api.saveSamjhanaRecord(editingRecord));
      setEditingRecord(null);
      setError("");
    } catch {
      setError(t("samjhana.error-save-record"));
    }
  };
  const removeRecord = async (record: SamjhanaRecord) => {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const confirmed = await ask(t("samjhana.delete-record-confirm-body"), {
      title: t("samjhana.delete-record-confirm-title"),
      kind: "warning",
    });
    if (confirmed) setData(await api.deleteSamjhanaRecord(record.id));
  };

  const onAdd = view === "reminders" ? add : () => setEditingRecord(blankRecord());
  const editorOpen = Boolean(editing || editingRecord);

  return (
    <div className="min-w-0 space-y-2.5">
      <Summary items={data.items} onAdd={onAdd} t={t} />
      {!editorOpen && (
        <Segmented
          label={t("samjhana.title")}
          value={view}
          onChange={setView}
          scrollable={false}
          options={[
            { id: "reminders" as const, label: t("samjhana.tab-reminders") },
            { id: "records" as const, label: t("samjhana.tab-records") },
          ]}
        />
      )}
      {editingRecord ? (
        <RecordEditor
          record={editingRecord}
          onChange={setEditingRecord}
          onSave={saveRecord}
          onCancel={() => setEditingRecord(null)}
          t={t}
        />
      ) : view === "records" ? (
        <>
          {error && (
            <p className="rounded-md bg-[color:color-mix(in_srgb,var(--color-holiday)_12%,transparent)] px-2 py-1.5 text-[10px] text-holiday">
              {error}
            </p>
          )}
          <section className="surface-card px-3">
            {data.records.length === 0 ? (
              <div className="px-1 py-8 text-center">
                <Icon name="samjhana" className="mx-auto size-6 text-text-muted" />
                <p className="mt-2 text-[12px] font-medium">{t("samjhana.records-empty-title")}</p>
                <p className="mt-1 text-[10px] text-text-muted">
                  {t("samjhana.records-empty-body")}
                </p>
                <button
                  type="button"
                  onClick={() => setEditingRecord(blankRecord())}
                  className="mt-3 text-[11px] text-accent-mark hover:underline"
                >
                  {t("samjhana.add-first-record")}
                </button>
              </div>
            ) : (
              data.records.map((record) => (
                <RecordRow
                  key={record.id}
                  record={record}
                  onEdit={() =>
                    setEditingRecord({
                      id: record.id,
                      documentType: record.documentType,
                      number: record.number,
                      issuedDate: record.issuedDate,
                      expiryDate: record.expiryDate,
                      office: record.office,
                      note: record.note,
                      createdAt: record.createdAt,
                    })
                  }
                  onDelete={() => removeRecord(record)}
                  t={t}
                />
              ))
            )}
          </section>
          <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">
            {t("samjhana.footer-note")}
          </p>
        </>
      ) : editing ? (
        <ItemEditor
          item={editing}
          people={data.people}
          onChange={setEditing}
          onSave={save}
          onCancel={() => setEditing(null)}
          onAddPerson={addPerson}
          t={t}
        />
      ) : (
        <>
          <div className="control-field flex min-w-0 items-center gap-1.5 rounded-md px-2">
            <Icon name="search" className="size-3 text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("samjhana.search-placeholder")}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[11px] outline-none placeholder:text-text-muted"
            />
          </div>
          <Segmented
            label={t("samjhana.category.all")}
            value={category}
            onChange={setCategory}
            options={[
              { id: "all" as const, label: t("samjhana.category.all") },
              { id: "identity" as const, label: t("samjhana.category.identity") },
              { id: "vehicle" as const, label: t("samjhana.category.vehicle") },
              { id: "home" as const, label: t("samjhana.category.home") },
              { id: "money" as const, label: t("samjhana.category.money") },
              { id: "health" as const, label: t("samjhana.category.health") },
              { id: "application" as const, label: t("samjhana.category.application") },
            ]}
          />
          {error && (
            <p className="rounded-md bg-[color:color-mix(in_srgb,var(--color-holiday)_12%,transparent)] px-2 py-1.5 text-[10px] text-holiday">
              {error}
            </p>
          )}
          <section className="surface-card px-3">
            {filtered.length === 0 ? (
              <div className="px-1 py-8 text-center">
                <Icon name="samjhana" className="mx-auto size-6 text-text-muted" />
                <p className="mt-2 text-[12px] font-medium">
                  {data.items.length === 0
                    ? t("samjhana.empty-title")
                    : t("samjhana.empty-search-title")}
                </p>
                <p className="mt-1 text-[10px] text-text-muted">
                  {data.items.length === 0
                    ? t("samjhana.empty-body")
                    : t("samjhana.empty-search-body")}
                </p>
                <button
                  type="button"
                  onClick={add}
                  className="mt-3 text-[11px] text-accent-mark hover:underline"
                >
                  {t("samjhana.add-first")}
                </button>
              </div>
            ) : (
              filtered.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  person={people.get(item.personId ?? "")}
                  onEdit={() => setEditing(item)}
                  onDelete={() => remove(item)}
                  onComplete={() => complete(item)}
                  t={t}
                />
              ))
            )}
          </section>
          <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">
            {t("samjhana.footer-note")}
          </p>
        </>
      )}
    </div>
  );
}
