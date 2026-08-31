import type { V2EquipmentId } from "./v2Equipment";
import { SP_FRUIT } from "./spFruit";
import type {
  StormExpeditionEncounterKind,
  StormExpeditionRouteId,
} from "./stormExpedition";

export const STORM_EXPEDITION_ROUTE_MATERIAL_ID: Record<
  StormExpeditionRouteId,
  string
> = {
  wreckage: "v2_storm_floating_alloy_core",
  gale: "v2_storm_gale_essence",
  thunder: "v2_storm_thunder_crystal",
};

/** 향후 7차 전직 공통 재료. 사용처 출시 전에도 원정에서 선행 수집할 수 있다. */
export const STORM_ORIGIN_FRAGMENT_MATERIAL_ID = "v2_storm_origin_fragment";
export const STORM_HEART_FRAGMENT_MATERIAL_ID = "v2_storm_heart_fragment";

export const STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID = SP_FRUIT[5].materialId;
export const STORM_EXPEDITION_SP_FRUIT_CHANCE = 0.04;
export const STORM_EXPEDITION_SP_FRUIT_PITY_CLEARS = 25;
export const STORM_EXPEDITION_SP_FRUIT_CAP = 3;

export type StormExpeditionSpFruitProgress = {
  pity: number;
  obtained: number;
};

export type StormExpeditionSpFruitRoll = {
  dropped: boolean;
  next: StormExpeditionSpFruitProgress;
};

/** 항로와 무관하게 최종 보스 완주 1회를 공용 천장에 반영한다. */
export function rollStormExpeditionSpFruit(
  progress: StormExpeditionSpFruitProgress,
  rng: () => number = Math.random,
): StormExpeditionSpFruitRoll {
  const obtained = Math.min(
    STORM_EXPEDITION_SP_FRUIT_CAP,
    Math.max(0, Math.floor(Number(progress.obtained) || 0)),
  );
  if (obtained >= STORM_EXPEDITION_SP_FRUIT_CAP) {
    return { dropped: false, next: { pity: 0, obtained } };
  }

  const pity = Math.min(
    STORM_EXPEDITION_SP_FRUIT_PITY_CLEARS - 1,
    Math.max(0, Math.floor(Number(progress.pity) || 0)),
  );
  const dropped = pity + 1 >= STORM_EXPEDITION_SP_FRUIT_PITY_CLEARS
    || rng() < STORM_EXPEDITION_SP_FRUIT_CHANCE;
  return {
    dropped,
    next: dropped
      ? { pity: 0, obtained: obtained + 1 }
      : { pity: pity + 1, obtained },
  };
}

