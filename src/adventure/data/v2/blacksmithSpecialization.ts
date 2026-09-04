import {
  V2_EQUIP_OPTION_KEYS,
  V2_EQUIPMENT,
  parseCraftedBy,
  parseCraftQuality,
  parseEquipRollForItem,
  type V2CraftedBy,
  type V2CraftQualityState,
  type V2EquipOptions,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipRoll,
  type V2EquipSlot,
} from "./v2Equipment";
import {
  equipRollFromPercentiles,
  equipRollPercentiles,
  equipRollQualityWeights,
  rollItemStats,
  type V2EquipRollPercentiles,
} from "./v2EquipVariance";
import {
  GUILD_WORKSHOP_MATERIAL_ID,
  type GuildWorkshopMaterialId,
} from "./guildWorkshopMaterials";

export type BlacksmithSpecialtyId = "weapon" | "armor" | "jewelry";

export type BlacksmithOptionFocusId =
  | "weapon_offense"
  | "weapon_precision"
  | "weapon_technique"
  | "weapon_guard"
  | "armor_guard"
  | "armor_mobility"
  | "armor_resistance"
  | "armor_offense"
  | "jewelry_offense"
  | "jewelry_survival"
  | "jewelry_recovery";

export type BlacksmithStructureId =
  | "balanced"
  | "primary"
  | "option"
  | "extreme"
  | "stable";

export type BlacksmithProgressionState = {
  specialty?: BlacksmithSpecialtyId;
  signatureIid?: string;
  pendingInspection?: BlacksmithPendingInspection;
  lastInspectionResolution?: BlacksmithInspectionResolution;
};

export type BlacksmithPendingInspection = {
  inspectionId: string;
  recipeId: string;
  equipmentId: V2EquipmentId;
  craftQuality: V2CraftQualityState;
  candidates: readonly [V2EquipRoll, V2EquipRoll];
  craftedBy: V2CraftedBy;
  createdAt: string;
};

export type BlacksmithInspectionResolution = {
  inspectionId: string;
  candidateIndex: 0 | 1;
  iid: string;
};

export type BlacksmithOptionFocusDefinition = {
  id: BlacksmithOptionFocusId;
  name: string;
  optionKeys: readonly (keyof V2EquipOptions)[];
};

export type BlacksmithStructureDefinition = {
  id: BlacksmithStructureId;
  name: string;
  requiredLevel: number;
};

export type BlacksmithCraftControlSelection = {
  optionFocus?: BlacksmithOptionFocusId;
  structure?: BlacksmithStructureId;
  useCatalyst: boolean;
};

export type BlacksmithControlledRoll = {
  roll: V2EquipRoll;
  percentiles: V2EquipRollPercentiles;
  focusApplied: boolean;
};

export const BLACKSMITH_SPECIALTY_LEVEL = 13;
export const BLACKSMITH_OPTION_FOCUS_LEVEL = 15;
export const BLACKSMITH_CATALYST_LEVEL = 17;
export const BLACKSMITH_STRUCTURE_LEVEL = 20;
export const BLACKSMITH_STABLE_LEVEL = 22;
export const BLACKSMITH_CATALYST_PRESERVE_LEVEL = 24;
export const BLACKSMITH_MASTERWORK_TECHNIQUE_LEVEL = 26;
export const BLACKSMITH_SIGNATURE_LEVEL = 28;
export const BLACKSMITH_INSPECTION_LEVEL = 30;

export const BLACKSMITH_FOCUS_CHANCE_PCT = 75;
export const BLACKSMITH_CATALYST_FOCUS_CHANCE_PCT = 90;
export const BLACKSMITH_CATALYST_PRESERVE_CHANCE_PCT = 20;
export const BLACKSMITH_CATALYST_FOCUS_FLOOR = 0.35;
export const BLACKSMITH_STRUCTURE_TRANSFER_BUDGET = 0.15;

export const BLACKSMITH_SPECIALTY_NAMES: Record<
  BlacksmithSpecialtyId,
  string
> = {
  weapon: "무기 단조",
  armor: "방어구 단조",
  jewelry: "장신구 세공",
};

export const BLACKSMITH_OPTION_FOCUSES: Record<
  BlacksmithSpecialtyId,
  readonly BlacksmithOptionFocusDefinition[]
