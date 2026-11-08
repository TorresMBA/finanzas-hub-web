import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from './dialog';

@Component({
  imports: [Dialog],
  template: `
    <button type="button" id="opener" (click)="open.set(true)">Abrir</button>
    @if (open()) {
      <app-dialog title="Editar" (closed)="open.set(false); closes = closes + 1">
        <input aria-label="Nombre" />
      </app-dialog>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly open = signal(false);
  closes = 0;
}

describe('Dialog', () => {
  it('gives focus back to what opened it, and once edited a click on the backdrop keeps it open', async () => {
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    const element: HTMLElement = fixture.nativeElement;
    const opener = element.querySelector<HTMLButtonElement>('#opener')!;

    opener.focus();
    opener.click();
    await fixture.whenStable();
    const dialog = element.querySelector('dialog')!;
    dialog.querySelector('input')!.dispatchEvent(new Event('input', { bubbles: true }));
    // Outside the dialog's box: what a click on the backdrop looks like.
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: -10, clientY: -10 }));
    await fixture.whenStable();
    expect(fixture.componentInstance.closes).toBe(0);

    element.querySelector<HTMLButtonElement>('app-dialog button[aria-label="Cerrar"]')!.click();
    await fixture.whenStable();

    expect(element.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    fixture.nativeElement.remove();
  });
});
