type PoolRuntimeOptions<TPool, TDatabase> = {
  createPool: () => TPool;
  createDatabase: (pool: TPool) => TDatabase;
  closePool: (pool: TPool, reason: string) => void | Promise<void>;
  now: () => number;
  recycleCooldownMs: number;
  onCloseError?: (error: unknown) => void;
};

export function createPoolRuntime<TPool, TDatabase>(
  options: PoolRuntimeOptions<TPool, TDatabase>,
) {
  let pool: TPool | null = null;
  let database: TDatabase | null = null;
  let lastRecycleAt: number | null = null;

  const getDatabase = (): TDatabase => {
    if (database) return database;
    pool = options.createPool();
    database = options.createDatabase(pool);
    return database;
  };

  const recycle = (reason: string): boolean => {
    if (!pool) return false;
    const currentTime = options.now();
    if (
      lastRecycleAt != null &&
      currentTime - lastRecycleAt < options.recycleCooldownMs
    ) {
      return false;
    }

    const stalePool = pool;
    pool = null;
    database = null;
    lastRecycleAt = currentTime;
    void Promise.resolve(options.closePool(stalePool, reason)).catch((error) => {
      options.onCloseError?.(error);
    });
    return true;
  };

  return { getDatabase, recycle };
}
