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

  it("장비 상자는 보스명 없이 1T~5T 한 종류씩 노출된다", () => {
    const entries = COOP_SHOP_ENTRIES.filter((e) => e.category === "equipment_box");
    expect(entries.map((entry) => entry.name)).toEqual([
      "1T 장비 상자",
      "2T 장비 상자",
      "3T 장비 상자",
      "4T 장비 상자",
      "5T 장비 상자",
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
    expect(entries.at(-1)?.output).toEqual({
      kind: "material",
      materialId: COOP_TIER5_EQUIPMENT_BOX.id,
      count: 1,
    });
    expect(
      entries.at(-1)?.cost.materials[COOP_BOSS_MATERIAL.mountain_chief_hard.id],
    ).toBe(15);
    expect(
      entries.at(-1)?.cost.materials[COOP_BOSS_MATERIAL.abyssal_tyrant.id],
    ).toBe(15);
  });

  it("일/주간 제한은 주기 키가 바뀌면 lazy reset 된다", () => {
    const stamina = COOP_SHOP_ENTRIES.find((e) => e.itemId === "stamina_potion")!;
    const raw = {
      daily: { key: "2026-06-30", purchases: { stamina_potion: 3 } },
      weekly: { key: "2026-06-29", purchases: { reforge_stone: 10 } },
    };
    const reset = parseCoopShopState(raw, "2026-07-01", "2026-06-29");
    expect(coopShopPurchaseCount(reset, stamina)).toBe(0);

    const weekly = COOP_SHOP_ENTRIES.find((e) => e.itemId === "reforge_stone")!;
    expect(coopShopPurchaseCount(reset, weekly)).toBe(10);
    expect(isCoopShopLimitReached(reset, weekly)).toBe(true);
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
