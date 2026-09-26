import { useEffect, useState } from "react";
import { useHeaderInner } from "../../shared/components/header-slot";
import { useSettings } from "../../shared/context/settings-context";
import { track } from "../../shared/lib/usage";
import { Converter } from "../calendar/converter";
import { ClockTab } from "./_components/clock-tab";
import { EmergencyTab } from "./_components/emergency-tab";
import { InterestTab } from "./_components/interest-tab";
import { LandTab } from "./_components/land-tab";
import { type ToolId, ToolsHome } from "./_components/tools-home";
import { VatTab } from "./_components/vat-tab";
import { WeightTab } from "./_components/weight-tab";
import type { DirectorySection } from "./_lib/directory";

type Tab = ToolId;

export function Tools() {
  const { t } = useSettings();
  const [tab, setTab] = useState<Tab | null>(null);
  const [directorySection, setDirectorySection] = useState<DirectorySection>("phones");
  useEffect(() => {
    if (tab) track(`tab.tools.${tab}`);
  }, [tab]);

  const titles: Record<Tab, string> = {
    emergency: t("tools.directory"),
    clock: t("tools.clock"),
    date: t("tools.date"),
    land: t("tools.land"),
    weight: t("tools.weight"),
    vat: t("tools.vat"),
    interest: t("tools.interest"),
  };
  useHeaderInner(tab ? { title: titles[tab], onBack: () => setTab(null) } : null);

  return (
    <div className="min-w-0 space-y-2.5">
      {tab === null ? (
        <ToolsHome
          onOpen={(tool, section) => {
            setDirectorySection(section ?? "phones");
            setTab(tool);
          }}
        />
      ) : (
        <>
          {tab === "date" && <Converter />}
          {tab === "land" && <LandTab />}
          {tab === "weight" && <WeightTab />}
          {tab === "vat" && <VatTab />}
          {tab === "interest" && <InterestTab />}
          {tab === "clock" && <ClockTab />}
          {tab === "emergency" && <EmergencyTab initialSection={directorySection} />}
        </>
      )}
    </div>
  );
}
