export const GUILD_WORKSHOP_MATERIAL_ID = {
  refinedIron: "v2_craft_refined_iron",
  mithrilShard: "v2_craft_mithril_shard",
  sunstone: "v2_craft_sunstone",
  auroraCrystal: "v2_craft_aurora_crystal",
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
      "철광석을 여러 번 정련한 대장간 전용 주괴. T4 제작 장비의 기본 병목 재료다.",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: {
    id: GUILD_WORKSHOP_MATERIAL_ID.mithrilShard,
    name: "미스릴 조각",
    description:
      "마력을 머금은 은빛 금속 조각. T6 제작 장비의 핵심 재료다.",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: {
    id: GUILD_WORKSHOP_MATERIAL_ID.sunstone,
    name: "태양석",
    description:
      "강한 열기와 빛을 품은 광석. T8 제작 장비에 쓰는 고급 재료다.",
  },
  [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: {
    id: GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal,
    name: "오로라 결정",
    description:
      "검은 왕도 주변에서 드물게 발견되는 다색 결정. T10 제작 장비의 최상위 병목 재료다.",
  },
} as const;

export const GUILD_WORKSHOP_MATERIAL_DROP_PCT: Record<
  GuildWorkshopMaterialId,
  number
> = {
  [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 0.004,
  [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 0.003,
  [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 0.002,
  [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 0.001,
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

  for (const id of candidates) {
    if (rng() < GUILD_WORKSHOP_MATERIAL_DROP_PCT[id]) {
      out[id] = (out[id] ?? 0) + 1;
    }
  }
  return out;
}
