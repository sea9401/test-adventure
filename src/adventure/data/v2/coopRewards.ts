// 협동 보스 보상 확장 — 확정 주화/보스 재료 + 확률 장비 상자.
// 표시 테이블과 claim 라우트가 같은 데이터를 읽어, 보이는 드랍과 실제 지급이 어긋나지 않게 한다.

import {
  COOP_TIER_LABEL,
  COOP_TIER_ORDER,
  type CoopBossKindId,
  type CoopRewardTier,
} from "./coopBosses";
import {
  V2_EQUIPMENT,
  isUnique,
  type V2EquipmentId,
  type V2EquipCatalogTier,
} from "./v2Equipment";

export const COOP_COIN_MATERIAL_ID = "v2_coop_coin";
export const COOP_MASTERY_TOME_MATERIAL_ID = "v2_coop_mastery_tome";
export const COOP_MASTERY_TOME_GAIN = 50;

export const COOP_BOSS_MATERIAL_ID: Record<CoopBossKindId, string> = {
  mountain_chief: "v2_coop_mountain_claw",
  mountain_chief_hard: "v2_coop_mountain_trace",
  abyssal_tyrant: "v2_coop_abyssal_scale",
  canyon_predator: "v2_coop_canyon_chitin",
  lake_sovereign: "v2_coop_lake_crystal",
  void_priest: "v2_coop_void_relic",
};

export const COOP_EQUIPMENT_BOX_ID: Record<CoopBossKindId, string> = {
  mountain_chief: "v2_coop_mountain_equipment_box",
  mountain_chief_hard: "v2_coop_mountain_hard_equipment_box",
  abyssal_tyrant: "v2_coop_abyssal_equipment_box",
  canyon_predator: "v2_coop_canyon_equipment_box",
  lake_sovereign: "v2_coop_lake_equipment_box",
  void_priest: "v2_coop_void_equipment_box",
};

export type CoopEquipmentBoxDef = {
  id: string;
  name: string;
  description: string;
  displayTier: 1 | 2 | 3 | 4 | 5;
  source: string;
  catalogTiers: readonly V2EquipCatalogTier[];
  itemIds?: readonly V2EquipmentId[];
};

export const COOP_EQUIPMENT_BOX: Record<CoopBossKindId, CoopEquipmentBoxDef> = {
  mountain_chief: {
    id: COOP_EQUIPMENT_BOX_ID.mountain_chief,
    name: "산군 1티어 장비 상자",
    description: "사용하면 1T 정규 장비 중 1개를 무작위로 획득한다.",
    displayTier: 1,
    source: "1T 정규 장비",
    catalogTiers: [1, 2, 3],
  },
  mountain_chief_hard: {
    id: COOP_EQUIPMENT_BOX_ID.mountain_chief_hard,
    name: "흉포한 산군 5T 장비 상자",
    description:
      "사용하면 하드 산군 전용 5T 장비 중 1개를 무작위로 획득한다.",
    displayTier: 5,
    source: "하드 산군",
    catalogTiers: [13],
    itemIds: [
      "v2_hard_sangoon_cleaver",
      "v2_hard_sangoon_hide",
      "v2_hard_sangoon_claws",
      "v2_hard_sangoon_stride",
      "v2_hard_sangoon_ring",
      "v2_hard_sangoon_amulet",
    ],
  },
  abyssal_tyrant: {
    id: COOP_EQUIPMENT_BOX_ID.abyssal_tyrant,
    name: "심연어룡 5T 장비 상자",
    description:
      "사용하면 심연어룡 전용 5T 장비 중 1개를 무작위로 획득한다.",
    displayTier: 5,
    source: "심연어룡",
    catalogTiers: [13],
    itemIds: [
      "v2_boss_abyssal_armor",
      "v2_boss_abyssal_ring",
      "v2_boss_abyssal_necklace",
    ],
  },
  canyon_predator: {
    id: COOP_EQUIPMENT_BOX_ID.canyon_predator,
    name: "스콜피온 2티어 장비 상자",
    description: "사용하면 2T 정규 장비 중 1개를 무작위로 획득한다.",
    displayTier: 2,
    source: "2T 정규 장비",
    catalogTiers: [4, 5, 6],
  },
  lake_sovereign: {
    id: COOP_EQUIPMENT_BOX_ID.lake_sovereign,
    name: "호수 3티어 장비 상자",
    description: "사용하면 3T 정규 장비 중 1개를 무작위로 획득한다.",
    displayTier: 3,
    source: "3T 정규 장비",
    catalogTiers: [7, 8, 9],
  },
  void_priest: {
    id: COOP_EQUIPMENT_BOX_ID.void_priest,
    name: "공허 4티어 장비 상자",
    description: "사용하면 4T 정규 장비 중 1개를 무작위로 획득한다.",
    displayTier: 4,
    source: "4T 정규 장비",
    catalogTiers: [10, 11, 12],
  },
};

