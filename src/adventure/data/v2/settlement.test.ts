import { describe, it, expect } from "vitest";
import {
  nextTier,
  tierMeetsNation,
  NATION_REQUIRED_TIER,
  canUpgrade,
  applyUpgradeCost,
  isValidVillageName,
  MAX_SLOTS_BY_TIER,
  GRID_COLS_BY_TIER,
  GRID_DISPLAY_COLS,
  GRID_DISPLAY_SLOTS,
  INITIAL_UNLOCKED_SLOTS,
  clampUnlockedSlots,
  canUnlockSlot,
  slotUnlockGoldCost,
  SLOT_UNLOCK_GOLD_BASE,
  SLOT_UNLOCK_GOLD_STEP,
  UPGRADE_COST,
  PLACEABLE_SETTLEMENT_BUILDING_IDS,
  GUILD_SMITHY_UPGRADES,
  TRAINING_GROUND_UPGRADES,
  EXPLORATION_HQ_UPGRADES,
  ALCHEMY_WORKSHOP_UPGRADES,
  DINING_HALL_UPGRADES,
  TRADE_POST_UPGRADES,
  GUILD_WAREHOUSE_UPGRADES,
  SETTLEMENT_RESOURCE_KEYS,
  canAffordSettlementBuildingUpgrade,
  explorationHqUpgradeForLevel,
  alchemyWorkshopUpgradeForLevel,
  diningHallUpgradeForLevel,
  tradePostUpgradeForLevel,
  guildWarehouseUpgradeForLevel,
  mapWorkshopUpgradeForLevel,
  nextSettlementBuildingUpgrade,
  settlementBuildingUpgradeSummary,
  trainingGroundUpgradeForLevel,
} from "./settlement";
import { WOODCUTTING_MATERIAL_ID } from "./woodcuttingSpots";
import { MINING_MATERIAL_ID } from "./miningSpots";
import { terrainTraitOf } from "./outposts";

// [PR-3] 슬롯 생산(produce/harvest) 폐지 — isHarvestReady/harvestYield/tryStartProduction 등
//   생산 헬퍼 테스트는 함수와 함께 삭제. 정착지 업글·칸 해금·검증 테스트만 유지.

