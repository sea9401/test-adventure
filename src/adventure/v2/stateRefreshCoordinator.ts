/** Instance-local, in-flight only. Later refreshes require a fresh trailing read. */
export function createStateRefreshCoordinator<T>(read: () => Promise<T>, apply: (value: T) => void) {
  let generation = 0;
  let dirty = false;
  let pending: Promise<void> | undefined;
  return {
    refresh(): Promise<void> {
      generation += 1;
      dirty = true;
      if (!pending) {
        pending = Promise.resolve().then(async () => {
          try {
            while (dirty) {
              dirty = false;
              const started = generation;
              try {
                const value = await read();
                if (started === generation) apply(value);
              } catch (error) {
                if (!dirty) throw error;
              }
            }
          } finally {
            // Clear synchronously with the drain, avoiding a lost refresh in a
            // separate Promise.finally microtask after the last response.
            pending = undefined;
          }
        });
      }
      return pending;
    },
    invalidate() {
      generation += 1;
      dirty = false;
    },
  };
}
