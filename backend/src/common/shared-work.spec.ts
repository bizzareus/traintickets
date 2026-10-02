import { AsyncLocalStorage } from 'node:async_hooks';
import { SharedWork } from './shared-work';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const drain = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('SharedWork', () => {
  it('preserves the requesting trace context when a job waits behind another request', async () => {
    const context = new AsyncLocalStorage<string>();
    const pool = new SharedWork<string | undefined>(1);
    const gate = deferred<string>();
    const first = context.run('request-a', () =>
      pool.run('a', () => gate.promise),
    );
    const second = context.run('request-b', () =>
      pool.run('b', () => Promise.resolve(context.getStore())),
    );
    gate.resolve('done');
    await first;
    await expect(second).resolves.toBe('request-b');
  });
  it('shares a job and lets one caller cancel without aborting another', async () => {
    const pool = new SharedWork<number>(1);
    const result = deferred<number>();
    const work = jest.fn((_signal: AbortSignal) => result.promise);
    const caller = new AbortController();
    const first = pool.run('key', work, caller.signal);
    const second = pool.run('key', work);
    const reason = new Error('client disconnected');
    const rejected = expect(first).rejects.toBe(reason);
    caller.abort(reason);
    await rejected;

    expect(work).toHaveBeenCalledTimes(1);
    expect(work.mock.calls[0][0].aborted).toBe(false);
    result.resolve(42);
    await expect(second).resolves.toBe(42);
  });

  it('aborts underlying work only when all callers leave and permits a fresh retry', async () => {
    const pool = new SharedWork<number>(1);
    const work = jest.fn(
      (signal: AbortSignal) =>
        new Promise<number>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const a = new AbortController();
    const b = new AbortController();
    const first = expect(pool.run('key', work, a.signal)).rejects.toThrow();
    const second = expect(pool.run('key', work, b.signal)).rejects.toThrow();
    a.abort();
    expect(work.mock.calls[0][0].aborted).toBe(false);
    b.abort();
    expect(work.mock.calls[0][0].aborted).toBe(true);
    await Promise.all([first, second]);
    await expect(pool.run('key', () => Promise.resolve(7))).resolves.toBe(7);
  });

  it('bounds actual active work across keys and scopes, even if aborted work settles late', async () => {
    const pool = new SharedWork<number>(2);
    const results = [
      deferred<number>(),
      deferred<number>(),
      deferred<number>(),
    ];
    let next = 0;
    const work = jest.fn((_signal: AbortSignal) => results[next++].promise);
    const controller = new AbortController();
    const first = pool.run('a', work, controller.signal, {});
    const second = pool.run('b', work, undefined, {});
    const third = pool.run('c', work);
    expect(work).toHaveBeenCalledTimes(2);
    const rejected = expect(first).rejects.toThrow();
    controller.abort();
    await rejected;
    expect(work).toHaveBeenCalledTimes(2);
    results[0].resolve(1);
    await drain();
    expect(work).toHaveBeenCalledTimes(3);
    results[1].resolve(2);
    results[2].resolve(3);
    await expect(Promise.all([second, third])).resolves.toEqual([2, 3]);
  });

  it('never starts queued work after its last caller cancels', async () => {
    const pool = new SharedWork<number>(1);
    const active = deferred<number>();
    const first = pool.run('active', () => active.promise);
    const controller = new AbortController();
    const queued = jest.fn(() => Promise.resolve(2));
    const cancelled = expect(
      pool.run('queued', queued, controller.signal),
    ).rejects.toThrow();
    controller.abort();
    await cancelled;
    active.resolve(1);
    await first;
    await drain();
    expect(queued).not.toHaveBeenCalled();
    await expect(pool.run('queued', queued)).resolves.toBe(2);
  });

  it('releases failed jobs and does not retain completed results', async () => {
    const pool = new SharedWork<number>(1);
    await expect(
      pool.run('key', () => Promise.reject(new Error('upstream'))),
    ).rejects.toThrow('upstream');
    await expect(pool.run('key', () => Promise.resolve(2))).resolves.toBe(2);
    await expect(pool.run('key', () => Promise.resolve(3))).resolves.toBe(3);
  });

  it('isolates identical keys belonging to different cache stores', async () => {
    const pool = new SharedWork<number>(2);
    const a = deferred<number>();
    const b = deferred<number>();
    const first = pool.run('same-key', () => a.promise, undefined, {});
    const second = pool.run('same-key', () => b.promise, undefined, {});
    a.resolve(1);
    b.resolve(2);
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
  });
});
