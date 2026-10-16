import useSWR from "swr";
import { api } from "../../shared/lib/ipc";
import { catchAsFailed } from "../../shared/lib/load-state";
import type { Registrar } from "../../types/api/Registrar";

/** The BOID report, shared by the row, the page and Today's card. */
export function useBoidReport() {
  return useSWR("boid-report", () => catchAsFailed(api.getBoidReport(false)));
}

/** Registrars are proper names, the same in either language. */
export const REGISTRAR_NAMES: Record<Registrar, string> = {
  nmbCapital: "NMB Capital",
  sanimaCapital: "Sanima Capital",
  laxmiSunriseCapital: "Laxmi Sunrise Capital",
  citizensCapital: "Citizens Capital",
  muktinathCapital: "Muktinath Capital",
  prabhuCapital: "Prabhu Capital",
  nimbAceCapital: "NIMB Ace Capital",
  globalImeCapital: "Global IME Capital",
};
