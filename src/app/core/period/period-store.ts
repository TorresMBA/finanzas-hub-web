import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';

/** Source of "today". Replaced in tests. */
export const TODAY = new InjectionToken<() => Date>('TODAY', { factory: () => () => new Date() });

export interface Month {
  readonly year: number;
  /** 1 to 12. */
  readonly month: number;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * The month selected in the top bar. It is a global filter: Inicio, Transacciones, Presupuestos and
 * Calendario all show this month.
 */
@Injectable({ providedIn: 'root' })
export class PeriodStore {
  private readonly today = inject(TODAY);
  private readonly selected = signal<Month>(this.currentMonth());

  readonly month = this.selected.asReadonly();

  /** "Octubre 2026" */
  readonly label = computed(() => `${MONTH_NAMES[this.selected().month - 1]} ${this.selected().year}`);

  /** "2026-10", the format the API expects for a month. */
  readonly isoMonth = computed(() => `${this.selected().year}-${String(this.selected().month).padStart(2, '0')}`);

  readonly isCurrent = computed(() => {
    const current = this.currentMonth();
    return current.year === this.selected().year && current.month === this.selected().month;
  });

  previous(): void {
    this.selected.update(({ year, month }) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }));
  }

  next(): void {
    this.selected.update(({ year, month }) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }));
  }

  goToCurrent(): void {
    this.selected.set(this.currentMonth());
  }

  private currentMonth(): Month {
    const now = this.today();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
}
