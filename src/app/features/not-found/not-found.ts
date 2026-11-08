import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';

/** An address that leads nowhere: say so, instead of silently showing Inicio. */
@Component({
  selector: 'app-not-found',
  imports: [EmptyState, PageHeader, RouterLink],
  template: `
    <app-page-header title="Página no encontrada" />
    <app-empty-state icon="explore_off" title="Esta dirección no lleva a ninguna parte" message="Puede que el enlace esté mal escrito o que la página ya no exista.">
      <a class="button button--primary" routerLink="/">Ir a Inicio</a>
    </app-empty-state>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {}
