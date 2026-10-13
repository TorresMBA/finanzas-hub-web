import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Me, Preferences, RegisterRequest, UpdatePreferencesRequest } from '../api/api-types';
import { ApiError } from '../errors/api-error';

/**
 * Who is signed in. The session itself is a cookie the page cannot read, so the only way to know is to
 * ask the API; the answer is kept here for the lifetime of the page.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly http = inject(HttpClient);
  private readonly current = signal<Me | null>(null);
  private loading: Promise<boolean> | null = null;

  readonly user = this.current.asReadonly();
  readonly isSignedIn = computed(() => this.current() !== null);

  /** Resolves to whether there is a session, asking the API only the first time. */
  ensureLoaded(): Promise<boolean> {
    this.loading ??= this.refresh();
    return this.loading;
  }

  async refresh(): Promise<boolean> {
    try {
      this.current.set(await firstValueFrom(this.http.get<Me>('/api/v1/me')));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        this.loading = null;
        throw error;
      }

      this.current.set(null);
    }

    this.loading = Promise.resolve(this.current() !== null);
    return this.current() !== null;
  }

  async login(email: string, password: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/v1/auth/login', { email, password }));
    await this.refresh();
  }

  async register(request: RegisterRequest): Promise<void> {
    await firstValueFrom(this.http.post('/api/v1/auth/register', request));
    await this.refresh();
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/v1/auth/logout', null));
    this.current.set(null);
    this.loading = Promise.resolve(false);
  }

  async updateProfile(displayName: string, phone: string): Promise<void> {
    await firstValueFrom(this.http.patch('/api/v1/me/profile', { displayName, phone: phone || null }));
    await this.refresh();
  }

  async updatePreferences(request: UpdatePreferencesRequest): Promise<void> {
    const preferences = await firstValueFrom(this.http.put<Preferences>('/api/v1/me/preferences', request));
    this.current.update((user) => (user ? { ...user, preferences } : user));
  }
}