export const COOP_BOSS_MATERIAL: Record<
  CoopBossKindId,
  { id: string; name: string; description: string }
> = {
  mountain_chief: {
    id: COOP_BOSS_MATERIAL_ID.mountain_chief,
    name: "산군의 발톱",
    description:
      "산군 토벌 기여 보상으로 얻는 재료. 협동 보스 교환 보상에 쓰일 수 있다.",
  },
  mountain_chief_hard: {
    id: COOP_BOSS_MATERIAL_ID.mountain_chief_hard,
    name: "산군의 흔적",
    description:
      "흉포한 산군 토벌 기여 보상으로 얻는 재료. 하드 보스 장비 성장에 쓰일 수 있다.",
  },
  abyssal_tyrant: {
    id: COOP_BOSS_MATERIAL_ID.abyssal_tyrant,
    name: "심연어룡의 비늘",
    description:
      "심연어룡 토벌 기여 보상으로 얻는 재료. 수압을 머금은 하드 보스 장비 성장에 쓰일 수 있다.",
  },
  canyon_predator: {
    id: COOP_BOSS_MATERIAL_ID.canyon_predator,
    name: "전갈왕의 갑각",
    description:
      "스콜피온 킹 토벌 기여 보상으로 얻는 재료. 협동 보스 교환 보상에 쓰일 수 있다.",
  },
  lake_sovereign: {
    id: COOP_BOSS_MATERIAL_ID.lake_sovereign,
    name: "호수의 서리 결정",
    description:
      "호수의 괴물 토벌 기여 보상으로 얻는 재료. 협동 보스 교환 보상에 쓰일 수 있다.",
  },
  void_priest: {
    id: COOP_BOSS_MATERIAL_ID.void_priest,
    name: "공허 사제의 성물",
    description:
      "공허 사제 토벌 기여 보상으로 얻는 재료. 협동 보스 교환 보상에 쓰일 수 있다.",
  },
};

export const COOP_REWARD_MATERIALS: Record<
  string,
  { id: string; name: string; description: string }
> = {
  [COOP_COIN_MATERIAL_ID]: {
    id: COOP_COIN_MATERIAL_ID,
    name: "협동 주화",
    description:
      "협동 보스 토벌 기여 보상으로 얻는 주화. 향후 협동 보상 교환에 쓰인다.",
  },
  [COOP_MASTERY_TOME_MATERIAL_ID]: {
    id: COOP_MASTERY_TOME_MATERIAL_ID,
    name: "상급 숙련 교본",
    description: `사용하면 현재 직업 숙련도가 ${COOP_MASTERY_TOME_GAIN} 오른다. 거래소에서 거래할 수 있다.`,
  },
  ...Object.fromEntries(
    Object.values(COOP_BOSS_MATERIAL).map((m) => [m.id, m]),
  ),
  ...Object.fromEntries(Object.values(COOP_EQUIPMENT_BOX).map((b) => [b.id, b])),
};

export type CoopExtraRewardRule = {
  coin: number;
  bossMaterial: number;
  equipmentBoxChance: number;
};

export const COOP_EXTRA_REWARD_RULES: Record<
  CoopRewardTier,
  CoopExtraRewardRule
