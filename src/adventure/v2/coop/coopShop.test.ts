import { describe, expect, it } from "vitest";
import {
  COOP_SHOP_ENTRIES,
  coopShopPurchaseCount,
  coopShopRelevantMaterialIds,
  isCoopShopLimitReached,
  parseCoopShopState,
  recordCoopShopPurchase,
} from "./coopShop";
import {
  COOP_BOSS_MATERIAL,
  COOP_COIN_MATERIAL_ID,
  COOP_EQUIPMENT_BOX,
  COOP_MASTERY_TOME_MATERIAL_ID,
  COOP_TIER5_EQUIPMENT_BOX,
} from "@/adventure/data/v2/coopRewards";
import type { CoopBossKindId } from "@/adventure/data/v2/coopBosses";

describe("coopShop", () => {
  it("v1 상품은 협동 주화를 비용에 포함한다", () => {
    expect(COOP_SHOP_ENTRIES.length).toBeGreaterThanOrEqual(8);
    for (const entry of COOP_SHOP_ENTRIES) {
      expect(entry.cost.materials[COOP_COIN_MATERIAL_ID]).toBeGreaterThan(0);
    }
  });

  it("장비 상자는 1T~5T 공용과 신규 HARD 보스별 6T 상자를 노출한다", () => {
    const entries = COOP_SHOP_ENTRIES.filter((e) => e.category === "equipment_box");
    expect(entries.map((entry) => entry.name)).toEqual([
      "1T 장비 상자",
      "2T 장비 상자",
      "3T 장비 상자",
      "4T 장비 상자",
      "5T 장비 상자",
      "재앙의 스콜피온 킹 6T 장비 상자",
      "혹한의 호수 괴물 6T 장비 상자",
    ]);
    for (const bossId of [
      "mountain_chief",
      "canyon_predator",
      "lake_sovereign",
      "void_priest",
    ] as CoopBossKindId[]) {
      const box = COOP_EQUIPMENT_BOX[bossId];
      const entry = entries.find(
        (e) => e.output.kind === "material" && e.output.materialId === box.id,
      );
      expect(entry, bossId).toBeDefined();
      expect(entry?.name).toBe(box.name);
      expect(entry?.cost.materials[COOP_BOSS_MATERIAL[bossId].id]).toBeGreaterThan(0);
    }
    expect(entries.some((entry) => entry.itemId === "mountain_chief_hard_equipment_box"))
      .toBe(false);
    expect(entries.some((entry) => entry.itemId === "abyssal_tyrant_equipment_box"))
      .toBe(false);
    const tier5 = entries.find((entry) => entry.itemId === "tier5_equipment_box");
    expect(tier5?.output).toEqual({
      kind: "material",
      materialId: COOP_TIER5_EQUIPMENT_BOX.id,
      count: 1,
    });
    expect(tier5?.description).toBe(
      "사용하면 흉포한 산군·심연어룡 전용 5T 장비 9종 중 1개를 무작위로 획득한다.",
    );
    expect(
      tier5?.cost.materials[COOP_BOSS_MATERIAL.mountain_chief_hard.id],
    ).toBe(15);
    expect(
      tier5?.cost.materials[COOP_BOSS_MATERIAL.abyssal_tyrant.id],
    ).toBe(15);
    for (const boss of ["canyon_predator_hard", "lake_sovereign_hard"] as const) {
      const box = COOP_EQUIPMENT_BOX[boss];
      const entry = entries.find(
        (candidate) =>
          candidate.output.kind === "material" &&
          candidate.output.materialId === box.id,
      );
      expect(entry?.cost.materials[COOP_COIN_MATERIAL_ID]).toBe(900);
      expect(entry?.cost.materials[COOP_BOSS_MATERIAL[boss].id]).toBe(40);
      expect(entry?.limit).toBeUndefined();
    }
  });

  it("일/주간 제한은 주기 키가 바뀌면 lazy reset 된다", () => {
    const stamina = COOP_SHOP_ENTRIES.find((e) => e.itemId === "stamina_potion")!;
    const raw = {
      daily: { key: "2026-06-30", purchases: { stamina_potion: 3 } },
      weekly: { key: "2026-06-29", purchases: { mastery_tome: 5 } },
    };
    const reset = parseCoopShopState(raw, "2026-07-01", "2026-06-29");
    expect(coopShopPurchaseCount(reset, stamina)).toBe(0);

    const weekly = COOP_SHOP_ENTRIES.find((e) => e.itemId === "mastery_tome")!;
    expect(coopShopPurchaseCount(reset, weekly)).toBe(5);
    expect(isCoopShopLimitReached(reset, weekly)).toBe(true);
  });

  it("스태미나 회복약은 하루 5개까지 교환한다", () => {
    const stamina = COOP_SHOP_ENTRIES.find((e) => e.itemId === "stamina_potion");
    expect(stamina?.limit).toEqual({ scope: "daily", count: 5 });
    expect(stamina?.description).toContain("하루 5개");
  });

  it("재련 비활성 중에는 재련석 교환 상품을 노출하지 않는다", () => {
    expect(
      COOP_SHOP_ENTRIES.some((e) => e.itemId === "reforge_stone"),
    ).toBe(false);
    expect(
      COOP_SHOP_ENTRIES.some((e) => e.itemId === "reforge_stone_high"),
    ).toBe(false);
  });

  it("구매 기록은 해당 제한 버킷에만 누적된다", () => {
    const state = parseCoopShopState({}, "2026-07-01", "2026-06-29");
    const entry = COOP_SHOP_ENTRIES.find((e) => e.itemId === "summon_scroll")!;
    const next = recordCoopShopPurchase(state, entry);
    expect(coopShopPurchaseCount(next, entry)).toBe(1);
    expect(next.weekly.purchases).toEqual({});
  });

  it("관련 재료 id 목록에 비용과 지급 재료를 포함한다", () => {
    const ids = coopShopRelevantMaterialIds();
    expect(ids).toContain(COOP_COIN_MATERIAL_ID);
    expect(ids).toContain("v2_boss_summon_scroll");
    expect(ids).toContain(COOP_MASTERY_TOME_MATERIAL_ID);
    for (const material of Object.values(COOP_BOSS_MATERIAL)) {
      expect(ids).toContain(material.id);
    }
  });

  it("상급 숙련 교본은 주간 제한 거래 소모품으로 제공한다", () => {
    const tome = COOP_SHOP_ENTRIES.find((e) => e.itemId === "mastery_tome");
    expect(tome).toBeDefined();
    expect(tome?.category).toBe("consumable");
    expect(tome?.limit).toEqual({ scope: "weekly", count: 5 });
    expect(tome?.output).toEqual({
      kind: "material",
      materialId: COOP_MASTERY_TOME_MATERIAL_ID,
      count: 1,
    });
  });
});
