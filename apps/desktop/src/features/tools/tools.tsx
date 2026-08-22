import { useState } from "react";
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

type Tool = { id: Tab; label: string; icon: IconName };

export function Tools() {
  const { t } = useSettings();
  const [tab, setTab] = useState<Tab | null>(null);

  const tools: readonly Tool[] = [
    { id: "emergency" as const, label: t("tools.directory"), icon: "directory" as const },
    { id: "clock" as const, label: t("tools.clock"), icon: "clock" as const },
    { id: "date" as const, label: t("tools.date"), icon: "upcoming" as const },
    { id: "land" as const, label: t("tools.land"), icon: "land" as const },
    { id: "weight" as const, label: t("tools.weight"), icon: "weight" as const },
    { id: "vat" as const, label: t("tools.vat"), icon: "percent" as const },
    { id: "interest" as const, label: t("tools.interest"), icon: "interest" as const },
  ];
  const essentialTools = tools.slice(0, 3);
  const calculatorTools = tools.slice(3);
  const selectedTool = tools.find((tool) => tool.id === tab);

  return (
    <div className="min-w-0 space-y-2.5">
      {tab === null ? (
        <div className="space-y-4 pt-0.5">
          <ToolGroup title={t("tools.essential")} tools={essentialTools} onSelect={setTab} />
          <ToolGroup title={t("tools.calculators")} tools={calculatorTools} onSelect={setTab} />
        </div>
      ) : (
        <>
          <div className="flex h-7 items-center gap-1.5 px-0.5">
            <button
              type="button"
              onClick={() => setTab(null)}
              className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
            >
              <Icon name="chevronLeft" className="size-3" />
              {t("tools.all")}
            </button>
            <span aria-hidden="true" className="h-3.5 w-px bg-divider" />
            <p className="min-w-0 truncate text-[12px] font-medium">{selectedTool?.label}</p>
          </div>
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
      <h2 className="px-0.5 text-[12px] font-medium text-text-secondary">{title}</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => onSelect(tool.id)}
            className="surface-card flex min-w-0 cursor-pointer items-center gap-2 p-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-mark"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-secondary">
              <Icon name={tool.icon} className="size-3.5" />
            </span>
            <span className="min-w-0 truncate text-[12px] font-medium">{tool.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