> = {
  weapon: [
    {
      id: "weapon_offense",
      name: "화력",
      optionKeys: ["crit", "critMult"],
    },
    { id: "weapon_precision", name: "정밀", optionKeys: ["accuracy"] },
    { id: "weapon_technique", name: "기교", optionKeys: ["spd", "mp"] },
    {
      id: "weapon_guard",
      name: "수호",
      optionKeys: ["hp", "def", "magicDef", "critResist", "statusDamageReductionPct"],
    },
  ],
  armor: [
    {
      id: "armor_guard",
      name: "방호",
      optionKeys: ["hp", "def", "magicDef"],
    },
    { id: "armor_mobility", name: "기동", optionKeys: ["eva", "spd"] },
    {
      id: "armor_resistance",
      name: "저항",
      optionKeys: ["critResist", "statusDamageReductionPct", "magicDef"],
    },
    {
      id: "armor_offense",
      name: "공세",
      optionKeys: ["crit", "accuracy", "critMult"],
    },
  ],
  jewelry: [
    {
      id: "jewelry_offense",
      name: "공격 보조",
      optionKeys: ["crit", "accuracy", "critMult"],
    },
    {
      id: "jewelry_survival",
      name: "생존 보조",
      optionKeys: ["hp", "mp", "magicDef", "critResist", "statusDamageReductionPct"],
    },
    {
      id: "jewelry_recovery",
      name: "회복 보조",
      optionKeys: ["healPowerPct", "mp", "spd"],
    },
  ],
};

export const BLACKSMITH_STRUCTURES: readonly BlacksmithStructureDefinition[] = [
  { id: "balanced", name: "균형 제작", requiredLevel: 20 },
  { id: "primary", name: "주력 강화", requiredLevel: 20 },
  { id: "option", name: "옵션 정밀", requiredLevel: 20 },
  { id: "extreme", name: "극한 제작", requiredLevel: 20 },
  { id: "stable", name: "안정 제작", requiredLevel: 22 },
];

const SPECIALTY_IDS = new Set<BlacksmithSpecialtyId>([
  "weapon",
  "armor",
  "jewelry",
]);
const OPTION_FOCUS_IDS = new Set<BlacksmithOptionFocusId>(
  Object.values(BLACKSMITH_OPTION_FOCUSES)
    .flat()
    .map((focus) => focus.id),
);
const STRUCTURE_IDS = new Set<BlacksmithStructureId>(
  BLACKSMITH_STRUCTURES.map((structure) => structure.id),
);

export function isBlacksmithSpecialtyId(
  value: unknown,
): value is BlacksmithSpecialtyId {
  return typeof value === "string" && SPECIALTY_IDS.has(value as BlacksmithSpecialtyId);
}

export function isBlacksmithOptionFocusId(
  value: unknown,
): value is BlacksmithOptionFocusId {
  return (
    typeof value === "string" &&
    OPTION_FOCUS_IDS.has(value as BlacksmithOptionFocusId)
  );
}

export function isBlacksmithStructureId(
  value: unknown,
): value is BlacksmithStructureId {
  return (
    typeof value === "string" &&
    STRUCTURE_IDS.has(value as BlacksmithStructureId)
  );
}

