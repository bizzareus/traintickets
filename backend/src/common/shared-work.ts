import { AsyncResource } from 'node:async_hooks';
import {
  EMPTY,
  Observable,
  ReplaySubject,
  Subject,
  catchError,
  defer,
  firstValueFrom,
  fromEvent,
  mergeMap,
  share,
  takeUntil,
  tap,
  throwError,
} from 'rxjs';

/** Bounded, process-local work shared by key. Each caller owns its cancellation;
 * the underlying operation is aborted only when the last caller leaves.
 */
export class SharedWork<T> {
  private readonly queue = new Subject<() => Observable<T>>();
  private readonly scopes = new WeakMap<object, Map<string, Observable<T>>>();

  constructor(concurrency: number) {
    this.queue
      .pipe(mergeMap((job) => job().pipe(catchError(() => EMPTY)), concurrency))
      .subscribe();
  }

  run(
    key: string,
    work: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    scope: object = this,
  ): Promise<T> {
    signal?.throwIfAborted();
    let inflight = this.scopes.get(scope);
    if (!inflight) {
      inflight = new Map();
      this.scopes.set(scope, inflight);
    }
    const entries = inflight;
    let shared = entries.get(key);
    if (!shared) {
      shared = new Observable<T>((subscriber) => {
        const controller = new AbortController();
        // Queued work must retain its originating request's Sentry/ALS context.
        const run = AsyncResource.bind(work);
        this.queue.next(() =>
          controller.signal.aborted
            ? EMPTY
            : defer(() => run(controller.signal)).pipe(
                tap({
                  next: (value) => subscriber.next(value),
                  error: (error: unknown) => subscriber.error(error),
                  complete: () => subscriber.complete(),
                }),
              ),
        );
        return () => {
          if (entries.get(key) === shared) entries.delete(key);
          controller.abort();
        };
      }).pipe(share({ connector: () => new ReplaySubject<T>(1) }));
      entries.set(key, shared);
    }

    return firstValueFrom(
      signal
        ? shared.pipe(
            takeUntil(
              fromEvent(signal, 'abort').pipe(
                mergeMap(() => throwError(() => signal.reason as unknown)),
              ),
            ),
          )
        : shared,
    );
  }
}
