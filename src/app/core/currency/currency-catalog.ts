import { httpResource } from '@angular/common/http';
import { Injectable, computed } from '@angular/core';
import { CurrencyInfo } from '../api/api-types';

/**
 * The currencies the application works with, from the API: the only list of them. Asked once, when something first
 * needs it, and kept for the session.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyCatalog {
  private readonly resource = httpResource<CurrencyInfo[]>(() => '/api/v1/currencies');

  /** Empty until the API answers. */
  readonly list = computed<readonly CurrencyInfo[]>(() => (this.resource.hasValue() ? this.resource.value() : []));
}
