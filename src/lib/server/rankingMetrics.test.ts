import { describe, expect, it } from "vitest";
import { farmingLevelXpThreshold } from "@/adventure/v2/farm";
import { woodcuttingXpForLevel } from "@/adventure/v2/woodcuttingProgression";
import { miningXpForLevel } from "@/adventure/v2/miningProgression";
import { fishingLevelXpThreshold } from "@/adventure/v2/fishingProgression";
import { cookingLevelXpThreshold } from "@/adventure/v2/cooking/state";
import {
  codexCompletionRankingFromSaves,
  lifeMasteryRankingFromSaves,
} from "./rankingMetrics";

describe("rankingMetrics", () => {
  it.each([
    { farming: 79, fishing: 79, cooking: 95, total: 453 },
    { farming: 100, fishing: 100, cooking: 100, total: 500 },
  ])("농사 $farming 레벨을 제한 없이 합산해 숙련도 $total 을 반환한다", ({ farming, fishing, cooking, total }) => {
    const ranking = lifeMasteryRankingFromSaves({
      farmRaw: {
        levelCurveVersion: 2,
        stats: { farmingXp: farmingLevelXpThreshold(farming) },
      },
      woodcuttingRaw: { levelCurveVersion: 2, xp: woodcuttingXpForLevel(100) },
      miningRaw: { levelCurveVersion: 2, xp: miningXpForLevel(100) },
      fishingRaw: { levelCurveVersion: 2, xp: fishingLevelXpThreshold(fishing) },
      cookingRaw: { levelCurveVersion: 2, xp: cookingLevelXpThreshold(cooking) },
    });

    expect(ranking.totalLevel).toBe(total);
    expect(ranking).toMatchObject({
      farmingLevel: farming,
      woodcuttingLevel: 100,
      miningLevel: 100,
      fishingLevel: fishing,
      cookingLevel: cooking,
    });
  });

  it("농사·벌목·채광·낚시·요리 레벨을 생활 숙련도로 합산한다", () => {
    const ranking = lifeMasteryRankingFromSaves({
      farmRaw: { stats: { farmingXp: 160 } },
      woodcuttingRaw: { cuts: 20, xp: 200 },
      miningRaw: { successes: 20, xp: 200 },
      fishingRaw: { xp: 200 },
      cookingRaw: { xp: 200 },
    });

    expect(ranking.totalLevel).toBe(
      ranking.farmingLevel +
        ranking.woodcuttingLevel +
        ranking.miningLevel +
        ranking.fishingLevel +
        ranking.cookingLevel,
    );
    expect(ranking.totalXp).toBe(960);
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

  it("표본 등록권은 도감 완성도에 포함하고 추출 뒤 남은 포획 기록은 포함하지 않는다", () => {
    const registered = codexCompletionRankingFromSaves({
      fishingCodexRaw: {
        fish: { carp: { registered: true, caughtEver: false } },
      },
    });
    const extracted = codexCompletionRankingFromSaves({
      fishingCodexRaw: {
        fish: {
          carp: {
            registered: false,
            caughtEver: true,
            bestSize: 40,
            totalCaught: 3,
          },
        },
      },
    });

    expect(registered.fishDiscovered).toBe(1);
    expect(extracted.fishDiscovered).toBe(0);
  });
});
