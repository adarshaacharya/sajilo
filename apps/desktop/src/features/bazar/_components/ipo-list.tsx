import { BackButton } from "../../../shared/components/back-button";
import { useSettings } from "../../../shared/context/settings-context";
import type { IssueGroups, PhasedIssue } from "../_lib/ipo";
import { IpoRow } from "./ipo-row";

export function IpoList({
  groups,
  onBack,
  onOpen,
}: {
  groups: IssueGroups;
  onBack: () => void;
  onOpen: (key: string) => void;
}) {
  const { t } = useSettings();
  const sections: { id: string; label: string; items: PhasedIssue[] }[] = [
    { id: "open", label: t("stocks.ipo-section-open"), items: groups.open },
    { id: "upcoming", label: t("stocks.ipo-section-upcoming"), items: groups.upcoming },
    { id: "closed", label: t("stocks.ipo-section-closed"), items: groups.closed },
  ];

  return (
    <section className="surface-card p-2.5">
      <div className="flex items-center gap-2">
        <BackButton onClick={onBack} />
        <p className="flex-1 text-[13px] font-semibold">{t("stocks.ipos")}</p>
      </div>

      {groups.open.length === 0 && groups.upcoming.length === 0 && (
        <p className="mt-2 text-[11px] text-text-secondary">{t("stocks.no-open-ipos")}</p>
      )}

      {sections.map(
        (section) =>
          section.items.length > 0 && (
            <div key={section.id} className="mt-2.5">
              <p className="text-[10px] font-semibold text-text-muted">
                {section.label}
                <span className="ml-1 font-normal tabular-nums">{section.items.length}</span>
              </p>
              <div>
                {section.items.map((entry) => (
                  <IpoRow key={entry.key} entry={entry} onOpen={() => onOpen(entry.key)} />
                ))}
              </div>
            </div>
          ),
      )}
    </section>
  );
}
