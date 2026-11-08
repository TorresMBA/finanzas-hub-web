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

  it('ignores what the window reports that is not a failure of the application', () => {
    // How Angular passes on an error event without an error, such as the browser's ResizeObserver warning.
    const resizeObserver = new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' });
    handler.handleError(new Error('An ErrorEvent with no error occurred.', { cause: resizeObserver }));

    const fromAnExtension = new Error('boom');
    fromAnExtension.stack = 'Error: boom\n    at run (chrome-extension://abcdef/web-client-content-script.js:2:10)';
    handler.handleError(fromAnExtension);

    expect(status.failure()).toBeNull();
  });
});
