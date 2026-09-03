export type BestEffortBatcherOptions<T> = {
  writeBatch(entries: readonly T[]): Promise<void>;
  maxBatchSize: number;
  flushDelayMs: number;
  onError(error: unknown, entries: readonly T[]): void;
};

export function createBestEffortBatcher<T>(
  options: BestEffortBatcherOptions<T>,
): {
  enqueue(entry: T): void;
  flush(): Promise<void>;
} {
  const maxBatchSize = Math.max(1, Math.floor(options.maxBatchSize));
  const flushDelayMs = Math.max(0, Math.floor(options.flushDelayMs));
  const pending: T[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const clearScheduledFlush = () => {
    if (flushTimer == null) return;
    clearTimeout(flushTimer);
    flushTimer = null;
  };

  const flush = (): Promise<void> => {
    if (inFlight) return inFlight;
    clearScheduledFlush();
    if (pending.length === 0) return Promise.resolve();

    const run = (async () => {
      while (pending.length > 0) {
        const entries = pending.splice(0, maxBatchSize);
        try {
          await options.writeBatch(entries);
        } catch (error) {
          options.onError(error, entries);
        }
      }
    })();
    inFlight = run.finally(() => {
      inFlight = null;
      if (pending.length > 0) scheduleFlush();
    });
    return inFlight;
  };

  const scheduleFlush = () => {
    if (flushTimer != null || inFlight) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, flushDelayMs);
    (flushTimer as { unref?: () => unknown }).unref?.();
  };

  return {
    enqueue(entry) {
      pending.push(entry);
      if (pending.length >= maxBatchSize) {
        clearScheduledFlush();
        void flush();
        return;
      }
      scheduleFlush();
    },
    flush,
  };
}
