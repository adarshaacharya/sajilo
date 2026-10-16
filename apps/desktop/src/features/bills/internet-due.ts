import useSWR from "swr";
import { api } from "../../shared/lib/ipc";
import { loadedValue } from "../../shared/lib/load-state";
import type { InternetAccount } from "../../types/api/InternetAccount";
import type { InternetStatus } from "../../types/api/InternetStatus";

export { rupees } from "./electricity-due";

/** When renewal is close enough to show on Today and colour as urgent. */
export const SOON_DAYS = 7;

/** Every WorldLink account, shared by the rows, the pages and Today's card. */
export function useInternet() {
  return useSWR("internet", () => api.getInternet(false));
}

/** Red when expired or within three days, accent within a week, else calm. */
export function internetTone(status: InternetStatus) {
  const days = status.daysLeft ?? 0;
  if (status.disabled || days <= 3) return "text-holiday";
  if (days <= SOON_DAYS) return "text-accent-mark";
  return "text-positive";
}

/** The account that runs out first, among those expired or within a week. */
export function soonest(accounts: readonly InternetAccount[]) {
  return accounts
    .map((account) => ({ account, status: loadedValue(account.state) }))
    .filter(
      (entry): entry is { account: InternetAccount; status: InternetStatus } =>
        !!entry.status &&
        entry.status.daysLeft !== null &&
        (entry.status.disabled || entry.status.daysLeft <= SOON_DAYS),
    )
    .sort((a, b) => (a.status.daysLeft ?? 0) - (b.status.daysLeft ?? 0))[0];
}
