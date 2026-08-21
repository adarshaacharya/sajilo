import { useEffect, useMemo, useState } from "react";
import { CONTROL } from "../../shared/components/control";
import { Icon } from "../../shared/components/icon";
import { MonthGrid } from "../../shared/components/month-grid";
import { Segmented } from "../../shared/components/segmented";
import { Select } from "../../shared/components/select";
import { Toggle } from "../../shared/components/toggle";
import { useSettings } from "../../shared/context/settings-context";
import { openExternalLink } from "../../shared/lib/external-link";
import {
  api,
  type CalendarMonth,
  type KeeperChecklistItem,
  type KeeperDate,
  type KeeperDateInput,
  type KeeperDocumentType,
  type KeeperItem,
  type KeeperPerson,
  type KeeperRecord,
  type KeeperRecordInput,
  type KeeperSnapshot,
} from "../../shared/lib/ipc";

type Category = "all" | "identity" | "vehicle" | "home" | "money" | "health" | "application";
type View = "reminders" | "records";
type TFn = ReturnType<typeof useSettings>["t"];

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

function blankItem(date: KeeperDateInput = EMPTY_DATE): KeeperItem {
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

function dueTone(item: KeeperItem) {
  if (item.status === "completed") return "text-positive";
  const days = daysUntil(item.dueDate.ad);
  return days < 0 ? "text-holiday" : days <= 30 ? "text-accent-mark" : "text-text-secondary";
}

function categoryLabel(t: TFn, category: string) {
  switch (category) {
    case "identity":
      return t("keeper.category.identity");
    case "vehicle":
      return t("keeper.category.vehicle");
    case "home":
      return t("keeper.category.home");
    case "money":
      return t("keeper.category.money");
    case "health":
      return t("keeper.category.health");
    case "application":
      return t("keeper.category.application");
    default:
      return t("keeper.category.other");
  }
}

function applyTemplate(item: KeeperItem, template: (typeof TEMPLATES)[number]) {
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

function Summary({ items, onAdd, t }: { items: KeeperItem[]; onAdd: () => void; t: TFn }) {
  const active = items.filter((item) => item.status === "active");
  const urgent = active.filter((item) => daysUntil(item.dueDate.ad) <= 30).length;
  return (
    <div className="flex items-center justify-between gap-3 px-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[color:color-mix(in_srgb,var(--color-accent-mark)_16%,transparent)] text-accent-mark">
          <Icon name="keeper" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold">{t("keeper.title")}</h2>
          {active.length > 0 && (
            <p className="mt-0.5 truncate text-[10px] text-text-muted">
              {active.length} {t("keeper.active").toLowerCase()}
              {urgent > 0 && (
                <span className="text-accent-mark">
                  {" · "}
                  {urgent} {t("keeper.due-soon").toLowerCase()}
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
        <Icon name="plus" className="size-3" /> {t("keeper.add")}
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
  item: KeeperItem;
  person?: KeeperPerson;
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
          aria-label={item.status === "completed" ? t("keeper.reopen") : t("keeper.mark-complete")}
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
                ? t("keeper.done")
                : days < 0
                  ? `${Math.abs(days)}d ${t("keeper.days-overdue")}`
                  : days === 0
                    ? t("keeper.today")
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
          aria-label={`${t("keeper.delete")} ${item.title}`}
          className="icon-btn shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Icon name="trash" className="size-3 text-text-muted hover:text-holiday" />
        </button>
      </div>
      {item.checklist.length > 0 && (
        <p className="ml-6 mt-1 text-[10px] text-text-muted">
          {item.checklist.filter((entry) => entry.checked).length}/{item.checklist.length}{" "}
          {t("keeper.checklist-ready")}
        </p>
      )}
    </article>
  );
}

/** A real calendar grid, not raw number fields — reuses the same
 * BS-native `MonthGrid` the dashboard browses with, so picking a date
 * feels like the rest of the app rather than a spreadsheet-style form. */
function InlineDatePicker({
  label,
  showLabel = true,
  value,
  calendar,
  onCalendarChange,
  onSelect,
  t,
}: {
  label: string;
  /** False when the caller already shows this label elsewhere (e.g. a
   * Toggle row) — avoids repeating "Issued" twice in a row. */
  showLabel?: boolean;
  value: KeeperDate | null;
  calendar: "ad" | "bs";
  onCalendarChange: (calendar: "ad" | "bs") => void;
  onSelect: (date: KeeperDate) => void;
  t: TFn;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);
  const [grid, setGrid] = useState<CalendarMonth | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const seed = cursor ?? (value ? { year: value.bs.year, month: value.bs.month } : null);
    const load = (year: number, month: number) =>
      api
        .monthGrid(year, month)
        .then((next) => {
          if (!cancelled) setGrid(next);
        })
        .catch(() => {});
    if (seed) {
      if (!cursor) setCursor(seed);
      load(seed.year, seed.month);
    } else {
      api
        .today()
        .then((today) => {
          if (cancelled) return;
          setCursor({ year: today.nepali.year, month: today.nepali.month });
          load(today.nepali.year, today.nepali.month);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [open, cursor, value]);

  const step = (offset: number) => {
    if (!cursor) return;
    api
      .shiftMonth(cursor.year, cursor.month, offset)
      .then(setCursor)
      .catch(() => {});
  };

  const dateOptions: { id: "ad" | "bs"; label: string }[] = [
    { id: "ad", label: "AD" },
    { id: "bs", label: "BS" },
  ];

  return (
    <div className="space-y-1.5">
      <div className={`flex items-center gap-2 ${showLabel ? "justify-between" : "justify-end"}`}>
        {showLabel && (
          <p className="min-w-0 truncate text-[10px] font-medium text-text-secondary">{label}</p>
        )}
        <Segmented
          options={dateOptions}
          value={calendar}
          onChange={onCalendarChange}
          label={label}
          scrollable={false}
        />
      </div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`${CONTROL} flex w-full items-center gap-1.5 text-left`}
      >
        <Icon name="upcoming" className="size-3 shrink-0 text-text-muted" />
        <span className="min-w-0 flex-1 truncate">
          {value
            ? calendar === "ad"
              ? formatDate(value.ad)
              : `BS ${value.bs.year}-${value.bs.month}-${value.bs.day}`
            : t("keeper.not-set")}
        </span>
      </button>
      {value?.ad && (
        <p className="text-[10px] text-text-muted">
          {calendar === "ad"
            ? `BS ${value.bs.year}-${value.bs.month}-${value.bs.day}`
            : `AD ${value.ad}`}
        </p>
      )}
      {open && (
        <div className="surface-card space-y-1.5 p-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label={t("calendar.previous-month")}
              onClick={() => step(-1)}
              className="icon-btn size-6"
            >
              <span className="text-[13px] leading-none">‹</span>
            </button>
            <span className="min-w-0 flex-1 truncate text-center text-[11px] font-semibold text-text-secondary">
              {grid?.title ?? ""}
            </span>
            <button
              type="button"
              aria-label={t("calendar.next-month")}
              onClick={() => step(1)}
              className="icon-btn size-6"
            >
              <span className="text-[13px] leading-none">›</span>
            </button>
          </div>
          {grid && (
            <MonthGrid
              month={grid}
              onSelect={(day) => {
                if (!day.date) return;
                api
                  .resolveKeeperDate({ calendar: "bs", ...day.date })
                  .then((date) => {
                    onSelect(date);
                    setOpen(false);
                  })
                  .catch(() => {});
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DateEditor({
  item,
  onChange,
  t,
}: {
  item: KeeperItem;
  onChange: (item: KeeperItem) => void;
  t: TFn;
}) {
  return (
    <InlineDatePicker
      label={t("keeper.due-date")}
      value={item.dueDate}
      calendar={item.dueDate.calendar}
      onCalendarChange={(calendar) => onChange({ ...item, dueDate: { ...item.dueDate, calendar } })}
      onSelect={(dueDate) => onChange({ ...item, dueDate })}
      t={t}
    />
  );
}

const RECORD_TYPES: readonly KeeperDocumentType[] = [
  "citizenship",
  "passport",
  "drivingLicence",
  "nid",
  "pan",
];

function docTypeLabel(t: TFn, type: KeeperDocumentType) {
  switch (type) {
    case "citizenship":
      return t("keeper.doc.citizenship");
    case "passport":
      return t("keeper.doc.passport");
    case "drivingLicence":
      return t("keeper.doc.drivingLicence");
    case "nid":
      return t("keeper.doc.nid");
    case "pan":
      return t("keeper.doc.pan");
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
  value: KeeperDate | null;
  onChange: (value: KeeperDate | null) => void;
  t: TFn;
}) {
  const [expanded, setExpanded] = useState(value !== null);
  const [calendar, setCalendar] = useState<"ad" | "bs">(value?.calendar ?? "ad");
  return (
    <div className="space-y-1.5">
      <Toggle
        label={label}
        note={expanded ? undefined : t("keeper.not-set")}
        checked={expanded}
        onChange={(checked) => {
          setExpanded(checked);
          if (!checked) onChange(null);
        }}
      />
      {expanded && (
        <InlineDatePicker
          label={label}
          showLabel={false}
          value={value}
          calendar={calendar}
          onCalendarChange={setCalendar}
          onSelect={onChange}
          t={t}
        />
      )}
    </div>
  );
}

function blankRecord(): KeeperRecordInput {
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
  record: KeeperRecord;
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
              {t("keeper.expiry-date")} {formatDate(record.expiryDate.ad)}
            </>
          )}
        </p>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${t("keeper.delete")} ${docTypeLabel(t, record.documentType)}`}
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
  record: KeeperRecordInput;
  onChange: (record: KeeperRecordInput) => void;
  onSave: () => void;
  onCancel: () => void;
  t: TFn;
}) {
  return (
    <section className="surface-card space-y-2.5 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold">
          {record.number ? t("keeper.edit-record") : t("keeper.new-record")}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="icon-btn"
          aria-label={t("keeper.close")}
        >
          <span className="text-[16px] leading-none text-text-muted">×</span>
        </button>
      </div>
      <Select
        value={record.documentType}
        onChange={(next) => onChange({ ...record, documentType: next })}
        options={RECORD_TYPES.map((type) => ({ id: type, label: docTypeLabel(t, type) }))}
      />
      <input
        value={record.number}
        onChange={(event) => onChange({ ...record, number: event.target.value })}
        placeholder={t("keeper.record-number")}
        className={`${CONTROL} w-full`}
      />
      <OptionalDateField
        label={t("keeper.issued-date")}
        value={record.issuedDate}
        onChange={(issuedDate) => onChange({ ...record, issuedDate })}
        t={t}
      />
      <OptionalDateField
        label={t("keeper.expiry-date")}
        value={record.expiryDate}
        onChange={(expiryDate) => onChange({ ...record, expiryDate })}
        t={t}
      />
      {record.expiryDate && (
        <p className="text-[10px] text-accent-mark">{t("keeper.linked-reminder-note")}</p>
      )}
      <input
        value={record.office}
        onChange={(event) => onChange({ ...record, office: event.target.value })}
        placeholder={t("keeper.office-placeholder")}
        className={`${CONTROL} w-full`}
      />
      <textarea
        value={record.note}
        onChange={(event) => onChange({ ...record, note: event.target.value })}
        placeholder={t("keeper.note-placeholder")}
        rows={2}
        className={`${CONTROL} h-auto w-full py-1.5`}
      />
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onCancel} className="btn-ghost text-[11px]">
          {t("keeper.cancel")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!record.number.trim()}
          className="settings-btn text-[11px] disabled:opacity-40"
        >
          {t("keeper.save-record")}
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
  item: KeeperItem;
  people: KeeperPerson[];
  onChange: (item: KeeperItem) => void;
  onSave: () => void;
  onCancel: () => void;
  onAddPerson: (name: string, relationship: string) => Promise<KeeperPerson | undefined>;
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
  const toggleChecklist = (entry: KeeperChecklistItem) =>
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
          {item.title ? t("keeper.edit-title") : t("keeper.new-title")}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="icon-btn"
          aria-label={t("keeper.close")}
        >
          <span className="text-[16px] leading-none text-text-muted">×</span>
        </button>
      </div>

      <Select
        value={template}
        onChange={(next) => {
          setTemplate(next);
          const found = TEMPLATES.find((entry) => entry.id === next);
          if (found) onChange(applyTemplate(item, found));
        }}
        options={[
          { id: "", label: t("keeper.template-placeholder") },
          ...TEMPLATES.map((entry) => ({ id: entry.id, label: entry.title })),
        ]}
      />
      <input
        value={item.title}
        onChange={(event) => onChange({ ...item, title: event.target.value })}
        placeholder={t("keeper.what-should-remember")}
        className={`${CONTROL} w-full`}
      />
      <Select
        value={item.category}
        onChange={(next) => onChange({ ...item, category: next })}
        options={[
          { id: "identity", label: t("keeper.category.identity") },
          { id: "vehicle", label: t("keeper.category.vehicle") },
          { id: "home", label: t("keeper.category.home") },
          { id: "money", label: t("keeper.category.money") },
          { id: "health", label: t("keeper.category.health") },
          { id: "application", label: t("keeper.category.application") },
        ]}
      />
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
        {showMore ? t("keeper.hide-details") : t("keeper.more-details")}
      </button>

      {showMore && (
        <div className="space-y-2.5 rounded-md border border-divider p-2.5">
          <div>
            <Select
              value={item.personId ?? ""}
              onChange={(next) => onChange({ ...item, personId: next || null })}
              options={[
                { id: "", label: t("keeper.for-me") },
                ...people.map((person) => ({
                  id: person.id,
                  label: person.relationship
                    ? `${person.name} · ${person.relationship}`
                    : person.name,
                })),
              ]}
            />
            {showPerson ? (
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={personDraft}
                  onChange={(event) => setPersonDraft(event.target.value)}
                  placeholder={t("keeper.family-name")}
                  className={`${CONTROL} min-w-0 flex-1`}
                />
                <input
                  value={relationshipDraft}
                  onChange={(event) => setRelationshipDraft(event.target.value)}
                  placeholder={t("keeper.relationship-placeholder")}
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
                  {t("keeper.add")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPerson(true)}
                className="mt-1.5 text-left text-[10px] text-accent-mark hover:underline"
              >
                {t("keeper.add-family-profile")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Select
              value={item.recurrence}
              onChange={(next) =>
                onChange({ ...item, recurrence: next as KeeperItem["recurrence"] })
              }
              options={[
                { id: "none", label: t("keeper.recurrence.none") },
                { id: "monthly", label: t("keeper.recurrence.monthly") },
                { id: "yearlyAd", label: t("keeper.recurrence.yearlyAd") },
                { id: "yearlyBs", label: t("keeper.recurrence.yearlyBs") },
              ]}
            />
            <Select
              value={item.applicationStatus}
              onChange={(next) => onChange({ ...item, applicationStatus: next })}
              options={[
                { id: "notStarted", label: t("keeper.status.notStarted") },
                { id: "submitted", label: t("keeper.status.submitted") },
                { id: "inReview", label: t("keeper.status.inReview") },
                { id: "ready", label: t("keeper.status.ready") },
                { id: "completed", label: t("keeper.status.completed") },
              ]}
            />
          </div>
          <div>
            <p className="mb-1 block text-[10px] font-medium text-text-secondary">
              {t("keeper.remind-before")}
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
              placeholder={t("keeper.fee-placeholder")}
              className={`${CONTROL} w-full`}
            />
            <input
              value={item.officeLocation}
              onChange={(event) => onChange({ ...item, officeLocation: event.target.value })}
              placeholder={t("keeper.location-placeholder")}
              className={`${CONTROL} w-full`}
            />
          </div>
          <div className="flex gap-1.5">
            <input
              value={item.officialUrl}
              onChange={(event) => onChange({ ...item, officialUrl: event.target.value })}
              placeholder={t("keeper.link-placeholder")}
              className={`${CONTROL} min-w-0 flex-1`}
            />
            {item.officialUrl && (
              <button
                type="button"
                onClick={() => openExternalLink(item.officialUrl)}
                className="btn-ghost shrink-0 text-[10px]"
                aria-label={t("keeper.open-link")}
              >
                <Icon name="openExternal" className="size-3" />
              </button>
            )}
          </div>
          <textarea
            value={item.note}
            onChange={(event) => onChange({ ...item, note: event.target.value })}
            placeholder={t("keeper.notes-placeholder")}
            rows={2}
            className={`${CONTROL} h-auto w-full py-1.5`}
          />
          {item.checklist.length > 0 && (
            <div className="rounded-md border border-divider p-2">
              <p className="mb-1.5 text-[10px] font-medium text-text-secondary">
                {t("keeper.required-documents")}
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
          {t("keeper.cancel")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!item.title.trim() || !item.dueDate.ad}
          className="settings-btn text-[11px] disabled:opacity-40"
        >
          {t("keeper.save")}
        </button>
      </div>
    </section>
  );
}

export function Keeper() {
  const { t } = useSettings();
  const [data, setData] = useState<KeeperSnapshot>({ people: [], items: [], records: [] });
  const [view, setView] = useState<View>("reminders");
  const [editing, setEditing] = useState<KeeperItem | null>(null);
  const [editingRecord, setEditingRecord] = useState<KeeperRecordInput | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .keeperSnapshot()
      .then(setData)
      .catch(() => setError(t("keeper.error-load")));
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
    const date = await api.resolveKeeperDate({
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
    const person: KeeperPerson = { id: id(), name: name.trim(), relationship, createdAt: "" };
    const next = await api.saveKeeperPerson(person);
    setData(next);
    return next.people.find((entry) => entry.id === person.id);
  };
  const save = async () => {
    if (!editing) return;
    try {
      setData(await api.saveKeeperItem(editing));
      setEditing(null);
      setError("");
    } catch {
      setError(t("keeper.error-save"));
    }
  };
  const complete = async (item: KeeperItem) => {
    try {
      setData(
        await api.saveKeeperItem({
          ...item,
          status: item.status === "completed" ? "active" : "completed",
        }),
      );
    } catch {
      setError(t("keeper.error-save"));
    }
  };
  const remove = async (item: KeeperItem) => {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const confirmed = await ask(t("keeper.delete-confirm-body"), {
      title: `${t("keeper.delete-confirm-title")} "${item.title}"`,
      kind: "warning",
    });
    if (confirmed) setData(await api.deleteKeeperItem(item.id));
  };

  const saveRecord = async () => {
    if (!editingRecord) return;
    try {
      setData(await api.saveKeeperRecord(editingRecord));
      setEditingRecord(null);
      setError("");
    } catch {
      setError(t("keeper.error-save-record"));
    }
  };
  const removeRecord = async (record: KeeperRecord) => {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    const confirmed = await ask(t("keeper.delete-record-confirm-body"), {
      title: t("keeper.delete-record-confirm-title"),
      kind: "warning",
    });
    if (confirmed) setData(await api.deleteKeeperRecord(record.id));
  };

  const onAdd = view === "reminders" ? add : () => setEditingRecord(blankRecord());
  const editorOpen = Boolean(editing || editingRecord);

  return (
    <div className="min-w-0 space-y-2.5">
      <Summary items={data.items} onAdd={onAdd} t={t} />
      {!editorOpen && (
        <Segmented
          label={t("keeper.title")}
          value={view}
          onChange={setView}
          scrollable={false}
          options={[
            { id: "reminders" as const, label: t("keeper.tab-reminders") },
            { id: "records" as const, label: t("keeper.tab-records") },
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
                <Icon name="keeper" className="mx-auto size-6 text-text-muted" />
                <p className="mt-2 text-[12px] font-medium">{t("keeper.records-empty-title")}</p>
                <p className="mt-1 text-[10px] text-text-muted">{t("keeper.records-empty-body")}</p>
                <button
                  type="button"
                  onClick={() => setEditingRecord(blankRecord())}
                  className="mt-3 text-[11px] text-accent-mark hover:underline"
                >
                  {t("keeper.add-first-record")}
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
            {t("keeper.footer-note")}
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
              placeholder={t("keeper.search-placeholder")}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[11px] outline-none placeholder:text-text-muted"
            />
          </div>
          <Segmented
            label={t("keeper.category.all")}
            value={category}
            onChange={setCategory}
            options={[
              { id: "all" as const, label: t("keeper.category.all") },
              { id: "identity" as const, label: t("keeper.category.identity") },
              { id: "vehicle" as const, label: t("keeper.category.vehicle") },
              { id: "home" as const, label: t("keeper.category.home") },
              { id: "money" as const, label: t("keeper.category.money") },
              { id: "health" as const, label: t("keeper.category.health") },
              { id: "application" as const, label: t("keeper.category.application") },
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
                <Icon name="keeper" className="mx-auto size-6 text-text-muted" />
                <p className="mt-2 text-[12px] font-medium">
                  {data.items.length === 0
                    ? t("keeper.empty-title")
                    : t("keeper.empty-search-title")}
                </p>
                <p className="mt-1 text-[10px] text-text-muted">
                  {data.items.length === 0 ? t("keeper.empty-body") : t("keeper.empty-search-body")}
                </p>
                <button
                  type="button"
                  onClick={add}
                  className="mt-3 text-[11px] text-accent-mark hover:underline"
                >
                  {t("keeper.add-first")}
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
            {t("keeper.footer-note")}
          </p>
        </>
      )}
    </div>
  );
}
