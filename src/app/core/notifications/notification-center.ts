import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, Injector, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UnreadCount } from '../api/api-types';

/** False where nothing should reach the network on its own, as in a component test. */
export const LIVE_NOTIFICATIONS = new InjectionToken<boolean>('LIVE_NOTIFICATIONS', { factory: () => true });

const POLL_MS = 60_000;
const TOAST_MS = 6_000;

/** The signal the hub sends when a notice enters the inbox. No more than this travels: the rest is asked over HTTP. */
interface NotificationCreated {
  readonly id: string;
  readonly category: string;
  readonly title: string;
}

/**
 * How many notices the person has not read, kept current while they are signed in. A signal from the hub
 * updates it at once; asking again every minute and when the window gets the focus back covers a lost
 * connection and the notices that the hub never pushes.
 */
@Injectable({ providedIn: 'root' })
export class NotificationCenter {
  private readonly injector = inject(Injector);
  private readonly live = inject(LIVE_NOTIFICATIONS);

  private readonly count = signal(0);
  private readonly latest = signal<NotificationCreated | null>(null);
  private readonly arrivals = signal(0);

  private timer: ReturnType<typeof setInterval> | undefined;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private connection: { stop(): Promise<void> } | undefined;
  private readonly onFocus = () => void this.refresh();

  readonly unread = this.count.asReadonly();

  /** The notice that just arrived, for a few seconds. */
  readonly toast = this.latest.asReadonly();

  /** Goes up with every notice that arrives while the application is open; a list reads it to know when to reload. */
  readonly arrived = this.arrivals.asReadonly();

  /** Called by the frame of the signed-in pages when it appears. */
  start(): void {
    if (!this.live || this.timer) {
      return;
    }

    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
    window.addEventListener('focus', this.onFocus);
    void this.connect();
  }

  stop(): void {
    clearInterval(this.timer);
    clearTimeout(this.toastTimer);
    this.timer = undefined;
    window.removeEventListener('focus', this.onFocus);
    void this.connection?.stop();
    this.connection = undefined;
    this.count.set(0);
    this.latest.set(null);
  }

  async refresh(): Promise<void> {
    if (!this.live) {
      return;
    }

    try {
      const answer = await firstValueFrom(this.injector.get(HttpClient).get<UnreadCount>('/api/v1/me/notifications/unread-count'));
      this.count.set(Number(answer.count));
    } catch {
      // The badge keeps what it had; the next poll tries again.
    }
  }

  dismissToast(): void {
    this.latest.set(null);
  }

  /** The library is loaded only here, so a page that never signs in does not download it. */
  private async connect(): Promise<void> {
    try {
      const { HubConnectionBuilder, LogLevel } = await import('@microsoft/signalr');
      const connection = new HubConnectionBuilder().withUrl('/hubs/realtime').withAutomaticReconnect().configureLogging(LogLevel.None).build();
      connection.on('notification.created', (notice: NotificationCreated) => this.onCreated(notice));
      connection.onreconnected(() => void this.refresh());
      this.connection = connection;
      await connection.start();
    } catch {
      // Without the hub the badge still follows the poll.
    }
  }

  private onCreated(notice: NotificationCreated): void {
    this.count.update((count) => count + 1);
    this.arrivals.update((arrivals) => arrivals + 1);
    this.latest.set(notice);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.latest.set(null), TOAST_MS);
    void this.refresh();
  }
}
