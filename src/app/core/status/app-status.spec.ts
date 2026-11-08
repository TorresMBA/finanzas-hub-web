import { TestBed } from '@angular/core/testing';
import { ApiError } from '../errors/api-error';
import { AppErrorHandler, AppStatus } from './app-status';

describe('AppErrorHandler', () => {
  let handler: AppErrorHandler;
  let status: AppStatus;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AppErrorHandler] });
    handler = TestBed.inject(AppErrorHandler);
    status = TestBed.inject(AppStatus);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('warns about an error nobody handled', () => {
    handler.handleError(new TypeError('x is undefined'));

    expect(status.failure()).not.toBeNull();
  });

  it('leaves a failed API call to the view that made it, also when a resource wraps it', () => {
    const failed = new ApiError(500, 'unexpected', 'boom', null, {});

    handler.handleError(failed);
    // What Angular throws when a view reads the value of a resource whose request failed.
    handler.handleError(new Error('Resource is currently in an error state', { cause: failed }));

    expect(status.failure()).toBeNull();
  });
});
