import { useState } from "react";
import { ICONS } from "../../components/Icon";
import { Segmented } from "../../components/Segmented";
import { useSettings } from "../../lib/settings";
import { InterestTab } from "./InterestTab";
import { LandTab } from "./LandTab";
import { VatTab } from "./VatTab";
import { WeightTab } from "./WeightTab";

type Tab = "land" | "weight" | "vat" | "interest";

export function Tools() {
  const { t } = useSettings();
  const [tab, setTab] = useState<Tab>("land");

  const tabs = [
    { id: "land" as const, label: t("tools.land"), icon: ICONS.land },
    { id: "weight" as const, label: t("tools.weight"), icon: ICONS.weight },
    { id: "vat" as const, label: t("tools.vat"), icon: ICONS.percent },
    { id: "interest" as const, label: t("tools.interest"), icon: ICONS.interest },
  ];

  return (
    <div className="space-y-3">
      <Segmented options={tabs} value={tab} onChange={setTab} label={t("tools.title")} />
      {tab === "land" && <LandTab />}
      {tab === "weight" && <WeightTab />}
      {tab === "vat" && <VatTab />}
      {tab === "interest" && <InterestTab />}
    </div>
  );
}
