import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { WhatsAppChannel as Channel, WhatsAppDelivery } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { Field } from '../../shared/ui/field';
import { Icon } from '../../shared/ui/icon';
import { NotificationsApi } from './notifications-api';

const KIND_LABELS: Readonly<Record<WhatsAppDelivery['kind'], string>> = {
  reply: 'Respuesta a tu mensaje',
  notice: 'Aviso',
  verificationCode: 'Código de verificación',
};

const STATUS_LABELS: Readonly<Record<WhatsAppDelivery['status'], string>> = {
  pending: 'Por enviar',
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leído',
  failed: 'No se pudo enviar',
};

const STATUS_TONES: Readonly<Record<WhatsAppDelivery['status'], 'ok' | 'wait' | 'bad'>> = {
  pending: 'wait',
  sent: 'ok',
  delivered: 'ok',
  read: 'ok',
  failed: 'bad',
};

const WHEN = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * The WhatsApp number of the person: proving it with a code, and forgetting it. Until the code is typed back
 * nothing goes to the number and nothing it says counts as the person.
 */
@Component({
  selector: 'app-whatsapp-channel',
  imports: [Field, Icon],
  templateUrl: './whatsapp-channel.html',
  styleUrl: './whatsapp-channel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsAppChannel {
  private readonly api = inject(NotificationsApi);

  readonly channel = input.required<Channel>();
  readonly changed = output<void>();

  protected readonly phone = signal('');
  protected readonly code = signal('');
  protected readonly developmentCode = signal<string | null>(null);
  protected readonly changing = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** The last messages and how each went, once there is a number. Only information: nothing here can be retried by hand. */
  protected readonly deliveries = httpResource<WhatsAppDelivery[]>(() => (this.channel().phone ? this.api.deliveriesUrl : undefined));
  protected readonly deliveryRows = computed(() =>
    (this.deliveries.value() ?? []).slice(0, 5).map((delivery) => ({
      id: delivery.id,
      what: delivery.title ?? KIND_LABELS[delivery.kind],
      status: STATUS_LABELS[delivery.status],
      tone: STATUS_TONES[delivery.status],
      when: WHEN.format(new Date(delivery.sentAt ?? delivery.createdAt)).replace('.', ''),
      error: delivery.lastError,
    })),
  );

  protected start(phone: string): Promise<void> {
    return this.run(async () => {
      const started = await this.api.startWhatsApp(phone);
      this.developmentCode.set(started.developmentCode);
      this.changing.set(false);
      this.code.set('');
    });
  }

  protected confirm(): Promise<void> {
    return this.run(async () => {
      await this.api.confirmWhatsApp(this.code().trim());
      this.developmentCode.set(null);
      this.phone.set('');
    });
  }

  protected remove(): Promise<void> {
    return this.run(() => this.api.removeWhatsApp().then(() => undefined));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      await action();
      this.changed.emit();
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
