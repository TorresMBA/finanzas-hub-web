import { Account } from './api-types';

/**
 * Accounts another section opens and moves: the fund of a goal and the capital of an investment. They are never
 * offered to register money by hand.
 */
export function isManagedAccount(type: Account['type']): boolean {
  return type === 'goalFund' || type === 'investment';
}
