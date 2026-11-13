import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { LIFE_MAJOR_PRODUCT_ID } from "@/adventure/v2/lifeMajorProducts";
import { LIFE_PROCESSED_MATERIAL_ID } from "@/adventure/v2/lifeWorkshopMaterials";

import {
  BATTLE_PREP_ITEMS,
  BATTLE_PREP_ITEM_BY_ID,
  activeBattlePreps,
  applyBattlePrepUse,
  battlePrepCombatFlat,
  battlePrepCraftRows,
  battlePrepEffectText,
  craftBattlePrep,
  dangerCatchCostName,
  dangerCatchHeld,
  selectDangerCatchMaterials,
} from "./battlePrep";
import { V2_MATERIALS } from "./dungeonDrops";

const NO_MASTER = { mining: false, woodcutting: false, fishing: false };
// 위험 해역 어획물 — 희귀: 철턱 참치·산호뿔 도미·뇌광 가오리, 영웅: 암초아귀 바리·밤유리 상어, 전설: 심연 왕관어.
const RARE_TUNA = "danger_catch_ironjaw_tuna";
const RARE_SNAPPER = "danger_catch_coralhorn_snapper";
const EPIC_GROUPER = "danger_catch_reef_maw_grouper";
const EPIC_SHARK = "danger_catch_nightglass_shark";
const LEGEND_CROWN = "danger_catch_abyssal_crownfish";
const COMMON_SARDINE = "danger_catch_razor_sardine";

it("숫돌·보강재 8종의 효과·지속·조건이 스펙 값과 같다", () => {
  const byId = BATTLE_PREP_ITEM_BY_ID;
  expect(BATTLE_PREP_ITEMS).toHaveLength(12);
  expect([1, 2, 3, "master"].map((t) => byId.get(`v2_prep_whetstone_${t}`)!.effect.atk)).toEqual([40, 80, 130, 180]);
  expect(byId.get("v2_prep_whetstone_3")!.effect).toEqual({ atk: 130, magicAtk: 130, def: 0, magicDef: 0, maxHp: 0, maxMp: 0 });
  expect([1, 2, 3, "master"].map((t) => byId.get(`v2_prep_brace_${t}`)!.effect)).toEqual([
    { atk: 0, magicAtk: 0, def: 20, magicDef: 20, maxHp: 300, maxMp: 0 },
    { atk: 0, magicAtk: 0, def: 40, magicDef: 40, maxHp: 600, maxMp: 0 },
    { atk: 0, magicAtk: 0, def: 65, magicDef: 65, maxHp: 1_000, maxMp: 0 },
    { atk: 0, magicAtk: 0, def: 90, magicDef: 90, maxHp: 1_400, maxMp: 0 },
  ]);
  for (const item of BATTLE_PREP_ITEMS) {
    expect(item.durationMs).toBe((item.tier === "master" ? 24 : 12) * 3_600_000);
    expect(item.requiresMajor).toBe(item.tier === "master");
    if (item.slot === "vigor") continue;
    expect(item.requiredLevel).toBe(item.tier === 2 ? 20 : item.tier === 1 ? 1 : 35);
    expect(item.activity).toBe(item.slot === "weapon" ? "mining" : "woodcutting");
    expect(item.catchCosts).toBeUndefined();
    expect(item.dangerCatchCost).toBeUndefined();
  }
});

it("12종 모두 품목 id와 같은 이름의 그림 파일이 있고 제작 행에도 실린다", () => {
  for (const item of BATTLE_PREP_ITEMS) {
    expect(item.image).toBe(`/images/items/battle-prep/${item.id}.webp`);
    expect(existsSync(`public${item.image}`)).toBe(true);
  }
  const rows = battlePrepCraftRows({
    materials: {},
    levels: { mining: 1, woodcutting: 1, fishing: 1 },
    masterCraft: NO_MASTER,
  });
  expect(rows.map((row) => row.image)).toEqual(BATTLE_PREP_ITEMS.map((item) => item.image));
});

