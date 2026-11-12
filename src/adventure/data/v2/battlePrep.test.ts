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
} from "./battlePrep";
import { V2_MATERIALS } from "./dungeonDrops";

it("8종의 효과·지속·조건이 스펙 값과 같다", () => {
  const byId = BATTLE_PREP_ITEM_BY_ID;
  expect(BATTLE_PREP_ITEMS).toHaveLength(8);
  expect([1, 2, 3, "master"].map((t) => byId.get(`v2_prep_whetstone_${t}`)!.effect.atk)).toEqual([40, 80, 130, 180]);
  expect(byId.get("v2_prep_whetstone_3")!.effect).toEqual({ atk: 130, magicAtk: 130, def: 0, magicDef: 0, maxHp: 0 });
  expect([1, 2, 3, "master"].map((t) => byId.get(`v2_prep_brace_${t}`)!.effect)).toEqual([
    { atk: 0, magicAtk: 0, def: 20, magicDef: 20, maxHp: 300 },
    { atk: 0, magicAtk: 0, def: 40, magicDef: 40, maxHp: 600 },
    { atk: 0, magicAtk: 0, def: 65, magicDef: 65, maxHp: 1_000 },
    { atk: 0, magicAtk: 0, def: 90, magicDef: 90, maxHp: 1_400 },
  ]);
  for (const item of BATTLE_PREP_ITEMS) {
    expect(item.durationMs).toBe((item.tier === "master" ? 24 : 12) * 3_600_000);
    expect(item.requiresMajor).toBe(item.tier === "master");
    expect(item.requiredLevel).toBe(item.tier === 2 ? 20 : item.tier === 1 ? 1 : 35);
    expect(item.activity).toBe(item.slot === "weapon" ? "mining" : "woodcutting");
  }
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
  expect(flat).toEqual({ atk: 180, magicAtk: 180, def: 65, magicDef: 65, maxHp: 1_000 });
  expect(battlePrepCombatFlat({})).toEqual({ atk: 0, magicAtk: 0, def: 0, magicDef: 0, maxHp: 0 });
  expect(battlePrepEffectText(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_whetstone_3")!.effect)).toBe("공격력·마법공격력 +130");
  expect(battlePrepEffectText(BATTLE_PREP_ITEM_BY_ID.get("v2_prep_brace_3")!.effect)).toBe("방어력·마법방어력 +65 · 최대 HP +1,000");
});

describe("craftBattlePrep", () => {
  const P = LIFE_PROCESSED_MATERIAL_ID;
  const ctx = { levels: { mining: 100, woodcutting: 100 }, masterCraft: { mining: false, woodcutting: false } };
  it("정확한 양이면 제작하고 0이 된 재료 키를 지운다", () => {
    const result = craftBattlePrep({ ...ctx, materials: { [P.softwood]: 80, other: 3 }, itemId: "v2_prep_brace_1", quantity: 2 });
    expect(result).toMatchObject({ ok: true, quantity: 2, materials: { other: 3, v2_prep_brace_1: 2 } });
    expect(result.ok && P.softwood in result.materials).toBe(false);
  });
  it("1개 모자라면 거절하고, 레벨·전공·수량·품목 오류를 구분한다", () => {
    expect(craftBattlePrep({ ...ctx, materials: { [P.softwood]: 79 }, itemId: "v2_prep_brace_1", quantity: 2 })).toEqual({ ok: false, error: "not_enough_materials" });
    expect(craftBattlePrep({ ...ctx, levels: { mining: 100, woodcutting: 19 }, materials: {}, itemId: "v2_prep_brace_2", quantity: 1 })).toEqual({ ok: false, error: "level_required" });
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
    levels: { mining: 1, woodcutting: 25 }, masterCraft: { mining: false, woodcutting: false },
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
