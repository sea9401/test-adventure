import { describe, expect, it } from "vitest";
import {
  MONSTER_CRAFT_MATERIAL_DROP_RULES,
  MONSTER_CRAFT_MATERIAL_ID,
  MONSTER_CRAFT_MATERIALS,
  rollMonsterCraftMaterialDrops,
} from "./monsterCraftMaterials";

describe("monster craft material drops", () => {
  it("registers every drop material in the material catalog", () => {
    for (const rule of MONSTER_CRAFT_MATERIAL_DROP_RULES) {
      expect(MONSTER_CRAFT_MATERIALS[rule.materialId]).toBeDefined();
    }
  });

  it("drops each dedicated material only from its matching defeated monster", () => {
    expect(MONSTER_CRAFT_MATERIAL_DROP_RULES).toHaveLength(7);
    for (const rule of MONSTER_CRAFT_MATERIAL_DROP_RULES) {
      expect(rollMonsterCraftMaterialDrops(rule.monsterKey, () => 0.0199)).toEqual({
        [rule.materialId]: 1,
      });
      expect(rollMonsterCraftMaterialDrops(rule.monsterKey, () => 0.02)).toEqual(
        {},
      );
    }
  });

  it("does not consume RNG for monsters without a dedicated material", () => {
    let draws = 0;
    expect(
      rollMonsterCraftMaterialDrops("박쥐 떼", () => {
        draws += 1;
        return 0;
      }),
    ).toEqual({});
    expect(draws).toBe(0);
  });

  it("applies rare-map drop multipliers to the dedicated material", () => {
    expect(
      rollMonsterCraftMaterialDrops("동굴 거미", () => 0.0399, 2),
    ).toEqual({
      [MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland]: 1,
    });
    expect(rollMonsterCraftMaterialDrops("동굴 거미", () => 0.04, 2)).toEqual(
      {},
    );
  });
});
