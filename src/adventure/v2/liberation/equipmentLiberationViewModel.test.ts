import { describe, expect, it } from "vitest";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import {
  LIBERATION_LINE_COUNT_CHANCES,
  enchantmentStage,
  liberationCandidateRows,
  liberationOptionProbabilityRows,
  liberationPromotionChancePct,
  liberationRankLevelSummary,
  formatLiberationOptionRoll,
} from "./equipmentLiberationViewModel";

describe("장비 해방 작업대 표시 모델", () => {
  const eligible: V2EquipInstance = {
    iid: "eligible",
    id: "v2_boss_catastrophe_gloves",
  };

  it("6T 이상 비개량 장비만 장착 우선 후보로 만든다", () => {
    const rows = liberationCandidateRows(
      [
        eligible,
        {
          iid: "equipped",
          id: "v2_boss_frozen_lake_armor",
          liberation: {
            rank: 2,
            lineCount: 2,
            revision: 4,
            options: [
              { id: "base_vit_pct", level: 8 },
              { id: "max_hp_pct", level: 10 },
            ],
          },
        },
        { iid: "storm", id: "v2_boss_frozen_lake_boots", stormRefined: true },
        { iid: "low", id: "v2_greatsword" },
      ],
      { armor: "equipped" },
    );

    expect(rows.map((row) => row.iid)).toEqual(["equipped", "eligible"]);
    expect(rows[0]).toMatchObject({ isEquipped: true, rank: 2, lineCount: 2 });
  });

  it("내부 등급을 오르는 방향의 마법부여 단계와 레벨 범위로 안내한다", () => {
    expect(LIBERATION_LINE_COUNT_CHANCES).toEqual([
      { lineCount: 1, chancePct: 50 },
      { lineCount: 2, chancePct: 35 },
      { lineCount: 3, chancePct: 15 },
    ]);
    expect(liberationPromotionChancePct(3)).toBe(5);
    expect(liberationPromotionChancePct(2)).toBe(1);
    expect(liberationPromotionChancePct(1)).toBe(0);
    expect(enchantmentStage(3)).toBe(1);
    expect(enchantmentStage(2)).toBe(2);
    expect(enchantmentStage(1)).toBe(3);
    expect(liberationRankLevelSummary(3)).toBe("마법부여 1단계 · Lv.1~5");
    expect(liberationRankLevelSummary(2)).toBe("마법부여 2단계 · Lv.5~10");
    expect(liberationRankLevelSummary(1)).toBe("마법부여 3단계 · Lv.10~20");
  });

  it("옵션 단위와 상대 가중치·첫 줄 실제 확률을 한 모델에서 제공한다", () => {
    expect(formatLiberationOptionRoll({ id: "skill_crit_damage_pp", level: 20 })).toBe(
      "스킬 치명타 피해 +40%p",
    );
    expect(formatLiberationOptionRoll({ id: "level_up_max_hp_growth", level: 20 })).toBe(
      "레벨업 시 최대 HP 추가 성장 +0~30",
    );

    const rows = liberationOptionProbabilityRows("gloves");
    const rare = rows.find((row) => row.id === "skill_crit_damage_pp");
    expect(rare).toMatchObject({ weight: 15 });
    expect(rare?.firstLineChancePct).toBeCloseTo(15 / 875 * 100, 6);
  });
});
