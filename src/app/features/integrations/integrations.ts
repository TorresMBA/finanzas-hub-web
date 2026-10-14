import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  Account,
  CategorizationRule,
  Category,
  ImportAccountMapping,
  ImportCategoryMapping,
  ImportDetail,
  ImportRecord,
  ImportSummary,
  NewAccountType,
} from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { formatShortDate } from '../../shared/ui/dates';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { Icon } from '../../shared/ui/icon';
import { MoneyPipe } from '../../shared/ui/money';
import { PageHeader } from '../../shared/ui/page-header';
import { Skeleton } from '../../shared/ui/skeleton';
import { IntegrationsApi, NEW_ACCOUNT_TYPES, RecordFilter, STATE_LOOK } from './integrations-api';

interface CategoryOption {
  id: string;
  label: string;
  isIncome: boolean;
}

const FORMAT_LABEL: Readonly<Record<ImportSummary['format'], string>> = { csv: 'CSV de banco', bluecoins: 'Bluecoins', ofx: 'OFX' };
const PAGE = 100;

/**
 * Brings movements from a file into the person's own accounts: a bank statement (CSV or OFX) or the export
 * of the Bluecoins app. The file is read first and nothing enters the ledger until the person confirms: they
 * see what is new, what they already had and what could not be read, and decide where each thing goes.
 */
