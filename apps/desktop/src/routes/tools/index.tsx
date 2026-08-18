import { useState } from "react";
import { Segmented } from "../../components/Segmented";
import { useSettings } from "../../lib/settings";
import { Converter } from "../converter";
import { InterestTab } from "./InterestTab";
import { LandTab } from "./LandTab";
import { VatTab } from "./VatTab";
import { WeightTab } from "./WeightTab";

type Tab = "date" | "land" | "weight" | "vat" | "interest";

export function Tools() {
  const { t } = useSettings();
  const [tab, setTab] = useState<Tab>("date");

  const tabs = [
    { id: "date" as const, label: t("screen.date-converter"), icon: "upcoming" as const },
    { id: "land" as const, label: t("tools.land"), icon: "land" as const },
    { id: "weight" as const, label: t("tools.weight"), icon: "weight" as const },
    { id: "vat" as const, label: t("tools.vat"), icon: "percent" as const },
    { id: "interest" as const, label: t("tools.interest"), icon: "interest" as const },
  ];

  return (
    <div className="space-y-3">
      <Segmented options={tabs} value={tab} onChange={setTab} label={t("tools.title")} />
      {tab === "date" && <Converter />}
      {tab === "land" && <LandTab />}
      {tab === "weight" && <WeightTab />}
      {tab === "vat" && <VatTab />}
      {tab === "interest" && <InterestTab />}
    </div>
  );
}
