import { describe, it, expect } from "vitest";
import {
  SP_FRUIT,
  SP_FRUIT_TIERS,
  SP_FRUIT_MATERIALS,
  parseSpFruitUsed,
  spCapBonusFromFruits,
  spCapBonusFromRaw,
  fruitTierForBoss,
  fruitTierForMaterial,
  type SpFruitTier,
} from "./spFruit";
import { calcSpBudget } from "./coreLoopConfig";
import { V2_MATERIALS } from "./dungeonDrops";

describe("SP_FRUIT config 일관성", () => {
  it("등급별 materialId 가 SP_FRUIT_MATERIALS·V2_MATERIALS 에 등재", () => {
    for (const t of SP_FRUIT_TIERS) {
      const id = SP_FRUIT[t].materialId;
      expect(SP_FRUIT_MATERIALS[id]).toBeTruthy();
      expect(SP_FRUIT_MATERIALS[id].id).toBe(id);
      // dungeonDrops 가 SP_FRUIT_MATERIALS 를 spread → 거래소 자동 거래.
      expect(V2_MATERIALS[id]).toBeTruthy();
    }
  });

  it("사용 캡 합 = 14 (I 3·II 3·III 5·IV 3 → 최대 +14 SP)", () => {
    const sum = SP_FRUIT_TIERS.reduce(
      (s, t) => s + SP_FRUIT[t].useCap * SP_FRUIT[t].spPerUse,
      0,
    );
    expect(sum).toBe(14);
  });

  it("보스 kind 가 등급별로 유일", () => {
    const kinds = SP_FRUIT_TIERS.map((t) => SP_FRUIT[t].bossKind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("parseSpFruitUsed", () => {
  it("기본 0 (빈/불량 입력)", () => {
    expect(parseSpFruitUsed(undefined)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
    expect(parseSpFruitUsed(null)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
    expect(parseSpFruitUsed("nope")).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
    expect(parseSpFruitUsed({ 1: "x", 2: NaN })).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });

  it("정상 입력 보존", () => {
    expect(parseSpFruitUsed({ 1: 2, 2: 1, 3: 4, 4: 3 })).toEqual({
      1: 2,
      2: 1,
      3: 4,
      4: 3,
    });
  });

  it("캡 초과·음수·소수 클램프", () => {
    expect(parseSpFruitUsed({ 1: 99, 2: -5, 3: 4.9, 4: 99 })).toEqual({
      1: SP_FRUIT[1].useCap, // 3
      2: 0,
      3: 4,
      4: SP_FRUIT[4].useCap, // 3
    });
  });
});

describe("spCapBonusFromFruits / spCapBonusFromRaw", () => {
  it("없음/null = 0", () => {
    expect(spCapBonusFromFruits(null)).toBe(0);
    expect(spCapBonusFromFruits(undefined)).toBe(0);
    expect(spCapBonusFromFruits({ 1: 0, 2: 0, 3: 0, 4: 0 })).toBe(0);
  });

  it("부분 사용 합산", () => {
    expect(spCapBonusFromFruits({ 1: 2, 2: 0, 3: 1, 4: 1 })).toBe(4);
  });

  it("전부 캡 = 최대 14", () => {
    expect(spCapBonusFromFruits({ 1: 3, 2: 3, 3: 5, 4: 3 })).toBe(14);
  });

  it("캡 초과 입력도 14 로 클램프", () => {
    expect(spCapBonusFromFruits({ 1: 99, 2: 99, 3: 99, 4: 99 })).toBe(14);
  });

  it("spCapBonusFromRaw = parse + 합산", () => {
    expect(spCapBonusFromRaw({ 1: 2, 3: 5 })).toBe(7);
    expect(spCapBonusFromRaw(undefined)).toBe(0);
  });
});

describe("fruitTierForBoss / fruitTierForMaterial", () => {
  it("보스 kind → 등급", () => {
    expect(fruitTierForBoss("mountain_chief")).toBe(1);
    expect(fruitTierForBoss("canyon_predator")).toBe(2);
    expect(fruitTierForBoss("lake_sovereign")).toBe(3);
    expect(fruitTierForBoss("void_priest")).toBe(4);
    expect(fruitTierForBoss("unknown")).toBeNull();
  });

  it("재료 id → 등급", () => {
    expect(fruitTierForMaterial("sp_fruit_1")).toBe(1);
    expect(fruitTierForMaterial("sp_fruit_3")).toBe(3);
    expect(fruitTierForMaterial("sp_fruit_4")).toBe(4);
    expect(fruitTierForMaterial("v2_timber")).toBeNull();
  });
});

describe("calcSpBudget spCapBonus 배선 (byte-identical 가드)", () => {
  // groups 는 옛 호출 호환용 인자이며 새 SP 예산에는 직접 영향을 주지 않는다.
  const groups: Record<string, { cumLevel?: number }> = {
    a: { cumLevel: 120 },
    b: { cumLevel: 300 },
  };

  it("spCapBonus 미지정 = 0 지정 = 기존 동작 (기존 플레이어 불변)", () => {
    expect(calcSpBudget(groups)).toBe(calcSpBudget(groups, 0));
  });

  it("보너스는 예산에 그대로 더해진다", () => {
    const base = calcSpBudget(groups);
    expect(calcSpBudget(groups, 5)).toBe(base + 5);
    expect(calcSpBudget(groups, 14)).toBe(base + 14);
  });

  it("음수 보너스는 0 으로 가드(예산 깎이지 않음)", () => {
    expect(calcSpBudget(groups, -3)).toBe(calcSpBudget(groups));
  });

  it("실제 SP 열매 사용분 → 예산 증가", () => {
    const base = calcSpBudget(groups);
    const used: Record<SpFruitTier, number> = { 1: 3, 2: 3, 3: 5, 4: 3 };
    expect(calcSpBudget(groups, spCapBonusFromFruits(used))).toBe(base + 14);
  });
});
