// Business dates travel as "2026-10-12": a day in the person's calendar, not an instant. They are built and
// read here part by part, never through Date's parser, which would shift them by the time zone.

const DAY = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' });

function toDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The same day of the following month, or its last day when that month is shorter. */
export function sameDayNextMonth(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const lastDay = new Date(year, month + 1, 0).getDate();
  return toIsoDate(new Date(year, month, Math.min(day, lastDay)));
}

/** Today in the person's own calendar. */
export function todayIso(now = new Date()): string {
  return toIsoDate(now);
}

/** First and last day of a month, for a date range filter. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: toIsoDate(new Date(year, month - 1, 1)), to: toIsoDate(new Date(year, month, 0)) };
}

/** "Lunes, 12 de octubre" */
export function formatDay(iso: string): string {
  const text = DAY.format(toDate(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "12 oct" */
export function formatShortDate(iso: string): string {
  return SHORT.format(toDate(iso)).replace('.', '');
}
