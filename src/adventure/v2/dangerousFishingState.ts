import {
  DANGEROUS_BOSSES,
  DANGEROUS_FISH,
  dangerousCatchMaterialId,
  isDangerousBaitId,
  isDangerousBossId,
  isDangerousDepthId,
  isDangerousFishId,
  isDangerousLineId,
  isDangerousReelId,
  isDangerousRodId,
  isDangerousZoneId,
  type DangerousBaitId,
  type DangerousBossId,
  type DangerousDepthId,
  type DangerousFishBehavior,
  type DangerousFishId,
  type DangerousLineId,
  type DangerousReelId,
  type DangerousRodId,
  type DangerousZoneId,
} from "@/adventure/data/v2/dangerousFishing";
import type {
  DangerousEncounter,
  DangerousEncounterEvent,
  DangerousEncounterTransition,
  DangerousRealtimeCompletion,
  DangerousRealtimeEncounter,
  DangerousRealtimeModifierSource,
  DangerousStoredEncounter,
  DangerousV1StoredEncounter,
} from "./dangerousFishingEncounter";
import { isDangerousRealtimeEncounter } from "./dangerousFishingEncounter";
import {
  DANGEROUS_REALTIME_LEGACY_BALANCE_REVISION,
  dangerousRealtimeTargetCalibration,
  dangerousRealtimeMaxTicks,
  isDangerousRealtimeBalanceRevision,
  isDangerousRealtimeCheckpoint,
  DANGEROUS_REALTIME_TICK_MS,
  type DangerousRealtimeConfig,
  type DangerousRealtimeBalanceRevision,
  type DangerousRealtimeState,
} from "./dangerousFishingRealtime";
import {
  dangerousRealtimeModifiers,
  type DangerousRealtimeModifiers,
} from "./dangerousFishingRealtimeModifiers";

export const DANGEROUS_FISHING_SAVE_KEY = "dangerous-fishing.v1";
export const DANGEROUS_FISHING_STATE_VERSION = 2 as const;
export const DANGEROUS_REALTIME_FINISH_GRACE_MS = 30_000;
const DANGEROUS_REALTIME_COMPLETION_LIMIT = 32;

export type DangerousCargoStack = {
  fishId: DangerousFishId;
  materialId: string;
  quantity: number;
  totalValue: number;
};

export type DangerousFishCodexEntry = {
  caughtCount: number;
  bestSizeCm: number;
  firstCaughtAt: number;
  bestCaughtAt: number;
};

export type DangerousBossCodexEntry = {
  defeats: number;
  firstDefeatedAt: number;
  lastDefeatedAt: number;
  bestContribution: number;
};

export type DangerousBossAttempt = {
  eventId: string;
  encounter: DangerousStoredEncounter;
};

export type DangerousGearEnhancements = {
  rods: Partial<Record<DangerousRodId, number>>;
  reels: Partial<Record<DangerousReelId, number>>;
  lines: Partial<Record<DangerousLineId, number>>;
};

export type DangerousFishingVoyage = {
  id: string;
  zoneId: DangerousZoneId;
  depthId: DangerousDepthId;
  risk: number;
  startedAt: number;
  cargo: DangerousCargoStack[];
  encounter: DangerousStoredEncounter | null;
};

export type DangerousFishingState = {
  version: typeof DANGEROUS_FISHING_STATE_VERSION;
  ownedGear: {
    rods: DangerousRodId[];
    reels: DangerousReelId[];
    lines: DangerousLineId[];
  };
  loadout: {
    rodId: DangerousRodId;
    reelId: DangerousReelId;
    lineId: DangerousLineId;
    baitId: DangerousBaitId;
  };
  baitCounts: Partial<Record<DangerousBaitId, number>>;
  codex: Partial<Record<DangerousFishId, DangerousFishCodexEntry>>;
  bossCodex: Partial<Record<DangerousBossId, DangerousBossCodexEntry>>;
  bossTraces: Partial<Record<DangerousBossId, number>>;
  bossAttempt: DangerousBossAttempt | null;
  resolvedEncounterIds: string[];
  gearEnhancements: DangerousGearEnhancements;
  realtimeCompletions: DangerousRealtimeCompletion[];
  voyage: DangerousFishingVoyage | null;
};

export type DangerousFishingReturn = {
  state: DangerousFishingState;
  incident: boolean;
  returned: boolean;
  lostValue: number;
  lostCargo: Record<string, number>;
  materials: Record<string, number>;
  retainedCargoValue: number;
};

export type DangerousRiskPreview = {
  risk: number;
  accidentChance: number;
  maxLossFraction: number;
};

export function emptyDangerousFishingState(): DangerousFishingState {
  return {
    version: DANGEROUS_FISHING_STATE_VERSION,
    ownedGear: {
      rods: ["starter_rod"],
      reels: ["starter_reel"],
      lines: ["starter_line"],
    },
    loadout: {
      rodId: "starter_rod",
      reelId: "starter_reel",
      lineId: "starter_line",
      baitId: "basic_bait",
    },
    baitCounts: {},
      codex: {},
      bossCodex: {},
    bossTraces: {},
    bossAttempt: null,
    resolvedEncounterIds: [],
    gearEnhancements: { rods: {}, reels: {}, lines: {} },
    realtimeCompletions: [],
    voyage: null,
  };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function safeInt(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.floor(value);
}

function nonNegativeSafeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)));
}

