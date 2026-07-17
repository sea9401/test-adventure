// 일반 사냥 몬스터 전용 제작 재료.
// 깊이 공용 제작 재료와 달리 실제로 처치한 몬스터 key 를 기준으로 굴린다.

export const MONSTER_CRAFT_MATERIAL_ID = {
  caveSpiderVenomGland: "v2_monster_cave_spider_venom_gland",
  rockGolemResonantCore: "v2_monster_rock_golem_resonant_core",
  sparkScorpionConductiveSac: "v2_monster_spark_scorpion_conductive_sac",
  abyssWormBurrowingJaw: "v2_monster_abyss_worm_burrowing_jaw",
  plateauSlayerSerratedBone: "v2_monster_plateau_slayer_serrated_bone",
  lightningOracleThunderRunestone:
    "v2_monster_lightning_oracle_thunder_runestone",
  trenchApostlePrayerCore: "v2_monster_trench_apostle_prayer_core",
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
  [MONSTER_CRAFT_MATERIAL_ID.rockGolemResonantCore]: {
    id: MONSTER_CRAFT_MATERIAL_ID.rockGolemResonantCore,
    name: "암반 골렘의 공명핵",
    description:
      "심층 동굴의 암반 골렘 안에서 낮게 진동하는 핵. 피격 충격을 방어력으로 바꾸는 갑주 개량에 쓰인다.",
  },
  [MONSTER_CRAFT_MATERIAL_ID.sparkScorpionConductiveSac]: {
    id: MONSTER_CRAFT_MATERIAL_ID.sparkScorpionConductiveSac,
    name: "스파크 전갈의 전도낭",
    description:
      "마른 협곡의 스파크 전갈이 전기를 모으는 기관. 공격에 감전을 싣는 장갑 개량에 쓰인다.",
  },
  [MONSTER_CRAFT_MATERIAL_ID.abyssWormBurrowingJaw]: {
    id: MONSTER_CRAFT_MATERIAL_ID.abyssWormBurrowingJaw,
    name: "심연 벌레의 굴착턱",
    description:
      "심층 동굴의 암맥을 파고드는 단단한 턱. 방어를 파쇄하는 화살촉을 벼리는 데 쓰인다.",
  },
  [MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone]: {
    id: MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone,
    name: "고원 학살자의 톱날뼈",
    description:
      "백골 고원의 학살자가 무기에 덧댄 톱니 모양 뼈. 깊은 출혈을 남기는 대검 개량에 쓰인다.",
  },
  [MONSTER_CRAFT_MATERIAL_ID.lightningOracleThunderRunestone]: {
    id: MONSTER_CRAFT_MATERIAL_ID.lightningOracleThunderRunestone,
    name: "낙뢰 예언자의 뇌문석",
    description:
      "폭풍 산맥의 예언자가 번개 문양을 새긴 돌. 주문의 마나를 되돌리는 마도서 개량에 쓰인다.",
  },
  [MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore]: {
    id: MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore,
    name: "해구의 사도 기도핵",
    description:
      "심해 폐허의 사도가 기도를 응축한 성유물. 회복의 여운을 보호막으로 굳히는 목걸이 개량에 쓰인다.",
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
    monsterKey: "스파크 전갈",
    sourceArea: "마른 협곡",
    materialId: MONSTER_CRAFT_MATERIAL_ID.sparkScorpionConductiveSac,
    chance: 0.02,
  },
  {
    monsterKey: "동굴 거미",
    sourceArea: "심층 동굴",
    materialId: MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland,
    chance: 0.02,
  },
  {
    monsterKey: "암반 골렘",
    sourceArea: "심층 동굴",
    materialId: MONSTER_CRAFT_MATERIAL_ID.rockGolemResonantCore,
    chance: 0.02,
  },
  {
    monsterKey: "심연 벌레",
    sourceArea: "심층 동굴",
    materialId: MONSTER_CRAFT_MATERIAL_ID.abyssWormBurrowingJaw,
    chance: 0.02,
  },
  {
    monsterKey: "고원 학살자",
    sourceArea: "백골 고원",
    materialId: MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone,
    chance: 0.02,
  },
  {
    monsterKey: "낙뢰 예언자",
    sourceArea: "폭풍 산맥",
    materialId: MONSTER_CRAFT_MATERIAL_ID.lightningOracleThunderRunestone,
    chance: 0.02,
  },
  {
    monsterKey: "해구의 사도",
    sourceArea: "심해 폐허",
    materialId: MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore,
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
