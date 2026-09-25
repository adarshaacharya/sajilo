import { useState } from "react";
import { useSearchParams } from "react-router";
import { Segmented } from "../../shared/components/segmented";
import { useSettings } from "../../shared/context/settings-context";
import { AboutTab } from "./_components/about-tab";
import { DisplayTab } from "./_components/display-tab";
import { ModulesTab } from "./_components/modules-tab";
import { SystemTab } from "./_components/system-tab";

type Tab = "display" | "modules" | "system" | "about";
const TABS: readonly Tab[] = ["display", "modules", "system", "about"];

/** `?tab=system` opens straight onto a tab, like Bazar's `?tab=`. */
function isTab(value: string | null): value is Tab {
  return TABS.includes(value as Tab);
}

export function Settings() {
  const { t, language, setLanguage, numerals, setNumerals } = useSettings();
  const [params] = useSearchParams();
  const asked = params.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(asked) ? asked : "display");

  return (
    <div className="space-y-2.5">
      <Segmented
        label={t("settings.general")}
        value={tab}
        onChange={setTab}
        scrollable={false}
        options={[
          { id: "display" as const, label: t("settings.tab-display"), icon: "display" as const },
          { id: "modules" as const, label: t("settings.tab-modules"), icon: "modules" as const },
          { id: "system" as const, label: t("settings.tab-system"), icon: "system" as const },
          { id: "about" as const, label: t("settings.tab-about"), icon: "info" as const },
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
      {tab === "about" && <AboutTab />}
    </div>
  );
}
