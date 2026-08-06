export const LIFE_PROCESSED_MATERIAL_ID = {
  softwood: "v2_processed_softwood",
  hardwood: "v2_processed_hardwood",
  masterwood: "v2_processed_masterwood",
  basicIngot: "v2_basic_ingot",
  preciousIngot: "v2_precious_ingot",
  arcaneAlloy: "v2_arcane_alloy",
} as const;

export type LifeProcessedMaterialId =
  (typeof LIFE_PROCESSED_MATERIAL_ID)[keyof typeof LIFE_PROCESSED_MATERIAL_ID];

export const LIFE_PROCESSED_MATERIALS: Record<
  LifeProcessedMaterialId,
  { id: LifeProcessedMaterialId; name: string; description: string }
> = {
  [LIFE_PROCESSED_MATERIAL_ID.softwood]: {
    id: LIFE_PROCESSED_MATERIAL_ID.softwood,
    name: "다듬은 목재",
    description: "소나무·자작나무 원목을 규격에 맞게 다듬은 기초 생활 제작 재료.",
  },
  [LIFE_PROCESSED_MATERIAL_ID.hardwood]: {
    id: LIFE_PROCESSED_MATERIAL_ID.hardwood,
    name: "강화 목재",
    description: "버드나무·참나무를 압착하고 손질한 중급 생활 제작 재료.",
  },
  [LIFE_PROCESSED_MATERIAL_ID.masterwood]: {
    id: LIFE_PROCESSED_MATERIAL_ID.masterwood,
    name: "명인 목재",
    description: "삼나무·편백나무의 결을 살려 완성한 최고급 생활 제작 재료.",
  },
  [LIFE_PROCESSED_MATERIAL_ID.basicIngot]: {
    id: LIFE_PROCESSED_MATERIAL_ID.basicIngot,
    name: "기초 금속괴",
    description: "철·구리광석의 불순물을 걷어낸 기초 생활 제작 재료.",
  },
  [LIFE_PROCESSED_MATERIAL_ID.preciousIngot]: {
    id: LIFE_PROCESSED_MATERIAL_ID.preciousIngot,
    name: "귀금속괴",
    description: "은·금광석을 정밀하게 제련한 중급 생활 제작 재료.",
  },
  [LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy]: {
    id: LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy,
    name: "마력 합금",
    description: "미스릴과 아다만타이트의 성질을 보존해 제련한 최고급 생활 제작 재료.",
  },
};
