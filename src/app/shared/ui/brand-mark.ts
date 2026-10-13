import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The three-bar logo of the mock. */
@Component({
  selector: 'app-brand-mark',
  template: `<span></span><span></span><span></span>`,
  styles: `
    :host {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      height: 22px;
      flex: none;
    }
    span {
      width: 5px;
      border-radius: 2px;
      background: var(--bl);
    }
    span:nth-child(1) {
      height: 12px;
    }
    span:nth-child(2) {
      height: 22px;
      background: var(--ac);
    }
    span:nth-child(3) {
      height: 16px;
    }
  `,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMark {}
