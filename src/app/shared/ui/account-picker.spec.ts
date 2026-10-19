import { TestBed } from '@angular/core/testing';
import { AccountPicker, PickerGroup } from './account-picker';

const GROUPS: PickerGroup[] = [
  {
    label: 'soles · PEN',
    total: 'S/ 5,002.00',
    options: [
      { id: 'sueldo', name: 'Cuenta Sueldo', hint: 'Cuenta de origen', currency: 'PEN', balance: 4820, icon: 'account_balance', color: 'blue', disabled: true },
      { id: 'billetera', name: 'Billetera', hint: 'Efectivo', currency: 'PEN', balance: 182, icon: 'payments', color: 'green' },
    ],
  },
  { label: 'dólares · USD', total: 'US$ 1,245.50', options: [{ id: 'spot', name: 'Cuenta Spot', hint: 'Cuenta bancaria', currency: 'USD', balance: 1245.5, icon: 'account_balance', color: 'blue' }] },
];

describe('AccountPicker', () => {
  it('opens from the keyboard, skips what cannot be chosen and chooses with Enter', async () => {
    const fixture = TestBed.createComponent(AccountPicker);
    fixture.componentRef.setInput('groups', GROUPS);
    fixture.componentRef.setInput('label', 'Hacia');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    const key = async (target: Element, name: string) => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
      await fixture.whenStable();
    };

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await key(trigger, 'ArrowDown');
    const list = element.querySelector('[role="listbox"]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    // Each currency is a group with its total; the origin of a transfer is there but cannot be chosen.
    expect(Array.from(element.querySelectorAll('.group')).map((group) => group.textContent?.trim())).toEqual(['soles · PENS/ 5,002.00', 'dólares · USDUS$ 1,245.50']);
    expect(element.querySelector('[aria-disabled="true"] strong')?.textContent).toBe('Cuenta Sueldo');
    expect(list.getAttribute('aria-activedescendant')).toContain('billetera');

    await key(list, 'ArrowDown');
    expect(list.getAttribute('aria-activedescendant')).toContain('spot');
    await key(list, 'Enter');

    expect(fixture.componentInstance.value()).toBe('spot');
    expect(element.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger.textContent).toContain('Saldo US$ 1,245.50');

    // Escape closes without changing the choice.
    await key(trigger, 'ArrowDown');
    await key(element.querySelector('[role="listbox"]')!, 'Home');
    await key(element.querySelector('[role="listbox"]')!, 'Escape');
    expect(fixture.componentInstance.value()).toBe('spot');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
