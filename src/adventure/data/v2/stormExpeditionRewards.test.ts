import { describe, expect, it } from "vitest";
import { V2_MATERIALS } from "./dungeonDrops";
import { parseStormExpeditionState } from "./stormExpedition";
import {
  STORM_EXPEDITION_EQUIPMENT_IDS,
  STORM_EXPEDITION_UNIQUE_LOOT,
  STORM_HEART_FRAGMENT_MATERIAL_ID,
  STORM_EXPEDITION_MATERIALS,
  STORM_EXPEDITION_ROUTE_MATERIAL_ID,
  STORM_EXPEDITION_SP_FRUIT_CAP,
  STORM_EXPEDITION_SP_FRUIT_CHANCE,
  STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID,
  STORM_EXPEDITION_SP_FRUIT_PITY_CLEARS,
  STORM_ORIGIN_FRAGMENT_MATERIAL_ID,
  mergeStormExpeditionMaterials,
  rollStormExpeditionLoot,
  rollStormExpeditionUniqueLoot,
  rollStormExpeditionSpFruit,
} from "./stormExpeditionRewards";
import { V2_EQUIPMENT, v2EquipCatalogTierToDisplayTier } from "./v2Equipment";

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0.999999;
}

describe("폭풍 원정 보상", () => {
  it("6T 원정 유니크 확률은 수호자·최종 경로·교차·심장을 독립 규칙으로 둔다", () => {
    expect(STORM_EXPEDITION_UNIQUE_LOOT).toEqual({
      guardianRouteChance: 0.03,
      finalRouteChance: 0.07,
      finalCrossChance: 0.04,
      finalHeartChance: 0.01,
    });
  });

  it("수호자는 선택 항로 유니크만 3%로 굴린다", () => {
    expect(
      rollStormExpeditionUniqueLoot("gale", "guardian", sequence(0.029999)),
    ).toEqual({
      routeUniqueId: "v2_storm_sig_gale_orbit_boots",
      crossUniqueId: null,
      heartUniqueId: null,
      uniqueIds: ["v2_storm_sig_gale_orbit_boots"],
    });
    expect(
      rollStormExpeditionUniqueLoot("gale", "guardian", sequence(0.03))
        .uniqueIds,
    ).toEqual([]);
  });

  it("최종 보스는 경로 7%·교차 4%·심장 1%를 각각 굴린다", () => {
    expect(
      rollStormExpeditionUniqueLoot(
        "thunder",
        "final_boss",
        sequence(0.069999, 0.039999, 0.999, 0.009999),
      ),
    ).toEqual({
      routeUniqueId: "v2_storm_sig_thunder_return_ring",
      crossUniqueId: "v2_storm_sig_confluence_necklace",
      heartUniqueId: "v2_storm_sig_heart_necklace",
      uniqueIds: [
        "v2_storm_sig_thunder_return_ring",
        "v2_storm_sig_confluence_necklace",
        "v2_storm_sig_heart_necklace",
      ],
    });
  });

  it("교차 유니크 성공 시 두 후보를 균등 선택한다", () => {
    const first = rollStormExpeditionUniqueLoot(
      "wreckage",
      "final_boss",
      sequence(1, 0, 0, 1),
    );
    const second = rollStormExpeditionUniqueLoot(
      "wreckage",
      "final_boss",
      sequence(1, 0, 0.999, 1),
    );
    expect(first.crossUniqueId).toBe("v2_storm_sig_triphase_gloves");
    expect(second.crossUniqueId).toBe("v2_storm_sig_confluence_necklace");
  });

  it("일반·정예 전투는 원정 유니크 RNG를 소비하지 않는다", () => {
    for (const kind of ["early_trash", "late_trash", "elite"] as const) {
      let calls = 0;
      expect(
        rollStormExpeditionUniqueLoot("wreckage", kind, () => (calls++, 0)),
      ).toMatchObject({ uniqueIds: [] });
      expect(calls).toBe(0);
    }
  });

  it("폭풍 계약 2배는 경로·교차에만 적용하고 심장 확률은 유지한다", () => {
    const guardian = rollStormExpeditionUniqueLoot(
      "wreckage",
      "guardian",
      sequence(0.059999),
      { uniqueChanceMultiplier: 2 },
    );
    const final = rollStormExpeditionUniqueLoot(
      "wreckage",
      "final_boss",
      sequence(0.139999, 0.079999, 0, 0.01),
      { uniqueChanceMultiplier: 2 },
    );
    expect(guardian.routeUniqueId).toBe("v2_storm_sig_wreckage_power_armor");
    expect(final.routeUniqueId).toBe("v2_storm_sig_wreckage_power_armor");
    expect(final.crossUniqueId).toBe("v2_storm_sig_triphase_gloves");
    expect(final.heartUniqueId).toBeNull();
  });

  it("하루 3회 완주 기준 첫 유니크의 평균 획득 주기는 2~3일이다", () => {
    const rules = STORM_EXPEDITION_UNIQUE_LOOT;
    const anyUniqueChance = 1
      - (1 - rules.guardianRouteChance)
        * (1 - rules.finalRouteChance)
        * (1 - rules.finalCrossChance)
        * (1 - rules.finalHeartChance);

    expect(anyUniqueChance).toBeCloseTo(0.14264416, 8);
    expect(1 / (anyUniqueChance * 3)).toBeGreaterThanOrEqual(2);
    expect(1 / (anyUniqueChance * 3)).toBeLessThanOrEqual(3);
  });

  it("원정 전용 SP 열매 V를 지급한다", () => {
    expect(STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID).toBe("sp_fruit_5");
    expect(V2_MATERIALS[STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID]?.name).toBe(
      "SP 열매 V",
    );
  });

  it("항로 재료 3종·7차 선행 파편·최종 보스 조각을 카탈로그에 등록한다", () => {
    expect(Object.keys(STORM_EXPEDITION_MATERIALS)).toHaveLength(5);
    for (const id of Object.keys(STORM_EXPEDITION_MATERIALS)) {
      expect(V2_MATERIALS[id]?.name.length).toBeGreaterThan(0);
    }
    expect(V2_MATERIALS[STORM_ORIGIN_FRAGMENT_MATERIAL_ID]?.description).toContain(
      "7차 전직",
    );
  });

  it("각 항로 장비 풀은 표시 6티어 장신구만 담는다", () => {
    for (const ids of Object.values(STORM_EXPEDITION_EQUIPMENT_IDS)) {
      expect(ids.length).toBeGreaterThanOrEqual(4);
      for (const id of ids) {
        const item = V2_EQUIPMENT[id];
        expect(item).toBeDefined();
        expect(v2EquipCatalogTierToDisplayTier(item.tier)).toBe(6);
        expect(item.noDrop).toBe(true);
        expect(["ring", "necklace"]).toContain(item.slot);
      }
    }
  });

  it("초반 전투의 낮은 확률 보상도 통과하면 즉시 임시 전리품이 된다", () => {
    const loot = rollStormExpeditionLoot(
      "gale",
      0,
      sequence(0, 0, 0, 0),
    );
    expect(loot.materials).toEqual({
      [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 1,
      [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 1,
    });
    expect(STORM_EXPEDITION_EQUIPMENT_IDS.gale).toContain(loot.equipmentId);
  });

  it("초반 전투의 굴림이 모두 실패하면 빈 보상을 반환한다", () => {
    expect(
      rollStormExpeditionLoot("thunder", 0, sequence(0.9, 0.9, 0.9)),
    ).toEqual({ materials: {}, equipmentId: null });
  });

  it("폭풍 계약의 장비 확률 2배는 최종 확률로 굴린다", () => {
    const base = rollStormExpeditionLoot(
      "gale",
      "early_trash",
      sequence(0.9, 0.9, 0.0015, 0),
    );
    const contracted = rollStormExpeditionLoot(
      "gale",
      "early_trash",
      sequence(0.9, 0.9, 0.0015, 0),
      { equipmentChanceMultiplier: 2 },
    );
    expect(base.equipmentId).toBeNull();
    expect(contracted.equipmentId).toBe(STORM_EXPEDITION_EQUIPMENT_IDS.gale[0]);
  });

  it("항로 수호자는 항로 재료 2~3개를 보장하고 기원의 파편은 5%로 굴린다", () => {
    const low = rollStormExpeditionLoot(
      "wreckage",
      3,
      sequence(0, 0, 0.99),
    );
    const high = rollStormExpeditionLoot(
      "wreckage",
      3,
      sequence(0.999, 0.99, 0.99),
    );
    expect(low.materials).toEqual({
      [STORM_EXPEDITION_ROUTE_MATERIAL_ID.wreckage]: 2,
      [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 1,
    });
    expect(high.materials).toEqual({
      [STORM_EXPEDITION_ROUTE_MATERIAL_ID.wreckage]: 3,
    });
  });

  it("공통 최종 보스는 항로 재료 4~6개와 7차 재료·심장 조각을 확정한다", () => {
    const loot = rollStormExpeditionLoot("thunder", "final_boss", sequence(0.999, 0.99));
    expect(loot.materials).toEqual({
      [STORM_EXPEDITION_ROUTE_MATERIAL_ID.thunder]: 6,
      [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 1,
      [STORM_HEART_FRAGMENT_MATERIAL_ID]: 1,
    });
    expect(loot.equipmentId).toBeNull();
  });

  it("임시 재료를 기존 전리품과 누적한다", () => {
    expect(
      mergeStormExpeditionMaterials(
        { [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 2 },
        {
          [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 1,
          [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 1,
        },
      ),
    ).toEqual({
      [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: 3,
      [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: 1,
    });
  });

  it("SP 열매는 4% 굴림에 실패하면 항로 공용 천장을 한 번 누적한다", () => {
    expect(STORM_EXPEDITION_SP_FRUIT_CHANCE).toBe(0.04);
    expect(
      rollStormExpeditionSpFruit({ pity: 7, obtained: 0 }, () => 0.04),
    ).toEqual({
      dropped: false,
      next: { pity: 8, obtained: 0 },
    });
  });

  it("SP 열매 확률 굴림에 성공하면 획득 수를 올리고 기존 천장을 초기화한다", () => {
    expect(
      rollStormExpeditionSpFruit({ pity: 7, obtained: 0 }, () => 0.039999),
    ).toEqual({
      dropped: true,
      next: { pity: 0, obtained: 1 },
    });
  });

  it("25번째 미획득 완주에서는 확률과 관계없이 SP 열매를 지급하고 천장을 초기화한다", () => {
    expect(STORM_EXPEDITION_SP_FRUIT_PITY_CLEARS).toBe(25);
    expect(
      rollStormExpeditionSpFruit({ pity: 24, obtained: 1 }, () => 0.999999),
    ).toEqual({
      dropped: true,
      next: { pity: 0, obtained: 2 },
    });
  });

  it("원정에서 SP 열매 3개를 얻은 뒤에는 추가 굴림과 천장 누적을 막는다", () => {
    expect(STORM_EXPEDITION_SP_FRUIT_CAP).toBe(3);
    expect(
      rollStormExpeditionSpFruit({ pity: 24, obtained: 3 }, () => 0),
    ).toEqual({
      dropped: false,
      next: { pity: 0, obtained: 3 },
    });
  });
});

describe("폭풍 원정 V1 진행 상태 호환", () => {
  it("기존 진행 중 원정은 빈 임시 아이템 가방을 보충해 그대로 복구한다", () => {
    const state = parseStormExpeditionState(
      {
        date: "2026-08-05",
        attemptsUsed: 1,
        active: {
          routeId: "gale",
          stage: 2,
          hp: 100,
          mp: 30,
          pendingGold: 46000,
        },
        clears: 4,
      },
      "2026-08-05",
    );
    expect(state.active).toMatchObject({
      version: 3,
      routeId: "gale",
      currentNodeId: "gale_elite",
      visitedNodeIds: ["gale_outer", "supply", "gale_middle", "gale_camp", "gale_elite"],
      completedNodeIds: ["gale_outer", "supply", "gale_middle", "gale_camp"],
      encounterIndex: 0,
      defeatedCount: 2,
      pendingGold: 46000,
      pendingMaterials: {},
      pendingEquipment: [],
    });
    expect(state).toMatchObject({
      spFruitPity: 0,
      spFruitObtained: 0,
    });
  });
});
