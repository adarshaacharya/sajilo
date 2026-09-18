import type { IconName } from "../../../shared/components/icon";
import type { KeeperDocumentType } from "../../../shared/lib/ipc";

export const DOCUMENT_ICONS: Record<KeeperDocumentType, IconName> = {
  citizenship: "idCitizenship",
  nid: "idCard",
  pan: "document",
  passport: "passport",
  drivingLicence: "steeringWheel",
  bluebook: "car",
  insurance: "shield",
  warranty: "wrench",
  custom: "documentBlank",
};

export const REMINDER_ICONS: Record<string, IconName> = {
  electricity: "bolt",
  water: "drop",
  internet: "wifi",
  telephone: "phone",
  rent: "house",
  loan: "banknote",
  school: "graduation",
  medicine: "pills",
  subscription: "refresh",
  sip: "banknote",
};