it("제작 재료가 스펙 표와 같고 모두 재료 카탈로그에 있다", () => {
  const P = LIFE_PROCESSED_MATERIAL_ID; const M = MINING_MATERIAL_ID;
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_1")!.costs).toEqual({ [P.basicIngot]: 40, [M.stone]: 20 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_2")!.costs).toEqual({ [P.preciousIngot]: 25, [P.basicIngot]: 15, [M.coal]: 10 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_3")!.costs).toEqual({ [P.arcaneAlloy]: 20, [P.preciousIngot]: 10, [P.basicIngot]: 10, [M.roughGem]: 5 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_master")!.costs).toEqual({ [P.arcaneAlloy]: 20, [P.preciousIngot]: 10, [P.basicIngot]: 10, [M.roughGem]: 5, [LIFE_MAJOR_PRODUCT_ID.mining]: 1 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_1")!.costs).toEqual({ [P.softwood]: 40 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_2")!.costs).toEqual({ [P.hardwood]: 25, [P.softwood]: 15 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_3")!.costs).toEqual({ [P.masterwood]: 20, [P.hardwood]: 10, [P.softwood]: 10 });
  expect(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_master")!.costs).toEqual({ [P.masterwood]: 20, [P.hardwood]: 10, [P.softwood]: 10, [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 1 });
  for (const item of BATTLE_PREP_ITEMS) {
    expect(V2_MATERIALS[item.id]?.name).toBe(item.name);
    for (const id of Object.keys(item.costs)) expect(V2_MATERIALS[id], id).toBeDefined();
  }
});

it("켜 둔 준비물 파서는 만료·모르는 품목·칸 불일치·잘못된 형식을 버린다", () => {
  const now = 1_000_000;
  expect(activeBattlePreps({
    weapon: { itemId: "v2_prep_whetstone_3", expiresAt: now + 1 },
    armor: { itemId: "v2_prep_brace_2", expiresAt: now },          // 만료
  }, now)).toEqual({ weapon: { itemId: "v2_prep_whetstone_3", expiresAt: now + 1 } });
  expect(activeBattlePreps({ weapon: { itemId: "v2_prep_brace_1", expiresAt: now + 1 } }, now)).toEqual({}); // 칸 불일치
  expect(activeBattlePreps({ weapon: { itemId: "gone", expiresAt: now + 1 }, armor: "x" }, now)).toEqual({});
  expect(activeBattlePreps(null, now)).toEqual({});
});

it("두 칸의 고정 수치를 합산하고 효과 문구를 만든다", () => {
  const flat = battlePrepCombatFlat({
    weapon: { itemId: "v2_prep_whetstone_master", expiresAt: 9 },
    armor: { itemId: "v2_prep_brace_3", expiresAt: 9 },
  });
  expect(flat).toEqual({ atk: 180, magicAtk: 180, def: 65, magicDef: 65, maxHp: 1_000, maxMp: 0 });
  expect(battlePrepCombatFlat({})).toEqual({ atk: 0, magicAtk: 0, def: 0, magicDef: 0, maxHp: 0, maxMp: 0 });
  expect(battlePrepEffectText(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_3")!.effect)).toBe("공격력·마법공격력 +130");
  expect(battlePrepEffectText(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_3")!.effect)).toBe("방어력·마법방어력 +65 · 최대 HP +1,000");
});

describe("craftBattlePrep", () => {
  const P = LIFE_PROCESSED_MATERIAL_ID;
  const ctx = { levels: { mining: 100, woodcutting: 100, fishing: 100 }, masterCraft: NO_MASTER };
  it("정확한 양이면 제작하고 0이 된 재료 키를 지운다", () => {
    const result = craftBattlePrep({ ...ctx, materials: { [P.softwood]: 80, other: 3 }, itemId: "v2_prep_brace_1", quantity: 2 });
    expect(result).toMatchObject({ ok: true, quantity: 2, materials: { other: 3, v2_prep_brace_1: 2 } });
    expect(result.ok && P.softwood in result.materials).toBe(false);
  });
  it("1개 모자라면 거절하고, 레벨·전공·수량·품목 오류를 구분한다", () => {
    expect(craftBattlePrep({ ...ctx, materials: { [P.softwood]: 79 }, itemId: "v2_prep_brace_1", quantity: 2 })).toEqual({ ok: false, error: "not_enough_materials" });
    expect(craftBattlePrep({ ...ctx, levels: { mining: 100, woodcutting: 19, fishing: 100 }, materials: {}, itemId: "v2_prep_brace_2", quantity: 1 })).toEqual({ ok: false, error: "level_required" });
    expect(craftBattlePrep({ ...ctx, materials: {}, itemId: "v2_prep_whetstone_master", quantity: 1 })).toEqual({ ok: false, error: "major_required" });
    expect(craftBattlePrep({ ...ctx, materials: {}, itemId: "v2_prep_brace_1", quantity: 21 })).toEqual({ ok: false, error: "invalid_quantity" });
    expect(craftBattlePrep({ ...ctx, materials: {}, itemId: "v2_prep_brace_1", quantity: 1.5 })).toEqual({ ok: false, error: "invalid_quantity" });
    expect(craftBattlePrep({ ...ctx, materials: {}, itemId: "nope", quantity: 1 })).toEqual({ ok: false, error: "bad_item" });
  });
});

it("제작 화면용 행은 보유량·막힌 이유·최대 제작 수를 계산한다", () => {
  const P = LIFE_PROCESSED_MATERIAL_ID;
  const rows = battlePrepCraftRows({
    materials: { [P.softwood]: 95, v2_prep_brace_1: 4 },
    levels: { mining: 1, woodcutting: 25, fishing: 1 }, masterCraft: NO_MASTER,
  });
  expect(rows.map((row) => row.id)).toEqual(BATTLE_PREP_ITEMS.map((item) => item.id));
  const brace1 = rows.find((row) => row.id === "v2_prep_brace_1")!;
  expect(brace1).toMatchObject({ owned: 4, blocked: null, maxCraftable: 2, durationHours: 12, costs: [{ id: P.softwood, need: 40, owned: 95 }] });
  expect(rows.find((row) => row.id === "v2_prep_brace_3")).toMatchObject({ blocked: "level", maxCraftable: 0, requiredLevel: 35 });
  expect(rows.find((row) => row.id === "v2_prep_brace_master")).toMatchObject({ blocked: "major", maxCraftable: 0 });
  expect(rows.find((row) => row.id === "v2_prep_whetstone_1")).toMatchObject({ blocked: null, maxCraftable: 0 });
});

describe("applyBattlePrepUse", () => {
  const now = 5_000;
  it("1개를 쓰고 같은 칸만 교체한다", () => {
    const result = applyBattlePrepUse({
      materials: { v2_prep_whetstone_1: 1, keep: 2 },
      activeRaw: { weapon: { itemId: "v2_prep_whetstone_master", expiresAt: now + 99 }, armor: { itemId: "v2_prep_brace_2", expiresAt: now + 50 } },
      itemId: "v2_prep_whetstone_1", now,
    });
    expect(result).toMatchObject({
      ok: true, materials: { keep: 2 },
      active: { weapon: { itemId: "v2_prep_whetstone_1", expiresAt: now + 12 * 3_600_000 }, armor: { itemId: "v2_prep_brace_2", expiresAt: now + 50 } },
    });
    expect(result.ok && "v2_prep_whetstone_1" in result.materials).toBe(false);
  });
  it("미보유와 모르는 품목을 거절한다", () => {
    expect(applyBattlePrepUse({ materials: {}, activeRaw: {}, itemId: "v2_prep_brace_1", now })).toEqual({ ok: false, error: "not_owned" });
    expect(applyBattlePrepUse({ materials: { x: 1 }, activeRaw: {}, itemId: "x", now })).toEqual({ ok: false, error: "bad_item" });
  });
});

describe("어유(기력 보충)", () => {
  const byId = BATTLE_PREP_ITEM_BY_ID;
  const ids = [1, 2, 3, "master"].map((tier) => `v2_prep_fishoil_${tier}`);
  const ctx = { levels: { mining: 1, woodcutting: 1, fishing: 100 }, masterCraft: NO_MASTER };

  it("4종의 효과·칸·조건이 스펙 값과 같다", () => {
    expect(ids.map((id) => byId.get(id)!.name)).toEqual(["초급 어유", "중급 어유", "상급 어유", "명장의 어유"]);
    expect(ids.map((id) => byId.get(id)!.effect)).toEqual(
      [250, 500, 800, 1_100].map((maxMp) => ({ atk: 0, magicAtk: 0, def: 0, magicDef: 0, maxHp: 0, maxMp })),
    );
    for (const id of ids) expect(byId.get(id)).toMatchObject({ slot: "vigor", activity: "fishing" });
    expect(ids.slice(0, 3).map((id) => byId.get(id)!.requiredLevel)).toEqual([1, 15, 25]);
    expect(battlePrepEffectText(byId.get("v2_prep_fishoil_3")!.effect)).toBe("최대 MP +800");
    expect(V2_MATERIALS.v2_prep_fishoil_master?.name).toBe("명장의 어유");
  });

  it("재료가 스펙 표와 같다", () => {
    expect(byId.get("v2_prep_fishoil_1")).toMatchObject({ catchCosts: { catch_common: 3, catch_fresh: 1 }, costs: {} });
    expect(byId.get("v2_prep_fishoil_1")!.dangerCatchCost).toBeUndefined();
    expect(byId.get("v2_prep_fishoil_2")).toMatchObject({ catchCosts: { catch_fresh: 3, catch_quality: 3 }, costs: {} });
    expect(byId.get("v2_prep_fishoil_3")).toMatchObject({
      catchCosts: { catch_quality: 4, catch_special: 1 },
      dangerCatchCost: { minRarity: "rare", amount: 2 },
      costs: {},
    });
    expect(byId.get("v2_prep_fishoil_master")).toMatchObject({
      catchCosts: { catch_special: 2, catch_legendary: 1 },
      dangerCatchCost: { minRarity: "epic", amount: 2 },
      costs: { [LIFE_MAJOR_PRODUCT_ID.fishing]: 1 },
    });
  });

  it("위험 해역 묶음 재료는 낮은 등급부터, 같은 등급은 많이 가진 어종부터 고른다", () => {
    const rare = { minRarity: "rare", amount: 2 } as const;
    const epic = { minRarity: "epic", amount: 2 } as const;
    expect(selectDangerCatchMaterials({ [RARE_TUNA]: 1, [EPIC_GROUPER]: 5 }, rare, 1)).toEqual({ [RARE_TUNA]: 1, [EPIC_GROUPER]: 1 });
    expect(selectDangerCatchMaterials({ [RARE_TUNA]: 9, [EPIC_GROUPER]: 1, [LEGEND_CROWN]: 1 }, epic, 1)).toEqual({ [EPIC_GROUPER]: 1, [LEGEND_CROWN]: 1 });
    expect(selectDangerCatchMaterials({ [RARE_TUNA]: 2, [RARE_SNAPPER]: 5, [EPIC_SHARK]: 3 }, rare, 3)).toEqual({ [RARE_SNAPPER]: 5, [RARE_TUNA]: 1 });
    expect(selectDangerCatchMaterials({ [RARE_TUNA]: 1, [COMMON_SARDINE]: 50 }, rare, 1)).toBeNull();
    expect(selectDangerCatchMaterials({ [RARE_TUNA]: 9 }, epic, 1)).toBeNull();
    expect(dangerCatchHeld({ [RARE_TUNA]: 2, [EPIC_SHARK]: 3, [COMMON_SARDINE]: 50, v2_basic_ingot: 9 }, "rare")).toBe(5);
    expect(dangerCatchHeld({ [RARE_TUNA]: 2, [EPIC_SHARK]: 3, [LEGEND_CROWN]: 1 }, "epic")).toBe(4);
    expect(dangerCatchCostName("rare")).toBe("위험 해역 희귀 이상 어획물");
    expect(dangerCatchCostName("epic")).toBe("위험 해역 영웅 이상 어획물");
  });

  it("상급 어유 제작은 어획물 재고와 위험 해역 어획물을 함께 줄이고 0이 된 키를 지운다", () => {
    const result = craftBattlePrep({
      ...ctx,
      materials: { [RARE_TUNA]: 3, [EPIC_GROUPER]: 2, keep: 1 },
      catchItems: { catch_quality: 8, catch_special: 5, catch_common: 7 },
      itemId: "v2_prep_fishoil_3",
      quantity: 2,
    });
    expect(result).toEqual({
      ok: true,
      item: byId.get("v2_prep_fishoil_3"),
      quantity: 2,
      usesCatchStock: true,
      materials: { [EPIC_GROUPER]: 1, keep: 1, v2_prep_fishoil_3: 2 },
      catchItems: { catch_special: 3, catch_common: 7 },
    });
  });

  it("어획물·위험 해역 어획물이 모자라거나 낚시 레벨이 낮으면 거절한다", () => {
    const enoughCatch = { catch_quality: 4, catch_special: 1 };
    expect(craftBattlePrep({ ...ctx, materials: { [RARE_TUNA]: 2 }, catchItems: { catch_quality: 3, catch_special: 1 }, itemId: "v2_prep_fishoil_3", quantity: 1 })).toEqual({ ok: false, error: "not_enough_materials" });
    expect(craftBattlePrep({ ...ctx, materials: { [RARE_TUNA]: 1 }, catchItems: enoughCatch, itemId: "v2_prep_fishoil_3", quantity: 1 })).toEqual({ ok: false, error: "not_enough_materials" });
    expect(craftBattlePrep({ ...ctx, materials: { [RARE_TUNA]: 2 }, itemId: "v2_prep_fishoil_3", quantity: 1 })).toEqual({ ok: false, error: "not_enough_materials" });
    expect(craftBattlePrep({ ...ctx, levels: { ...ctx.levels, fishing: 24 }, materials: { [RARE_TUNA]: 2 }, catchItems: enoughCatch, itemId: "v2_prep_fishoil_3", quantity: 1 })).toEqual({ ok: false, error: "level_required" });
    expect(craftBattlePrep({ ...ctx, materials: {}, catchItems: {}, itemId: "v2_prep_fishoil_master", quantity: 1 })).toEqual({ ok: false, error: "major_required" });
  });

  it("명장의 어유는 낚시 주전공이 명장 어획까지 내고 만든다", () => {
    const result = craftBattlePrep({
      ...ctx,
      masterCraft: { ...NO_MASTER, fishing: true },
      materials: { [RARE_TUNA]: 9, [EPIC_SHARK]: 1, [LEGEND_CROWN]: 1, [LIFE_MAJOR_PRODUCT_ID.fishing]: 1 },
      catchItems: { catch_special: 2, catch_legendary: 1 },
      itemId: "v2_prep_fishoil_master",
      quantity: 1,
    });
    expect(result).toMatchObject({ ok: true, materials: { [RARE_TUNA]: 9, v2_prep_fishoil_master: 1 }, catchItems: {} });
    expect(result.ok && Object.keys(result.materials).sort()).toEqual([RARE_TUNA, "v2_prep_fishoil_master"].sort());
  });

  it("숫돌 제작은 어획물 재고를 쓰지 않는다", () => {
    const P = LIFE_PROCESSED_MATERIAL_ID; const M = MINING_MATERIAL_ID;
    const catchItems = { catch_common: 4 };
    const result = craftBattlePrep({ ...ctx, materials: { [P.basicIngot]: 40, [M.stone]: 20 }, catchItems, itemId: "v2_prep_whetstone_1", quantity: 1 });
    expect(result).toMatchObject({ ok: true, usesCatchStock: false, catchItems });
  });

  it("제작 행은 세 종류 재료를 이름과 함께 싣고 가장 모자란 쪽으로 최대 제작 수를 정한다", () => {
    const rows = battlePrepCraftRows({
      ...ctx,
      materials: { [RARE_TUNA]: 3, [EPIC_GROUPER]: 4, [COMMON_SARDINE]: 9 },
      catchItems: { catch_quality: 40, catch_special: 9 },
    });
    expect(rows).toHaveLength(12);
    expect(rows.find((row) => row.id === "v2_prep_fishoil_3")).toMatchObject({
      slot: "vigor",
      blocked: null,
      maxCraftable: 3,
      costs: [
        { id: "catch_quality", name: "고급 어획물", need: 4, owned: 40 },
        { id: "catch_special", name: "특급 어획물", need: 1, owned: 9 },
        { id: "danger_catch:rare", name: "위험 해역 희귀 이상 어획물", need: 2, owned: 7 },
      ],
    });
    expect(rows.find((row) => row.id === "v2_prep_fishoil_master")).toMatchObject({ blocked: "major", maxCraftable: 0 });
    const withoutStock = battlePrepCraftRows({ ...ctx, materials: {} });
    expect(withoutStock.find((row) => row.id === "v2_prep_fishoil_1")).toMatchObject({
      maxCraftable: 0,
      costs: [
        { id: "catch_common", name: "일반 어획물", need: 3, owned: 0 },
        { id: "catch_fresh", name: "신선한 어획물", need: 1, owned: 0 },
      ],
    });
  });

  it("켜 둔 준비물 파서와 합산이 기력 보충 칸을 읽는다", () => {
    const now = 1_000;
    const active = activeBattlePreps({
      weapon: { itemId: "v2_prep_whetstone_1", expiresAt: now + 1 },
      vigor: { itemId: "v2_prep_fishoil_master", expiresAt: now + 1 },
    }, now);
    expect(active).toEqual({
      weapon: { itemId: "v2_prep_whetstone_1", expiresAt: now + 1 },
      vigor: { itemId: "v2_prep_fishoil_master", expiresAt: now + 1 },
    });
    expect(battlePrepCombatFlat(active)).toEqual({ atk: 40, magicAtk: 40, def: 0, magicDef: 0, maxHp: 0, maxMp: 1_100 });
    expect(activeBattlePreps({ vigor: { itemId: "v2_prep_whetstone_1", expiresAt: now + 1 } }, now)).toEqual({});
    expect(activeBattlePreps({ weapon: { itemId: "v2_prep_fishoil_1", expiresAt: now + 1 } }, now)).toEqual({});
  });

  it("어유를 쓰면 기력 보충 칸만 바뀐다", () => {
    const now = 5_000;
    const result = applyBattlePrepUse({
      materials: { v2_prep_fishoil_2: 2 },
      activeRaw: { weapon: { itemId: "v2_prep_whetstone_2", expiresAt: now + 9 } },
      itemId: "v2_prep_fishoil_2",
      now,
    });
    expect(result).toMatchObject({
      ok: true,
      materials: { v2_prep_fishoil_2: 1 },
      active: {
        weapon: { itemId: "v2_prep_whetstone_2", expiresAt: now + 9 },
        vigor: { itemId: "v2_prep_fishoil_2", expiresAt: now + 12 * 3_600_000 },
      },
    });
  });
});
