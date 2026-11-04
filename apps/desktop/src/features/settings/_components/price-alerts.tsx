import { useSettings } from "../../../shared/context/settings-context";
import { usePriceAlerts } from "../../../shared/lib/price-alerts";
import { ExistingAlert } from "../../bazar/_components/price-alert";
import { metalName, metalNepaliName } from "../../bazar/_lib/format";
import { SettingsSection } from "./settings-section";

/** Every price alert in one place, to review or remove. Absent until one is
 * set: the bell on a stock or a metal is where alerts start. */
export function PriceAlertsSection() {
  const { t, language } = useSettings();
  const alerts = usePriceAlerts();
  if (alerts.length === 0) return null;
  return (
    <SettingsSection title={t("alerts.section")}>
      <ul className="space-y-1.5">
        {alerts.map((alert) => (
          <ExistingAlert
            key={alert.id}
            alert={alert}
            label={
              alert.item.kind === "stock"
                ? alert.item.symbol
                : language === "ne"
                  ? metalNepaliName(alert.item.metal)
                  : metalName(alert.item.metal)
            }
          />
        ))}
      </ul>
    </SettingsSection>
  );
}
