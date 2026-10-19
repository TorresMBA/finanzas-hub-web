import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

const STORAGE_KEY = 'ph.amounts-hidden';

/**
 * Whether the balances are hidden, for when someone else can see the screen. Remembered on this device, like the
 * theme. It only hides what is shown: the figures still come from the API.
 */
@Injectable({ providedIn: 'root' })
export class PrivacyStore {
  private readonly storage = inject(DOCUMENT).defaultView?.localStorage;
  private readonly hidden = signal(this.storage?.getItem(STORAGE_KEY) === 'true');

  readonly amountsHidden = this.hidden.asReadonly();

  constructor() {
    effect(() => this.storage?.setItem(STORAGE_KEY, String(this.hidden())));
  }

  toggle(): void {
    this.hidden.update((hidden) => !hidden);
  }
}
