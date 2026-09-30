import { once } from 'node:events';
import type { Request, Response } from 'express';

export function createResponseLifecycle(
  req: Request,
  res: Response,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, timeoutMs);
  req.once('aborted', abort);
  res.once('close', abort);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      req.off('aborted', abort);
      res.off('close', abort);
    },
  };
}

export async function writeChunk(
  res: Response,
  chunk: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (res.destroyed || res.writableEnded) throw new Error('Response is closed');
  if (res.write(chunk)) return;
  await once(res, 'drain', { signal });
}

export function endResponse(res: Response): void {
  if (!res.destroyed && !res.writableEnded) res.end();
}