@Component({
  selector: 'app-integrations',
  imports: [EmptyState, ErrorState, Icon, MoneyPipe, PageHeader, Skeleton],
  templateUrl: './integrations.html',
  styleUrl: './integrations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Integrations {
  private readonly api = inject(IntegrationsApi);

  protected readonly stateLook = STATE_LOOK;
  protected readonly formatLabel = FORMAT_LABEL;
  protected readonly newAccountTypes = NEW_ACCOUNT_TYPES;
  protected readonly formatShortDate = formatShortDate;

  protected readonly imports = httpResource<ImportSummary[]>(() => this.api.importsUrl());
  protected readonly rules = httpResource<CategorizationRule[]>(() => this.api.rulesUrl());
  private readonly accounts = httpResource<Account[]>(() => this.api.accountsUrl());
  private readonly categories = httpResource<Category[]>(() => this.api.categoriesUrl());

  protected readonly openId = signal<string | null>(null);
  protected readonly filter = signal<RecordFilter>('all');
  protected readonly offset = signal(0);
  protected readonly detail = httpResource<ImportDetail>(() => this.api.detailUrl(this.openId(), this.filter(), this.offset()));

  protected readonly file = signal<File | null>(null);
  protected readonly accountId = signal('');
  protected readonly rulePattern = signal('');
  protected readonly ruleCategory = signal('');

  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);
  private commitKey = crypto.randomUUID();

  /** Where a statement can go: the accounts in use, except the funds of goals, which only their goal moves. */
  protected readonly usableAccounts = computed(() => (this.accounts.value() ?? []).filter((account) => !account.isArchived && account.type !== 'goalFund'));

  /** Every category and subcategory in use, as "Comida / Restaurantes". */
  protected readonly categoryOptions = computed<CategoryOption[]>(() =>
    (this.categories.value() ?? [])
      .filter((category) => !category.isArchived)
      .flatMap((category) => [
        { id: category.id, label: category.name, isIncome: category.kind === 'income' },
        ...category.subcategories
          .filter((subcategory) => !subcategory.isArchived)
          .map((subcategory) => ({ id: subcategory.id, label: `${category.name} / ${subcategory.name}`, isIncome: category.kind === 'income' })),
      ]),
  );

  protected readonly incomeCategories = computed(() => this.categoryOptions().filter((option) => option.isIncome));
  protected readonly expenseCategories = computed(() => this.categoryOptions().filter((option) => !option.isIncome));

  /** The filters of the review, each with how many lines it has; an empty one is not offered. */
  /** The counts of the import on screen, as numbers. */
  protected readonly counts = computed(() => {
    const counts = this.detail.value()?.counts;
    return {
      ready: Number(counts?.ready ?? 0),
      pending: Number(counts?.pending ?? 0),
      duplicates: Number(counts?.duplicates ?? 0),
      excluded: Number(counts?.excluded ?? 0),
      invalid: Number(counts?.invalid ?? 0),
      imported: Number(counts?.imported ?? 0),
    };
  });

  protected readonly filters = computed(() => {
    if (!this.detail.hasValue()) {
      return [];
    }

    const counts = this.counts();

    const all: { value: RecordFilter; label: string; count: number }[] = [
      { value: 'pending', label: 'Por resolver', count: counts.pending },
      { value: 'ready', label: 'Listos', count: counts.ready },
      { value: 'duplicate', label: 'Ya registrados', count: counts.duplicates },
      { value: 'excluded', label: 'Excluidos', count: counts.excluded },
      { value: 'invalid', label: 'No se pudieron leer', count: counts.invalid },
      { value: 'imported', label: 'Importados', count: counts.imported },
    ];
    return [{ value: 'all' as RecordFilter, label: 'Todos', count: Number(this.detail.value()!.import.recordCount) }, ...all.filter((option) => option.count > 0 || option.value === this.filter())];
  });

  protected readonly isOpen = computed(() => this.detail.value()?.import.status === 'review');
  protected readonly hasPrevious = computed(() => this.offset() > 0);
  protected readonly hasNext = computed(() => this.offset() + PAGE < Number(this.detail.value()?.matchingRecords ?? 0));

  /** The day something happened, in the time zone of the browser: an upload at 10 pm in Lima is still that day. */
  protected day(timestamp: string): string {
    const moment = new Date(timestamp);
    const local = new Date(moment.getTime() - moment.getTimezoneOffset() * 60_000);
    return formatShortDate(local.toISOString().slice(0, 10));
  }

  protected accountValue(mapping: ImportAccountMapping): string {
    return mapping.createAs ? `new:${mapping.createAs}` : mapping.accountId ? `account:${mapping.accountId}` : '';
  }

  protected categoryValue(mapping: ImportCategoryMapping): string {
    return mapping.create ? 'new' : (mapping.categoryId ?? '');
  }

  protected sourceCategory(mapping: ImportCategoryMapping): string {
    if (!mapping.sourceName) {
      return mapping.isIncome ? 'Ingresos sin categoría en el archivo' : 'Gastos sin categoría en el archivo';
    }

    return mapping.sourceGroup && mapping.sourceGroup.toLowerCase() !== mapping.sourceName.toLowerCase()
      ? `${mapping.sourceGroup} / ${mapping.sourceName}`
      : mapping.sourceName;
  }

  protected signed(record: ImportRecord): number {
    return record.kind === 'income' || record.kind === 'openingBalance' ? Number(record.amount) : -Number(record.amount);
  }

  protected chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
  }

  protected async upload(): Promise<void> {
    const file = this.file();
    if (!file) {
      return;
    }

    await this.run(async () => {
      const detail = await this.api.upload(file, this.accountId() || null);
      this.file.set(null);
      this.open(detail.import.id);
      return Number(detail.counts.pending) > 0
        ? 'Archivo leído. Antes de importar, dinos a qué cuenta y categoría va lo que falta.'
        : 'Archivo leído. Revisa los movimientos y confírmalos.';
    });
  }

  protected open(importId: string): void {
    this.openId.set(importId);
    this.filter.set('all');
    this.offset.set(0);
    this.commitKey = crypto.randomUUID();
  }

  protected close(): void {
    this.openId.set(null);
    this.imports.reload();
  }

  protected setFilter(filter: RecordFilter): void {
    this.filter.set(filter);
    this.offset.set(0);
  }

  protected page(step: number): void {
    this.offset.update((offset) => Math.max(0, offset + step * PAGE));
  }

  protected mapAccount(detail: ImportDetail, mapping: ImportAccountMapping, value: string): Promise<void> {
    const [kind, id] = value.split(':');
    return this.run(async () => {
      await this.api.mapAccount(detail.import.id, mapping.id, kind === 'account' ? id : null, kind === 'new' ? (id as NewAccountType) : null);
      return null;
    });
  }

  protected mapCategory(detail: ImportDetail, mapping: ImportCategoryMapping, value: string): Promise<void> {
    return this.run(async () => {
      await this.api.mapCategory(detail.import.id, mapping.id, value && value !== 'new' ? value : null, value === 'new');
      return null;
    });
  }

  protected classify(detail: ImportDetail, record: ImportRecord, categoryId: string): Promise<void> {
    return this.run(async () => {
      await this.api.review(detail.import.id, record.id, { categoryId });
      return null;
    });
  }

  protected toggle(detail: ImportDetail, record: ImportRecord): Promise<void> {
    const leaveOut = record.state !== 'excluded' && record.state !== 'duplicate';
    return this.run(async () => {
      await this.api.review(detail.import.id, record.id, { excluded: leaveOut });
      return null;
    });
  }

  protected commit(detail: ImportDetail): Promise<void> {
    return this.run(async () => {
      const done = await this.api.commit(detail.import.id, this.commitKey);
      this.filter.set('all');
      this.offset.set(0);
      this.accounts.reload();
      this.categories.reload();
      const count = Number(done.import.importedCount);
      return `${count} ${count === 1 ? 'movimiento importado' : 'movimientos importados'}. Ya están en tus cuentas.`;
    });
  }

  protected discard(detail: ImportDetail): Promise<void> {
    return this.run(async () => {
      await this.api.discard(detail.import.id);
      this.openId.set(null);
      return `«${detail.import.fileName}» descartado. Nada entró a tus cuentas.`;
    });
  }

  protected addRule(): Promise<void> {
    return this.run(async () => {
      await this.api.saveRule({ pattern: this.rulePattern(), categoryId: this.ruleCategory(), isActive: true });
      const pattern = this.rulePattern();
      this.rulePattern.set('');
      this.ruleCategory.set('');
      return `Regla guardada: lo que diga «${pattern}» se clasificará solo en tus próximas importaciones.`;
    });
  }

  protected toggleRule(rule: CategorizationRule): Promise<void> {
    return this.run(async () => {
      await this.api.saveRule({ id: rule.id, pattern: rule.pattern, categoryId: rule.categoryId, isActive: !rule.isActive });
      return null;
    });
  }

  protected deleteRule(rule: CategorizationRule): Promise<void> {
    return this.run(async () => {
      await this.api.deleteRule(rule.id);
      return `Regla «${rule.pattern}» eliminada.`;
    });
  }

  protected reload(): void {
    this.imports.reload();
    this.rules.reload();
    this.detail.reload();
  }

  private async run(action: () => Promise<string | null>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    this.notice.set(null);
    try {
      const message = await action();
      if (message) {
        this.notice.set(message);
      }
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
      this.reload();
    }
  }
}
