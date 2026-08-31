import { describe, expect, it } from "vitest";
import type { DbExecutor } from "./savesKv";
import { readJobSpRebalanceState } from "./jobSpRollout";

function executorReturning(rows: Array<{ value: unknown }>): DbExecutor {
  const query = {
    from: () => query,
    where: () => query,
    limit: async () => rows,
  };
  return { select: () => query } as unknown as DbExecutor;
}

describe("readJobSpRebalanceState", () => {
  const startedAt = Date.UTC(2026, 7, 17, 0, 0, 0);

  it("ops 설정의 시작 시각을 24시간 유예 상태로 읽는다", async () => {
    const state = await readJobSpRebalanceState(
      executorReturning([{ value: { startedAt } }]),
      startedAt + 1,
    );

    expect(state).toEqual({
      startedAt,
      endsAt: startedAt + 24 * 60 * 60 * 1_000,
      active: true,
    });
  });

  it("설정 행이나 DB select가 없으면 신규 산식을 즉시 적용한다", async () => {
    expect(
      await readJobSpRebalanceState(executorReturning([]), startedAt),
    ).toEqual({ startedAt: null, endsAt: null, active: false });
    expect(
      await readJobSpRebalanceState({} as DbExecutor, startedAt),
    ).toEqual({ startedAt: null, endsAt: null, active: false });
  });
});
