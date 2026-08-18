import { useState } from "react";
import { Segmented } from "../../shared/components/segmented";
import { useSettings } from "../../shared/context/settings-context";
import { DisplayTab } from "./_components/display-tab";
import { ModulesTab } from "./_components/modules-tab";
import { SystemTab } from "./_components/system-tab";

type Tab = "display" | "modules" | "system";

export function Settings() {
  const { t, language, setLanguage, numerals, setNumerals } = useSettings();
  const [tab, setTab] = useState<Tab>("display");

  return (
    <div className="space-y-2.5">
      <Segmented
        label={t("settings.general")}
        value={tab}
        onChange={setTab}
        options={[
          { id: "display" as const, label: t("settings.tab-display"), icon: "display" as const },
          { id: "modules" as const, label: t("settings.tab-modules"), icon: "modules" as const },
          { id: "system" as const, label: t("settings.tab-system"), icon: "system" as const },
        ]}
      />

      {tab === "display" && (
        <DisplayTab
          language={language}
          setLanguage={setLanguage}
          numerals={numerals}
          setNumerals={setNumerals}
        />
      )}
      {tab === "modules" && <ModulesTab />}
      {tab === "system" && <SystemTab />}
    </div>
  );
}
