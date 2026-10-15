import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { WhatsAppChannel as Channel } from '../../core/api/api-types';
import { errorMessage } from '../../core/errors/error-messages';
import { Field } from '../../shared/ui/field';
import { Icon } from '../../shared/ui/icon';
import { NotificationsApi } from './notifications-api';

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
