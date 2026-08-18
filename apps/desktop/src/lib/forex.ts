import type { ForexRate } from "../types/api/ForexRate";
import type { ForexSnapshot } from "../types/api/ForexSnapshot";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAmount(value: number): string {
  return money.format(value);
}

export function unitLabel(rate: ForexRate): string {
  return rate.unit === 1 ? rate.currencyCode : `${rate.currencyCode} (per ${rate.unit})`;
}

export function buyPerUnit(rate: ForexRate): number {
  return rate.unit > 0 ? rate.buy / rate.unit : rate.buy;
}

export function sellPerUnit(rate: ForexRate): number {
  return rate.unit > 0 ? rate.sell / rate.unit : rate.sell;
}

export function nprForAmount(rate: ForexRate, amount: number): number {
  return amount * buyPerUnit(rate);
}

export function amountForNpr(rate: ForexRate, rupees: number): number {
  const perUnit = sellPerUnit(rate);
  return perUnit > 0 ? rupees / perUnit : 0;
}

export function conversionText(rate: ForexRate, amount: number, reversed: boolean): string {
  if (reversed) {
    return `Rs ${formatAmount(amount)} = ${formatAmount(amountForNpr(rate, amount))} ${rate.currencyCode}`;
  }
  return `${formatAmount(amount)} ${rate.currencyCode} = Rs ${formatAmount(nprForAmount(rate, amount))}`;
}

export function rateFootnote(rate: ForexRate, reversed: boolean): string {
  return reversed
    ? `At NRB's sell rate, Rs ${formatAmount(rate.sell)} per ${unitLabel(rate)}`
    : `At NRB's buy rate, Rs ${formatAmount(rate.buy)} per ${unitLabel(rate)}`;
}

/** NRB can publish `modified_on` before `published_on` — show whichever is later. */
export function sourceTimestamp(snapshot: ForexSnapshot): Date {
  const stamps = [snapshot.publishedOn, snapshot.modifiedOn, snapshot.date]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime());
  return new Date(Math.max(...stamps));
}
