import { useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { Segmented } from "../../../shared/components/segmented";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import {
  alertsFor,
  deletePriceAlert,
  roundTarget,
  savePriceAlert,
  usePriceAlerts,
} from "../../../shared/lib/price-alerts";
import { track } from "../../../shared/lib/usage";
import type { AlertDirection } from "../../../types/api/AlertDirection";
import type { AlertItem } from "../../../types/api/AlertItem";
import type { PriceAlert } from "../../../types/api/PriceAlert";
import { money } from "../_lib/format";

const QUICK = [-10, -5, 5, 10] as const;
/** Within this of its target, an alert's bell glows: nearly there. */
const NEAR = 0.01;

/** The bell beside a stock's or a metal's star: lit while an alert is set. */
export function AlertBell({
  item,
  open,
  onToggle,
}: {
  item: AlertItem;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useSettings();
  const armed = alertsFor(usePriceAlerts(), item).find((alert) => alert.active);
  // Lit, the bell is the sign; pointed at, it says what it waits for.
  const label = armed
    ? t(armed.direction === "below" ? "alerts.set-below" : "alerts.set-above").replace(
        "{price}",
        money.format(armed.price),
      )
    : t("alerts.set");
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      aria-expanded={open}
      aria-label={label}
      title={label}
      className={`shrink-0 p-1 ${armed || open ? "text-[color:var(--color-accent-mark)]" : "text-text-muted hover:text-text"}`}
    >
      <Icon name="bell" className="size-3.5" />
    </button>
  );
}

/** "≤ 520" under a watched price, glowing softly once it is nearly there. */
export function AlertHint({
  item,
  price,
  long = false,
  bare = false,
}: {
  item: AlertItem;
  price: number | undefined;
  /** Spelled out, for a page with room: "Alert when below Rs 520". */
  long?: boolean;
  /** Beside the bell itself: the target alone, no second bell. */
  bare?: boolean;
}) {
  const { t } = useSettings();
  const alert = alertsFor(usePriceAlerts(), item).find((each) => each.active);
  if (!alert) return null;
  const near = price !== undefined && Math.abs(price / alert.price - 1) <= NEAR;
  return (
    <span className={`price-alert-hint${near ? " is-near" : ""}`}>
      {!bare && <Icon name="bell" className="size-2.5" />}
      {long
        ? t(alert.direction === "below" ? "alerts.set-below" : "alerts.set-above").replace(
            "{price}",
            money.format(alert.price),
          )
        : `${alert.direction === "below" ? "≤" : "≥"} ${money.format(alert.price)}`}
    </span>
  );
}

/**
 * Setting an alert, as quick as setting an alarm: which way, the price,
 * and four one-tap targets. Opens in place under the price it is about.
 */
export function AlertPanel({
  item,
  name,
  price,
  onClose,
}: {
  item: AlertItem;
  name: string;
  price: number | undefined;
  onClose: () => void;
}) {
  const { t } = useSettings();
  const existing = alertsFor(usePriceAlerts(), item);
  const [direction, setDirection] = useState<AlertDirection>("below");
  const [text, setText] = useState(() => (price ? String(roundTarget(price * 0.95)) : ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = Number(text.replace(/,/g, ""));
  const valid = Number.isFinite(target) && target > 0;
  const away = valid && price ? (target / price - 1) * 100 : null;
  const already =
    valid && price !== undefined && (direction === "below" ? price <= target : price >= target);

  const type = (value: string) => {
    setText(value);
    const next = Number(value.replace(/,/g, ""));
    // A target under today's price can only be "below", over it "above".
    if (price && Number.isFinite(next) && next > 0) {
      setDirection(next < price ? "below" : "above");
    }
  };
  const quick = (percent: number) => {
    if (!price) return;
    setText(String(roundTarget(price * (1 + percent / 100))));
    setDirection(percent < 0 ? "below" : "above");
  };

  const save = () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    track("action.price-alert");
    void api.requestNotificationPermission().catch(() => {});
    savePriceAlert({ id: null, item, direction, price: target })
      .then(onClose)
      .catch((reason: unknown) => {
        setError(String(reason));
        setSaving(false);
      });
  };

  return (
    <div className="price-alert-panel">
      <p className="text-[11.5px] text-text-secondary">
        {t("alerts.when").replace("{name}", name)}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="w-[118px] shrink-0">
          <Segmented
            label={t("alerts.direction")}
            size="sm"
            value={direction}
            onChange={setDirection}
            options={[
              { id: "below", label: t("alerts.below") },
              { id: "above", label: t("alerts.above") },
            ]}
          />
        </div>
        <label className="price-alert-field">
          <span className="text-text-muted">Rs</span>
          <input
            inputMode="decimal"
            value={text}
            onChange={(event) => type(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && save()}
            aria-label={t("alerts.price")}
            maxLength={12}
          />
        </label>
      </div>
      {price !== undefined && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {QUICK.map((percent) => (
            <button
              key={percent}
              type="button"
              onClick={() => quick(percent)}
              className="price-alert-chip"
            >
              {percent > 0 ? "+" : "−"}
              {Math.abs(percent)}%
            </button>
          ))}
        </div>
      )}
      <p
        className={`mt-1.5 text-[10.5px] ${already ? "text-[color:var(--color-accent-mark)]" : "text-text-muted"}`}
      >
        {already
          ? t(direction === "below" ? "alerts.already-below" : "alerts.already-above")
              .replace("{name}", name)
              .replace("{price}", money.format(target))
          : price !== undefined && away !== null
            ? t(away < 0 ? "alerts.now-falls" : "alerts.now-rises")
                .replace("{price}", money.format(price))
                .replace("{away}", Math.abs(away).toFixed(1))
            : null}
      </p>
      {error && <p className="mt-1 text-[10.5px] text-[color:var(--color-holiday)]">{error}</p>}

      {existing.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-divider pt-1.5">
          {existing.map((alert) => (
            <ExistingAlert key={alert.id} alert={alert} />
          ))}
        </ul>
      )}

      <div className="mt-2 flex justify-end gap-1.5">
        <button type="button" onClick={onClose} className="settings-btn">
          {t("action.cancel")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!valid || saving}
          className="settings-btn settings-btn--accent"
        >
          {t("alerts.save")}
        </button>
      </div>
    </div>
  );
}

/** An alert already set for this item: what it waits for, or when it went off. */
export function ExistingAlert({ alert, label }: { alert: PriceAlert; label?: string }) {
  const { t } = useSettings();
  const which = t(alert.direction === "below" ? "alerts.below" : "alerts.above");
  return (
    <li className="flex items-center gap-2 text-[11.5px]">
      <Icon
        name="bell"
        className={`size-3 shrink-0 ${alert.active ? "text-[color:var(--color-accent-mark)]" : "text-text-muted"}`}
      />
      <span className={`min-w-0 flex-1 truncate ${alert.active ? "" : "text-text-muted"}`}>
        {label ? `${label} · ` : ""}
        {which} Rs {money.format(alert.price)}
        {alert.hit && (
          <span className="text-text-muted">
            {" "}
            · {t("alerts.hit").replace("{price}", money.format(alert.hit.price))}
          </span>
        )}
      </span>
      {!alert.active && (
        <button
          type="button"
          onClick={() =>
            void savePriceAlert({
              id: alert.id,
              item: alert.item,
              direction: alert.direction,
              price: alert.price,
            }).catch(() => {})
          }
          className="text-[11px] text-text-secondary hover:text-text"
        >
          {t("alerts.again")}
        </button>
      )}
      <button
        type="button"
        onClick={() => void deletePriceAlert(alert.id).catch(() => {})}
        aria-label={t("action.remove")}
        className="text-text-muted hover:text-text"
      >
        ✕
      </button>
    </li>
  );
}
