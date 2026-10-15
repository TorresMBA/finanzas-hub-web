import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NotificationCategory, NotificationSettings, UpdateNotificationSettingsRequest, WhatsAppChannel, WhatsAppVerification } from '../../core/api/api-types';

/** How each category is called, what it is for and how it looks in the inbox. */
export const CATEGORY_LOOK: Readonly<Record<NotificationCategory, { label: string; hint: string; icon: string }>> = {
  budget: { label: 'Alertas de presupuesto', hint: 'Cuando llegas al aviso que elegiste o pasas el límite.', icon: 'donut_large' },
  largeMovement: { label: 'Movimientos grandes', hint: 'Un ingreso o un gasto desde el monto que indiques.', icon: 'payments' },
  goals: { label: 'Metas', hint: 'Aportes de otros participantes y metas alcanzadas.', icon: 'flag' },
  shared: { label: 'Gastos compartidos', hint: 'Un gasto nuevo con tu parte, un pago o un recordatorio.', icon: 'group' },
  bills: { label: 'Pagos y vencimientos', hint: 'Recordatorios de lo que programaste y tarjetas por vencer.', icon: 'event' },
};

/** The calls about the inbox and the notification settings of the signed-in person. They do not depend on the workspace. */
@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly http = inject(HttpClient);

  readonly settingsUrl = '/api/v1/me/notification-settings';
  readonly whatsAppUrl = '/api/v1/me/channels/whatsapp';

  listUrl(unreadOnly: boolean): string {
    return `/api/v1/me/notifications?unreadOnly=${unreadOnly}`;
  }

  markRead(notificationId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`/api/v1/me/notifications/${notificationId}/read`, null));
  }

  markAllRead(): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/v1/me/notifications/read-all', null));
  }

  updateSettings(request: UpdateNotificationSettingsRequest): Promise<NotificationSettings> {
    return firstValueFrom(this.http.put<NotificationSettings>(this.settingsUrl, request));
  }

  startWhatsApp(phone: string): Promise<WhatsAppVerification> {
    return firstValueFrom(this.http.post<WhatsAppVerification>(`${this.whatsAppUrl}/verify-start`, { phone }));
  }

  confirmWhatsApp(code: string): Promise<WhatsAppChannel> {
    return firstValueFrom(this.http.post<WhatsAppChannel>(`${this.whatsAppUrl}/verify-confirm`, { code }));
  }

  removeWhatsApp(): Promise<WhatsAppChannel> {
    return firstValueFrom(this.http.delete<WhatsAppChannel>(this.whatsAppUrl));
  }
}
