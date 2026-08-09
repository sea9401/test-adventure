import { describe, expect, it, vi } from "vitest";
import { createPoolRuntime } from "./poolRuntime";

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
});
