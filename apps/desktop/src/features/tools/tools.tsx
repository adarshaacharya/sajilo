import { useState } from "react";
import { Segmented } from "../../shared/components/segmented";
import { useSettings } from "../../shared/context/settings-context";
import { Converter } from "../calendar/converter";
import { ClockTab } from "./_components/clock-tab";
import { InterestTab } from "./_components/interest-tab";
import { LandTab } from "./_components/land-tab";
import { VatTab } from "./_components/vat-tab";
import { WeightTab } from "./_components/weight-tab";

type Tab = "date" | "land" | "weight" | "vat" | "interest" | "clock";

export function Tools() {
  const { t } = useSettings();
  const [tab, setTab] = useState<Tab>("date");

  const tabs = [
    { id: "date" as const, label: t("tools.date"), icon: "upcoming" as const },
    { id: "land" as const, label: t("tools.land"), icon: "land" as const },
    { id: "weight" as const, label: t("tools.weight"), icon: "weight" as const },
    { id: "vat" as const, label: t("tools.vat"), icon: "percent" as const },
    { id: "interest" as const, label: t("tools.interest"), icon: "interest" as const },
    { id: "clock" as const, label: t("tools.clock"), icon: "clock" as const },
  ];

  return (
    <div className="min-w-0 space-y-2.5">
      <Segmented options={tabs} value={tab} onChange={setTab} label={t("tools.title")} />
      {tab === "date" && <Converter />}
      {tab === "land" && <LandTab />}
      {tab === "weight" && <WeightTab />}
      {tab === "vat" && <VatTab />}
      {tab === "interest" && <InterestTab />}
      {tab === "clock" && <ClockTab />}
    </div>
  );
}
