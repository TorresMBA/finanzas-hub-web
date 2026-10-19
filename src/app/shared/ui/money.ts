import { Pipe, PipeTransform } from '@angular/core';

/** An amount as the API sends it: a JSON number, or a string for values a number cannot hold exactly. */
export type Amount = number | string;

/** How a currency is written, as the API's catalog of currencies describes it. */
export interface CurrencyLook {
  readonly code: string;
  readonly symbol: string;
  readonly name: string;
  readonly pluralName: string;
  readonly minorUnits: number;
}

// What formatting knows of each currency. It starts with the currencies the API has always had, so an amount reads
// right before the catalog arrives; the frame of the application replaces it with the API's catalog, which is the
// only list of currencies (see `useCurrencies`).
let looks = new Map<string, CurrencyLook>(
  [
    { code: 'PEN', symbol: 'S/', name: 'Sol peruano', pluralName: 'soles', minorUnits: 2 },
    { code: 'USD', symbol: 'US$', name: 'Dólar estadounidense', pluralName: 'dólares', minorUnits: 2 },
    { code: 'EUR', symbol: '€', name: 'Euro', pluralName: 'euros', minorUnits: 2 },
  ].map((look) => [look.code, look]),
);

const numbers = new Map<number, Intl.NumberFormat>();

/** Replaces what formatting knows of the currencies with the API's catalog. An empty list changes nothing. */
export function useCurrencies(catalog: readonly CurrencyLook[]): void {
  if (catalog.length > 0) {
    looks = new Map(catalog.map((look) => [look.code, look]));
  }
}

/** The currency as the catalog describes it; undefined for a code it does not have. */
export function currencyLook(code: string): CurrencyLook | undefined {
  return looks.get(code);
}

/** "S/" for PEN; the code itself for a currency the catalog does not have. */
export function currencySymbol(code: string): string {
  return looks.get(code)?.symbol ?? code;
}

/** How many decimals an amount in the currency carries: two unless the catalog says otherwise. */
export function currencyDecimals(code: string): number {
  return looks.get(code)?.minorUnits ?? 2;
}

function numberWith(decimals: number): Intl.NumberFormat {
  let format = numbers.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat('es-PE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    numbers.set(decimals, format);
  }

  return format;
}

export interface MoneyFormat {
  /** Show "+" on positive amounts, for lists where the sign is the information. */
  readonly signed?: boolean;
}

/** "S/ 1,234.50", "−US$ 20.00". The minus is the typographic one, as in the mock. */
export function formatMoney(amount: Amount, currency: string, format: MoneyFormat = {}): string {
  const value = Number(amount);
  const sign = value < 0 ? '−' : format.signed && value > 0 ? '+' : '';
  return `${sign}${currencySymbol(currency)} ${numberWith(currencyDecimals(currency)).format(Math.abs(value))}`;
}

/** "1 US$ = S/ 3.745": what one unit of a currency is worth in another. Three decimals, as banks quote it. */
export function formatRate(rate: Amount, currency: string, quote: string): string {
  return `1 ${currencySymbol(currency)} = ${currencySymbol(quote)} ${Number(rate).toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}`;
}

/**
 * Adds amounts of one currency exactly, in cents. Only for totals of what is on screen: every balance and
 * every total that matters comes already added from the API.
 */
export function sumAmounts(amounts: readonly Amount[]): number {
  return amounts.reduce<number>((cents, amount) => cents + Math.round(Number(amount) * 100), 0) / 100;
}

/**
 * Reads what a person typed as an amount: digits with up to `decimals` decimals (two unless said), with "." or ","
 * as the decimal mark. Null when it is anything else, so a typo is never sent as a different amount.
 */
export function parseAmount(text: string, decimals = 2): number | null {
  const normalized = text.trim().replace(',', '.');
  const fraction = decimals > 0 ? `(\\.\\d{1,${decimals}})?` : '';
  return new RegExp(`^-?\\d{1,12}${fraction}$`).test(normalized) ? Number(normalized) : null;
}

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(amount: Amount, currency: string, format?: MoneyFormat): string {
    return formatMoney(amount, currency, format);
  }
}