export const STORM_EXPEDITION_MATERIALS = {
  [STORM_EXPEDITION_ROUTE_MATERIAL_ID.wreckage]: {
    id: STORM_EXPEDITION_ROUTE_MATERIAL_ID.wreckage,
    name: "부유 합금핵",
    description:
      "부유 잔해지의 합금과 중력이 뭉친 핵. 힘·활력 계열 폭풍 장비와 상위 전직에 쓰인다.",
  },
  [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: {
    id: STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale,
    name: "칼바람 정수",
    description:
      "칼바람 항로의 가장 날카로운 기류를 응축한 정수. 민첩·행운 계열 폭풍 장비와 상위 전직에 쓰인다.",
  },
  [STORM_EXPEDITION_ROUTE_MATERIAL_ID.thunder]: {
    id: STORM_EXPEDITION_ROUTE_MATERIAL_ID.thunder,
    name: "뇌운 결정",
    description:
      "뇌운 속 마력과 정신의 파동이 굳은 결정. 지능·정신 계열 폭풍 장비와 상위 전직에 쓰인다.",
  },
  [STORM_ORIGIN_FRAGMENT_MATERIAL_ID]: {
    id: STORM_ORIGIN_FRAGMENT_MATERIAL_ID,
    name: "폭풍 기원의 파편",
    description:
      "폭풍의 근원에서 떨어져 나온 파편. 향후 7차 전직에 쓰이며, 지금부터 원정에서 모아 둘 수 있다.",
  },
  [STORM_HEART_FRAGMENT_MATERIAL_ID]: {
    id: STORM_HEART_FRAGMENT_MATERIAL_ID,
    name: "폭풍 심장 조각",
    description:
      "폭풍의 심장을 쓰러뜨리고 얻은 응축 결정. 최상위 폭풍 장비와 후속 원정 확장에 쓰인다.",
  },
} as const;

export const STORM_EXPEDITION_EQUIPMENT_IDS: Record<
  StormExpeditionRouteId,
  readonly V2EquipmentId[]
> = {
  wreckage: [
    "v2_storm_wreckage_ring",
    "v2_storm_wreckage_necklace",
    "v2_storm_breaker_ring",
    "v2_storm_breaker_necklace",
  ],
  gale: [
    "v2_storm_gale_ring",
    "v2_storm_gale_necklace",
    "v2_storm_shadow_ring",
    "v2_storm_shadow_necklace",
    "v2_storm_venom_ring",
    "v2_storm_venom_necklace",
  ],
  thunder: [
    "v2_storm_thunder_ring",
    "v2_storm_thunder_necklace",
    "v2_storm_sanctuary_ring",
    "v2_storm_sanctuary_necklace",
  ],
};

export type StormExpeditionUniqueRule = {
  guardianRouteChance: number;
  finalRouteChance: number;
  finalCrossChance: number;
  finalHeartChance: number;
};

export const STORM_EXPEDITION_UNIQUE_LOOT: StormExpeditionUniqueRule = {
  guardianRouteChance: 0.0015,
  finalRouteChance: 0.004,
  finalCrossChance: 0.002,
  finalHeartChance: 0.0005,
};

export const STORM_EXPEDITION_ROUTE_UNIQUE_IDS: Record<
  StormExpeditionRouteId,
  V2EquipmentId
> = {
  wreckage: "v2_storm_sig_wreckage_power_armor",
  gale: "v2_storm_sig_gale_orbit_boots",
  thunder: "v2_storm_sig_thunder_return_ring",
};

export const STORM_EXPEDITION_CROSS_UNIQUE_IDS: readonly V2EquipmentId[] = [
  "v2_storm_sig_triphase_gloves",
  "v2_storm_sig_confluence_necklace",
];

export const STORM_EXPEDITION_HEART_UNIQUE_ID: V2EquipmentId =
  "v2_storm_sig_heart_necklace";

export type StormExpeditionUniqueLoot = {
  routeUniqueId: V2EquipmentId | null;
  crossUniqueId: V2EquipmentId | null;
  heartUniqueId: V2EquipmentId | null;
  uniqueIds: V2EquipmentId[];
};

/** 수호자와 최종 보스에서만 굴리는 독립 유니크 보상. 중복 보유 여부는 제한하지 않는다. */
export function rollStormExpeditionUniqueLoot(
  routeId: StormExpeditionRouteId,
  encounterKind: StormExpeditionEncounterKind,
  rng: () => number = Math.random,
  modifiers: { uniqueChanceMultiplier?: number } = {},
): StormExpeditionUniqueLoot {
  let routeUniqueId: V2EquipmentId | null = null;
  let crossUniqueId: V2EquipmentId | null = null;
  let heartUniqueId: V2EquipmentId | null = null;
  const multiplier = Math.max(0, modifiers.uniqueChanceMultiplier ?? 1);

  if (encounterKind === "guardian") {
    if (
      rng() <
      Math.min(1, STORM_EXPEDITION_UNIQUE_LOOT.guardianRouteChance * multiplier)
    ) {
      routeUniqueId = STORM_EXPEDITION_ROUTE_UNIQUE_IDS[routeId];
    }
  } else if (encounterKind === "final_boss") {
    if (
      rng() <
      Math.min(1, STORM_EXPEDITION_UNIQUE_LOOT.finalRouteChance * multiplier)
    ) {
      routeUniqueId = STORM_EXPEDITION_ROUTE_UNIQUE_IDS[routeId];
    }
    if (
      rng() <
      Math.min(1, STORM_EXPEDITION_UNIQUE_LOOT.finalCrossChance * multiplier)
    ) {
      crossUniqueId = STORM_EXPEDITION_CROSS_UNIQUE_IDS[
        Math.min(
          STORM_EXPEDITION_CROSS_UNIQUE_IDS.length - 1,
          Math.floor(rng() * STORM_EXPEDITION_CROSS_UNIQUE_IDS.length),
        )
      ] ?? null;
    }
    if (rng() < STORM_EXPEDITION_UNIQUE_LOOT.finalHeartChance) {
      heartUniqueId = STORM_EXPEDITION_HEART_UNIQUE_ID;
    }
  }

  return {
    routeUniqueId,
    crossUniqueId,
    heartUniqueId,
    uniqueIds: [routeUniqueId, crossUniqueId, heartUniqueId].filter(
      (id): id is V2EquipmentId => id !== null,
    ),
  };
}

export type StormExpeditionLoot = {
  materials: Record<string, number>;
  equipmentId: V2EquipmentId | null;
};

export type StormExpeditionLootRule = {
  routeMaterialChance: number;
  routeMaterialMin: number;
  routeMaterialMax: number;
  equipmentChance: number;
  originFragmentChance: number;
  originFragmentGuaranteed: number;
  heartFragmentGuaranteed: number;
};

export const STORM_EXPEDITION_LOOT: Record<
  StormExpeditionEncounterKind,
  StormExpeditionLootRule
> = {
  early_trash: {
    routeMaterialChance: 0.15,
    routeMaterialMin: 1,
    routeMaterialMax: 1,
    equipmentChance: 0.001,
    originFragmentChance: 0.0005,
    originFragmentGuaranteed: 0,
    heartFragmentGuaranteed: 0,
  },
  late_trash: {
    routeMaterialChance: 0.25,
    routeMaterialMin: 1,
    routeMaterialMax: 1,
    equipmentChance: 0.0025,
    originFragmentChance: 0.001,
    originFragmentGuaranteed: 0,
    heartFragmentGuaranteed: 0,
  },
  elite: {
    routeMaterialChance: 1,
    routeMaterialMin: 1,
    routeMaterialMax: 2,
    equipmentChance: 0.01,
    originFragmentChance: 0.01,
    originFragmentGuaranteed: 0,
    heartFragmentGuaranteed: 0,
  },
  guardian: {
    routeMaterialChance: 1,
    routeMaterialMin: 2,
    routeMaterialMax: 3,
    equipmentChance: 0.03,
    originFragmentChance: 0.05,
    originFragmentGuaranteed: 0,
    heartFragmentGuaranteed: 0,
  },
  final_boss: {
    routeMaterialChance: 1,
    routeMaterialMin: 4,
    routeMaterialMax: 6,
    equipmentChance: 0.08,
    originFragmentChance: 0,
    originFragmentGuaranteed: 1,
    heartFragmentGuaranteed: 1,
  },
} as const;

/** 구형 UI import 호환용. 순서는 전초/중층/정예/수호자/최종 보스다. */
export const STORM_EXPEDITION_STAGE_LOOT = [
  STORM_EXPEDITION_LOOT.early_trash,
  STORM_EXPEDITION_LOOT.late_trash,
  STORM_EXPEDITION_LOOT.elite,
  STORM_EXPEDITION_LOOT.guardian,
  STORM_EXPEDITION_LOOT.final_boss,
] as const;

export function rollStormExpeditionLoot(
  routeId: StormExpeditionRouteId,
  encounterKindOrLegacyStage: StormExpeditionEncounterKind | number,
  rng: () => number = Math.random,
  modifiers: { equipmentChanceMultiplier?: number } = {},
): StormExpeditionLoot {
  const encounterKind = typeof encounterKindOrLegacyStage === "number"
    ? (["early_trash", "late_trash", "elite", "guardian"] as const)[Math.min(3, Math.max(0, Math.floor(Number(encounterKindOrLegacyStage) || 0)))]
    : encounterKindOrLegacyStage;
  const rule = STORM_EXPEDITION_LOOT[encounterKind];
  const materials: Record<string, number> = {};
  const routeMaterialId = STORM_EXPEDITION_ROUTE_MATERIAL_ID[routeId];

  if (rule.routeMaterialChance >= 1 || rng() < rule.routeMaterialChance) {
    const span = rule.routeMaterialMax - rule.routeMaterialMin + 1;
    const amount =
      span <= 1
        ? rule.routeMaterialMin
        : rule.routeMaterialMin + Math.floor(rng() * span);
    materials[routeMaterialId] = amount;
  }

  const originAmount =
    rule.originFragmentGuaranteed +
    (rule.originFragmentChance > 0 && rng() < rule.originFragmentChance ? 1 : 0);
  if (originAmount > 0) {
    materials[STORM_ORIGIN_FRAGMENT_MATERIAL_ID] = originAmount;
  }
  if (rule.heartFragmentGuaranteed > 0) {
    materials[STORM_HEART_FRAGMENT_MATERIAL_ID] = rule.heartFragmentGuaranteed;
  }

  let equipmentId: V2EquipmentId | null = null;
  const equipmentChance = Math.min(
    1,
    rule.equipmentChance * Math.max(0, modifiers.equipmentChanceMultiplier ?? 1),
  );
  if (rng() < equipmentChance) {
    const pool = STORM_EXPEDITION_EQUIPMENT_IDS[routeId];
    equipmentId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] ?? null;
  }

  return { materials, equipmentId };
}

export function mergeStormExpeditionMaterials(
  current: Readonly<Record<string, number>>,
  gained: Readonly<Record<string, number>>,
): Record<string, number> {
  const next = { ...current };
  for (const [id, amountRaw] of Object.entries(gained)) {
    const amount = Math.max(0, Math.floor(Number(amountRaw) || 0));
    if (amount <= 0) continue;
    next[id] = Math.max(0, Math.floor(Number(next[id]) || 0)) + amount;
  }
  return next;
}
