import type { Fuel } from "../types/api/Fuel";
import type { FuelPrice } from "../types/api/FuelPrice";
import type { MarketUnit } from "../types/api/MarketUnit";
import type { Metal } from "../types/api/Metal";
import type { MetalRate } from "../types/api/MetalRate";
import type { MetalRateSnapshot } from "../types/api/MetalRateSnapshot";
import type { MetalUnit } from "../types/api/MetalUnit";
import type { NepaliDate } from "../types/api/NepaliDate";

export const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
export const money0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const METAL_NAMES: Record<Metal, { en: string; ne: string }> = {
  fineGold: { en: "Fine gold", ne: "छापावाल सुन" },
  tejabiGold: { en: "Tejabi gold", ne: "तेजाबी सुन" },
  silver: { en: "Silver", ne: "असली चाँदी" },
};

const METAL_UNITS: Record<MetalUnit, string> = {
  tola: "per tola",
  tenGram: "per 10 g",
};

const FUEL_NAMES: Record<Fuel, { en: string; ne: string }> = {
  petrol: { en: "Petrol", ne: "पेट्रोल" },
  diesel: { en: "Diesel", ne: "डिजेल" },
  kerosene: { en: "Kerosene", ne: "मट्टितेल" },
  lpg: { en: "LPG cylinder", ne: "ग्यास सिलिन्डर" },
};

const FUEL_UNITS: Record<Fuel, string> = {
  petrol: "per litre",
  diesel: "per litre",
  kerosene: "per litre",
  lpg: "per cylinder",
};

const MARKET_UNITS: Record<MarketUnit, string> = {
  kilogram: "per kg",
  dozen: "per dozen",
  piece: "each",
};

const UNIT_GRAMS: Record<MetalUnit, number> = {
  tola: 11.663_803_8,
  tenGram: 10,
};

export type WeightUnit = "tola" | "tenGram" | "gram" | "ounce";

const WEIGHT_GRAMS: Record<WeightUnit, number> = {
  tola: 11.663_803_8,
  tenGram: 10,
  gram: 1,
  ounce: (11.663_803_8 * 8) / 3,
};

const WEIGHT_LABELS: Record<WeightUnit, string> = {
  tola: "Tola",
  tenGram: "10 g",
  gram: "Gram",
  ounce: "Ounce",
};

export function metalName(metal: Metal): string {
  return METAL_NAMES[metal].en;
}

export function metalNepaliName(metal: Metal): string {
  return METAL_NAMES[metal].ne;
}

export function metalUnitLabel(unit: MetalUnit): string {
  return METAL_UNITS[unit];
}

export function fuelName(fuel: Fuel): string {
  return FUEL_NAMES[fuel].en;
}

export function fuelNepaliName(fuel: Fuel): string {
  return FUEL_NAMES[fuel].ne;
}

export function fuelUnitLabel(fuel: Fuel): string {
  return FUEL_UNITS[fuel];
}

export function marketUnitLabel(unit: MarketUnit): string {
  return MARKET_UNITS[unit];
}

export function weightLabel(unit: WeightUnit): string {
  return WEIGHT_LABELS[unit];
}

export function unitGrams(unit: MetalUnit): number {
  return UNIT_GRAMS[unit];
}

export function priceChange(price: number, previous: number): number {
  return price - previous;
}

export function changePercent(change: number, previous: number): number {
  return previous > 0 ? (change / previous) * 100 : 0;
}

export function changeText(change: number): string {
  const flat = Math.abs(change) < 0.005;
  if (flat) return "No change";
  const sign = change > 0 ? "+" : "";
  return `${sign}${money.format(change)}`;
}

export function changePercentText(change: number, previous: number): string {
  const percent = changePercent(change, previous);
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

export function isFlatChange(change: number): boolean {
  return Math.abs(change) < 0.005;
}

export function headlineMetal(snapshot: MetalRateSnapshot): MetalRate | undefined {
  return (
    snapshot.rates.find((rate) => rate.metal === "fineGold" && rate.unit === "tola") ??
    snapshot.rates[0]
  );
}

export function pricePerGram(rate: MetalRate): number {
  return rate.price / unitGrams(rate.unit);
}

export function metalWorth(
  snapshot: MetalRateSnapshot,
  metal: Metal,
  amount: number,
  unit: WeightUnit,
): number | null {
  const rate =
    snapshot.rates.find((row) => row.metal === metal && row.unit === "tola") ??
    snapshot.rates.find((row) => row.metal === metal);
  if (!rate || !Number.isFinite(amount)) return null;
  const grams = amount * WEIGHT_GRAMS[unit];
  return Math.round(grams * pricePerGram(rate));
}

export function availableMetals(snapshot: MetalRateSnapshot): Metal[] {
  const order: Metal[] = ["fineGold", "tejabiGold", "silver"];
  return order.filter((metal) => snapshot.rates.some((rate) => rate.metal === metal));
}

export function formatNepaliDate(date: NepaliDate): string {
  return `${date.day} / ${date.month} / ${date.year}`;
}

export function sourceStamp(
  freshness: { fetchedAt: string; sourceTimestamp: string | null } | undefined,
): string | undefined {
  if (!freshness) return undefined;
  const stamp = freshness.sourceTimestamp ?? freshness.fetchedAt;
  return new Date(stamp).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fuelChange(price: FuelPrice): number {
  return priceChange(price.price, price.previousPrice);
}
