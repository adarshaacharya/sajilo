import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useHeaderInner } from "../../shared/components/header-slot";
import { useSettings } from "../../shared/context/settings-context";
import { track } from "../../shared/lib/usage";
import { ElectricityPage, ElectricityRow } from "./_components/electricity";
import { InternetPage, InternetRow } from "./_components/internet";

/** What can be opened from the list. One entry per bill or status Sajilo
 * checks for the reader. */
type Tracker = "electricity" | "internet";

/**
 * Bills & status: the recurring things Sajilo checks on the reader's behalf
 * with their own account numbers, kept on this computer. Each tracker is a
 * row here and a page of its own; what needs attention also shows on Today.
 */
export function Bills() {
  const { t } = useSettings();
  const { search } = useLocation();
  const [open, setOpen] = useState<Tracker | null>(() => {
    const linked = new URLSearchParams(search).get("open");
    return linked === "electricity" || linked === "internet" ? linked : null;
  });
  useEffect(() => {
    if (open) track(`tab.bills.${open}`);
  }, [open]);

  const titles: Record<Tracker, string> = {
    electricity: t("electricity.title"),
    internet: t("internet.title"),
  };
  useHeaderInner(open ? { title: titles[open], onBack: () => setOpen(null) } : null);

  if (open === "electricity") return <ElectricityPage t={t} />;
  if (open === "internet") return <InternetPage t={t} />;

  return (
    <div className="space-y-2.5">
      <ElectricityRow onOpen={() => setOpen("electricity")} t={t} />
      <InternetRow onOpen={() => setOpen("internet")} t={t} />
      <p className="px-0.5 text-[10px] leading-relaxed text-text-muted">{t("bills.note")}</p>
    </div>
  );
}
