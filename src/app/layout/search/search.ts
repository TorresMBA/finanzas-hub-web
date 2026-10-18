import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SearchResult } from '../../core/api/api-types';
import { WorkspaceStore } from '../../core/workspace/workspace-store';
import { formatShortDate } from '../../shared/ui/dates';
import { Dialog } from '../../shared/ui/dialog';
import { Icon } from '../../shared/ui/icon';
import { MoneyPipe } from '../../shared/ui/money';

const DELAY_MS = 250;
const MIN_LENGTH = 2;

/**
 * The global search of the top bar: the person's own movements, accounts, goals and categories, and their groups, by a piece of their text.
 * It opens with its button or with Ctrl+K (⌘K on a Mac).
 */
@Component({
  selector: 'app-search',
  imports: [Dialog, Icon, MoneyPipe, RouterLink],
  host: { '(document:keydown)': 'shortcut($event)' },
  template: `
    <button type="button" class="trigger" aria-label="Buscar" aria-keyshortcuts="Control+K Meta+K" (click)="open.set(true)">
      <app-icon name="search" [size]="19" />
      <span class="label">Buscar</span>
      <kbd>Ctrl K</kbd>
    </button>

    @if (open()) {
      <app-dialog title="Buscar" (closed)="close()">
        <input
          #field
          class="input"
          type="search"
          aria-label="Buscar movimientos, cuentas, metas, categorías y grupos"
          placeholder="Wong, BCP, viaje…"
          [value]="text()"
          (input)="type($any($event.target).value)"
        />

        @if (query().length < minLength) {
          <p class="hint">Escribe al menos {{ minLength }} letras: busca en tus movimientos, cuentas, metas, categorías y grupos.</p>
        } @else if (!results.hasValue() && results.isLoading()) {
          <p class="hint" aria-busy="true">Buscando…</p>
        } @else if (results.error()) {
          <p class="hint" role="alert">No se pudo buscar. Inténtalo otra vez.</p>
        } @else if (results.value(); as found) {
          @if (found.movements.length + found.accounts.length + found.goals.length + found.categories.length + found.groups.length === 0) {
            <p class="hint">Nada coincide con «{{ query() }}».</p>
          } @else {
            @if (found.movements.length > 0) {
              <section aria-label="Movimientos">
                <h3>Movimientos</h3>
                <ul>
                  @for (movement of found.movements; track movement.id) {
                    <li>
                      <a routerLink="/transactions" [queryParams]="{ q: query(), range: 'all', open: movement.id }" (click)="close()">
                        <span class="name">{{ movement.description }}<small>{{ day(movement.occurredOn) }} · {{ movement.accountName }}{{ movement.categoryName ? ' · ' + movement.categoryName : '' }}</small></span>
                        <strong [class.is-income]="+movement.signedAmount > 0">{{ movement.signedAmount | money: movement.currency : { signed: true } }}</strong>
                      </a>
                    </li>
                  }
                </ul>
              </section>
            }
            @if (found.accounts.length > 0) {
              <section aria-label="Cuentas">
                <h3>Cuentas</h3>
                <ul>
                  @for (account of found.accounts; track account.id) {
                    <li>
                      <a routerLink="/transactions" [queryParams]="{ accountId: account.id }" (click)="close()">
                        <span class="name">{{ account.name }}</span>
                        <strong>{{ account.balance | money: account.currency }}</strong>
                      </a>
                    </li>
                  }
                </ul>
              </section>
            }
            @if (found.goals.length > 0) {
              <section aria-label="Metas">
                <h3>Metas</h3>
                <ul>
                  @for (goal of found.goals; track goal.id) {
                    <li>
                      <a routerLink="/goals" [queryParams]="{ open: goal.id }" (click)="close()">
                        <span class="name">{{ goal.name }}<small>{{ goal.percent }}% de {{ goal.targetAmount | money: goal.currency }}</small></span>
                        <strong>{{ goal.saved | money: goal.currency }}</strong>
                      </a>
                    </li>
                  }
                </ul>
              </section>
            }
            @if (found.categories.length > 0) {
              <section aria-label="Categorías">
                <h3>Categorías</h3>
                <ul>
                  @for (category of found.categories; track category.id) {
                    <li>
                      <a routerLink="/transactions" [queryParams]="{ categoryId: category.id, range: 'all' }" (click)="close()">
                        <app-icon [name]="category.icon" [size]="18" />
                        <span class="name">{{ category.name }}<small>{{ category.parentName ? category.parentName + ' · ' : '' }}{{ category.isIncome ? 'Ingreso' : 'Gasto' }}</small></span>
                      </a>
                    </li>
                  }
                </ul>
              </section>
            }
            @if (found.groups.length > 0) {
              <section aria-label="Gastos compartidos">
                <h3>Gastos compartidos</h3>
                <ul>
                  @for (group of found.groups; track group.id) {
                    <li>
                      <a routerLink="/shared" [queryParams]="{ open: group.id }" (click)="close()">
                        <app-icon [name]="group.icon" [size]="18" />
                        <span class="name">{{ group.name }}{{ group.isArchived ? ' · Archivado' : '' }}</span>
                      </a>
                    </li>
                  }
                </ul>
              </section>
            }
          }
        }
      </app-dialog>
    }
  `,
  styles: `
    @use 'mixins' as m;

    .trigger {
      height: 38px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      border-radius: 10px;
      color: var(--tx2);

      @include m.tablet-up {
        background: var(--sf);
        border: 1px solid var(--bd);
      }
    }
    .label,
    kbd {
      display: none;

      @include m.desktop {
        display: inline;
      }
    }
    .label {
      font-size: 13px;
      font-weight: 600;
    }
    kbd {
      padding: 1px 6px;
      border-radius: 6px;
      background: var(--sf2);
      color: var(--mu);
      font: inherit;
      font-size: 11px;
    }
    .hint,
    small {
      color: var(--mu);
      font-size: 12.5px;
    }
    .hint {
      margin-top: 14px;
    }
    h3 {
      margin: 16px 0 6px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      color: var(--mu);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-radius: 10px;
      color: var(--tx);

      &:hover,
      &:focus-visible {
        background: var(--sf2);
      }
    }
    .name {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      font-size: 13.5px;
      font-weight: 600;
      @include m.truncate;
    }
    strong {
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    .is-income {
      color: var(--ac);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Search {
  private readonly workspaces = inject(WorkspaceStore);

  protected readonly minLength = MIN_LENGTH;
  protected readonly open = signal(false);
  protected readonly text = signal('');
  protected readonly query = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly url = computed(() => {
    const workspace = this.workspaces.current();
    const query = this.query();
    return workspace && query.length >= MIN_LENGTH ? `/api/v1/workspaces/${workspace.id}/search?q=${encodeURIComponent(query)}` : undefined;
  });
  protected readonly results = httpResource<SearchResult>(() => this.url());

  protected readonly day = formatShortDate;

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    // The box is ready to type in as soon as the dialog opens.
    afterRenderEffect(() => this.field()?.nativeElement.focus());
  }

  protected type(value: string): void {
    this.text.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.query.set(value.trim()), DELAY_MS);
  }

  protected close(): void {
    clearTimeout(this.timer);
    this.open.set(false);
    this.text.set('');
    this.query.set('');
  }

  protected shortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.open.set(true);
    }
  }
}
