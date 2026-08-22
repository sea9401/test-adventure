import { describe, expect, it } from "vitest";
import { materialSellPriceOf } from "./dungeonDrops";
import {
  DANGEROUS_BAITS,
  DANGEROUS_BOSSES,
  DANGEROUS_DEPTHS,
  DANGEROUS_FISH,
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
  DANGEROUS_ZONES,
  dangerousBossMaterialId,
  dangerousCatchMaterialId,
  isDangerousBaitId,
  isDangerousCatchMaterialId,
  isDangerousFishId,
  isDangerousZoneId,
} from "./dangerousFishing";

describe("위험 해역 출시 카탈로그", () => {
  it("세 해역과 세 수심에 어종을 분산하고 잘못된 ID를 거부한다", () => {
    expect(Object.keys(DANGEROUS_ZONES)).toEqual([
      "shattered_reef",
      "storm_trench",
      "abyssal_rift",
    ]);
    expect(Object.keys(DANGEROUS_DEPTHS)).toEqual([
      "surface",
      "midwater",
      "deep",
    ]);
    expect(Object.keys(DANGEROUS_FISH)).toHaveLength(18);
    expect(new Set(Object.values(DANGEROUS_FISH).map((fish) => fish.zoneId))).toEqual(
      new Set(["shattered_reef", "storm_trench", "abyssal_rift"]),
    );
    expect(new Set(Object.values(DANGEROUS_FISH).map((fish) => fish.depthId))).toEqual(
      new Set(["surface", "midwater", "deep"]),
    );
    for (const zoneId of Object.keys(DANGEROUS_ZONES)) {
      const zoneFish = Object.values(DANGEROUS_FISH).filter(
        (fish) => fish.zoneId === zoneId,
      );
      expect(zoneFish).toHaveLength(6);
      for (const depthId of Object.keys(DANGEROUS_DEPTHS)) {
        expect(zoneFish.filter((fish) => fish.depthId === depthId)).toHaveLength(2);
      }
    }
    expect(isDangerousZoneId("storm_trench")).toBe(true);
    expect(isDangerousZoneId("toString")).toBe(false);
    expect(isDangerousFishId("ironjaw_tuna")).toBe(true);
    expect(isDangerousFishId("unknown_fish")).toBe(false);
  });

  it("무료 스타터 세트와 비싼 영구 장비 가격대를 제공한다", () => {
    expect(DANGEROUS_RODS.starter_rod.price).toBe(0);
    expect(DANGEROUS_REELS.starter_reel.price).toBe(0);
    expect(DANGEROUS_LINES.starter_line.price).toBe(0);

    const paidPrices = [
      ...Object.values(DANGEROUS_RODS),
      ...Object.values(DANGEROUS_REELS),
      ...Object.values(DANGEROUS_LINES),
    ]
      .map((gear) => gear.price)
      .filter((price) => price > 0);
    expect(Math.min(...paidPrices)).toBeGreaterThanOrEqual(15_000);
    expect(Math.max(...paidPrices)).toBeGreaterThanOrEqual(100_000);
  });

  it("기본 미끼는 무제한 무료이며 특수 미끼 묶음은 500~3,000 코인이다", () => {
    expect(DANGEROUS_BAITS.basic_bait).toMatchObject({
      price: 0,
      unlimited: true,
    });
    for (const bait of Object.values(DANGEROUS_BAITS)) {
      if (bait.id === "basic_bait") continue;
      expect(bait.unlimited).toBe(false);
      expect(bait.price).toBeGreaterThanOrEqual(500);
      expect(bait.price).toBeLessThanOrEqual(3_000);
      expect(bait.packSize).toBeGreaterThan(0);
    }
    expect(isDangerousBaitId("luminous_bait")).toBe(true);
    expect(isDangerousBaitId("constructor")).toBe(false);
  });

  it("미끼가 목표 희귀도 출현 가중치와 실시간 조우 효과를 함께 제공한다", () => {
    expect(DANGEROUS_BAITS.reef_bait).toMatchObject({
      targetBehaviors: ["turn"],
      targetRarities: ["common", "rare"],
      rarityBonus: 0.25,
      realtimeEffect: {
        turnDistanceRecoveryReductionPct: 20,
        turnTensionImpactReductionPct: 20,
        maxTimeReductionPct: 20,
      },
    });
    expect(DANGEROUS_BAITS.blood_bait).toMatchObject({
      targetRarities: ["rare", "epic"],
      rarityBonus: 0.4,
    });
    expect(DANGEROUS_BAITS.luminous_bait).toMatchObject({
      targetRarities: ["epic", "legendary"],
      rarityBonus: 0.65,
    });
    expect(DANGEROUS_BAITS.abyss_bait).toMatchObject({
      targetRarities: ["legendary"],
      rarityBonus: 1,
    });
    expect(DANGEROUS_BAITS.abyss_bait.realtimeEffect).toMatchObject({
      startingStaminaReductionPct: 10,
      tensionImpulseReductionPct: 12,
      maxTimeReductionPct: 10,
    });
  });

  it("거대어 두 종과 충돌 없는 거래 재료 ID를 만든다", () => {
    expect(Object.keys(DANGEROUS_BOSSES)).toEqual([
      "tidal_colossus",
      "abyss_kraken",
    ]);
    const materialIds = [
      ...Object.keys(DANGEROUS_FISH).map((id) => dangerousCatchMaterialId(id)),
      ...Object.keys(DANGEROUS_BOSSES).map((id) => dangerousBossMaterialId(id)),
    ];
    expect(new Set(materialIds).size).toBe(20);
    expect(materialIds).toContain("danger_catch_ironjaw_tuna");
    expect(materialIds).toContain("danger_boss_abyss_kraken");
    expect(materialIds.every(isDangerousCatchMaterialId)).toBe(true);
    expect(isDangerousCatchMaterialId("danger_catch_unknown")).toBe(false);
  });

  it("일반 위험 어획물만 화물 가치의 10배로 NPC 판매할 수 있다", () => {
    const expectedPrices = {
      danger_catch_razor_sardine: 800,
      danger_catch_ironjaw_tuna: 2_100,
      danger_catch_reef_maw_grouper: 4_300,
      danger_catch_glassscale_herring: 950,
      danger_catch_coralhorn_snapper: 2_400,
      danger_catch_trenchshell_sturgeon: 4_800,
      danger_catch_storm_mackerel: 1_500,
      danger_catch_thunder_ray: 3_300,
      danger_catch_tempest_swordfish: 6_800,
      danger_catch_gale_needlefish: 1_750,
      danger_catch_stormbell_sunfish: 3_650,
      danger_catch_cyclone_marlin: 7_400,
      danger_catch_lantern_eel: 3_900,
      danger_catch_voidfin_coelacanth: 7_900,
      danger_catch_abyssal_crownfish: 13_500,
      danger_catch_ghostlight_jellyfish: 4_300,
      danger_catch_nightglass_shark: 8_600,
      danger_catch_starless_leviathan: 15_000,
    } as const;

    for (const [materialId, expectedPrice] of Object.entries(expectedPrices)) {
      expect(materialSellPriceOf(materialId)).toBe(expectedPrice);
    }
    expect(materialSellPriceOf(dangerousBossMaterialId("tidal_colossus"))).toBeUndefined();
    expect(materialSellPriceOf(dangerousBossMaterialId("abyss_kraken"))).toBeUndefined();
  });

  it("모든 위험 해역 카탈로그 항목에 ID 기반 이미지 경로가 있다", () => {
    expect(DANGEROUS_ZONES.shattered_reef.imageSrc).toBe(
      "/images/ui/dangerous-fishing-shattered-reef.webp",
    );
    for (const fish of Object.values(DANGEROUS_FISH)) {
      expect(fish.imageSrc).toBe(`/images/fish/${fish.id}.webp`);
    }
    expect(DANGEROUS_BOSSES.abyss_kraken.imageSrc).toBe(
      "/images/fish/abyss_kraken.webp",
    );
    expect(DANGEROUS_REELS.current_reel.imageSrc).toBe(
      "/images/items/fishing/dangerous/current_reel.webp",
    );
    expect(DANGEROUS_BAITS.luminous_bait.imageSrc).toBe(
      "/images/items/fishing/dangerous/luminous_bait.webp",
    );
  });

  it("실시간 조우용 배경과 거대어 몸부림 시트 경로를 제공한다", () => {
    const encounterImageByZone = {
      shattered_reef:
        "/images/ui/dangerous-fishing-shattered-reef-encounter.webp",
      storm_trench:
        "/images/ui/dangerous-fishing-storm-trench-encounter.webp",
      abyssal_rift:
        "/images/ui/dangerous-fishing-abyssal-rift-encounter.webp",
    } as const;

    for (const zone of Object.values(DANGEROUS_ZONES)) {
      expect(zone.encounterImageSrc).toBe(encounterImageByZone[zone.id]);
    }
    for (const boss of Object.values(DANGEROUS_BOSSES)) {
      expect(boss.struggleSpriteSrc).toMatch(/-struggle\.webp$/);
    }
  });
});
