import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Notification, NotificationList, NotificationSettings } from '../../core/api/api-types';
import { apiErrorInterceptor } from '../../core/http/api-interceptors';
import { TODAY } from '../../core/period/period-store';
import { provideSession } from '../../core/testing/signed-in';
import { Notifications } from './notifications';

const LIST_URL = '/api/v1/me/notifications?unreadOnly=false';
const SETTINGS_URL = '/api/v1/me/notification-settings';

const WARNING: Notification = {
  id: 'n-1',
  category: 'budget',
  severity: 'warning',
  title: 'Supermercado al 91 %',
  body: 'Pasaste el 90 % de tu presupuesto.',
  link: '/budgets',
  workspaceId: null,
  createdAt: new Date(2026, 9, 13, 9, 12).toISOString(),
  isRead: false,
};
const OLD: Notification = { ...WARNING, id: 'n-2', category: 'largeMovement', severity: 'info', title: 'Gasto de PEN 800.00', createdAt: new Date(2026, 9, 2, 18, 0).toISOString(), isRead: true };
const LIST: NotificationList = { items: [WARNING, OLD], unreadCount: 1 };
const SETTINGS: NotificationSettings = {
  quietHoursEnabled: true,
  quietFrom: '22:00:00',
  quietTo: '07:00:00',
  largeMovementThreshold: 500,
  preferences: [
    { category: 'budget', emailEnabled: true, whatsAppEnabled: false },
    { category: 'largeMovement', emailEnabled: false, whatsAppEnabled: false },
  ],
};

describe('Notifications', () => {
  let fixture: ComponentFixture<Notifications>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideSession(),
        { provide: TODAY, useValue: () => new Date(2026, 9, 13, 12, 0) },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Notifications);
    element = fixture.nativeElement;
    TestBed.tick();
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  it('groups the notices by day, and opening an unread one marks it read and goes where it points', async () => {
    http.expectOne(LIST_URL).flush(LIST);
    http.expectOne(SETTINGS_URL).flush(SETTINGS);
    http.expectOne('/api/v1/me/channels/whatsapp').flush({ phone: null, pendingPhone: null, codeExpiresAt: null });
    await fixture.whenStable();

    expect(Array.from(element.querySelectorAll('section h2')).map((node) => node.textContent)).toEqual(['Hoy', 'Anteriores']);
    expect(element.querySelectorAll('.notice.is-unread').length).toBe(1);
    expect(element.querySelector<HTMLInputElement>('input[type="time"]')!.value).toBe('22:00');
    // Without a proven number nothing can go to WhatsApp; the email still can.
    expect(element.querySelector<HTMLInputElement>('[aria-label="Alertas de presupuesto por WhatsApp"]')!.disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('[aria-label="Alertas de presupuesto por correo"]')!.checked).toBe(true);

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    element.querySelector<HTMLButtonElement>('.notice.is-unread')!.click();
    await settle();
    http.expectOne({ method: 'POST', url: '/api/v1/me/notifications/n-1/read' }).flush(null);
    await settle();
    http.expectOne(LIST_URL).flush({ items: [{ ...WARNING, isRead: true }, OLD], unreadCount: 0 });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/budgets');
    expect(element.querySelectorAll('.notice.is-unread').length).toBe(0);
  });
});
