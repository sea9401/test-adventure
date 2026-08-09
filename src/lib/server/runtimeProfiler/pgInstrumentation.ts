import { currentRequestProfile, recordDatabaseQuery } from "./requestContext";
import type { DatabasePoolMetrics } from "./types";

const POOL_INSTRUMENTED = Symbol.for(
  "adventure.runtimeProfiler.pgPoolInstrumented",
);
const CLIENT_INSTRUMENTED = Symbol.for(
  "adventure.runtimeProfiler.pgClientInstrumented",
);

type QueryCallback = (...args: unknown[]) => unknown;

type QueryEventEmitter = {
  once(event: "end" | "error", listener: (...args: unknown[]) => void): unknown;
};

type InstrumentableClient = {
  query: (...args: unknown[]) => unknown;
  [CLIENT_INSTRUMENTED]?: boolean;
};

type InstrumentablePool = {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  on(event: "connect", listener: (client: InstrumentableClient) => void): unknown;
  [POOL_INSTRUMENTED]?: boolean;
};

type PgInstrumentationOptions = {
  nowNs?: () => bigint;
  onError?: (error: unknown) => void;
};

declare global {
  var __adventureProfilerDatabasePool: InstrumentablePool | undefined;
}

function isThenable(
  value: unknown,
): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function isQueryEmitter(value: unknown): value is QueryEventEmitter {
  return (
    typeof value === "object" &&
    value !== null &&
    "once" in value &&
    typeof value.once === "function"
  );
}

function instrumentClient(
  client: InstrumentableClient,
  options: PgInstrumentationOptions,
): void {
  if (client[CLIENT_INSTRUMENTED]) return;
  const originalQuery = client.query;
  const nowNs = options.nowNs ?? process.hrtime.bigint;

  client.query = function instrumentedQuery(...originalArgs: unknown[]) {
    const profile = currentRequestProfile();
    if (!profile) return originalQuery.apply(this, originalArgs);

    const startedAtNs = nowNs();
    let recorded = false;
    const finish = (failed: boolean): void => {
      if (recorded) return;
      recorded = true;
      try {
        recordDatabaseQuery(
          profile,
          Number(nowNs() - startedAtNs) / 1_000_000,
          failed,
        );
      } catch (error) {
        options.onError?.(error);
      }
    };

    const args = [...originalArgs];
    const lastArgument = args.at(-1);
    if (typeof lastArgument === "function") {
      const callback = lastArgument as QueryCallback;
      args[args.length - 1] = function instrumentedCallback(
        this: unknown,
        ...callbackArgs: unknown[]
      ) {
        finish(callbackArgs[0] != null);
        return callback.apply(this, callbackArgs);
      };
    }

    try {
      const result = originalQuery.apply(this, args);
      if (isThenable(result)) {
        return result.then(
          (value) => {
            finish(false);
            return value;
          },
          (error) => {
            finish(true);
            throw error;
          },
        );
      }
      if (isQueryEmitter(result)) {
        result.once("end", () => finish(false));
        result.once("error", () => finish(true));
      }
      return result;
    } catch (error) {
      finish(true);
      throw error;
    }
  };
  client[CLIENT_INSTRUMENTED] = true;
}

export function instrumentPgPool(
  pool: InstrumentablePool,
  options: PgInstrumentationOptions = {},
): boolean {
  if (pool[POOL_INSTRUMENTED]) return false;
  try {
    pool.on("connect", (client) => {
      try {
        instrumentClient(client, options);
      } catch (error) {
        options.onError?.(error);
      }
    });
  } catch (error) {
    options.onError?.(error);
    return false;
  }
  pool[POOL_INSTRUMENTED] = true;
  globalThis.__adventureProfilerDatabasePool = pool;
  return true;
}

export function readInstrumentedPoolMetrics(): DatabasePoolMetrics | null {
  const pool = globalThis.__adventureProfilerDatabasePool;
  if (!pool) return null;
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}
