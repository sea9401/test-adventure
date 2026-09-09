import { describe, expect, it, vi } from "vitest";
import {
  formatOfflineSpecialtyDrops,
  settleOfflineHuntBatches,
} from "./offlineSettleApi";

describe("settleOfflineHuntBatches", () => {
  it("오프라인 정산의 특화 장비 이름과 중복 횟수를 표시용 문구로 만든다", () => {
    expect(formatOfflineSpecialtyDrops([
      "v2_unexplored_iron_line_armor",
      "v2_unexplored_iron_line_armor",
      "v2_unexplored_iron_line_gloves",
    ])).toBe(" · 특화 장비 철갑 전열갑 ×2, 장창 수호완갑 ×1");
  });

  it("releases the server between batches and aggregates the result", async () => {
    const responses = [
      Response.json({
        ok: true,
        battles: 50,
        wins: 40,
        losses: 10,
        totalExp: 500,
        totalGold: 200,
        depth: 4,
        remainingBattles: 10,
        droppedSpecialties: ["v2_unexplored_iron_line_armor"],
      }),
      Response.json({
        ok: true,
        battles: 10,
        wins: 8,
        losses: 2,
        totalExp: 100,
        totalGold: 40,
        depth: 4,
        remainingBattles: 0,
        droppedSpecialties: ["v2_unexplored_iron_line_gloves"],
      }),
    ];
    const fetcher = vi.fn(async () => responses.shift()!);
    const wait = vi.fn(async () => undefined);

    const result = await settleOfflineHuntBatches(
      fetcher as unknown as typeof fetch,
      wait,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      battles: 60,
      wins: 48,
      losses: 12,
      totalExp: 600,
      totalGold: 240,
      depth: 4,
      remainingBattles: 0,
      droppedSpecialties: [
        "v2_unexplored_iron_line_armor",
        "v2_unexplored_iron_line_gloves",
      ],
    });
  });

  it("stops immediately when the feature is disabled", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ ok: true, disabled: true, battles: 0 }),
    );
    const result = await settleOfflineHuntBatches(
      fetcher as unknown as typeof fetch,
      vi.fn(async () => undefined),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.battles).toBe(0);
  });

  it("정지 조건 사유를 유지하고 남은 판수가 0이면 추가 요청하지 않는다", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        ok: true,
        battles: 1,
        wins: 1,
        remainingBattles: 0,
        stoppedReason: "rare_map",
      }),
    );
    const result = await settleOfflineHuntBatches(
      fetcher as unknown as typeof fetch,
      vi.fn(async () => undefined),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      battles: 1,
      stoppedReason: "rare_map",
      remainingBattles: 0,
    });
  });
});
