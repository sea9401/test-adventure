import { describe, expect, it, vi } from "vitest";
import { createPoolRuntime } from "./poolRuntime";

type TestPool = {
  id: number;
  onError?: (error: unknown) => void;
};

describe("createPoolRuntime", () => {
  it("정상 요청은 풀 하나를 공유하고 회전 뒤 다음 요청은 새 풀을 사용한다", () => {
    let poolId = 0;
    const closePool = vi.fn();
    const runtime = createPoolRuntime({
      createPool: () => ({ id: ++poolId }),
      createDatabase: (pool) => ({ poolId: pool.id }),
      closePool,
      now: () => 60_000,
      recycleCooldownMs: 30_000,
    });

    expect(runtime.getDatabase()).toEqual({ poolId: 1 });
    expect(runtime.getDatabase()).toEqual({ poolId: 1 });
    expect(runtime.recycle("health-timeout")).toBe(true);
    expect(runtime.getDatabase()).toEqual({ poolId: 2 });
    expect(closePool).toHaveBeenCalledOnce();
    expect(closePool).toHaveBeenCalledWith({ id: 1 }, "health-timeout");
  });

  it("쿨다운 동안에는 새 풀을 다시 분리하지 않는다", () => {
    let now = 60_000;
    let poolId = 0;
    const closePool = vi.fn();
    const runtime = createPoolRuntime({
      createPool: () => ({ id: ++poolId }),
      createDatabase: (pool) => ({ poolId: pool.id }),
      closePool,
      now: () => now,
      recycleCooldownMs: 30_000,
    });

    runtime.getDatabase();
    expect(runtime.recycle("first-timeout")).toBe(true);
    runtime.getDatabase();
    now += 10_000;
    expect(runtime.recycle("second-timeout")).toBe(false);
    expect(runtime.getDatabase()).toEqual({ poolId: 2 });
    expect(closePool).toHaveBeenCalledTimes(1);
  });

  it("현재 풀의 연결 오류는 안전한 메타데이터만 남기고 풀을 회수한다", () => {
    let poolId = 0;
    const pools: TestPool[] = [];
    const closePool = vi.fn();
    const onPoolError = vi.fn();
    const runtime = createPoolRuntime<TestPool, { poolId: number }>({
      createPool: () => {
        const pool = { id: ++poolId };
        pools.push(pool);
        return pool;
      },
      createDatabase: (pool) => ({ poolId: pool.id }),
      closePool,
      now: () => 60_000,
      recycleCooldownMs: 30_000,
      registerPoolErrorHandler: (pool, handler) => {
        pool.onError = handler;
      },
      onPoolError,
    });

    expect(runtime.getDatabase()).toEqual({ poolId: 1 });
    pools[0]?.onError?.(
      Object.assign(new Error("params: SECRET_BATTLE_PAYLOAD"), {
        code: "ECONNRESET",
      }),
    );

    expect(onPoolError).toHaveBeenCalledWith({
      name: "Error",
      code: "ECONNRESET",
    });
    expect(JSON.stringify(onPoolError.mock.calls)).not.toContain(
      "SECRET_BATTLE_PAYLOAD",
    );
    expect(closePool).toHaveBeenCalledOnce();
    expect(closePool).toHaveBeenCalledWith(pools[0], "pool-client-error");
    expect(runtime.getDatabase()).toEqual({ poolId: 2 });

    pools[0]?.onError?.(new Error("late stale error"));
    expect(closePool).toHaveBeenCalledOnce();
  });
});
