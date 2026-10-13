import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';

/**
 * Stands in for a section until its roadmap phase builds it. Each feature replaces its own route;
 * this component is deleted when the last one is replaced.
 */
@Component({
  selector: 'app-feature-placeholder',
  imports: [PageHeader, EmptyState],
  template: `
    <app-page-header [eyebrow]="eyebrow()" [title]="heading()" [subtitle]="description()" />
    <app-empty-state icon="construction" title="Esta sección todavía no está construida" [message]="message()" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturePlaceholder {
  // Bound from the route's data.
  readonly heading = input.required<string>();
  readonly description = input<string>();
  readonly phase = input.required<number>();

  protected readonly eyebrow = computed(() => `Fase ${this.phase()}`);
  protected readonly message = computed(
    () => `Llega en la fase ${this.phase()} del plan. Por ahora solo existe la navegación.`,
  );
}
