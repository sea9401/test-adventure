import type { Monster } from "./types";

export const VOLCANIC_MONSTERS: Record<string, Monster> = {
  // ── 화산 지대 (volcanic_badlands) ───────────────────────────────────────
  "용암 슬라임": {
    name: "용암 슬라임",
    tags: ["slime"],
    image: "/images/monster/lavaslime.webp",
    hp: 540,
    atk: 45,
    def: 24,
    spd: 4,
    exp: 69,
    drops: [
      { kind: "material", materialId: "lava_core", chance: 0.0045 },
      // 유실된 명품(unique) — 미처 못 녹인 거대 용암 핵. atk +11 / spd -2. 가장 희귀한 한 자루.
      { kind: "equip", itemId: "lava_core_maul", chance: 0.0001 },
      // 그 망치를 한 단계 끌어올리는 단조서 (결과도 unique·비거래).
      { kind: "recipe", recipeId: "lava_core_greatmaul", chance: 0.005 },
    ],
    skill: { kind: "heavy_blow", name: "용암 비산", everyPhases: 4, multiplier: 1.5 },
  },
  "화산 두꺼비": {
    name: "화산 두꺼비",
    tags: ["beast"],
    image: "/images/monster/flamefrog.webp",
    hp: 620,
    atk: 50,
    def: 30,
    spd: 3,
    exp: 78,
    drops: [
      { kind: "material", materialId: "lava_core", chance: 0.0075 },
    ],
    skill: { kind: "enrage", name: "용암 분출", hpFraction: 0.4, atkBonus: 8 },
  },
  "불꽃 골렘": {
    name: "불꽃 골렘",
    tags: ["golem"],
    image: "/images/monster/moltengolem.webp",
    hp: 680,
    atk: 54,
    def: 26,
    spd: 5,
    exp: 88,
    drops: [
      { kind: "material", materialId: "lava_core", chance: 0.0135 },
      { kind: "material", materialId: "ruin_fragment", chance: 0.0375 },
    ],
    skill: { kind: "heavy_blow", name: "과열 가동", everyPhases: 3, multiplier: 1.5 },
  },
  // 화산 지대 보스 — 처치 시 volcano_heart_defeated flag → 천공 성지 개방.
  "화산의 심장": {
    name: "화산의 심장",
    tags: ["golem"],
    image: "/images/monster/volcanicheart.webp",
    hp: 1200,
    atk: 72,
    def: 32,
    spd: 6,
    exp: 400,
    drops: [
      { kind: "material", materialId: "lava_core", chance: 1, amount: 4 },
      { kind: "material", materialId: "phoenix_feather", chance: 1, amount: 3 },
      { kind: "material", materialId: "flame_scale", chance: 1, amount: 5 },
      {
        kind: "recipe_one_of",
        recipeIds: ["volcano_sword", "volcano_shield", "volcano_spear", "volcano_claw"],
        chance: 1,
      },
      { kind: "recipe", recipeId: "volcano_armor", chance: 0.15 },
      { kind: "recipe", recipeId: "volcano_core", chance: 0.15 },
    ],
    dropQualityBias: 4,
    armorVulnerable: 0.3,
    playerDefVulnerable: 0.25,
    phaseTrigger: {
      hpFraction: 0.4,
      defBonus: 6,
      message: "화산의 심장이 붉게 달아오른다.",
    },
    onDefeatFlag: "volcano_heart_defeated",
    bonusAttackChancePct: 300,
  },
};
