import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ph.theme';

/** The colour theme. It is applied as `data-theme` on the root element and remembered on this device. */
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly document = inject(DOCUMENT);
  private readonly storage = this.document.defaultView?.localStorage;
  private readonly current = signal<Theme>(this.readStored());

  readonly theme = this.current.asReadonly();
  readonly isDark = computed(() => this.current() === 'dark');

  constructor() {
    effect(() => {
      const theme = this.current();
      this.document.documentElement.dataset['theme'] = theme;
      this.storage?.setItem(STORAGE_KEY, theme);
    });
  }

  set(theme: Theme): void {
    this.current.set(theme);
  }

  toggle(): void {
    this.current.update((theme) => (theme === 'dark' ? 'light' : 'dark'));
  }

  private readStored(): Theme {
    return this.storage?.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  }
}
