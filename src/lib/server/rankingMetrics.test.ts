import { describe, expect, it } from "vitest";
import {
  codexCompletionRankingFromSaves,
  lifeMasteryRankingFromSaves,
} from "./rankingMetrics";

describe("rankingMetrics", () => {
  it("농사·벌목·채광·낚시 레벨을 생활 숙련도로 합산한다", () => {
    const ranking = lifeMasteryRankingFromSaves({
      farmRaw: { stats: { farmingXp: 160 } },
      woodcuttingRaw: { cuts: 20, xp: 200 },
      miningRaw: { successes: 20, xp: 200 },
      fishingRaw: { xp: 200 },
    });

    expect(ranking.totalLevel).toBe(
      ranking.farmingLevel +
        ranking.woodcuttingLevel +
        ranking.miningLevel +
        ranking.fishingLevel,
    );
    expect(ranking.totalXp).toBe(760);
  });

  it("직업·장비·어보 수집 진척만 도감 완성도에 포함한다", () => {
    const empty = codexCompletionRankingFromSaves({
      characterRaw: { class: "warrior" },
      proficiencyRaw: { groups: { warrior: { cumLevel: 1 } } },
    });
    const collected = codexCompletionRankingFromSaves({
      characterRaw: { class: "warrior" },
      proficiencyRaw: { groups: { warrior: { cumLevel: 1 } } },
      equipmentCodexRaw: { registeredIds: ["v2_iron_sword"] },
      fishingCodexRaw: {
        fish: { carp: { discovered: true, bestSize: 40, totalCaught: 1 } },
      },
    });

    expect(collected.jobUnlocked).toBe(empty.jobUnlocked);
    expect(collected.equipmentRegistered).toBe(1);
    expect(collected.fishDiscovered).toBe(1);
    expect(collected.collected).toBe(empty.collected + 2);
    expect(collected.total).toBe(empty.total);
  });
});
