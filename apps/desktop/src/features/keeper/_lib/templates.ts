import type { KeeperDate, KeeperDocumentType, KeeperItem } from "../../../shared/lib/ipc";
import { type Category, id } from "./shared";

/*
 * Template and guide content (titles, fees, offices, checklists, notes) is
 * English-only for now — it mirrors official form and office names, which
 * Nepali speakers commonly use in English day to day. Everything around it
 * (labels, buttons, categories) is localized.
 *
 * Checked against official and published sources in Bhadra 2083: DoTM /
 * EDLVRS for licences and bluebook tax, the Department of Passports, and
 * NEA's billing rules. Fees are pointers, not quotes — they change
 * every fiscal year, so each one says where to verify.
 */

export type ReminderTemplate = {
  id: string;
  title: string;
  category: Category;
  /** Short, practical lines shown on the reminder — what to have ready,
   * where to pay, what lateness costs. Advice, not a form. */
  tips: string[];
  url: string;
  recurrence?: KeeperItem["recurrence"];
  remindDays: number[];
};

/** Things to do or pay. Documents you hold (passport, bluebook, insurance…)
 * are records, not reminders — their renewal steps live in `RENEWAL_GUIDES`. */
export const REMINDER_TEMPLATES: readonly ReminderTemplate[] = [
  {
    id: "electricity",
    title: "Electricity bill",
    category: "home",
    tips: [
      "Have your SC number and customer ID ready",
      "Pay on eSewa, Khalti, connectIPS, or at the NEA counter",
      "2% off if paid within 7 days of the meter reading",
      "Penalty from day 16: 5%, then 10% after day 30, 25% after day 40",
    ],
    url: "https://nea.org.np/",
    recurrence: "monthly",
    remindDays: [3, 0],
  },
  {
    id: "internet",
    title: "Internet bill",
    category: "home",
    tips: [
      "Have your customer ID or username ready",
      "Pay in the provider's app, eSewa, Khalti, or at the counter",
    ],
    url: "",
    recurrence: "monthly",
    remindDays: [3, 0],
  },
  {
    id: "rent",
    title: "Rent payment",
    category: "home",
    tips: [
      "Keep a receipt for every payment",
      "The landlord owes 10% house rent tax; the agreement should say who pays it",
    ],
    url: "",
    recurrence: "monthly",
    remindDays: [3, 0],
  },
  {
    id: "loan",
    title: "Loan instalment",
    category: "money",
    tips: [
      "Have your loan account number ready",
      "Late instalments draw penal interest after a short grace period",
      "Overdue past 90 days, the loan is classed non-performing",
    ],
    url: "",
    recurrence: "monthly",
    remindDays: [3, 0],
  },
  {
    id: "school",
    title: "School fee",
    category: "home",
    tips: ["Have the student ID ready", "Keep the payment receipt"],
    url: "",
    remindDays: [7, 0],
  },
  {
    id: "medicine",
    title: "Medicine refill",
    category: "health",
    tips: ["Take the prescription", "Note the medicine name and dose"],
    url: "",
    remindDays: [3, 0],
  },
];

export type RenewalGuide = {
  url: string;
  fee: string;
  location: string;
  checklist: string[];
  note?: string;
};

/** What renewing a document involves, shown on the document itself. Record-only
 * documents (citizenship, NID, PAN) never renew, so they have no guide. */
export const RENEWAL_GUIDES: Partial<Record<KeeperDocumentType, RenewalGuide>> = {
  passport: {
    url: "https://nepalpassport.gov.np/en",
    fee: "From Rs 5,000 (34 pages); verify current revenue",
    location: "Department of Passports, Tripureshwor, or your DAO",
    checklist: [
      "Online pre-enrolment and appointment",
      "Citizenship certificate",
      "National ID number (NIN)",
      "Current passport",
      "Revenue payment receipt",
      "Marriage or migration certificate (if details changed)",
    ],
    note: "Adults get 10 years, under-18s 5. Renewal opens once less than a year is left, and many visas need six months of validity.",
  },
  drivingLicence: {
    url: "https://edlvrs.dotm.gov.np/",
    fee: "Provincial fee shown on EDLVRS",
    location: "Apply on EDLVRS, then the Transport Management Office for biometrics",
    checklist: [
      "Original driving licence",
      "Citizenship certificate or National ID",
      "Medical certificate (within 3 months)",
      "EDLVRS application and payment receipt",
    ],
    note: "Valid 10 years (5 from age 60). Renewing late adds a fine, and a licence expired more than 5 years is cancelled.",
  },
  bluebook: {
    url: "https://dotm.gov.np/",
    fee: "Provincial tax by CC/kW + renewal fee",
    location: "Transport Management Office, Nagarik App, or provincial portal",
    checklist: [
      "Original bluebook",
      "Valid third-party or comprehensive insurance",
      "Owner’s citizenship or NID copy",
      "Previous tax receipt",
    ],
    note: "Due by Ashad end each fiscal year. Late fine on the tax: 5% within 30 days, 10% for the next 45, 20% after that, then 32% per year.",
  },
  insurance: {
    url: "",
    fee: "Premium amount",
    location: "Insurance company branch or app",
    checklist: [
      "Policy number",
      "Previous policy or renewal notice",
      "Bluebook copy (vehicle policy)",
      "Premium payment receipt",
    ],
    note: "A lapsed vehicle policy blocks bluebook renewal. Life policies usually allow a grace period of about 30 days (15 for monthly premiums).",
  },
  warranty: {
    url: "",
    fee: "",
    location: "Brand service centre or seller",
    checklist: [
      "Purchase bill / invoice",
      "Stamped warranty card",
      "Serial or IMEI number",
      "Box and accessories",
    ],
    note: "Check for faults before it ends — repairs after that are paid.",
  },
};

export function blankItem(dueDate: KeeperDate | null): KeeperItem {
  return {
    id: id(),
    personId: null,
    title: "",
    category: "home",
    status: "active",
    dueDate,
    recurrence: "none",
    remindDays: [1, 0],
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

/** A template's tips are kept on the reminder (in `checklist`, unchecked),
 * so they stay with it if the title is edited. */
export function applyTemplate(item: KeeperItem, template: ReminderTemplate): KeeperItem {
  return {
    ...item,
    title: template.title,
    category: template.category,
    recurrence: template.recurrence ?? item.recurrence,
    remindDays: [...template.remindDays],
    officialUrl: template.url,
    checklist: template.tips.map((label) => ({ id: id(), label, checked: false })),
  };
}
