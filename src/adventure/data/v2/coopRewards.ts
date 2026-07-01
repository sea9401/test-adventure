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
  type V2EquipTier,
} from "./v2Equipment";

export const COOP_COIN_MATERIAL_ID = "v2_coop_coin";

export const COOP_BOSS_MATERIAL_ID: Record<CoopBossKindId, string> = {
  mountain_chief: "v2_coop_mountain_claw",
  canyon_predator: "v2_coop_canyon_chitin",
  lake_sovereign: "v2_coop_lake_crystal",
  void_priest: "v2_coop_void_relic",
};

export const COOP_EQUIPMENT_BOX_ID: Record<CoopBossKindId, string> = {
  mountain_chief: "v2_coop_mountain_equipment_box",
  canyon_predator: "v2_coop_canyon_equipment_box",
  lake_sovereign: "v2_coop_lake_equipment_box",
  void_priest: "v2_coop_void_equipment_box",
};

export type CoopEquipmentBoxDef = {
  id: string;
  name: string;
  description: string;
  displayTier: 1 | 2 | 3 | 4;
  source: string;
  tiers: readonly V2EquipTier[];
};

export const COOP_EQUIPMENT_BOX: Record<CoopBossKindId, CoopEquipmentBoxDef> = {
  mountain_chief: {
    id: COOP_EQUIPMENT_BOX_ID.mountain_chief,
    name: "산군 1티어 장비 상자",
    description:
      "사용하면 들판 I~III 등급의 정규 장비 중 1개를 무작위로 획득한다.",
    displayTier: 1,
    source: "들판 I~III",
    tiers: [1, 2, 3],
  },
  canyon_predator: {
    id: COOP_EQUIPMENT_BOX_ID.canyon_predator,
    name: "스콜피온 2티어 장비 상자",
    description:
      "사용하면 마른 협곡~심층 동굴 등급의 정규 장비 중 1개를 무작위로 획득한다.",
    displayTier: 2,
    source: "마른 협곡~심층 동굴",
    tiers: [4, 5, 6],
  },
  lake_sovereign: {
    id: COOP_EQUIPMENT_BOX_ID.lake_sovereign,
    name: "호수 3티어 장비 상자",
    description:
      "사용하면 잊힌 성소~짐승의 소굴 등급의 정규 장비 중 1개를 무작위로 획득한다.",
    displayTier: 3,
    source: "잊힌 성소~짐승의 소굴",
    tiers: [7, 8, 9],
  },
  void_priest: {
    id: COOP_EQUIPMENT_BOX_ID.void_priest,
    name: "공허 4티어 장비 상자",
    description:
      "사용하면 검은 왕도~백골 고원 등급의 정규 장비 중 1개를 무작위로 획득한다.",
    displayTier: 4,
    source: "검은 왕도~백골 고원",
    tiers: [10, 11, 12],
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
  const rule = COOP_EXTRA_REWARD_RULES[tier];
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
    const rule = COOP_EXTRA_REWARD_RULES[tier];
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
  const tierGroups: readonly (readonly V2EquipTier[])[] =
    box.displayTier === 4
      ? [box.tiers, [7, 8, 9], [4, 5, 6], [1, 2, 3]]
      : box.displayTier === 3
        ? [box.tiers, [4, 5, 6], [1, 2, 3]]
        : box.displayTier === 2
          ? [box.tiers, [1, 2, 3]]
          : [box.tiers];
  let candidates: V2EquipmentId[] = [];
  for (const tiers of tierGroups) {
    const allowed = new Set<V2EquipTier>(tiers);
    candidates = Object.values(V2_EQUIPMENT)
      .filter((item) => {
        if (!allowed.has(item.tier)) return false;
        if (isUnique(item)) return false;
        if (item.craftOnly || item.starterOnly || item.noDrop) return false;
        return true;
      })
      .map((item) => item.id);
    if (candidates.length > 0) break;
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)] ?? null;
}
