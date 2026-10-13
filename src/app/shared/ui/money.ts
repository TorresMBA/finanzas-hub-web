import { Pipe, PipeTransform } from '@angular/core';

/** An amount as the API sends it: a JSON number, or a string for values a number cannot hold exactly. */
export type Amount = number | string;

const SYMBOLS: Readonly<Record<string, string>> = { PEN: 'S/', USD: 'US$', EUR: '€' };
const NUMBER = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface MoneyFormat {
  /** Show "+" on positive amounts, for lists where the sign is the information. */
  readonly signed?: boolean;
}

/** "S/ 1,234.50", "−US$ 20.00". The minus is the typographic one, as in the mock. */
export function formatMoney(amount: Amount, currency: string, format: MoneyFormat = {}): string {
  const value = Number(amount);
  const sign = value < 0 ? '−' : format.signed && value > 0 ? '+' : '';
  return `${sign}${SYMBOLS[currency] ?? currency} ${NUMBER.format(Math.abs(value))}`;
}

/**
 * Adds amounts of one currency exactly, in cents. Only for totals of what is on screen: every balance and
 * every total that matters comes already added from the API.
 */
export function sumAmounts(amounts: readonly Amount[]): number {
  return amounts.reduce<number>((cents, amount) => cents + Math.round(Number(amount) * 100), 0) / 100;
}

/**
 * Reads what a person typed as an amount: digits with up to two decimals, with "." or "," as the decimal
 * mark. Null when it is anything else, so a typo is never sent as a different amount.
 */
export function parseAmount(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  return /^-?\d{1,12}(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : null;
}

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(amount: Amount, currency: string, format?: MoneyFormat): string {
    return formatMoney(amount, currency, format);
  }
}