export function parseBlacksmithProgressionState(
  raw: unknown,
): BlacksmithProgressionState {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const value = raw as Record<string, unknown>;
  const specialty = isBlacksmithSpecialtyId(value.specialty)
    ? value.specialty
    : undefined;
  const signatureIid =
    typeof value.signatureIid === "string" && value.signatureIid.length > 0
      ? value.signatureIid
      : undefined;
  const pendingRaw =
    value.pendingInspection != null &&
    typeof value.pendingInspection === "object" &&
    !Array.isArray(value.pendingInspection)
      ? (value.pendingInspection as Record<string, unknown>)
      : null;
  const equipmentId =
    typeof pendingRaw?.equipmentId === "string" &&
    Object.hasOwn(V2_EQUIPMENT, pendingRaw.equipmentId)
      ? (pendingRaw.equipmentId as V2EquipmentId)
      : undefined;
  const candidateRaw = Array.isArray(pendingRaw?.candidates)
    ? pendingRaw.candidates
    : [];
  const candidates =
    equipmentId && candidateRaw.length === 2
      ? candidateRaw.map((candidate) =>
          parseEquipRollForItem(V2_EQUIPMENT[equipmentId], candidate),
        )
      : [];
  const craftQuality = parseCraftQuality(pendingRaw?.craftQuality);
  const craftedBy = parseCraftedBy(pendingRaw?.craftedBy);
  const createdAt =
    typeof pendingRaw?.createdAt === "string" &&
    Number.isFinite(Date.parse(pendingRaw.createdAt))
      ? pendingRaw.createdAt
      : undefined;
  const pendingInspection =
    typeof pendingRaw?.inspectionId === "string" &&
    pendingRaw.inspectionId.length > 0 &&
    typeof pendingRaw.recipeId === "string" &&
    pendingRaw.recipeId.length > 0 &&
    equipmentId &&
    craftQuality &&
    candidates.length === 2 &&
    candidates[0] &&
    candidates[1] &&
    craftedBy &&
    createdAt
      ? {
          inspectionId: pendingRaw.inspectionId,
          recipeId: pendingRaw.recipeId,
          equipmentId,
          craftQuality,
          candidates: [candidates[0], candidates[1]] as const,
          craftedBy,
          createdAt,
        }
      : undefined;
  const resolutionRaw =
    value.lastInspectionResolution != null &&
    typeof value.lastInspectionResolution === "object" &&
    !Array.isArray(value.lastInspectionResolution)
      ? (value.lastInspectionResolution as Record<string, unknown>)
      : null;
  const resolvedCandidateIndex: 0 | 1 | undefined =
    resolutionRaw?.candidateIndex === 0 || resolutionRaw?.candidateIndex === 1
      ? resolutionRaw.candidateIndex
      : undefined;
  const lastInspectionResolution: BlacksmithInspectionResolution | undefined =
    typeof resolutionRaw?.inspectionId === "string" &&
    resolutionRaw.inspectionId.length > 0 &&
    resolvedCandidateIndex != null &&
    typeof resolutionRaw.iid === "string" &&
    resolutionRaw.iid.length > 0
      ? {
          inspectionId: resolutionRaw.inspectionId,
          candidateIndex: resolvedCandidateIndex,
          iid: resolutionRaw.iid,
        }
      : undefined;
  return {
    ...(specialty ? { specialty } : {}),
    ...(signatureIid ? { signatureIid } : {}),
    ...(pendingInspection ? { pendingInspection } : {}),
    ...(lastInspectionResolution ? { lastInspectionResolution } : {}),
  };
}

export function blacksmithCatalystMaterialForItem(
  item: V2Equipment,
): GuildWorkshopMaterialId {
  if (item.tier <= 4) return GUILD_WORKSHOP_MATERIAL_ID.refinedIron;
  if (item.tier <= 7) return GUILD_WORKSHOP_MATERIAL_ID.mithrilShard;
  if (item.tier <= 10) return GUILD_WORKSHOP_MATERIAL_ID.sunstone;
  if (item.tier <= 13) return GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal;
  return GUILD_WORKSHOP_MATERIAL_ID.abyssalStarsteel;
}

export function blacksmithSpecialtyForSlot(
  slot: V2EquipSlot,
): BlacksmithSpecialtyId {
  if (slot === "weapon") return "weapon";
  if (slot === "armor" || slot === "gloves" || slot === "boots") {
    return "armor";
  }
  return "jewelry";
}

function variableOptionKeys(item: V2Equipment): (keyof V2EquipOptions)[] {
  return V2_EQUIP_OPTION_KEYS.filter((key) => {
    const value = item.options?.[key];
    return value != null && Math.round(value * 0.65) > 0;
  });
}

