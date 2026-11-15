import { describe, expect, it } from "vitest";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import {
  CUT_GEMS,
  CUT_GEM_GRADES,
  GEM_CUT_BATCH_LIMIT,
  GEM_CUT_CHANCES,
  GEM_CUT_MASTER_ALLOY_COST,
  GEM_CUT_REQUIRED_MINING_LEVEL,
  GEM_CUT_ROUGH_COST,
  GemCuttingError,
  LIBERATION_LOCK_GOLD_PER_LINE,
  cutGems,
  cutGemUsableForRank,
  pickLiberationLockGems,
  rollCutGemGrade,
} from "./gemCutting";
import { LIFE_MAJOR_PRODUCT_ID } from "./lifeMajorProducts";

const ROUGH = MINING_MATERIAL_ID.roughGem;
const ALLOY = LIFE_MAJOR_PRODUCT_ID.mining;
const fixed = (value: number) => () => value;

describe("세공 보석", () => {
  it("세 등급을 거래 가능한 재료로 등록한다", () => {
    expect(CUT_GEM_GRADES).toEqual(["polished", "refined", "flawless"]);
    expect(CUT_GEMS.polished).toMatchObject({ id: "v2_cut_gem_polished", name: "다듬은 보석" });
    expect(CUT_GEMS.refined).toMatchObject({ id: "v2_cut_gem_refined", name: "정교한 보석" });
    expect(CUT_GEMS.flawless).toMatchObject({ id: "v2_cut_gem_flawless", name: "완벽한 보석" });
    for (const grade of CUT_GEM_GRADES) {
      expect(V2_MATERIALS[CUT_GEMS[grade].id]?.name).toBe(CUT_GEMS[grade].name);
    }
  });

  it("세공 확률은 일반 70·25·5, 명장 50·38·12다", () => {
    expect(GEM_CUT_CHANCES.normal).toEqual({ polished: 70, refined: 25, flawless: 5 });
    expect(GEM_CUT_CHANCES.master).toEqual({ polished: 50, refined: 38, flawless: 12 });
    expect(rollCutGemGrade("normal", fixed(0))).toBe("polished");
    expect(rollCutGemGrade("normal", fixed(0.699))).toBe("polished");
    expect(rollCutGemGrade("normal", fixed(0.7))).toBe("refined");
    expect(rollCutGemGrade("normal", fixed(0.949))).toBe("refined");
    expect(rollCutGemGrade("normal", fixed(0.95))).toBe("flawless");
    expect(rollCutGemGrade("master", fixed(0.5))).toBe("refined");
    expect(rollCutGemGrade("master", fixed(0.88))).toBe("flawless");
    expect(rollCutGemGrade("master", fixed(0.9999))).toBe("flawless");
  });
});

describe("세공", () => {
  const context = { miningLevel: 30, masterUnlocked: false };

  it("원석 보석 60개로 하나씩 만들고 결과를 등급별로 센다", () => {
    expect(GEM_CUT_ROUGH_COST).toBe(60);
    expect(GEM_CUT_REQUIRED_MINING_LEVEL).toBe(30);
    const rolls = [0.1, 0.8, 0.97];
    const done = cutGems({
      materials: { [ROUGH]: 200, other: 3, [CUT_GEMS.polished.id]: 2 },
      mode: "normal",
      count: 3,
      context,
      rng: () => rolls.shift()!,
    });
    expect(done.results).toEqual({ polished: 1, refined: 1, flawless: 1 });
    expect(done.materials).toEqual({
      [ROUGH]: 20,
      other: 3,
      [CUT_GEMS.polished.id]: 3,
      [CUT_GEMS.refined.id]: 1,
      [CUT_GEMS.flawless.id]: 1,
    });
  });

  it("재료를 정확히 다 쓰면 그 재료를 남기지 않는다", () => {
    const done = cutGems({ materials: { [ROUGH]: 60 }, mode: "normal", count: 1, context, rng: fixed(0) });
    expect(done.materials).toEqual({ [CUT_GEMS.polished.id]: 1 });
  });

  it("명장 세공은 주전공 명장 조건과 명장 합금 3개가 든다", () => {
    expect(GEM_CUT_MASTER_ALLOY_COST).toBe(3);
    const materials = { [ROUGH]: 120, [ALLOY]: 6 };
    const locked = () => cutGems({ materials, mode: "master", count: 1, context, rng: fixed(0) });
    expect(locked).toThrow(GemCuttingError);
    expect(locked).toThrow("master_locked");

    const master = { miningLevel: 100, masterUnlocked: true };
    const done = cutGems({ materials, mode: "master", count: 2, context: master, rng: fixed(0.9) });
    expect(done.results).toEqual({ polished: 0, refined: 0, flawless: 2 });
    expect(done.materials).toEqual({ [CUT_GEMS.flawless.id]: 2 });
    expect(() =>
      cutGems({ materials: { [ROUGH]: 60, [ALLOY]: 2 }, mode: "master", count: 1, context: master, rng: fixed(0) }),
    ).toThrow("not_enough_master_alloy");
  });

  it("채광 레벨, 원석 수량, 세공 수량을 검사한다", () => {
    const args = { materials: { [ROUGH]: 59 }, mode: "normal" as const, count: 1, rng: fixed(0) };
    expect(() => cutGems({ ...args, context: { miningLevel: 29, masterUnlocked: false } })).toThrow(
      "mining_level_required",
    );
    expect(() => cutGems({ ...args, context })).toThrow("not_enough_rough_gems");
    expect(GEM_CUT_BATCH_LIMIT).toBe(100);
    for (const count of [0, 101, 1.5, Number.NaN]) {
      expect(() => cutGems({ ...args, count, context })).toThrow("bad_count");
    }
  });
});

describe("마법부여 줄 고정에 쓰는 보석", () => {
  it("장비 단계에 따라 쓸 수 있는 등급이 다르다", () => {
    expect(CUT_GEM_GRADES.filter((grade) => cutGemUsableForRank(grade, 3))).toEqual([
      "polished",
      "refined",
      "flawless",
    ]);
    expect(CUT_GEM_GRADES.filter((grade) => cutGemUsableForRank(grade, 2))).toEqual(["refined", "flawless"]);
    expect(CUT_GEM_GRADES.filter((grade) => cutGemUsableForRank(grade, 1))).toEqual(["flawless"]);
    expect(LIBERATION_LOCK_GOLD_PER_LINE).toBe(5_000_000);
  });

  it("쓸 수 있는 보석 중 낮은 등급부터 고른다", () => {
    const held = {
      [CUT_GEMS.polished.id]: 1,
      [CUT_GEMS.refined.id]: 5,
      [CUT_GEMS.flawless.id]: 1,
    };
    expect(pickLiberationLockGems(held, 3, 2)).toEqual({
      [CUT_GEMS.polished.id]: 1,
      [CUT_GEMS.refined.id]: 1,
    });
    expect(pickLiberationLockGems(held, 2, 2)).toEqual({ [CUT_GEMS.refined.id]: 2 });
    expect(pickLiberationLockGems(held, 1, 1)).toEqual({ [CUT_GEMS.flawless.id]: 1 });
    // 모자라면 null.
    expect(pickLiberationLockGems(held, 1, 2)).toBeNull();
    expect(pickLiberationLockGems({}, 3, 1)).toBeNull();
    expect(pickLiberationLockGems(held, 3, 0)).toEqual({});
  });
});
