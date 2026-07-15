// 일반 사냥 몬스터 전용 제작 재료.
// 깊이 공용 제작 재료와 달리 실제로 처치한 몬스터 key 를 기준으로 굴린다.

export const MONSTER_CRAFT_MATERIAL_ID = {
  caveSpiderVenomGland: "v2_monster_cave_spider_venom_gland",
} as const;

export type MonsterCraftMaterialId =
  (typeof MONSTER_CRAFT_MATERIAL_ID)[keyof typeof MONSTER_CRAFT_MATERIAL_ID];

export const MONSTER_CRAFT_MATERIAL_IDS = Object.values(
  MONSTER_CRAFT_MATERIAL_ID,
) as MonsterCraftMaterialId[];

export const MONSTER_CRAFT_MATERIALS: Record<
  MonsterCraftMaterialId,
  { id: MonsterCraftMaterialId; name: string; description: string }
> = {
  [MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland]: {
    id: MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland,
    name: "동굴 거미의 맹독샘",
    description:
      "심층 동굴의 동굴 거미에게서 얻는 독샘. 길드 제작소에서 독 관련 특수 장비를 만드는 데 쓰인다.",
  },
};

export type MonsterCraftMaterialDropRule = {
  monsterKey: string;
  sourceArea: string;
  materialId: MonsterCraftMaterialId;
  chance: number;
};

export const MONSTER_CRAFT_MATERIAL_DROP_RULES: readonly MonsterCraftMaterialDropRule[] = [
  {
    monsterKey: "동굴 거미",
    sourceArea: "심층 동굴",
    materialId: MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland,
    chance: 0.02,
  },
];

/** 승리한 일반 사냥의 실제 몬스터 key 기준 전용 제작 재료 드랍. */
export function rollMonsterCraftMaterialDrops(
  monsterKey: string,
  rng: () => number,
  chanceMult = 1,
): Record<string, number> {
  const out: Record<string, number> = {};
  const mult = Math.max(0, Number(chanceMult) || 0);
  for (const rule of MONSTER_CRAFT_MATERIAL_DROP_RULES) {
    if (rule.monsterKey !== monsterKey) continue;
    if (rng() < Math.min(1, rule.chance * mult)) {
      out[rule.materialId] = (out[rule.materialId] ?? 0) + 1;
    }
  }
  return out;
}
