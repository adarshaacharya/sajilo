import type {
  KeeperDocumentType,
  KeeperPerson,
  KeeperRecord,
  KeeperRecordInput,
  KeeperRecurrence,
} from "../../../shared/lib/ipc";
import { type I18nKey, id, type TFn } from "./shared";

/**
 * How a document behaves over time — the thing that decides what the screen
 * shows, not its paper:
 *
 * - `record`  never expires (citizenship, NID, PAN). No date field at all.
 * - `expires` has one end date; renewing picks a new one (passport, licence,
 *   warranty, a travel policy).
 * - `repeats` falls due on a fixed cycle; marking it done moves the date one
 *   period (bluebook tax every Ashad, a yearly policy, a life premium).
 */
export type DocumentKind = "record" | "expires" | "repeats";

/** `number` is the record's own column; every other key lands in `details`. */
export const NUMBER = "number";

export type RecordField = {
  key: string;
  label: I18nKey;
  /** Spans both columns. Short values (CC, premium) sit side by side. */
  wide?: boolean;
  options?: readonly { id: string; label: I18nKey }[];
};

export type DocumentSpec = {
  kind: DocumentKind;
  fields: readonly RecordField[];
  /** The field a record can't be saved without — mirrored by the backend. */
  required: string;
  issued: I18nKey;
  /** Label for the date that needs action; absent for `record`. */
  due?: I18nKey;
  office: I18nKey | null;
  /** For `repeats`: the cycles the user may choose between. */
  cycles?: readonly KeeperRecurrence[];
  defaultRecurrence: KeeperRecurrence;
  defaultRemindDays: readonly number[];
  /** What the done button says for `repeats`, or the renew prompt for
   * `expires`. Warranties just end, so they have neither. */
  action?: I18nKey;
};

export const DOCUMENT_TYPES: readonly KeeperDocumentType[] = [
  "citizenship",
  "nid",
  "pan",
  "passport",
  "drivingLicence",
  "bluebook",
  "insurance",
  "warranty",
  "custom",
];

const ID_FIELDS: readonly RecordField[] = [
  { key: NUMBER, label: "keeper.record-number", wide: true },
];

const RECORD_ONLY: DocumentSpec = {
  kind: "record",
  fields: ID_FIELDS,
  required: NUMBER,
  issued: "keeper.issued-date",
  office: "keeper.office-placeholder",
  defaultRecurrence: "none",
  defaultRemindDays: [],
};

export type InsuranceType =
  | "thirdParty"
  | "comprehensive"
  | "health"
  | "healthGovt"
  | "life"
  | "property"
  | "travel"
  | "other";

export const INSURANCE_TYPES: readonly { id: InsuranceType; label: I18nKey }[] = [
  { id: "thirdParty", label: "keeper.insurance.type.thirdParty" },
  { id: "comprehensive", label: "keeper.insurance.type.comprehensive" },
  { id: "health", label: "keeper.insurance.type.health" },
  { id: "healthGovt", label: "keeper.insurance.type.healthGovt" },
  { id: "life", label: "keeper.insurance.type.life" },
  { id: "property", label: "keeper.insurance.type.property" },
  { id: "travel", label: "keeper.insurance.type.travel" },
  { id: "other", label: "keeper.insurance.type.other" },
];

const INSURANCE_TYPE_FIELD: RecordField = {
  key: "insuranceType",
  label: "keeper.insurance.type",
  wide: true,
  options: INSURANCE_TYPES,
};

/** Insurance is several documents in one: a vehicle or health policy renews
 * every year, a life policy asks for a premium on its own cycle, and a travel
 * policy simply ends. */
