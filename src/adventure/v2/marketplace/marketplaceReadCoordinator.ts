/** Component-local in-flight reads, never a cross-account or completed-result cache. */
export function createMarketplaceReadCoordinator() {
  const pending = new Map<string, Promise<void>>();
  let generation = 0;
  return {
    invalidate() {
      generation += 1;
      pending.clear();
    },
    run<T>(
      key: string,
      read: () => Promise<T>,
      apply: (value: T) => void,
    ): Promise<void> {
      const existing = pending.get(key);
      if (existing) return existing;
      const startedAt = generation;
      const request = Promise.resolve()
        .then(read)
        .then((value) => {
          if (generation === startedAt) apply(value);
        })
        .catch((error: unknown) => {
          if (generation === startedAt) throw error;
        })
        .finally(() => {
          if (pending.get(key) === request) pending.delete(key);
        });
      pending.set(key, request);
      return request;
    },
  };
}
