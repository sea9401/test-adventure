type PoolRuntimeOptions<TPool, TDatabase> = {
  createPool: () => TPool;
  createDatabase: (pool: TPool) => TDatabase;
  closePool: (pool: TPool, reason: string) => void | Promise<void>;
  registerPoolErrorHandler?: (
    pool: TPool,
    handler: (error: unknown) => void,
  ) => void;
  onPoolError?: (metadata: PoolErrorMetadata) => void;
  now: () => number;
  recycleCooldownMs: number;
  onCloseError?: (error: unknown) => void;
};

type PoolErrorMetadata = {
  name: string;
  code?: string;
};

function safeErrorToken(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z0-9_]{1,64}$/.test(value)
    ? value
    : fallback;
}

function describePoolError(error: unknown): PoolErrorMetadata {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const code = safeErrorToken(
    (error as Error & { code?: unknown }).code,
    "",
  );
  return {
    name: safeErrorToken(error.name, "Error"),
    ...(code ? { code } : {}),
  };
}

export function createPoolRuntime<TPool, TDatabase>(
  options: PoolRuntimeOptions<TPool, TDatabase>,
) {
  let pool: TPool | null = null;
  let database: TDatabase | null = null;
  let lastRecycleAt: number | null = null;

  const recycleCurrentPool = (
    reason: string,
    expectedPool?: TPool,
  ): boolean => {
    if (!pool) return false;
    if (expectedPool && pool !== expectedPool) return false;
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

  const getDatabase = (): TDatabase => {
    if (database) return database;
    const createdPool = options.createPool();
    pool = createdPool;
    options.registerPoolErrorHandler?.(createdPool, (error) => {
      options.onPoolError?.(describePoolError(error));
      recycleCurrentPool("pool-client-error", createdPool);
    });
    database = options.createDatabase(createdPool);
    return database;
  };

  const recycle = (reason: string): boolean => recycleCurrentPool(reason);

  return { getDatabase, recycle };
}
