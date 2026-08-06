import type { V2EquipmentId } from "./v2Equipment";
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
    "v2_storm_wreckage_greatsword",
    "v2_storm_wreckage_armor",
    "v2_storm_wreckage_gloves",
    "v2_storm_wreckage_boots",
    "v2_storm_wreckage_ring",
    "v2_storm_wreckage_necklace",
  ],
  gale: [
    "v2_storm_gale_bow",
    "v2_storm_gale_dagger",
    "v2_storm_gale_armor",
    "v2_storm_gale_gloves",
    "v2_storm_gale_boots",
    "v2_storm_gale_ring",
    "v2_storm_gale_necklace",
  ],
  thunder: [
    "v2_storm_thunder_staff",
    "v2_storm_thunder_armor",
    "v2_storm_thunder_gloves",
    "v2_storm_thunder_boots",
    "v2_storm_thunder_ring",
    "v2_storm_thunder_necklace",
  ],
};

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
