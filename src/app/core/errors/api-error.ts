import { HttpErrorResponse } from '@angular/common/http';

/**
 * A failed API call, read from the RFC 9457 problem document the API returns for every error.
 * `code` is stable and is what the UI branches on; `message` is a fallback for people.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly traceId: string | null,
    /** Per-field messages of a 400, keyed by the field name in camelCase. */
    readonly fieldErrors: Readonly<Record<string, readonly string[]>>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

const FALLBACK_CODES: Record<number, string> = {
  0: 'network.unreachable',
  401: 'auth.unauthenticated',
  403: 'auth.forbidden',
  404: 'resource.not_found',
};

export function toApiError(response: HttpErrorResponse): ApiError {
  const problem = isRecord(response.error) ? response.error : {};
  const code = typeof problem['code'] === 'string' ? problem['code'] : (FALLBACK_CODES[response.status] ?? 'unexpected');
  const message = firstString(problem['detail'], problem['title']) ?? 'No se pudo completar la operación.';
  const traceId = typeof problem['traceId'] === 'string' ? problem['traceId'] : null;
  return new ApiError(response.status, code, message, traceId, readFieldErrors(problem['errors']));
}

function readFieldErrors(errors: unknown): Record<string, readonly string[]> {
  if (!isRecord(errors)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(errors)
      .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
      .map(([field, messages]) => [field, messages.filter((message): message is string => typeof message === 'string')]),
  );
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