export function blacksmithTechniqueView({
  level,
  specialty,
  item,
}: {
  level: number;
  specialty: BlacksmithSpecialtyId | undefined;
  item: V2Equipment;
}) {
  const safeLevel = Math.max(1, Math.floor(level));
  const eligible =
    specialty != null && blacksmithSpecialtyForSlot(item.slot) === specialty;
  const variableKeys = variableOptionKeys(item);
  const optionFocuses =
    eligible && safeLevel >= BLACKSMITH_OPTION_FOCUS_LEVEL
      ? BLACKSMITH_OPTION_FOCUSES[specialty].filter((focus) => {
          const targetCount = variableKeys.filter((key) =>
            focus.optionKeys.includes(key),
          ).length;
          return targetCount > 0;
        })
      : [];
  const structures =
    eligible && safeLevel >= BLACKSMITH_STRUCTURE_LEVEL
      ? BLACKSMITH_STRUCTURES.filter(
          (structure) => safeLevel >= structure.requiredLevel,
        )
      : [];
  return {
    eligible,
    optionFocuses,
    structures,
    focusChancePct: BLACKSMITH_FOCUS_CHANCE_PCT,
    catalystUnlocked: eligible && safeLevel >= BLACKSMITH_CATALYST_LEVEL,
    catalystFocusChancePct: BLACKSMITH_CATALYST_FOCUS_CHANCE_PCT,
    catalystPreserveChancePct:
      eligible && safeLevel >= BLACKSMITH_CATALYST_PRESERVE_LEVEL
        ? BLACKSMITH_CATALYST_PRESERVE_CHANCE_PCT
        : 0,
    masterworkTechniquesUnlocked:
      eligible && safeLevel >= BLACKSMITH_MASTERWORK_TECHNIQUE_LEVEL,
    signatureUnlocked: eligible && safeLevel >= BLACKSMITH_SIGNATURE_LEVEL,
    inspectionUnlocked: eligible && safeLevel >= BLACKSMITH_INSPECTION_LEVEL,
  };
}

type PercentileEntry =
  | { kind: "power"; weight: number }
  | { kind: "option"; key: keyof V2EquipOptions; weight: number };

function percentileEntries(
  item: V2Equipment,
  percentiles: V2EquipRollPercentiles,
): PercentileEntry[] {
  const weights = equipRollQualityWeights(item);
  return [
    ...(weights.power > 0
      ? [{ kind: "power" as const, weight: weights.power }]
      : []),
    ...V2_EQUIP_OPTION_KEYS.flatMap((key) =>
      percentiles.options?.[key] == null || (weights.options?.[key] ?? 0) <= 0
        ? []
        : [
            {
              kind: "option" as const,
              key,
              weight: weights.options?.[key] ?? 0,
            },
          ],
    ),
  ];
}

function entryValue(
  percentiles: V2EquipRollPercentiles,
  entry: PercentileEntry,
): number {
  return entry.kind === "power"
    ? percentiles.power
    : (percentiles.options?.[entry.key] ?? 0.5);
}

function setEntryValue(
  percentiles: V2EquipRollPercentiles,
  entry: PercentileEntry,
  value: number,
) {
  const safe = Math.max(0, Math.min(1, value));
  if (entry.kind === "power") {
    percentiles.power = safe;
    return;
  }
  percentiles.options ??= {};
  percentiles.options[entry.key] = safe;
}

function clonePercentiles(
  percentiles: V2EquipRollPercentiles,
): V2EquipRollPercentiles {
  return {
    power: percentiles.power,
    ...(percentiles.options ? { options: { ...percentiles.options } } : {}),
  };
}

export function blacksmithWeightedPercentileBudget(
  item: V2Equipment,
  percentiles: V2EquipRollPercentiles,
): number {
  return percentileEntries(item, percentiles).reduce(
    (sum, entry) => sum + entryValue(percentiles, entry) * entry.weight,
    0,
  );
}

function adjustBudget(
  percentiles: V2EquipRollPercentiles,
  entries: readonly PercentileEntry[],
  deltaBudget: number,
): number {
  if (Math.abs(deltaBudget) <= 1e-10 || entries.length === 0) return 0;
  const increase = deltaBudget > 0;
  const capacity = entries.reduce((sum, entry) => {
    const value = entryValue(percentiles, entry);
    return sum + (increase ? 1 - value : value) * entry.weight;
  }, 0);
  const applied = Math.min(Math.abs(deltaBudget), capacity);
  if (applied <= 1e-10 || capacity <= 1e-10) return 0;
  const ratio = applied / capacity;
  for (const entry of entries) {
    const value = entryValue(percentiles, entry);
    const room = increase ? 1 - value : value;
    setEntryValue(
      percentiles,
      entry,
      value + (increase ? 1 : -1) * room * ratio,
    );
  }
  return increase ? applied : -applied;
}