describe("settlement — 정착지(업그레이드·칸 해금)", () => {
  it("nextTier — 마을→도시→대도시→null", () => {
    expect(nextTier("village")).toBe("city");
    expect(nextTier("city")).toBe("metropolis");
    expect(nextTier("metropolis")).toBe(null);
  });

  it("MAX_SLOTS_BY_TIER — 마을별 1슬롯 고정", () => {
    expect(MAX_SLOTS_BY_TIER.village).toBe(1);
    expect(MAX_SLOTS_BY_TIER.city).toBe(1);
    expect(MAX_SLOTS_BY_TIER.metropolis).toBe(1);
    expect(GRID_COLS_BY_TIER.village).toBe(1);
    expect(GRID_COLS_BY_TIER.city).toBe(1);
    expect(GRID_COLS_BY_TIER.metropolis).toBe(1);
    // 최종 판 크기 = cols² 일관성(1×1 = 1칸).
    expect(MAX_SLOTS_BY_TIER.metropolis).toBe(GRID_COLS_BY_TIER.metropolis ** 2);
    expect(GRID_DISPLAY_COLS).toBe(GRID_COLS_BY_TIER.metropolis); // 1
    expect(GRID_DISPLAY_SLOTS).toBe(MAX_SLOTS_BY_TIER.metropolis); // 1
  });

  it("훈련장은 배치 가능 건물이며 Lv5에서 일일 훈련 3회와 보상 +50%를 연다", () => {
    expect(PLACEABLE_SETTLEMENT_BUILDING_IDS).toContain("training_ground");
    expect(nextSettlementBuildingUpgrade("training_ground", 1)).toMatchObject({
      level: 2,
    });
    expect(trainingGroundUpgradeForLevel(5)).toMatchObject({
      trainingRewardBonusPct: 50,
      unlockedDrillCount: 3,
    });
  });

  it("탐사 본부는 배치 가능 건물이며 Lv5에서 의뢰 6종과 진척 +35%를 연다", () => {
    expect(PLACEABLE_SETTLEMENT_BUILDING_IDS).toContain("exploration_hq");
    expect(nextSettlementBuildingUpgrade("exploration_hq", 1)).toMatchObject({
      level: 2,
      cost: { crop: 500, ore: 500, gold: 22_000_000, fame: 0 },
      weeklyMissionCount: 2,
      missionProgressBonusPct: 10,
    });
    expect(explorationHqUpgradeForLevel(5)).toMatchObject({
      cost: {
        [WOODCUTTING_MATERIAL_ID.willow]: 2000,
        [MINING_MATERIAL_ID.silver]: 2000,
        [WOODCUTTING_MATERIAL_ID.oak]: 1500,
        [MINING_MATERIAL_ID.gold]: 1500,
        [WOODCUTTING_MATERIAL_ID.cedar]: 1000,
        [MINING_MATERIAL_ID.mythril]: 1000,
        [WOODCUTTING_MATERIAL_ID.cypress]: 500,
        [MINING_MATERIAL_ID.adamantite]: 500,
        gold: 175_000_000,
        fame: 2800,
      },
      weeklyMissionCount: 6,
      missionProgressBonusPct: 35,
    });
    expect(
      settlementBuildingUpgradeSummary(
        "exploration_hq",
        explorationHqUpgradeForLevel(5),
      ),
    ).toBe("해금 의뢰 6종 · 진척 +35%");
  });

  it("연금 공방은 배치 가능 건물이며 레벨별 주간 연성력을 12~30 제공한다", () => {
    expect(PLACEABLE_SETTLEMENT_BUILDING_IDS).toContain("alchemy_workshop");
    expect(nextSettlementBuildingUpgrade("alchemy_workshop", 1)).toMatchObject({
      level: 2,
      cost: { crop: 500, ore: 500, gold: 20_000_000, fame: 0 },
      weeklyEnergy: 16,
    });
    expect(alchemyWorkshopUpgradeForLevel(5)).toMatchObject({
      weeklyEnergy: 30,
      label: "대연금 연구소",
    });
    expect(
      settlementBuildingUpgradeSummary(
        "alchemy_workshop",
        alchemyWorkshopUpgradeForLevel(5),
      ),
    ).toBe("주간 연성력 30 · 조제법 Lv.5");
  });

  it("길드 식당은 레벨마다 운영 메뉴가 늘고 Lv5에서 기여 식권 5장을 연다", () => {
    expect(PLACEABLE_SETTLEMENT_BUILDING_IDS).toContain("dining_hall");
    expect(DINING_HALL_UPGRADES.map((upgrade) => upgrade.weeklyMenuSlots)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(nextSettlementBuildingUpgrade("dining_hall", 1)).toMatchObject({
      level: 2,
      cost: { crop: 500, ore: 500, gold: 20_000_000, fame: 0 },
      weeklyMealTickets: 2,
      weeklyMenuSlots: 2,
    });
    expect(diningHallUpgradeForLevel(4)).toMatchObject({
      weeklyMealTickets: 4,
      weeklyMenuSlots: 4,
    });
    expect(diningHallUpgradeForLevel(5)).toMatchObject({
      weeklyMealTickets: 5,
      weeklyMenuSlots: 5,
      label: "길드 대연회장",
    });
    expect(
      settlementBuildingUpgradeSummary(
        "dining_hall",
        diningHallUpgradeForLevel(5),
      ),
    ).toBe("기본 식권 1장 + 기여 식권 5장 · 메뉴 5종");
  });

  it("길드 교역소는 매 레벨 토큰·납품 한도·완료 보상을 크게 높인다", () => {
    expect(PLACEABLE_SETTLEMENT_BUILDING_IDS).toContain("trade_post");
    expect(nextSettlementBuildingUpgrade("trade_post", 1)).toMatchObject({
      level: 2,
      cost: { crop: 500, ore: 500, gold: 25_000_000, fame: 0 },
      weeklyContractCount: 3,
      personalContributionCap: 200,
      tokenYieldBonusPct: 70,
      completionRewardBonusPct: 25,
    });
    expect(tradePostUpgradeForLevel(5)).toMatchObject({
      weeklyContractCount: 5,
      personalContributionCap: 600,
      tokenYieldBonusPct: 220,
      completionRewardBonusPct: 100,
      label: "왕립 교역 연합소",
    });
    expect(
      settlementBuildingUpgradeSummary(
        "trade_post",
        tradePostUpgradeForLevel(5),
      ),
    ).toBe(
      "주간 계약 5건 · 개인 납품 600점 · 토큰 +220% · 완료 보상 +100%",
    );
  });

  it("길드 창고는 배치 가능하며 레벨마다 슬롯이 2칸씩 늘어난다", () => {
    expect(PLACEABLE_SETTLEMENT_BUILDING_IDS).toContain("guild_warehouse");
    expect(GUILD_WAREHOUSE_UPGRADES.map((upgrade) => upgrade.capacity)).toEqual([
      1, 3, 5, 7, 9,
    ]);
    expect(nextSettlementBuildingUpgrade("guild_warehouse", 1)).toMatchObject({
      level: 2,
      cost: { crop: 500, ore: 500, gold: 20_000_000, fame: 0 },
      capacity: 3,
    });
    expect(guildWarehouseUpgradeForLevel(5)).toMatchObject({
      capacity: 9,
      label: "왕립 공동 창고",
    });
    expect(
      settlementBuildingUpgradeSummary(
        "guild_warehouse",
        guildWarehouseUpgradeForLevel(5),
      ),
    ).toBe("아이템 보관 슬롯 9칸");
  });

  it("시설 재료 비용은 Lv2~5에서 기존 대비 2~5배이며 Lv2 명성은 무료다", () => {
    for (const upgrades of [
      GUILD_SMITHY_UPGRADES,
      TRAINING_GROUND_UPGRADES,
      EXPLORATION_HQ_UPGRADES,
      ALCHEMY_WORKSHOP_UPGRADES,
      DINING_HALL_UPGRADES,
      TRADE_POST_UPGRADES,
      GUILD_WAREHOUSE_UPGRADES,
    ]) {
      expect(upgrades[1].cost.fame).toBe(0);
      expect(upgrades[1].cost).toMatchObject({ crop: 500, ore: 500 });
      expect(upgrades[2].cost).toMatchObject({
        crop: 900,
        ore: 900,
        [WOODCUTTING_MATERIAL_ID.birch]: 600,
        [MINING_MATERIAL_ID.copper]: 600,
      });
      expect(upgrades[3].cost).toMatchObject({
        [WOODCUTTING_MATERIAL_ID.birch]: 1400,
        [MINING_MATERIAL_ID.copper]: 1400,
        [WOODCUTTING_MATERIAL_ID.willow]: 1000,
        [MINING_MATERIAL_ID.silver]: 1000,
        [WOODCUTTING_MATERIAL_ID.oak]: 600,
        [MINING_MATERIAL_ID.gold]: 600,
      });
      expect(upgrades[4].cost).toMatchObject({
        [WOODCUTTING_MATERIAL_ID.willow]: 2000,
        [MINING_MATERIAL_ID.silver]: 2000,
        [WOODCUTTING_MATERIAL_ID.oak]: 1500,
        [MINING_MATERIAL_ID.gold]: 1500,
        [WOODCUTTING_MATERIAL_ID.cedar]: 1000,
        [MINING_MATERIAL_ID.mythril]: 1000,
        [WOODCUTTING_MATERIAL_ID.cypress]: 500,
        [MINING_MATERIAL_ID.adamantite]: 500,
      });
    }
  });

  it("시설별 Lv5 누적 비용은 재료 2만 개이며 골드 비중과 명성 절감치를 고정한다", () => {
    const totals = [
      GUILD_SMITHY_UPGRADES,
      TRAINING_GROUND_UPGRADES,
      EXPLORATION_HQ_UPGRADES,
      ALCHEMY_WORKSHOP_UPGRADES,
      DINING_HALL_UPGRADES,
      TRADE_POST_UPGRADES,
      GUILD_WAREHOUSE_UPGRADES,
    ].map((upgrades) => ({
      materials: upgrades
        .slice(1)
        .reduce(
          (sum, upgrade) =>
            sum +
            SETTLEMENT_RESOURCE_KEYS.reduce(
              (resourceSum, key) => resourceSum + (upgrade.cost[key] ?? 0),
              0,
            ),
          0,
        ),
      gold: upgrades
        .slice(1)
        .reduce((sum, upgrade) => sum + (upgrade.cost.gold ?? 0), 0),
      fame: upgrades
        .slice(1)
        .reduce((sum, upgrade) => sum + (upgrade.cost.fame ?? 0), 0),
    }));
    expect(totals).toEqual([
      { materials: 20_000, gold: 315_000_000, fame: 4_350 },
      { materials: 20_000, gold: 380_000_000, fame: 5_350 },
      { materials: 20_000, gold: 347_000_000, fame: 5_000 },
      { materials: 20_000, gold: 315_000_000, fame: 4_350 },
      { materials: 20_000, gold: 315_000_000, fame: 4_350 },
      { materials: 20_000, gold: 380_000_000, fame: 5_350 },
      { materials: 20_000, gold: 315_000_000, fame: 4_350 },
    ]);
  });

  it("시설 재료 검증은 비용에 포함된 모든 등급을 확인한다", () => {
    const cost = GUILD_SMITHY_UPGRADES[2].cost;
    const resources = Object.fromEntries(
      SETTLEMENT_RESOURCE_KEYS.map((key) => [key, cost[key] ?? 0]),
    );
    expect(canAffordSettlementBuildingUpgrade(resources, cost)).toBe(true);
    expect(
      canAffordSettlementBuildingUpgrade(
        { ...resources, [WOODCUTTING_MATERIAL_ID.birch]: 599 },
        cost,
      ),
    ).toBe(false);
  });

  it("지도 제작소는 임시 비활성화되어 신규 배치 목록에서 제외된다", () => {
    expect(PLACEABLE_SETTLEMENT_BUILDING_IDS).not.toContain("map_workshop");
    expect(nextSettlementBuildingUpgrade("map_workshop", 1)).toMatchObject({
      level: 2,
      cost: { crop: 500, ore: 400 },
      fragmentDiscountPct: 10,
    });
    expect(mapWorkshopUpgradeForLevel(5)).toMatchObject({
      fragmentDiscountPct: 25,
    });
    expect(
      settlementBuildingUpgradeSummary(
        "map_workshop",
        mapWorkshopUpgradeForLevel(5),
      ),
    ).toBe("지도 조각 비용 -25%");
  });

  it("INITIAL_UNLOCKED_SLOTS=0 / clampUnlockedSlots — [0, 최대]로 보정", () => {
    expect(INITIAL_UNLOCKED_SLOTS).toBe(0);
    expect(clampUnlockedSlots("village", 0)).toBe(0); // 건설 직후 빈 판
    expect(clampUnlockedSlots("village", 9)).toBe(1); // 마을 판 최대 1
    expect(clampUnlockedSlots("village", 1)).toBe(1);
    expect(clampUnlockedSlots("city", 9)).toBe(1);
    expect(clampUnlockedSlots("city", 99)).toBe(1);
    expect(clampUnlockedSlots("metropolis", 99)).toBe(1);
    expect(clampUnlockedSlots("village", -2)).toBe(0);
    expect(clampUnlockedSlots("village", NaN)).toBe(0);
    expect(clampUnlockedSlots("village", 2.5)).toBe(0);
  });

  it("canUpgrade — 판 다 채우고 재화 충분해야 ok(needSlots/insufficient 구분)", () => {
    const cost = UPGRADE_COST.village!; // 마을→도시 비용
    // 마을 판(1칸)을 열고 비용 충족 → ok.
    expect(
      canUpgrade("village", 1, { crop: cost.crop!, ore: cost.ore! }),
    ).toEqual({ ok: true, next: "city", missing: [], needSlots: false });
    // 재화 부족 → ok false, missing.
    const r = canUpgrade("village", 1, { crop: cost.crop!, ore: 0 });
    expect(r.ok).toBe(false);
    expect(r.next).toBe("city");
    expect(r.missing).toContain("ore");
    expect(r.needSlots).toBe(false);
    // 칸 미해금(판 안 참) → 재화 충분해도 needSlots 로 막힘.
    const s = canUpgrade("village", 0, { crop: 99999, ore: 99999 });
    expect(s.ok).toBe(false);
    expect(s.needSlots).toBe(true);
    // 최종 단계는 업그레이드 없음.
    expect(canUpgrade("metropolis", 1, { crop: 99999 })).toMatchObject({
      ok: false,
      next: null,
    });
  });

  it("칸 해금 — 첫 칸 유료(5천만)·1칸 가득(atMax)", () => {
    // 첫 칸(해금 0개)=base. step 은 후속 슬롯 확장용 다이얼로 유지.
    expect(slotUnlockGoldCost(0)).toBe(SLOT_UNLOCK_GOLD_BASE);
    expect(slotUnlockGoldCost(1)).toBe(SLOT_UNLOCK_GOLD_BASE + SLOT_UNLOCK_GOLD_STEP);
    expect(SLOT_UNLOCK_GOLD_BASE).toBe(50_000_000); // 첫 칸 5천만
    expect(SLOT_UNLOCK_GOLD_BASE + SLOT_UNLOCK_GOLD_STEP).toBe(100_000_000); // 확장 시 둘째 1억
    // 첫 칸 = base 골드 필요(무료 아님).
    expect(canUnlockSlot("village", 0, SLOT_UNLOCK_GOLD_BASE).ok).toBe(true);
    expect(canUnlockSlot("village", 0, SLOT_UNLOCK_GOLD_BASE - 1).ok).toBe(false);
    // 마을 판 다 참(1칸) → atMax(골드 무관).
    expect(canUnlockSlot("village", 1, 9_999_999_999)).toMatchObject({
      ok: false,
      atMax: true,
    });
  });

  it("applyUpgradeCost — 비용만큼 차감, 음수로 안 감", () => {
    const cost = UPGRADE_COST.village!;
    const after = applyUpgradeCost("village", { crop: 500, ore: 300 });
    expect(after.crop).toBe(500 - cost.crop!);
    expect(after.ore).toBe(300 - cost.ore!);
    // 부족해도 음수 안 됨(0 클램프).
    expect(applyUpgradeCost("village", { crop: 10 }).crop).toBe(0);
  });

  it("isValidVillageName — 1~16자(트림), 빈/공백/초과 거부", () => {
    expect(isValidVillageName("샘플마을")).toBe(true);
    expect(isValidVillageName("a")).toBe(true);
    expect(isValidVillageName("  여백있음  ")).toBe(true); // 트림 후 유효
    expect(isValidVillageName("")).toBe(false);
    expect(isValidVillageName("   ")).toBe(false); // 공백뿐
    expect(isValidVillageName("x".repeat(16))).toBe(true);
    expect(isValidVillageName("x".repeat(17))).toBe(false);
  });

  it("terrainTraitOf — 타입 파생 + 오버라이드(거점 id 큐레이션 잠금)", () => {
    // 광산 type → 광맥
    expect(terrainTraitOf("kingdom_blackforge")).toBe("mine");
    expect(terrainTraitOf("war_central_mine")).toBe("mine");
    // 마을 type → farmland(숲)
    expect(terrainTraitOf("kingdom_sunderhold")).toBe("farmland");
    expect(terrainTraitOf("village_wheatfield")).toBe("farmland");
    // 요새/탑 → 평지
    expect(terrainTraitOf("war_central_fort")).toBe("plain");
    expect(terrainTraitOf("war_central_tower")).toBe("plain");
    // 물 테마 오버라이드 → lake(어장)(마을 type 이지만)
    expect(terrainTraitOf("city_river_haven")).toBe("lake");
    // 광맥 이름 마을 오버라이드 → 광맥
    expect(terrainTraitOf("village_oremouth")).toBe("mine");
    // 미지 거점 → 평지
    expect(terrainTraitOf("no_such_outpost")).toBe("plain");
  });

  it("tierMeetsNation — 대도시만 국가 선포 게이트 충족", () => {
    expect(NATION_REQUIRED_TIER).toBe("metropolis");
    expect(tierMeetsNation("metropolis")).toBe(true);
    expect(tierMeetsNation("city")).toBe(false);
    expect(tierMeetsNation("village")).toBe(false);
    // 손상/미지 tier 문자열은 충족 안 함(라우트 게이트가 막힘쪽으로 안전 fallback).
    expect(tierMeetsNation("garbage" as never)).toBe(false);
  });
});