function insuranceSpec(type: string): DocumentSpec {
  const vehicle = type === "thirdParty" || type === "comprehensive";
  const fields: RecordField[] = [
    INSURANCE_TYPE_FIELD,
    { key: "insurer", label: "keeper.insurance.insurer", wide: true },
    {
      key: NUMBER,
      label: type === "healthGovt" ? "keeper.insurance.member-id" : "keeper.insurance.number",
      wide: true,
    },
    {
      key: "insured",
      label: vehicle
        ? "keeper.insurance.vehicle"
        : type === "health" || type === "healthGovt"
          ? "keeper.insurance.members"
          : "keeper.insurance.insured",
      wide: true,
    },
    {
      key: "sumInsured",
      label: type === "life" ? "keeper.insurance.sum-assured" : "keeper.insurance.sum-insured",
    },
    { key: "premium", label: "keeper.insurance.premium" },
  ];
  const base = {
    fields,
    required: NUMBER,
    issued: "keeper.insurance.start" as const,
    office: null,
  };
  if (type === "life") {
    return {
      ...base,
      kind: "repeats",
      due: "keeper.insurance.premium-due",
      cycles: ["monthly", "quarterly", "halfYearly", "yearlyAd"],
      defaultRecurrence: "yearlyAd",
      defaultRemindDays: [14, 3, 0],
      action: "keeper.action.premium-paid",
    };
  }
  if (type === "travel" || type === "other") {
    return {
      ...base,
      kind: "expires",
      due: "keeper.insurance.expiry",
      defaultRecurrence: "none",
      defaultRemindDays: [14, 3, 0],
      action: "keeper.action.renewed",
    };
  }
  return {
    ...base,
    kind: "repeats",
    due: "keeper.insurance.expiry",
    cycles: ["yearlyAd"],
    defaultRecurrence: "yearlyAd",
    defaultRemindDays: [30, 7, 0],
    action: "keeper.action.policy-renewed",
  };
}

export function documentSpec(
  record: Pick<KeeperRecordInput, "documentType" | "details">,
): DocumentSpec {
  switch (record.documentType) {
    case "passport":
      return {
        kind: "expires",
        fields: ID_FIELDS,
        required: NUMBER,
        issued: "keeper.issued-date",
        due: "keeper.expiry-date",
        office: "keeper.office-placeholder",
        defaultRecurrence: "none",
        // Renewal opens a year out, and visas want six months left.
        defaultRemindDays: [365, 180, 30, 0],
        action: "keeper.action.renewed",
      };
    case "drivingLicence":
      return {
        kind: "expires",
        fields: [
          ...ID_FIELDS,
          { key: "categories", label: "keeper.licence.categories", wide: true },
        ],
        required: NUMBER,
        issued: "keeper.issued-date",
        due: "keeper.expiry-date",
        office: "keeper.office-placeholder",
        defaultRecurrence: "none",
        defaultRemindDays: [30, 7, 0],
        action: "keeper.action.renewed",
      };
    case "bluebook":
      return {
        kind: "repeats",
        fields: [
          { key: NUMBER, label: "keeper.bluebook.number", wide: true },
          {
            key: "vehicleClass",
            label: "keeper.bluebook.class",
            wide: true,
            options: [
              { id: "twoWheeler", label: "keeper.bluebook.class.twoWheeler" },
              { id: "fourWheeler", label: "keeper.bluebook.class.fourWheeler" },
              { id: "heavy", label: "keeper.bluebook.class.heavy" },
              { id: "other", label: "keeper.bluebook.class.other" },
            ],
          },
          { key: "makeModel", label: "keeper.bluebook.make-model" },
          { key: "engineCc", label: "keeper.bluebook.engine-cc" },
          { key: "engineNumber", label: "keeper.bluebook.engine-number" },
          { key: "chassisNumber", label: "keeper.bluebook.chassis-number" },
        ],
        required: NUMBER,
        issued: "keeper.bluebook.registered",
        due: "keeper.bluebook.tax-due",
        office: "keeper.bluebook.office",
        cycles: ["yearlyBs"],
        defaultRecurrence: "yearlyBs",
        defaultRemindDays: [30, 7, 0],
        action: "keeper.action.tax-paid",
      };
    case "insurance":
      return insuranceSpec(record.details.insuranceType ?? "");
    case "warranty":
      return {
        kind: "expires",
        fields: [
          { key: "product", label: "keeper.warranty.product", wide: true },
          { key: NUMBER, label: "keeper.warranty.number", wide: true },
          { key: "seller", label: "keeper.warranty.seller" },
          { key: "invoiceNumber", label: "keeper.warranty.invoice" },
          { key: "serviceCenter", label: "keeper.warranty.service-center", wide: true },
        ],
        required: "product",
        issued: "keeper.warranty.purchased",
        due: "keeper.warranty.ends",
        office: null,
        defaultRecurrence: "none",
        defaultRemindDays: [30, 0],
      };
    case "custom":
      return customSpec(record.details.customKind ?? "record");
    default:
      return RECORD_ONLY;
  }
}

export type CustomKind = DocumentKind;

/** A document Keeper has no form for: the user names it and says how it
 * behaves, and adds whatever fields their paper carries. */
