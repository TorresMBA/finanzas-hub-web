import { Injectable, effect, inject, signal, untracked } from '@angular/core';

/** The router outlet where the quick button of the frame opens a new movement, so the page behind stays. */
export const QUICK_OUTLET = 'quick';
/** The path of that dialog inside its outlet. */
export const QUICK_TRANSACTION_PATH = 'nueva-transaccion';

/**
 * Says that a movement was registered from outside the page on screen, like the quick button of the frame. The
 * pages that show money read it to catch up, and the frame shows what was saved.
 */
@Injectable({ providedIn: 'root' })
export class MovementsFeed {
  private readonly count = signal(0);
  private readonly message = signal<string | null>(null);

  /** Goes up with every movement registered this way. */
  readonly version = this.count.asReadonly();
  /** What the last one was, until the frame stops showing it. */
  readonly notice = this.message.asReadonly();

  saved(message: string): void {
    this.message.set(message);
    this.count.update((count) => count + 1);
  }

  dismiss(): void {
    this.message.set(null);
  }
}

/** Calls `react` each time a movement is registered from outside the page; never on the first read. */
export function onMovementSaved(react: () => void): void {
  const version = inject(MovementsFeed).version;
  let seen = untracked(version);
  effect(() => {
    const now = version();
    if (now !== seen) {
      seen = now;
      untracked(react);
    }
  });
}
