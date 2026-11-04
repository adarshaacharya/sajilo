import { useEffect, useSyncExternalStore } from "react";
import type { AlertItem } from "../../types/api/AlertItem";
import type { PriceAlert } from "../../types/api/PriceAlert";
import type { PriceAlertInput } from "../../types/api/PriceAlertInput";
import { api } from "./ipc";

/**
 * Price alerts, shared by every screen that shows them: the stock page, the
 * watchlist, metals and Settings all read one list, so setting an alert in
 * one place shows at once in the others.
 */
let alerts: PriceAlert[] = [];
const listeners = new Set<() => void>();

function publish(next: PriceAlert[] | null) {
  alerts = next ?? [];
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let lastRead = 0;
let reading: Promise<void> | null = null;

/** Every row mounting asks; one read every few seconds answers them all. */
export function refreshPriceAlerts(): Promise<void> {
  if (reading) return reading;
  if (Date.now() - lastRead < 5000) return Promise.resolve();
  reading = api
    .priceAlerts()
    .then(publish)
    .catch(() => {})
    .finally(() => {
      lastRead = Date.now();
      reading = null;
    });
  return reading;
}

export function usePriceAlerts(): PriceAlert[] {
  const list = useSyncExternalStore(subscribe, () => alerts);
  // Read again on every mount: an alert may have gone off since.
  useEffect(() => {
    void refreshPriceAlerts();
  }, []);
  return list;
}

export function savePriceAlert(input: PriceAlertInput) {
  return api.setPriceAlert(input).then(publish);
}

export function deletePriceAlert(id: string) {
  return api.deletePriceAlert(id).then(publish);
}

export function sameItem(a: AlertItem, b: AlertItem): boolean {
  if (a.kind === "stock" && b.kind === "stock") {
    return a.symbol.toUpperCase() === b.symbol.toUpperCase();
  }
  return a.kind === "metal" && b.kind === "metal" && a.metal === b.metal;
}

export function alertsFor(list: PriceAlert[], item: AlertItem): PriceAlert[] {
  return list.filter((alert) => sameItem(alert.item, item));
}

/** A target 5% further on, rounded to two significant figures: after 520,
 * 490; after Rs 2,70,000, Rs 2,60,000. */
export function nextTarget(price: number, direction: PriceAlert["direction"]): number {
  const raw = price * (direction === "below" ? 0.95 : 1.05);
  const step = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 1);
  return direction === "below" ? Math.floor(raw / step) * step : Math.ceil(raw / step) * step;
}

/** A price a person would type: whole rupees from a thousand up. */
export function roundTarget(price: number): number {
  return price >= 1000 ? Math.round(price) : Math.round(price * 10) / 10;
}
