import { formatDay, formatShortDate, monthRange, todayIso } from './dates';
import { currencyLook, formatMoney, formatRate, parseAmount, sumAmounts, useCurrencies } from './money';
import { isValidTag, parseTags } from './tags';

describe('money', () => {
  it('writes an amount with the symbol of its currency and two decimals', () => {
    expect(formatMoney(1234.5, 'PEN')).toBe('S/ 1,234.50');
    expect(formatMoney('820', 'USD')).toBe('US$ 820.00');
    expect(formatMoney(-54, 'PEN')).toBe('−S/ 54.00');
    expect(formatMoney(10, 'CLP')).toBe('CLP 10.00');
  });

  it('shows the plus sign only where it is asked for, and never on zero', () => {
    expect(formatMoney(54, 'PEN', { signed: true })).toBe('+S/ 54.00');
    expect(formatMoney(-54, 'PEN', { signed: true })).toBe('−S/ 54.00');
    expect(formatMoney(0, 'PEN', { signed: true })).toBe('S/ 0.00');
  });

  it('adds amounts exactly, where floating point would not', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts([1000, '-54.90', -120, '4500'])).toBe(5325.1);
    expect(sumAmounts([])).toBe(0);
  });

  it.each([
    ['54', 54],
    [' 1250.50 ', 1250.5],
    ['180,5', 180.5],
    ['-20', -20],
  ])('reads %s as an amount', (text, amount) => {
    expect(parseAmount(text)).toBe(amount);
  });

  it.each(['', 'abc', '1.005', '1,234.50', '12.', '5 soles', '1e3'])('refuses %j instead of guessing an amount', (text) => {
    expect(parseAmount(text)).toBeNull();
  });

  it('follows the catalog of the API: a currency it adds is written with its symbol and its decimals', () => {
    const before = ['PEN', 'USD', 'EUR'].map((code) => currencyLook(code)!);
    useCurrencies([...before, { code: 'JPY', symbol: '¥', name: 'Yen', pluralName: 'yenes', minorUnits: 0 }]);
    try {
      expect(formatMoney(1500, 'JPY')).toBe('¥ 1,500');
      expect(parseAmount('1500', 0)).toBe(1500);
      expect(parseAmount('1500.5', 0)).toBeNull();
    } finally {
      useCurrencies(before);
    }
  });

  it('writes a rate as banks quote it', () => {
    expect(formatRate(3.745, 'USD', 'PEN')).toBe('1 US$ = S/ 3.745');
  });
});

describe('dates', () => {
  it('gives the first and the last day of a month', () => {
    expect(monthRange(2026, 10)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthRange(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange(2026, 12)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('reads a business date as that day in any time zone', () => {
    expect(formatDay('2026-10-01')).toBe('Jueves, 1 de octubre');
    expect(formatShortDate('2026-10-01')).toBe('1 oct');
  });

  it('writes today as the person sees it on their calendar', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('tags', () => {
  it('splits what was typed by commas and drops the empty parts', () => {
    expect(parseTags(' fijo, hogar ,, #Recibo Honorarios ')).toEqual(['fijo', 'hogar', '#Recibo Honorarios']);
    expect(parseTags('  ')).toEqual([]);
  });

  it('knows the rule of the API for a tag name', () => {
    expect(['fijo', '#Recibo Honorarios', 'suscripción', 'año_2026'].every(isValidTag)).toBe(true);
    expect(['a.b', '#', 'x'.repeat(41)].some(isValidTag)).toBe(false);
  });
});