function customSpec(kind: string): DocumentSpec {
  const fields: RecordField[] = [
    { key: "name", label: "keeper.custom.name", wide: true },
    { key: NUMBER, label: "keeper.custom.number", wide: true },
  ];
  const base = {
    fields,
    required: "name",
    issued: "keeper.issued-date" as const,
    office: null,
  };
  if (kind === "repeats") {
    return {
      ...base,
      kind: "repeats",
      due: "keeper.custom.due",
      cycles: ["monthly", "quarterly", "halfYearly", "yearlyAd", "yearlyBs"],
      defaultRecurrence: "yearlyAd",
      defaultRemindDays: [7, 0],
      action: "keeper.action.done",
    };
  }
  if (kind === "expires") {
    return {
      ...base,
      kind: "expires",
      due: "keeper.expiry-date",
      defaultRecurrence: "none",
      defaultRemindDays: [30, 7, 0],
      action: "keeper.action.renewed",
    };
  }
  return { ...base, kind: "record", defaultRecurrence: "none", defaultRemindDays: [] };
}

/** Vehicle policies point at a vehicle; their bluebook is where lapsed cover
 * actually bites. */
export function isVehicleInsurance(record: Pick<KeeperRecordInput, "documentType" | "details">) {
  return (
    record.documentType === "insurance" &&
    (record.details.insuranceType === "thirdParty" ||
      record.details.insuranceType === "comprehensive")
  );
}

export function docTypeLabel(t: TFn, type: KeeperDocumentType) {
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
    case "bluebook":
      return t("keeper.doc.bluebook");
    case "insurance":
      return t("keeper.doc.insurance");
    case "warranty":
      return t("keeper.doc.warranty");
    case "custom":
      return t("keeper.doc.custom");
    default:
      return type;
  }
}

export const RECURRENCE_LABELS: Record<KeeperRecurrence, I18nKey> = {
  none: "keeper.recurrence.none",
  monthly: "keeper.recurrence.monthly",
  quarterly: "keeper.recurrence.quarterly",
  halfYearly: "keeper.recurrence.halfYearly",
  yearlyAd: "keeper.recurrence.yearlyAd",
  yearlyBs: "keeper.recurrence.yearlyBs",
};

/** A record's name in lists: its type, sharpened by the detail that tells two
 * of the same apart (which insurance, which product). */
export function recordName(t: TFn, record: KeeperRecord | KeeperRecordInput) {
  if (record.documentType === "insurance") {
    const type = INSURANCE_TYPES.find((entry) => entry.id === record.details.insuranceType);
    return type ? `${t("keeper.doc.insurance")} · ${t(type.label)}` : t("keeper.doc.insurance");
  }
  if (record.documentType === "warranty" && record.details.product) {
    return record.details.product;
  }
  if (record.documentType === "custom" && record.details.name) {
    return record.details.name;
  }
  return docTypeLabel(t, record.documentType);
}

/** The short identifying line under a record's name. */
export function recordSummary(record: KeeperRecord) {
  const parts =
    record.documentType === "bluebook"
      ? [record.number, record.details.makeModel]
      : record.documentType === "insurance"
        ? [record.details.insurer, record.number]
        : record.documentType === "warranty"
          ? [record.details.seller, record.number]
          : [record.number];
  return parts.filter(Boolean).join(" · ");
}

export function fieldValue(record: KeeperRecordInput | KeeperRecord, key: string) {
  return key === NUMBER ? record.number : (record.details[key] ?? "");
}

export function personName(t: TFn, people: readonly KeeperPerson[], personId: string | null) {
  return people.find((person) => person.id === personId)?.name ?? t("keeper.person.me");
}

export function blankRecord(
  documentType: KeeperDocumentType,
  personId: string | null,
): KeeperRecordInput {
  const details: Record<string, string> =
    documentType === "insurance"
      ? { insuranceType: "thirdParty" }
      : documentType === "custom"
        ? { customKind: "record" }
        : {};
  const spec = documentSpec({ documentType, details });
  return {
    id: id(),
    documentType,
    personId,
    number: "",
    issuedDate: null,
    expiryDate: null,
    recurrence: spec.defaultRecurrence,
    remindDays: [...spec.defaultRemindDays],
    office: "",
    note: "",
    details,
    links: [],
    customFields: [],
    createdAt: "",
  };
}

export function recordInput(record: KeeperRecord): KeeperRecordInput {
  return {
    id: record.id,
    documentType: record.documentType,
    personId: record.personId,
    number: record.number,
    issuedDate: record.issuedDate,
    expiryDate: record.expiryDate,
    recurrence: record.recurrence,
    remindDays: record.remindDays,
    office: record.office,
    note: record.note,
    details: record.details,
    links: record.links,
    customFields: record.customFields,
    createdAt: record.createdAt,
  };
}