function rebalanceBudget(
  item: V2Equipment,
  percentiles: V2EquipRollPercentiles,
  targetBudget: number,
) {
  const delta =
    targetBudget - blacksmithWeightedPercentileBudget(item, percentiles);
  adjustBudget(percentiles, percentileEntries(item, percentiles), delta);
}

function focusDefinition(
  id: BlacksmithOptionFocusId | undefined,
): BlacksmithOptionFocusDefinition | undefined {
  if (!id) return undefined;
  return Object.values(BLACKSMITH_OPTION_FOCUSES)
    .flat()
    .find((focus) => focus.id === id);
}

function focusEntries(
  item: V2Equipment,
  percentiles: V2EquipRollPercentiles,
  focus: BlacksmithOptionFocusDefinition,
) {
  const options = percentileEntries(item, percentiles).filter(
    (entry): entry is Extract<PercentileEntry, { kind: "option" }> =>
      entry.kind === "option",
  );
  const targets = options.filter((entry) => focus.optionKeys.includes(entry.key));
  const otherOptions = options.filter((entry) => !focus.optionKeys.includes(entry.key));
  const powerFallback = percentileEntries(item, percentiles).filter(
    (entry) => entry.kind === "power",
  );
  return {
    targets,
    // 모든 보조 옵션이 한 성향에 몰린 장비는 기본 성능을 비교군으로 삼아
    // 성향 선택이 실제 품질 우선순위를 만들도록 한다.
    others: otherOptions.length > 0 ? otherOptions : powerFallback,
  };
}

function prioritizeFocus(
  percentiles: V2EquipRollPercentiles,
  targets: readonly Extract<PercentileEntry, { kind: "option" }>[],
  others: readonly PercentileEntry[],
) {
  const values = [...targets, ...others]
    .map((entry) => entryValue(percentiles, entry))
    .sort((a, b) => b - a);
  for (const [index, entry] of [...targets, ...others].entries()) {
    setEntryValue(percentiles, entry, values[index] ?? 0.5);
  }
}

function applyCatalystFloor(
  percentiles: V2EquipRollPercentiles,
  targets: readonly Extract<PercentileEntry, { kind: "option" }>[],
  others: readonly PercentileEntry[],
) {
  const belowFloor = targets.filter(
    (entry) => entryValue(percentiles, entry) < BLACKSMITH_CATALYST_FOCUS_FLOOR,
  );
  const desired = belowFloor.reduce(
    (sum, entry) =>
      sum +
      (BLACKSMITH_CATALYST_FOCUS_FLOOR - entryValue(percentiles, entry)) *
        entry.weight,
    0,
  );
  const removed = -adjustBudget(percentiles, others, -desired);
  adjustBudget(percentiles, belowFloor, removed);
}

function transferBudget(
  percentiles: V2EquipRollPercentiles,
  from: readonly PercentileEntry[],
  to: readonly PercentileEntry[],
  requested: number,
) {
  const removed = -adjustBudget(percentiles, from, -requested);
  const added = adjustBudget(percentiles, to, removed);
  if (added < removed) adjustBudget(percentiles, from, removed - added);
}