function saturatingSafeAdd(left: number, right: number): number {
  return left >= Number.MAX_SAFE_INTEGER - right
    ? Number.MAX_SAFE_INTEGER
    : left + right;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniqueGear<T extends string>(
  raw: unknown,
  guard: (value: unknown) => value is T,
  starter: T,
): T[] {
  const values = Array.isArray(raw) ? raw.filter(guard) : [];
  return [starter, ...values.filter((value) => value !== starter)].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
}

const BEHAVIORS = new Set<DangerousFishBehavior>([
  "charge",
  "thrash",
  "turn",
  "dive",
]);

function parseV1Encounter(raw: unknown): DangerousV1StoredEncounter | null {
  const value = objectRecord(raw);
  if (!value || typeof value.id !== "string" || value.id.length === 0) return null;
  const targetKind = value.targetKind;
  const targetId = value.targetId;
  if (
    (targetKind !== "fish" && targetKind !== "boss") ||
    typeof targetId !== "string" ||
    (targetKind === "fish"
      ? !isDangerousFishId(targetId)
      : !isDangerousBossId(targetId))
  ) {
    return null;
  }
  if (
    value.status !== "active" &&
    value.status !== "caught" &&
    value.status !== "failed"
  ) {
    return null;
  }
  const behaviorPattern = Array.isArray(value.behaviorPattern)
    ? value.behaviorPattern.filter(
        (behavior): behavior is DangerousFishBehavior =>
          typeof behavior === "string" &&
          BEHAVIORS.has(behavior as DangerousFishBehavior),
      )
    : [];
  if (behaviorPattern.length === 0) return null;

  const maxTension = Math.max(20, safeInt(value.maxTension, 100));
  const maxStamina = Math.max(1, safeInt(value.maxStamina, 1));
  const startDistance = Math.max(1, safeInt(value.startDistance, 1));
  return {
    simulationVersion: 1,
    id: value.id,
    targetKind,
    targetId,
    status: value.status,
    tension: Math.max(0, safeInt(value.tension)),
    maxTension,
    stamina: clamp(safeInt(value.stamina), 0, maxStamina),
    maxStamina,
    distance: clamp(safeInt(value.distance), 0, startDistance * 2),
    startDistance,
    slackTurns: Math.max(0, safeInt(value.slackTurns)),
    slackTolerance: Math.max(0, safeInt(value.slackTolerance)),
    step: Math.max(0, safeInt(value.step)),
    revision: Math.max(0, safeInt(value.revision)),
    nextActionAt: Math.max(0, safeInt(value.nextActionAt)),
    expiresAt: Math.max(0, safeInt(value.expiresAt)),
    patternSeed: safeInt(value.patternSeed),
    behaviorPattern,
    reelPowerBonus: safeInt(value.reelPowerBonus),
    staminaDamageBonus: safeInt(value.staminaDamageBonus),
    tensionControlBonus: safeInt(value.tensionControlBonus),
    telegraphSteps: clamp(safeInt(value.telegraphSteps), 0, 2),
  };
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function sameBehaviors(
  raw: unknown,
  expected: readonly DangerousFishBehavior[],
): raw is DangerousFishBehavior[] {
  return (
    Array.isArray(raw) &&
    raw.every((behavior) => typeof behavior === "string" && BEHAVIORS.has(behavior as DangerousFishBehavior)) &&
    raw.length === expected.length &&
    raw.every((behavior, index) => behavior === expected[index])
  );
}

function sameBaitEffects(
  left: DangerousRealtimeModifiers["baitEffect"],
  right: DangerousRealtimeModifiers["baitEffect"],
): boolean {
  return (
    left.turnDistanceRecoveryReductionPct === right.turnDistanceRecoveryReductionPct &&
    left.turnTensionImpactReductionPct === right.turnTensionImpactReductionPct &&
    left.chargeAndThrashStaminaDamagePct === right.chargeAndThrashStaminaDamagePct &&
    left.telegraphCount === right.telegraphCount &&
    left.diveSpeedReductionPct === right.diveSpeedReductionPct &&
    left.startingStaminaReductionPct === right.startingStaminaReductionPct &&
    left.tensionImpulseReductionPct === right.tensionImpulseReductionPct &&
    left.maxTimeReductionPct === right.maxTimeReductionPct
  );
}

type RealtimeParseContext = {
  ownedGear: DangerousFishingState["ownedGear"];
  gearEnhancements: DangerousGearEnhancements;
};

function parseRealtimeModifierSource(
  raw: unknown,
): DangerousRealtimeModifierSource | null {
  const value = objectRecord(raw);
  if (!value) return null;
  const {
    fishingLevel,
    baitId,
    rodId,
    reelId,
    lineId,
    maxTensionBonus,
    reelPowerBonus,
    staminaDamageBonus,
    tensionControlBonus,
    slackTolerance,
    telegraphSteps,
    rodEnhancementLevel,
    reelEnhancementLevel,
    lineEnhancementLevel,
    cargoProtectionPct,
    targetStamina,
    targetDistance,
    targetBaseTension,
  } = value;
  if (
    !isNonNegativeInt(fishingLevel) ||
    fishingLevel > 100 ||
    !isDangerousBaitId(baitId) ||
    !isDangerousRodId(rodId) ||
    !isDangerousReelId(reelId) ||
    !isDangerousLineId(lineId) ||
    !Number.isSafeInteger(maxTensionBonus) ||
    (maxTensionBonus as number) < -50 ||
    (maxTensionBonus as number) > 100 ||
    !isNonNegativeInt(reelPowerBonus) ||
    reelPowerBonus > 100 ||
    !isNonNegativeInt(staminaDamageBonus) ||
    staminaDamageBonus > 100 ||
    !isNonNegativeInt(tensionControlBonus) ||
    tensionControlBonus > 100 ||
    !isNonNegativeInt(slackTolerance) ||
    slackTolerance > 10 ||
    !isNonNegativeInt(telegraphSteps) ||
    telegraphSteps > 2 ||
    !isNonNegativeInt(rodEnhancementLevel) ||
    rodEnhancementLevel > 3 ||
    !isNonNegativeInt(reelEnhancementLevel) ||
    reelEnhancementLevel > 3 ||
    !isNonNegativeInt(lineEnhancementLevel) ||
    lineEnhancementLevel > 3 ||
    !isNonNegativeInt(cargoProtectionPct) ||
    cargoProtectionPct > 15 ||
    !isNonNegativeInt(targetStamina) ||
    targetStamina === 0 ||
    targetStamina > 1_000_000 ||
    !isNonNegativeInt(targetDistance) ||
    targetDistance === 0 ||
    targetDistance > 1_000_000 ||
    !isNonNegativeInt(targetBaseTension) ||
    targetBaseTension > 10_000
  ) {
    return null;
  }
  return {
    fishingLevel,
    baitId,
    rodId,
    reelId,
    lineId,
    maxTensionBonus: maxTensionBonus as number,
    reelPowerBonus,
    staminaDamageBonus,
    tensionControlBonus,
    slackTolerance,
    telegraphSteps,
    rodEnhancementLevel,
    reelEnhancementLevel,
    lineEnhancementLevel,
    cargoProtectionPct,
    targetStamina,
    targetDistance,
    targetBaseTension,
  };
}

function sameRealtimeModifiers(
  left: DangerousRealtimeModifiers,
  right: DangerousRealtimeModifiers,
): boolean {
  return (
    left.reelEfficiencyPct === right.reelEfficiencyPct &&
    left.tensionControlPct === right.tensionControlPct &&
    left.safeZoneBonusPct === right.safeZoneBonusPct &&
    left.cargoProtectionPct === right.cargoProtectionPct &&
    left.staminaDamagePct === right.staminaDamagePct &&
    left.distanceRecoveryPct === right.distanceRecoveryPct &&
    left.lowTensionGraceTicks === right.lowTensionGraceTicks &&
    left.telegraphCount === right.telegraphCount &&
    left.timeReductionPct === right.timeReductionPct &&
    sameBaitEffects(left.baitEffect, right.baitEffect)
  );
}

function parseRealtimeModifiers(raw: unknown): DangerousRealtimeModifiers | null {
  const value = objectRecord(raw);
  const baitEffect = objectRecord(value?.baitEffect);
  if (!value || !baitEffect) return null;
  const modifierKeys = [
    "reelEfficiencyPct",
    "tensionControlPct",
    "safeZoneBonusPct",
    "cargoProtectionPct",
    "staminaDamagePct",
    "distanceRecoveryPct",
    "lowTensionGraceTicks",
    "telegraphCount",
    "timeReductionPct",
  ] as const;
  const baitEffectKeys = [
    "turnDistanceRecoveryReductionPct",
    "turnTensionImpactReductionPct",
    "chargeAndThrashStaminaDamagePct",
    "telegraphCount",
    "diveSpeedReductionPct",
    "startingStaminaReductionPct",
    "tensionImpulseReductionPct",
    "maxTimeReductionPct",
  ] as const;
  if (
    !modifierKeys.every((key) => isNonNegativeInt(value[key])) ||
    !baitEffectKeys.every((key) => isNonNegativeInt(baitEffect[key]))
  ) {
    return null;
  }
  return {
    reelEfficiencyPct: value.reelEfficiencyPct as number,
    tensionControlPct: value.tensionControlPct as number,
    safeZoneBonusPct: value.safeZoneBonusPct as number,
    cargoProtectionPct: value.cargoProtectionPct as number,
    staminaDamagePct: value.staminaDamagePct as number,
    distanceRecoveryPct: value.distanceRecoveryPct as number,
    lowTensionGraceTicks: value.lowTensionGraceTicks as number,
    telegraphCount: value.telegraphCount as number,
    timeReductionPct: value.timeReductionPct as number,
    baitEffect: {
      turnDistanceRecoveryReductionPct:
        baitEffect.turnDistanceRecoveryReductionPct as number,
      turnTensionImpactReductionPct:
        baitEffect.turnTensionImpactReductionPct as number,
      chargeAndThrashStaminaDamagePct:
        baitEffect.chargeAndThrashStaminaDamagePct as number,
      telegraphCount: baitEffect.telegraphCount as number,
      diveSpeedReductionPct: baitEffect.diveSpeedReductionPct as number,
      startingStaminaReductionPct:
        baitEffect.startingStaminaReductionPct as number,
      tensionImpulseReductionPct:
        baitEffect.tensionImpulseReductionPct as number,
      maxTimeReductionPct: baitEffect.maxTimeReductionPct as number,
    },
  };
}

function parseRealtimeConfig(
  raw: unknown,
  modifierSourceRaw: unknown,
  targetKind: "fish" | "boss",
  targetId: DangerousFishId | DangerousBossId,
  balanceRevision: DangerousRealtimeBalanceRevision,
): { config: DangerousRealtimeConfig; modifierSource: DangerousRealtimeModifierSource } | null {
  const value = objectRecord(raw);
  if (!value || value.targetKind !== targetKind || !isNonNegativeInt(value.seed)) {
    return null;
  }
  const target =
    targetKind === "fish"
      ? DANGEROUS_FISH[targetId as DangerousFishId]
      : DANGEROUS_BOSSES[targetId as DangerousBossId];
  const rarity =
    targetKind === "fish"
      ? DANGEROUS_FISH[targetId as DangerousFishId].rarity
      : "boss";
  if (
    value.rarity !== rarity ||
    !sameBehaviors(value.behaviorPattern, target.behaviorPattern) ||
    !isNonNegativeInt(value.risk) ||
    value.risk > 5 ||
    typeof value.initialTension !== "number" ||
    typeof value.maxTension !== "number" ||
    typeof value.initialStamina !== "number" ||
    typeof value.initialDistance !== "number"
  ) {
    return null;
  }
  const modifierSource = parseRealtimeModifierSource(modifierSourceRaw);
  if (!modifierSource) return null;
  const targetCalibration = dangerousRealtimeTargetCalibration({
    stamina: modifierSource.targetStamina,
    distance: modifierSource.targetDistance,
    baseTension: modifierSource.targetBaseTension,
    maxTensionBonus: modifierSource.maxTensionBonus,
  }, balanceRevision);
  if (
    value.initialTension !== targetCalibration.initialTension ||
    value.maxTension !== targetCalibration.maxTension ||
    value.initialStamina !== targetCalibration.initialStamina ||
    value.initialDistance !== targetCalibration.initialDistance
  ) {
    return null;
  }
  const modifiers = dangerousRealtimeModifiers({
    fishingLevel: modifierSource.fishingLevel,
    baitId: modifierSource.baitId,
    reelPowerBonus: modifierSource.reelPowerBonus,
    staminaDamageBonus: modifierSource.staminaDamageBonus,
    tensionControlBonus: modifierSource.tensionControlBonus,
    slackTolerance: modifierSource.slackTolerance,
    telegraphSteps: modifierSource.telegraphSteps,
    rodEnhancementLevel: modifierSource.rodEnhancementLevel,
    reelEnhancementLevel: modifierSource.reelEnhancementLevel,
    lineEnhancementLevel: modifierSource.lineEnhancementLevel,
    cargoProtectionPct: modifierSource.cargoProtectionPct,
  });
  const persistedModifiers = parseRealtimeModifiers(value.modifiers);
  if (!persistedModifiers) return null;
  if (!sameRealtimeModifiers(persistedModifiers, modifiers)) return null;
  const config: DangerousRealtimeConfig = {
    seed: value.seed,
    risk: value.risk,
    targetKind,
    rarity,
    behaviorPattern: [...target.behaviorPattern],
    ...targetCalibration,
    maxTicks: 0,
    modifiers,
  };
  const maxTicks = dangerousRealtimeMaxTicks(config);
  if (value.maxTicks !== maxTicks) return null;
  return { config: { ...config, maxTicks }, modifierSource };
}

function parseRealtimeCheckpoint(
  raw: unknown,
  config: DangerousRealtimeConfig,
  balanceRevision: DangerousRealtimeBalanceRevision,
): DangerousRealtimeState | null {
  return isDangerousRealtimeCheckpoint(raw, config, balanceRevision)
    ? raw
    : null;
}

export function parseDangerousStoredEncounter(
  raw: unknown,
  _context: RealtimeParseContext,
): DangerousStoredEncounter | null {
  const value = objectRecord(raw);
  if (!value) return null;
  if (value.simulationVersion === undefined || value.simulationVersion === 1) {
    return parseV1Encounter(value);
  }
  if (
    value.simulationVersion !== 2 ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    (value.targetKind !== "fish" && value.targetKind !== "boss") ||
    typeof value.targetId !== "string" ||
    (value.targetKind === "fish"
      ? !isDangerousFishId(value.targetId)
      : !isDangerousBossId(value.targetId))
  ) {
    return null;
  }
  const balanceRevision =
    value.balanceRevision === undefined
      ? DANGEROUS_REALTIME_LEGACY_BALANCE_REVISION
      : isDangerousRealtimeBalanceRevision(value.balanceRevision)
        ? value.balanceRevision
        : null;
  if (balanceRevision === null) return null;
  const parsedConfig = parseRealtimeConfig(
    value.config,
    value.modifierSource,
    value.targetKind,
    value.targetId as DangerousFishId | DangerousBossId,
    balanceRevision,
  );
  if (!parsedConfig) return null;
  const { config, modifierSource } = parsedConfig;
  const checkpoint = parseRealtimeCheckpoint(
    value.checkpoint,
    config,
    balanceRevision,
  );
  if (
    !config ||
    !checkpoint ||
    !isNonNegativeInt(value.approvedTick) ||
    !isNonNegativeInt(value.revision) ||
    !isNonNegativeInt(value.startedAt) ||
    !isNonNegativeInt(value.expiresAt) ||
    value.approvedTick !== checkpoint.tick ||
    value.expiresAt !== value.startedAt + config.maxTicks * DANGEROUS_REALTIME_TICK_MS
  ) {
    return null;
  }
  const encounter: DangerousRealtimeEncounter = {
    simulationVersion: 2,
    balanceRevision,
    id: value.id,
    targetKind: value.targetKind,
    targetId: value.targetId,
    modifierSource,
    config,
    checkpoint,
    approvedTick: value.approvedTick,
    revision: value.revision,
    startedAt: value.startedAt,
    expiresAt: value.expiresAt,
  };
  return encounter;
}

function parseCargo(raw: unknown): DangerousCargoStack[] {
  if (!Array.isArray(raw)) return [];
  const byFish = new Map<DangerousFishId, DangerousCargoStack>();
  for (const item of raw) {
    const value = objectRecord(item);
    if (!value || !isDangerousFishId(value.fishId)) continue;
    const quantity = nonNegativeSafeInt(value.quantity);
    const totalValue = nonNegativeSafeInt(value.totalValue);
    const materialId = dangerousCatchMaterialId(value.fishId);
    if (quantity === 0 || totalValue === 0 || value.materialId !== materialId) continue;
    const previous = byFish.get(value.fishId);
    byFish.set(value.fishId, {
      fishId: value.fishId,
      materialId,
      quantity: saturatingSafeAdd(previous?.quantity ?? 0, quantity),
      totalValue: saturatingSafeAdd(previous?.totalValue ?? 0, totalValue),
    });
  }
  return [...byFish.values()];
}

function parseCodex(
  raw: unknown,
): Partial<Record<DangerousFishId, DangerousFishCodexEntry>> {
  const record = objectRecord(raw);
  const codex: Partial<Record<DangerousFishId, DangerousFishCodexEntry>> = {};
  if (!record) return codex;
  for (const [id, rawEntry] of Object.entries(record)) {
    if (!isDangerousFishId(id)) continue;
    const entry = objectRecord(rawEntry);
    if (!entry) continue;
    const caughtCount = Math.max(0, safeInt(entry.caughtCount));
    const bestSizeCm = Math.max(0, safeInt(entry.bestSizeCm));
    if (caughtCount === 0 || bestSizeCm === 0) continue;
    codex[id] = {
      caughtCount,
      bestSizeCm,
      firstCaughtAt: Math.max(0, safeInt(entry.firstCaughtAt)),
      bestCaughtAt: Math.max(0, safeInt(entry.bestCaughtAt)),
    };
  }
  return codex;
}

function parseBossCodex(
  raw: unknown,
): Partial<Record<DangerousBossId, DangerousBossCodexEntry>> {
  const record = objectRecord(raw);
  const codex: Partial<Record<DangerousBossId, DangerousBossCodexEntry>> = {};
  if (!record) return codex;
  for (const [id, rawEntry] of Object.entries(record)) {
    if (!isDangerousBossId(id)) continue;
    const entry = objectRecord(rawEntry);
    if (!entry) continue;
    const defeats = Math.max(0, safeInt(entry.defeats));
    if (defeats === 0) continue;
    codex[id] = {
      defeats,
      firstDefeatedAt: Math.max(0, safeInt(entry.firstDefeatedAt)),
      lastDefeatedAt: Math.max(0, safeInt(entry.lastDefeatedAt)),
      bestContribution: Math.max(0, safeInt(entry.bestContribution)),
    };
  }
  return codex;
}

function parseBossAttempt(
  raw: unknown,
  context: RealtimeParseContext,
): DangerousBossAttempt | null {
  const value = objectRecord(raw);
  if (!value || typeof value.eventId !== "string" || value.eventId.length === 0) {
    return null;
  }
  const encounter = parseDangerousStoredEncounter(value.encounter, context);
  if (!encounter || encounter.targetKind !== "boss") return null;
  return { eventId: value.eventId, encounter };
}

function parseVoyage(
  raw: unknown,
  context: RealtimeParseContext,
): DangerousFishingVoyage | null {
  const value = objectRecord(raw);
  if (
    !value ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    !isDangerousZoneId(value.zoneId) ||
    !isDangerousDepthId(value.depthId)
  ) {
    return null;
  }
  const risk = clamp(safeInt(value.risk), 0, 5);
  const encounter = parseDangerousStoredEncounter(value.encounter, context);
  return {
    id: value.id,
    zoneId: value.zoneId,
    depthId: value.depthId,
    risk,
    startedAt: Math.max(0, safeInt(value.startedAt)),
    cargo: parseCargo(value.cargo),
    encounter:
      encounter &&
      (!isDangerousRealtimeEncounter(encounter) || encounter.config.risk === risk)
        ? encounter
        : null,
  };
}

function parseEnhancementLevels<T extends string>(
  raw: unknown,
  guard: (value: unknown) => value is T,
): Partial<Record<T, number>> {
  const value = objectRecord(raw);
  const levels: Partial<Record<T, number>> = {};
  if (!value) return levels;
  for (const [id, rawLevel] of Object.entries(value)) {
    if (!guard(id)) continue;
    levels[id] = clamp(safeInt(rawLevel), 0, 3);
  }
  return levels;
}

function parseGearEnhancements(
  raw: unknown,
  ownedGear: DangerousFishingState["ownedGear"],
): DangerousGearEnhancements {
  const value = objectRecord(raw);
  return {
    rods: Object.fromEntries(
      Object.entries(parseEnhancementLevels(value?.rods, isDangerousRodId)).filter(
        ([id]) => ownedGear.rods.includes(id as DangerousRodId),
      ),
    ),
    reels: Object.fromEntries(
      Object.entries(parseEnhancementLevels(value?.reels, isDangerousReelId)).filter(
        ([id]) => ownedGear.reels.includes(id as DangerousReelId),
      ),
    ),
    lines: Object.fromEntries(
      Object.entries(parseEnhancementLevels(value?.lines, isDangerousLineId)).filter(
        ([id]) => ownedGear.lines.includes(id as DangerousLineId),
      ),
    ),
  };
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  const record = objectRecord(value);
  return !!record && Object.values(record).every(isJsonValue);
}

function parseRealtimeCompletions(raw: unknown): DangerousRealtimeCompletion[] {
  if (!Array.isArray(raw)) return [];
  const completions: DangerousRealtimeCompletion[] = [];
  const requestIds = new Set<string>();
  for (const rawCompletion of raw) {
    const value = objectRecord(rawCompletion);
    if (
      !value ||
      typeof value.requestId !== "string" ||
      value.requestId.length === 0 ||
      typeof value.encounterId !== "string" ||
      value.encounterId.length === 0 ||
      !isJsonValue(value.result)
    ) {
      continue;
    }
    if (requestIds.has(value.requestId)) {
      const previous = completions.findIndex(
        (completion) => completion.requestId === value.requestId,
      );
      completions.splice(previous, 1);
    }
    requestIds.add(value.requestId);
    completions.push({
      requestId: value.requestId,
      encounterId: value.encounterId,
      result: value.result,
    });
  }
  return completions.slice(-32);
}

export function parseDangerousFishingState(raw: unknown): DangerousFishingState {
  const fallback = emptyDangerousFishingState();
  const value = objectRecord(raw);
  if (!value) return fallback;
  const rawOwned = objectRecord(value.ownedGear);
  const rods = uniqueGear(rawOwned?.rods, isDangerousRodId, "starter_rod");
  const reels = uniqueGear(rawOwned?.reels, isDangerousReelId, "starter_reel");
  const lines = uniqueGear(rawOwned?.lines, isDangerousLineId, "starter_line");

  const baitCounts: Partial<Record<DangerousBaitId, number>> = {};
  const rawBaits = objectRecord(value.baitCounts);
  if (rawBaits) {
    for (const [id, amount] of Object.entries(rawBaits)) {
      if (!isDangerousBaitId(id) || id === "basic_bait") continue;
      const count = Math.max(0, safeInt(amount));
      if (count > 0) baitCounts[id] = count;
    }
  }

  const rawLoadout = objectRecord(value.loadout);
  const rodId =
    isDangerousRodId(rawLoadout?.rodId) && rods.includes(rawLoadout.rodId)
      ? rawLoadout.rodId
      : "starter_rod";
  const reelId =
    isDangerousReelId(rawLoadout?.reelId) && reels.includes(rawLoadout.reelId)
      ? rawLoadout.reelId
      : "starter_reel";
  const lineId =
    isDangerousLineId(rawLoadout?.lineId) && lines.includes(rawLoadout.lineId)
      ? rawLoadout.lineId
      : "starter_line";
  const baitId =
    isDangerousBaitId(rawLoadout?.baitId) &&
    (rawLoadout.baitId === "basic_bait" || (baitCounts[rawLoadout.baitId] ?? 0) > 0)
      ? rawLoadout.baitId
      : "basic_bait";
  const gearEnhancements = parseGearEnhancements(value.gearEnhancements, {
    rods,
    reels,
    lines,
  });
  const realtimeContext: RealtimeParseContext = {
    ownedGear: { rods, reels, lines },
    gearEnhancements,
  };

  const bossTraces: Partial<Record<DangerousBossId, number>> = {};
  const rawTraces = objectRecord(value.bossTraces);
  if (rawTraces) {
    for (const [id, amount] of Object.entries(rawTraces)) {
      if (!isDangerousBossId(id)) continue;
      const count = Math.max(0, safeInt(amount));
      if (count > 0) bossTraces[id] = count;
    }
  }

  const resolvedEncounterIds = Array.isArray(value.resolvedEncounterIds)
    ? value.resolvedEncounterIds
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .filter((id, index, all) => all.indexOf(id) === index)
        .slice(-32)
    : [];

  return {
    version: DANGEROUS_FISHING_STATE_VERSION,
    ownedGear: { rods, reels, lines },
    loadout: { rodId, reelId, lineId, baitId },
    baitCounts,
    codex: parseCodex(value.codex),
    bossCodex: parseBossCodex(value.bossCodex),
    bossTraces,
    bossAttempt: parseBossAttempt(value.bossAttempt, realtimeContext),
    resolvedEncounterIds,
    gearEnhancements,
    realtimeCompletions: parseRealtimeCompletions(value.realtimeCompletions),
    voyage: parseVoyage(value.voyage, realtimeContext),
  };
}

export type DangerousRealtimeExpiryRecovery = {
  state: DangerousFishingState;
  encounter: DangerousStoredEncounter | null;
};

function realtimeExpiryCompletion(
  state: DangerousFishingState,
  encounter: DangerousRealtimeEncounter,
  result: unknown,
  requestId?: string,
): Pick<DangerousFishingState, "realtimeCompletions" | "resolvedEncounterIds"> {
  const completion: DangerousRealtimeCompletion = {
    requestId: requestId ?? `expired:${encounter.id}`,
    encounterId: encounter.id,
    result,
  };
  return {
    realtimeCompletions: [
      ...state.realtimeCompletions.filter(
        (entry) =>
          entry.requestId !== completion.requestId &&
          entry.encounterId !== encounter.id,
      ),
      completion,
    ].slice(-DANGEROUS_REALTIME_COMPLETION_LIMIT),
    resolvedEncounterIds: withResolvedId(state, encounter.id),
  };
}

function isPastRealtimeFinishGrace(
  encounter: DangerousRealtimeEncounter,
  now: number,
): boolean {
  return now > encounter.expiresAt + DANGEROUS_REALTIME_FINISH_GRACE_MS;
}

export function recoverExpiredRealtimeVoyageEncounter(
  state: DangerousFishingState,
  args: { now: number; result: unknown; requestId?: string },
): DangerousRealtimeExpiryRecovery {
  const encounter = state.voyage?.encounter;
  if (
    !encounter ||
    !isDangerousRealtimeEncounter(encounter) ||
    !isPastRealtimeFinishGrace(encounter, args.now)
  ) {
    return { state, encounter: null };
  }
  const resolution = realtimeExpiryCompletion(
    state,
    encounter,
    args.result,
    args.requestId,
  );
  return {
    encounter,
    state: {
      ...state,
      ...resolution,
      voyage: state.voyage
        ? { ...state.voyage, encounter: null }
        : state.voyage,
    },
  };
}

export function recoverExpiredRealtimeBossAttempt(
  state: DangerousFishingState,
  args: { now: number; result: unknown; requestId?: string },
): DangerousRealtimeExpiryRecovery {
  const encounter = state.bossAttempt?.encounter;
  if (!encounter) {
    return { state, encounter: null };
  }
  if (!isDangerousRealtimeEncounter(encounter)) {
    if (args.now < encounter.expiresAt) {
      return { state, encounter: null };
    }
    return {
      encounter,
      state: { ...state, bossAttempt: null },
    };
  }
  if (!isPastRealtimeFinishGrace(encounter, args.now)) {
    return { state, encounter: null };
  }
  const resolution = realtimeExpiryCompletion(
    state,
    encounter,
    args.result,
    args.requestId,
  );
  return {
    encounter,
    state: {
      ...state,
      ...resolution,
      bossAttempt: null,
    },
  };
}

export function startDangerousVoyage(
  state: DangerousFishingState,
  args: {
    id: string;
    zoneId: DangerousZoneId;
    depthId: DangerousDepthId;
    risk: number;
    startedAt: number;
  },
):
  | { ok: true; state: DangerousFishingState }
  | { ok: false; error: "voyage_active"; state: DangerousFishingState } {
  if (state.voyage) return { ok: false, error: "voyage_active", state };
  return {
    ok: true,
    state: {
      ...state,
      voyage: {
        id: args.id,
        zoneId: args.zoneId,
        depthId: args.depthId,
        risk: clamp(safeInt(args.risk), 0, 5),
        startedAt: Math.max(0, safeInt(args.startedAt)),
        cargo: [],
        encounter: null,
      },
    },
  };
}

export function startPersonalEncounter(
  state: DangerousFishingState,
  encounter: DangerousEncounter,
):
  | { ok: true; state: DangerousFishingState }
  | {
      ok: false;
      error: "no_voyage" | "encounter_active";
      state: DangerousFishingState;
    } {
  if (!state.voyage) return { ok: false, error: "no_voyage", state };
  if (state.bossAttempt) {
    return { ok: false, error: "encounter_active", state };
  }
  if (state.voyage.encounter) {
    return { ok: false, error: "encounter_active", state };
  }
  return {
    ok: true,
    state: {
      ...state,
      voyage: {
        ...state.voyage,
        encounter: { ...encounter, simulationVersion: 1 },
      },
    },
  };
}

function withResolvedId(state: DangerousFishingState, encounterId: string): string[] {
  return [...state.resolvedEncounterIds.filter((id) => id !== encounterId), encounterId].slice(
    -32,
  );
}

export function resolvePersonalEncounter(
  state: DangerousFishingState,
  transition: DangerousEncounterTransition,
  now: number,
  caught?: {
    fishId: DangerousFishId;
    sizeCm: number;
    quantity: number;
  },
): {
  state: DangerousFishingState;
  outcome: "progress" | "caught" | "failed" | "duplicate" | "no_encounter";
  event?: DangerousEncounterEvent;
} {
  const encounterId = transition.encounter.id;
  if (state.resolvedEncounterIds.includes(encounterId)) {
    return { state, outcome: "duplicate", event: transition.event };
  }
  if (!state.voyage?.encounter || state.voyage.encounter.id !== encounterId) {
    return { state, outcome: "no_encounter", event: transition.event };
  }
  if (isDangerousRealtimeEncounter(state.voyage.encounter)) {
    return { state, outcome: "no_encounter", event: transition.event };
  }
  if (transition.event === "progress") {
    return {
      state: {
        ...state,
        voyage: {
          ...state.voyage,
          encounter: { ...transition.encounter, simulationVersion: 1 },
        },
      },
      outcome: "progress",
      event: transition.event,
    };
  }
  if (transition.event === "too_fast" || transition.event === "stale") {
    return { state, outcome: "progress", event: transition.event };
  }

  const resolvedEncounterIds = withResolvedId(state, encounterId);
  const clearedVoyage = { ...state.voyage, encounter: null };
  if (
    transition.event !== "caught" ||
    !caught ||
    transition.encounter.targetKind !== "fish" ||
    transition.encounter.targetId !== caught.fishId
  ) {
    return {
      state: {
        ...state,
        resolvedEncounterIds,
        voyage: clearedVoyage,
      },
      outcome: "failed",
      event: transition.event,
    };
  }

  const fish = DANGEROUS_FISH[caught.fishId];
  const quantity = Math.max(1, safeInt(caught.quantity, 1));
  const sizeCm = clamp(safeInt(caught.sizeCm, fish.minSizeCm), fish.minSizeCm, fish.maxSizeCm);
  const materialId = dangerousCatchMaterialId(caught.fishId);
  const cargo = [...clearedVoyage.cargo];
  const cargoIndex = cargo.findIndex((item) => item.fishId === caught.fishId);
  if (cargoIndex >= 0) {
    const previous = cargo[cargoIndex];
    cargo[cargoIndex] = {
      ...previous,
      quantity: previous.quantity + quantity,
      totalValue: previous.totalValue + fish.cargoValue * quantity,
    };
  } else {
    cargo.push({
      fishId: caught.fishId,
      materialId,
      quantity,
      totalValue: fish.cargoValue * quantity,
    });
  }

  const previousCodex = state.codex[caught.fishId];
  const isBest = !previousCodex || sizeCm > previousCodex.bestSizeCm;
  const codexEntry: DangerousFishCodexEntry = {
    caughtCount: (previousCodex?.caughtCount ?? 0) + quantity,
    bestSizeCm: isBest ? sizeCm : (previousCodex?.bestSizeCm ?? sizeCm),
    firstCaughtAt: previousCodex?.firstCaughtAt ?? Math.max(0, safeInt(now)),
    bestCaughtAt: isBest
      ? Math.max(0, safeInt(now))
      : (previousCodex?.bestCaughtAt ?? Math.max(0, safeInt(now))),
  };
  return {
    state: {
      ...state,
      codex: { ...state.codex, [caught.fishId]: codexEntry },
      resolvedEncounterIds,
      voyage: {
        ...clearedVoyage,
        risk: clamp(clearedVoyage.risk + 1, 0, 5),
        cargo,
      },
    },
    outcome: "caught",
    event: transition.event,
  };
}

export function dangerousRiskPreview(risk: number): DangerousRiskPreview {
  const normalized = clamp(safeInt(risk), 0, 5);
  if (normalized <= 2) {
    return { risk: normalized, accidentChance: 0, maxLossFraction: 0 };
  }
  if (normalized === 3) {
    return { risk: 3, accidentChance: 0.12, maxLossFraction: 0.2 };
  }
  if (normalized === 4) {
    return { risk: 4, accidentChance: 0.22, maxLossFraction: 0.35 };
  }
  return { risk: 5, accidentChance: 0.32, maxLossFraction: 0.5 };
}

function settledMaterials(cargo: readonly DangerousCargoStack[]): Record<string, number> {
  const materials: Record<string, number> = {};
  for (const item of cargo) {
    materials[item.materialId] = saturatingSafeAdd(
      materials[item.materialId] ?? 0,
      nonNegativeSafeInt(item.quantity),
    );
  }
  return materials;
}

function settledCargoValue(cargo: readonly DangerousCargoStack[]): number {
  let total = 0;
  for (const item of cargo) {
    total = saturatingSafeAdd(total, nonNegativeSafeInt(item.totalValue));
  }
  return total;
}

export function returnDangerousVoyage(
  state: DangerousFishingState,
): DangerousFishingReturn {
  if (!state.voyage) {
    return {
      state,
      incident: false,
      returned: false,
      lostValue: 0,
      lostCargo: {},
      materials: {},
      retainedCargoValue: 0,
    };
  }
  return {
    state: { ...state, voyage: null },
    incident: false,
    returned: true,
    lostValue: 0,
    lostCargo: {},
    materials: settledMaterials(state.voyage.cargo),
    retainedCargoValue: settledCargoValue(state.voyage.cargo),
  };
}

export function applyDangerousAccidentAndReturn(
  state: DangerousFishingState,
  roll: number,
  cargoProtectionPct = 0,
): DangerousFishingReturn {
  if (!state.voyage) return returnDangerousVoyage(state);
  const preview = dangerousRiskPreview(state.voyage.risk);
  const normalizedRoll = Number.isFinite(roll) ? clamp(roll, 0, 1) : 1;
  if (preview.accidentChance === 0 || normalizedRoll >= preview.accidentChance) {
    return {
      state,
      incident: false,
      returned: false,
      lostValue: 0,
      lostCargo: {},
      materials: {},
      retainedCargoValue: 0,
    };
  }

  const cargo = state.voyage.cargo
    .map((item) => ({
      ...item,
      quantity: nonNegativeSafeInt(item.quantity),
      totalValue: nonNegativeSafeInt(item.totalValue),
    }))
    .filter((item) => item.quantity > 0 && item.totalValue > 0);
  const bigintZero = BigInt(0);
  const totalValue = cargo.reduce(
    (sum, item) => sum + BigInt(item.totalValue),
    bigintZero,
  );
  const protection = clamp(
    Number.isFinite(cargoProtectionPct) ? cargoProtectionPct : 0,
    0,
    100,
  );
  const fractionScale = BigInt(1_000_000);
  const lossFractionUnits = BigInt(
    Math.round(preview.maxLossFraction * Number(fractionScale)),
  );
  const protectionFractionUnits = BigInt(
    Math.round((protection / 100) * Number(fractionScale)),
  );
  const lossBudget =
    (totalValue * lossFractionUnits *
      (fractionScale - protectionFractionUnits)) /
    (fractionScale * fractionScale);
  const lostCargo: Record<string, number> = {};
  const retainedCargo: DangerousCargoStack[] = [];
  let lostValue = bigintZero;

  for (const item of cargo) {
    const proportionalBudget =
      totalValue > bigintZero
        ? (lossBudget * BigInt(item.totalValue)) / totalValue
        : bigintZero;
    const itemQuantity = BigInt(item.quantity);
    const itemValue = BigInt(item.totalValue);
    const lostQuantityBig =
      itemValue > bigintZero
        ? (proportionalBudget * itemQuantity) / itemValue
        : bigintZero;
    const lostQuantity = Number(
      lostQuantityBig > itemQuantity ? itemQuantity : lostQuantityBig,
    );
    const itemLostValue = Number(
      (itemValue * BigInt(lostQuantity)) / itemQuantity,
    );
    lostValue += BigInt(itemLostValue);
    if (lostQuantity > 0) {
      lostCargo[item.materialId] = saturatingSafeAdd(
        lostCargo[item.materialId] ?? 0,
        lostQuantity,
      );
    }
    const retainedQuantity = item.quantity - lostQuantity;
    if (retainedQuantity > 0) {
      retainedCargo.push({
        ...item,
        quantity: retainedQuantity,
        totalValue: item.totalValue - itemLostValue,
      });
    }
  }

  return {
    state: { ...state, voyage: null },
    incident: true,
    returned: true,
    lostValue: Number(
      lostValue > BigInt(Number.MAX_SAFE_INTEGER)
        ? BigInt(Number.MAX_SAFE_INTEGER)
        : lostValue,
    ),
    lostCargo,
    materials: settledMaterials(retainedCargo),
    retainedCargoValue: settledCargoValue(retainedCargo),
  };
}
