import useSWR from "swr";
import type { useSettings } from "../../shared/context/settings-context";
import { api } from "../../shared/lib/ipc";
import { catchAsFailed } from "../../shared/lib/load-state";
import type { BillDue } from "../../types/api/BillDue";

type TFn = ReturnType<typeof useSettings>["t"];

/** The electricity bill's shared pieces, for Keeper's page and Today's card. */
export const rupees = (value: number) =>
  `Rs ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;

/** The account's bills, shared by the row, the page and Today's card. */
export function useElectricity() {
  return useSWR("electricity", () => catchAsFailed(api.getElectricity(false)));
}

/** What the bill's stage asks of the reader, in one short line. */
export function dueLine(t: TFn, due: BillDue): string {
  const days = due.daysLeft ?? 0;
  const count =
    days === 0 ? t("electricity.today") : t("electricity.days").replace("{n}", String(days));
  switch (due.stage) {
    case "rebate":
      return t("electricity.due-rebate").replace("{when}", count);
    case "normal":
      return t("electricity.due-normal").replace("{when}", count);
    case "penalty":
      return t("electricity.due-penalty");
    default:
      return t("electricity.due-cut");
  }
}

/** red when late, accent while the rebate or normal window runs. */
export function dueToneOf(due: BillDue) {
  return due.stage === "penalty" || due.stage === "disconnection"
    ? "text-holiday"
    : "text-accent-mark";
}
