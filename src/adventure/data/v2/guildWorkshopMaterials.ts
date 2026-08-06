export const GUILD_WORKSHOP_MATERIAL_ID = {
  refinedIron: "v2_craft_refined_iron",
  mithrilShard: "v2_craft_mithril_shard",
  sunstone: "v2_craft_sunstone",
  auroraCrystal: "v2_craft_aurora_crystal",
  abyssalStarsteel: "v2_craft_abyssal_starsteel",
} as const;

export type GuildWorkshopMaterialId =
  (typeof GUILD_WORKSHOP_MATERIAL_ID)[keyof typeof GUILD_WORKSHOP_MATERIAL_ID];

export const GUILD_WORKSHOP_MATERIAL_IDS = Object.values(
  GUILD_WORKSHOP_MATERIAL_ID,
) as GuildWorkshopMaterialId[];

export const GUILD_WORKSHOP_MATERIALS = {
  [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: {
    id: GUILD_WORKSHOP_MATERIAL_ID.refinedIron,
    name: "정제 철괴",
    description:
      "철광석을 여러 번 정련한 제작소 전용 주괴. 2T 제작 장비의 기본 병목 재료다.",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: {
    id: GUILD_WORKSHOP_MATERIAL_ID.mithrilShard,
    name: "미스릴 조각",
    description:
      "마력을 머금은 은빛 금속 조각. 2T 후반~3T 제작 장비의 핵심 재료다.",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: {
    id: GUILD_WORKSHOP_MATERIAL_ID.sunstone,
    name: "태양석",
    description:
      "강한 열기와 빛을 품은 광석. 3T 제작 장비에 쓰는 고급 재료다.",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: {
    id: GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal,
    name: "오로라 결정",
    description:
      "검은 왕도 주변에서 드물게 발견되는 다색 결정. 4T 제작 장비의 최상위 병목 재료다.",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel]: {
    id: GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel,
    name: "심해성철",
    description:
      "폭풍과 심해의 압력을 견딘 검푸른 합금핵. 극단적인 성능을 지닌 5T 키카드 제작에 쓰인다.",
  },
} as const;

export const GUILD_WORKSHOP_MATERIAL_DROP_PCT: Record<
  GuildWorkshopMaterialId,
  number
> = {
  [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 0.0045,
  [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 0.0035,
  [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 0.0025,
  [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 0.002,
  [GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel]: 0.0017,
};

export const GUILD_WORKSHOP_MATERIAL_SOURCES: Record<
  GuildWorkshopMaterialId,
  {
    source: string;
    depthText: string;
    note: string;
  }
> = {
  [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: {
    source: "필드 사냥",
    depthText: "마른 협곡~얼음 호수",
    note: "2T 제작과 초반 해체 루프의 기본 재료",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: {
    source: "필드 사냥",
    depthText: "심층 동굴~잊힌 성소",
    note: "2T 후반~3T 제작 전용 장비의 병목 재료",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: {
    source: "필드 사냥",
    depthText: "리자드 늪지~짐승의 소굴",
    note: "3T 고급 제작과 명장 제작 준비 재료",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: {
    source: "필드 사냥",
    depthText: "검은 왕도 이후",
    note: "4T 최상위 제작 전용 장비 재료",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel]: {
    source: "필드 사냥",
    depthText: "폭풍 산맥 · 최심부~심해 폐허",
    note: "5T 키카드 제작 전용 병목 재료",
  },
};

export function rollGuildWorkshopMaterialDrops(
  depthRaw: number,
  rng: () => number,
): Record<string, number> {
  const depth = Math.max(1, Math.floor(depthRaw));
  const out: Record<string, number> = {};
  const candidates: GuildWorkshopMaterialId[] = [];
  if (depth >= 7 && depth <= 18) {
    candidates.push(GUILD_WORKSHOP_MATERIAL_ID.refinedIron);
  }
  if (depth >= 19 && depth <= 30) {
    candidates.push(GUILD_WORKSHOP_MATERIAL_ID.mithrilShard);
  }
  if (depth >= 31 && depth <= 42) {
    candidates.push(GUILD_WORKSHOP_MATERIAL_ID.sunstone);
  }
  if (depth >= 43) {
    candidates.push(GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal);
  }
  // 폭풍 산맥의 최심부 쌍(65~66)과 심해 폐허 전 구간(67~72).
  if (depth >= 65) {
    candidates.push(GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel);
  }

  for (const id of candidates) {
    if (rng() < GUILD_WORKSHOP_MATERIAL_DROP_PCT[id]) {
      out[id] = (out[id] ?? 0) + 1;
    }
  }
  return out;
}
