import { describe, expect, it } from "vitest";
import {
  FISHING_LURES,
  FISHING_RODS,
  addFishingCatchXp,
  buyFishingLure,
  buyFishingRod,
  emptyFishingProgression,
  equipFishingLure,
  equipFishingRod,
  fishingBonusesFromProgression,
  fishingGearPrice,
  fishingLevelBonuses,
  fishingLevelForXp,
  fishingLevelRewardCoins,
  fishingProgressionView,
  parseFishingProgression,
} from "./fishingProgression";

describe("낚시 진행도", () => {
  it("깨진 저장값은 기본 낚싯대/미끼로 복구한다", () => {
    const parsed = parseFishingProgression({
      xp: 42.9,
      catches: -3,
      ownedRods: ["reed_rod", "ghost_rod", "lacquered_rod"],
      equippedRodId: "ghost_rod",
      ownedLures: ["ghost_lure"],
      equippedLureId: "trophy_lure",
      fishCounts: { carp: 3.8, ghost_fish: 9, trout: -1 },
      claimedGoals: ["g_carp_20", 123, "g_carp_20"],
    });

    expect(parsed.xp).toBe(42);
    expect(parsed.catches).toBe(0);
    expect(parsed.fishCounts).toEqual({ carp: 3 });
    expect(parsed.claimedGoals).toEqual(["g_carp_20"]);
    expect(parsed.ownedRods).toEqual(["reed_rod", "lacquered_rod"]);
    expect(parsed.equippedRodId).toBe("reed_rod");
    expect(parsed.ownedLures).toEqual(["dough_lure"]);
    expect(parsed.equippedLureId).toBe("dough_lure");
  });

  it("성공 어획으로 경험치와 누적 어획을 올린다", () => {
    const result = addFishingCatchXp(emptyFishingProgression(), "carp");
    const view = fishingProgressionView(result.state);

    expect(result.xpGained).toBe(4);
    expect(result.state.catches).toBe(1);
    expect(result.state.fishCounts.carp).toBe(1);
    expect(view.level).toBe(1);
    expect(view.xpIntoLevel).toBe(4);
  });

  it("누적 목표는 어종별 누적 카운트로 완료된다", () => {
    let state = emptyFishingProgression();
    for (let i = 0; i < 25; i += 1) {
      state = addFishingCatchXp(state, "crucian_carp").state;
    }

    const goal = fishingProgressionView(state).goals.find(
      (g) => g.id === "g_crucian_25",
    );
    expect(goal?.progress).toBe(25);
    expect(goal?.claimable).toBe(true);
  });

  it("레벨은 경험치 곡선에 따라 상승하고 30에서 멈춘다", () => {
    expect(fishingLevelForXp(0)).toBe(1);
    expect(fishingLevelForXp(35)).toBe(2);
    expect(fishingLevelForXp(140)).toBe(3);
    expect(fishingLevelForXp(999_999)).toBe(30);
  });

  it("레벨 보너스는 씨알과 특별 손님 가중치만 제공한다", () => {
    expect(fishingLevelBonuses(1)).toEqual({
      waitReductionPct: 0,
      sizeBonusPct: 0,
      rareSizeBonusPct: 0,
      bigCatchSizeBonusPct: 0,
      specialWeightPct: 0,
    });
    expect(fishingLevelBonuses(5).sizeBonusPct).toBe(1);
    expect(fishingLevelBonuses(5).specialWeightPct).toBe(2);
    expect(fishingLevelBonuses(30).sizeBonusPct).toBe(7);
    expect(fishingLevelBonuses(30).specialWeightPct).toBe(14);
  });

  it("레벨업 코인 보상은 2레벨부터 주고 5레벨 단위에서 커진다", () => {
    expect(fishingLevelRewardCoins(1)).toBe(0);
    expect(fishingLevelRewardCoins(2)).toBe(40);
    expect(fishingLevelRewardCoins(5)).toBe(140);
    expect(fishingLevelRewardCoins(10)).toBe(240);
  });

  it("도구 구매는 보유 목록에 추가하고 즉시 장착한다", () => {
    const withRod = buyFishingRod(emptyFishingProgression(), "lacquered_rod");
    const withLure = buyFishingLure(withRod, "trophy_lure");

    expect(withLure.ownedRods).toContain("lacquered_rod");
    expect(withLure.equippedRodId).toBe("lacquered_rod");
    expect(withLure.ownedLures).toContain("trophy_lure");
    expect(withLure.equippedLureId).toBe("trophy_lure");
  });

  it("미보유 도구 장착은 거부하고 보유 도구 보정은 합산한다", () => {
    const base = emptyFishingProgression();
    expect(equipFishingRod(base, "master_rod")).toBeNull();

    const withGear = buyFishingLure(
      buyFishingRod(base, "deepcurrent_rod"),
      "tide_lure",
    );
    const equipped = equipFishingLure(withGear, "tide_lure");
    expect(equipped).not.toBeNull();

    const bonuses = fishingBonusesFromProgression(equipped ?? withGear);
    const view = fishingProgressionView(equipped ?? withGear);
    expect(view.levelBonuses).toEqual(fishingLevelBonuses(view.level));
    expect(bonuses.waitReductionPct).toBe(
      FISHING_RODS.deepcurrent_rod.bonuses.waitReductionPct,
    );
    expect(bonuses.specialWeightPct).toBe(
      FISHING_LURES.tide_lure.bonuses.specialWeightPct,
    );
    expect(bonuses.sizeBonusPct).toBe(
      FISHING_LURES.tide_lure.bonuses.sizeBonusPct,
    );
  });

  it("상점 도구 가격 조회는 등재 id만 허용한다", () => {
    expect(fishingGearPrice("rod", "lacquered_rod")).toBe(1200);
    expect(fishingGearPrice("rod", "storm_rod")).toBe(9000);
    expect(fishingGearPrice("lure", "trophy_lure")).toBe(1800);
    expect(fishingGearPrice("lure", "prism_lure")).toBe(5000);
    expect(fishingGearPrice("rod", "ghost_rod")).toBeNull();
  });
});