> = {
  bronze: { coin: 3, bossMaterial: 1, equipmentBoxChance: 0 },
  silver: { coin: 8, bossMaterial: 2, equipmentBoxChance: 0.03 },
  gold: { coin: 15, bossMaterial: 4, equipmentBoxChance: 0.06 },
  epic: { coin: 28, bossMaterial: 8, equipmentBoxChance: 0.12 },
  legend: { coin: 45, bossMaterial: 15, equipmentBoxChance: 0.2 },
};

export const COOP_HARD_EXTRA_REWARD_RULES: Record<
  CoopRewardTier,
  CoopExtraRewardRule
> = {
  bronze: { coin: 3, bossMaterial: 1, equipmentBoxChance: 0 },
  silver: { coin: 8, bossMaterial: 2, equipmentBoxChance: 0 },
  gold: { coin: 15, bossMaterial: 4, equipmentBoxChance: 0.1 },
  epic: { coin: 28, bossMaterial: 7, equipmentBoxChance: 0.25 },
  legend: { coin: 45, bossMaterial: 12, equipmentBoxChance: 1 },
};

export function coopExtraRewardRuleFor(
  boss: CoopBossKindId,
  tier: CoopRewardTier,
): CoopExtraRewardRule {
  return boss === "mountain_chief_hard" || boss === "abyssal_tyrant"
    ? COOP_HARD_EXTRA_REWARD_RULES[tier]
    : COOP_EXTRA_REWARD_RULES[tier];
}

export type CoopExtraRewardRoll = {
  coin: number;
  bossMaterialId: string;
  bossMaterialName: string;
  bossMaterialCount: number;
  equipmentBoxId: string | null;
  equipmentBoxName: string | null;
};

export function rollCoopExtraRewards(
  boss: CoopBossKindId,
  tier: CoopRewardTier,
  rng: () => number,
): CoopExtraRewardRoll {
  const rule = coopExtraRewardRuleFor(boss, tier);
  const material = COOP_BOSS_MATERIAL[boss];
  const box = COOP_EQUIPMENT_BOX[boss];
  const gotBox = rule.equipmentBoxChance > 0 && rng() < rule.equipmentBoxChance;
  return {
    coin: rule.coin,
    bossMaterialId: material.id,
    bossMaterialName: material.name,
    bossMaterialCount: rule.bossMaterial,
    equipmentBoxId: gotBox ? box.id : null,
    equipmentBoxName: gotBox ? box.name : null,
  };
}

export function coopExtraRewardDropText(boss: CoopBossKindId): string[] {
  const material = COOP_BOSS_MATERIAL[boss];
  const box = COOP_EQUIPMENT_BOX[boss];
  return COOP_TIER_ORDER.map((tier) => {
    const rule = coopExtraRewardRuleFor(boss, tier);
    const parts = [
      `협동 주화 x${rule.coin}`,
      `${material.name} x${rule.bossMaterial}`,
    ];
    if (rule.equipmentBoxChance > 0) {
      parts.push(`${box.name} ${Math.round(rule.equipmentBoxChance * 100)}%`);
    }
    return `${COOP_TIER_LABEL[tier]}: ${parts.join(", ")}`;
  });
}

export function parseCoopEquipmentBoxId(
  value: unknown,
): CoopBossKindId | null {
  if (typeof value !== "string") return null;
  for (const boss of Object.keys(COOP_EQUIPMENT_BOX_ID) as CoopBossKindId[]) {
    if (COOP_EQUIPMENT_BOX_ID[boss] === value) return boss;
  }
  return null;
}

export function rollCoopEquipmentBoxItem(
  boss: CoopBossKindId,
  rng: () => number,
): V2EquipmentId | null {
  const box = COOP_EQUIPMENT_BOX[boss];
  if (box.itemIds && box.itemIds.length > 0) {
    return box.itemIds[Math.floor(rng() * box.itemIds.length)] ?? null;
  }
  const allowed = new Set<V2EquipCatalogTier>(box.catalogTiers);
  const candidates = Object.values(V2_EQUIPMENT)
    .filter((item) => {
      if (!allowed.has(item.tier)) return false;
      if (isUnique(item)) return false;
      if (item.craftOnly || item.starterOnly) return false;
      return true;
    })
    .map((item) => item.id);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)] ?? null;
}