export function applyBlacksmithCraftControl(
  item: V2Equipment,
  baseRoll: V2EquipRoll,
  selection: BlacksmithCraftControlSelection,
  rng: () => number,
): BlacksmithControlledRoll {
  const original = equipRollPercentiles(item, baseRoll);
  const targetBudget = blacksmithWeightedPercentileBudget(item, original);
  const percentiles = clonePercentiles(original);
  const focus = focusDefinition(selection.optionFocus);
  const grouped = focus ? focusEntries(item, percentiles, focus) : null;
  const validFocus =
    grouped != null && grouped.targets.length > 0 && grouped.others.length > 0;
  const focusApplied =
    validFocus &&
    rng() * 100 <
      (selection.useCatalyst
        ? BLACKSMITH_CATALYST_FOCUS_CHANCE_PCT
        : BLACKSMITH_FOCUS_CHANCE_PCT);
  if (focusApplied && grouped) {
    prioritizeFocus(percentiles, grouped.targets, grouped.others);
    if (selection.useCatalyst) {
      applyCatalystFloor(percentiles, grouped.targets, grouped.others);
    }
  }

  const entries = percentileEntries(item, percentiles);
  const powerEntries = entries.filter((entry) => entry.kind === "power");
  const optionEntries = entries.filter((entry) => entry.kind === "option");
  const transfer = entries.reduce((sum, entry) => sum + entry.weight, 0) *
    BLACKSMITH_STRUCTURE_TRANSFER_BUDGET;
  if (selection.structure === "primary") {
    transferBudget(percentiles, optionEntries, powerEntries, transfer);
  } else if (selection.structure === "option" && grouped) {
    transferBudget(percentiles, powerEntries, grouped.targets, transfer);
  } else if (
    selection.structure === "stable" ||
    selection.structure === "extreme"
  ) {
    const factor = selection.structure === "stable" ? 0.6 : 1.25;
    for (const entry of entries) {
      const value = entryValue(percentiles, entry);
      setEntryValue(percentiles, entry, 0.5 + (value - 0.5) * factor);
    }
  }
  rebalanceBudget(item, percentiles, targetBudget);
  return {
    roll: equipRollFromPercentiles(item, percentiles),
    percentiles,
    focusApplied,
  };
}

export function rollBlacksmithCatalystPreserved(
  level: number,
  rng: () => number,
): boolean {
  return (
    level >= BLACKSMITH_CATALYST_PRESERVE_LEVEL &&
    rng() * 100 < BLACKSMITH_CATALYST_PRESERVE_CHANCE_PCT
  );
}

function normalizedToBudget(
  item: V2Equipment,
  roll: V2EquipRoll,
  targetBudget: number,
): V2EquipRoll {
  const percentiles = equipRollPercentiles(item, roll);
  rebalanceBudget(item, percentiles, targetBudget);
  return equipRollFromPercentiles(item, percentiles);
}

function distinctInspectionPercentiles(
  item: V2Equipment,
  baseline: V2EquipRollPercentiles,
  otherRoll: V2EquipRoll,
): V2EquipRollPercentiles {
  const entries = percentileEntries(item, baseline);
  for (const source of entries) {
    for (const target of entries) {
      if (source === target) continue;
      const capacity = Math.min(
        entryValue(baseline, source) * source.weight,
        (1 - entryValue(baseline, target)) * target.weight,
      );
      for (const fraction of [0.5, 1, 0.25]) {
        const transfer = capacity * fraction;
        if (transfer <= 1e-10) continue;
        const candidate = clonePercentiles(baseline);
        setEntryValue(
          candidate,
          source,
          entryValue(candidate, source) - transfer / source.weight,
        );
        setEntryValue(
          candidate,
          target,
          entryValue(candidate, target) + transfer / target.weight,
        );
        if (
          JSON.stringify(equipRollFromPercentiles(item, candidate)) !==
          JSON.stringify(otherRoll)
        ) {
          return candidate;
        }
      }
    }
  }
  return baseline;
}

export function rollBlacksmithInspectionCandidates(
  item: V2Equipment,
  selection: BlacksmithCraftControlSelection,
  rng: () => number,
): readonly [BlacksmithControlledRoll, BlacksmithControlledRoll] {
  const firstBase = rollItemStats(item, rng);
  const budget = blacksmithWeightedPercentileBudget(
    item,
    equipRollPercentiles(item, firstBase),
  );
  const secondBase = normalizedToBudget(item, rollItemStats(item, rng), budget);
  const first = applyBlacksmithCraftControl(item, firstBase, selection, rng);
  const second = applyBlacksmithCraftControl(item, secondBase, selection, rng);
  rebalanceBudget(
    item,
    second.percentiles,
    blacksmithWeightedPercentileBudget(item, first.percentiles),
  );
  second.roll = equipRollFromPercentiles(item, second.percentiles);
  if (JSON.stringify(first.roll) === JSON.stringify(second.roll)) {
    second.percentiles = distinctInspectionPercentiles(
      item,
      second.percentiles,
      first.roll,
    );
    second.roll = equipRollFromPercentiles(item, second.percentiles);
  }
  return [first, second];
}
