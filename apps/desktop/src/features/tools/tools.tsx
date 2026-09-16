import { useState } from "react";
import { useHeaderInner } from "../../shared/components/header-slot";
import { Icon, type IconName } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { Converter } from "../calendar/converter";
import { ClockTab } from "./_components/clock-tab";
import { EmergencyTab } from "./_components/emergency-tab";
import { InterestTab } from "./_components/interest-tab";
import { LandTab } from "./_components/land-tab";
import { VatTab } from "./_components/vat-tab";
import { WeightTab } from "./_components/weight-tab";

type Tab = "date" | "land" | "weight" | "vat" | "interest" | "clock" | "emergency";

type Tool = { id: Tab; label: string; hint: string; icon: IconName };

export function Tools() {
  const { t } = useSettings();
  const [tab, setTab] = useState<Tab | null>(null);

  const tools: readonly Tool[] = [
    {
      id: "emergency" as const,
      label: t("tools.directory"),
      hint: t("tools.directory-hint-short"),
      icon: "directory" as const,
    },
    {
      id: "clock" as const,
      label: t("tools.clock"),
      hint: t("tools.clock-hint-short"),
      icon: "clock" as const,
    },
    {
      id: "date" as const,
      label: t("tools.date"),
      hint: t("tools.date-hint-short"),
      icon: "upcoming" as const,
    },
    {
      id: "land" as const,
      label: t("tools.land"),
      hint: t("tools.land-hint-short"),
      icon: "land" as const,
    },
    {
      id: "weight" as const,
      label: t("tools.weight"),
      hint: t("tools.weight-hint-short"),
      icon: "weight" as const,
    },
    {
      id: "vat" as const,
      label: t("tools.vat"),
      hint: t("tools.vat-hint-short"),
      icon: "percent" as const,
    },
    {
      id: "interest" as const,
      label: t("tools.interest"),
      hint: t("tools.interest-hint-short"),
      icon: "interest" as const,
    },
  ];
  const essentialTools = tools.slice(0, 3);
  const calculatorTools = tools.slice(3);
  const selectedTool = tools.find((tool) => tool.id === tab);
  useHeaderInner(selectedTool ? { title: selectedTool.label, onBack: () => setTab(null) } : null);

  return (
    <div className="min-w-0 space-y-2.5">
      {tab === null ? (
        <div className="space-y-4 pt-0.5">
          <ToolGroup title={t("tools.essential")} tools={essentialTools} onSelect={setTab} />
          <ToolGroup title={t("tools.calculators")} tools={calculatorTools} onSelect={setTab} />
        </div>
      ) : (
        <>
          {tab === "date" && <Converter />}
          {tab === "land" && <LandTab />}
          {tab === "weight" && <WeightTab />}
          {tab === "vat" && <VatTab />}
          {tab === "interest" && <InterestTab />}
          {tab === "clock" && <ClockTab />}
          {tab === "emergency" && <EmergencyTab />}
        </>
      )}
    </div>
  );
}

function ToolGroup({
  title,
  tools,
  onSelect,
}: {
  title: string;
  tools: readonly Tool[];
  onSelect: (tool: Tab) => void;
}) {
  return (
    <section aria-label={title} className="space-y-1.5">
      <h2 className="px-0.5 text-[12px] font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => onSelect(tool.id)}
            className="surface-card group flex min-w-0 cursor-pointer items-center gap-2.5 p-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mark"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[7px] bg-[color:color-mix(in_srgb,var(--color-accent-mark)_14%,transparent)] text-accent-mark transition-colors group-hover:bg-[color:color-mix(in_srgb,var(--color-accent-mark)_22%,transparent)]">
              <Icon name={tool.icon} className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium">{tool.label}</span>
              <span className="mt-px block truncate text-[10px] text-text-muted">{tool.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
