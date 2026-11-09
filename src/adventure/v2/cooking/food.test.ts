import { describe, expect, it } from "vitest";

import { COOKING_PUBLIC_RECIPE_BY_ID } from "./catalog";
import {
  COOKING_BUFF_DURATION_MS,
  activeCookingBuff,
  cookingFoodDefinition,
  cookingFoodId,
  parseCookingFoodId,
  scaleCookingEffect,
} from "./food";
import { COOKING_QUALITY_DELIVERY, cookingPerformancePct, cookingQualityName } from "./foodShared";

describe("cooking v2 food", () => {
  it("round-trips quality, originator, and specialty bonus in a tradeable id", () => {
    const id = cookingFoodId({
      recipeId: "ranch_grand_feast",
      quality: "masterpiece",
      originator: true,
      specialtyBonusPct: 5,
    });

    expect(id).toBe("food2:ranch_grand_feast:masterpiece:o1:s5");
    expect(parseCookingFoodId(id)).toEqual({
      id,
      recipeId: "ranch_grand_feast",
      quality: "masterpiece",
      originator: true,
      specialtyBonusPct: 5,
    });
  });

  it("adds quality, originator, and specialty performance to at most 135 percent", () => {
    const recipe = COOKING_PUBLIC_RECIPE_BY_ID.get("ranch_grand_feast")!;
    const effect = scaleCookingEffect({ combatFlat: { atk: 100 } }, {
      quality: "masterpiece",
      originator: true,
      specialtyBonusPct: 5,
    });

    expect(effect.combatFlat?.atk).toBe(135);
    expect(
      cookingFoodDefinition(
        cookingFoodId({
          recipeId: recipe.id,
          quality: "masterpiece",
          originator: true,
          specialtyBonusPct: 5,
        }),
      )?.performancePct,
    ).toBe(135);
  });

  it("applies hard caps after scaling", () => {
    expect(
      scaleCookingEffect(
        {
          primaryPct: { str: 20 },
          combatFlat: { atk: 9_000, maxHp: 99_000 },
          huntExpPct: 80,
          huntGoldPct: 80,
        },
        {
          quality: "masterpiece",
          originator: true,
          specialtyBonusPct: 5,
        },
      ),
    ).toEqual({
      primaryPct: { str: 5 },
      combatFlat: { atk: 450, maxHp: 4_500 },
      huntExpPct: 15,
      huntGoldPct: 15,
    });
  });

  // 건의 #839: 고정 수치 상한이 5티어 기본값과 같아 품질 보정이 잘려 나갔다.
  it("5티어 고정 수치 요리도 품질·원조·전문 보정만큼 오른다", () => {
    const foodEffect = (quality: "normal" | "masterpiece" | "signature", originator = false, specialtyBonusPct = 0) =>
      cookingFoodDefinition(cookingFoodId({ recipeId: "corn_cheese_bread", quality, originator, specialtyBonusPct }))?.effect;

    expect(foodEffect("normal")?.combatFlat?.magicAtk).toBe(300);
    expect(foodEffect("masterpiece")?.combatFlat?.magicAtk).toBe(360);
    expect(foodEffect("signature", true, 5)?.combatFlat?.magicAtk).toBe(450);
    expect(
      scaleCookingEffect(
        { primaryFlat: { str: 32 }, combatFlat: { maxHp: 3_000, maxMp: 1_000 } },
        { quality: "signature", originator: true, specialtyBonusPct: 5 },
      ),
    ).toEqual({ primaryFlat: { str: 48 }, combatFlat: { maxHp: 4_500, maxMp: 1_500 } });
  });

  it("먹은 뒤 저장된 5티어 걸작 효과를 다시 읽어도 깎지 않는다", () => {
    const now = Date.now();
    const buff = activeCookingBuff(
      {
        recipeId: "corn_cheese_bread",
        recipeName: "옥수수 치즈빵",
        quality: "masterpiece",
        effect: { combatFlat: { magicAtk: 360 } },
        expiresAt: now + COOKING_BUFF_DURATION_MS,
      },
      now,
    );

    expect(buff?.effect.combatFlat?.magicAtk).toBe(360);
  });

  it("accepts only unexpired twelve-hour v2 buffs", () => {
    const now = Date.now();
    const buff = activeCookingBuff(
      {
        recipeId: "ranch_grand_feast",
        recipeName: "목장 대만찬",
        quality: "normal",
        effect: { combatFlat: { atk: 300 } },
        expiresAt: now + COOKING_BUFF_DURATION_MS,
      },
      now,
    );

    expect(buff?.expiresAt).toBe(now + COOKING_BUFF_DURATION_MS);
    expect(activeCookingBuff({ ...buff, expiresAt: now }, now)).toBeNull();
  });
});

describe("명장 요리 품질", () => {
  const recipeId = "ranch_grand_feast";

  it("명장 품질을 요리 ID로 주고받고 기존 품질도 그대로 읽는다", () => {
    const id = cookingFoodId({ recipeId, quality: "signature", originator: false, specialtyBonusPct: 0 });
    expect(id).toBe(`food2:${recipeId}:signature:o0:s0`);
    expect(parseCookingFoodId(id)?.quality).toBe("signature");
    for (const quality of ["normal", "careful", "masterpiece"] as const) {
      expect(parseCookingFoodId(`food2:${recipeId}:${quality}:o0:s0`)?.quality).toBe(quality);
    }
  });

  it("명장은 성능 +35·상한 150·배달 200·지속 2배·이름 태그 '명장'", () => {
    expect(cookingQualityName("signature")).toBe("명장");
    expect(cookingPerformancePct({ quality: "signature", originator: false, specialtyBonusPct: 0 })).toBe(135);
    expect(cookingPerformancePct({ quality: "signature", originator: true, specialtyBonusPct: 5 })).toBe(150);
    expect(cookingPerformancePct({ quality: "masterpiece", originator: true, specialtyBonusPct: 5 })).toBe(135);
    expect(COOKING_QUALITY_DELIVERY.signature).toBe(200);
    const definition = cookingFoodDefinition(`food2:${recipeId}:signature:o0:s0`)!;
    expect(definition.durationMs).toBe(2 * COOKING_BUFF_DURATION_MS);
    expect(definition.name).toContain("명장");
    expect(cookingFoodDefinition(`food2:${recipeId}:masterpiece:o0:s0`)!.durationMs).toBe(COOKING_BUFF_DURATION_MS);
  });

  it("활성 버프의 명장 품질을 보존한다", () => {
    const buff = activeCookingBuff(
      { recipeId, quality: "signature", effect: {}, expiresAt: Date.now() + 60_000 },
    );
    expect(buff?.quality).toBe("signature");
  });
});
