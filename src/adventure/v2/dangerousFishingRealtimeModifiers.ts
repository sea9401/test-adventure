import {
  DANGEROUS_BAITS,
  type DangerousBaitId,
  type DangerousRealtimeBaitEffect,
} from "@/adventure/data/v2/dangerousFishing";

export const DANGEROUS_REALTIME_RISK_RULES = {
  0: {
    safeZonePct: 52,
    minBehaviorTicks: 32,
    maxChain: 1,
    tensionImpulsePermille: 800,
  },
  1: {
    safeZonePct: 50,
    minBehaviorTicks: 30,
    maxChain: 1,
    tensionImpulsePermille: 900,
  },
  2: {
    safeZonePct: 46,
    minBehaviorTicks: 28,
    maxChain: 2,
    tensionImpulsePermille: 1000,
  },
  3: {
    safeZonePct: 42,
    minBehaviorTicks: 25,
    maxChain: 2,
    tensionImpulsePermille: 1120,
  },
  4: {
    safeZonePct: 38,
    minBehaviorTicks: 22,
    maxChain: 3,
    tensionImpulsePermille: 1250,
  },
  5: {
    safeZonePct: 34,
    minBehaviorTicks: 19,
    maxChain: 3,
    tensionImpulsePermille: 1400,
  },
} as const;

export type DangerousRealtimeModifierArgs = {
  fishingLevel: number;
  baitId: DangerousBaitId;
  reelPowerBonus?: number;
  staminaDamageBonus?: number;
  tensionControlBonus?: number;
  slackTolerance?: number;
  telegraphSteps?: number;
  rodEnhancementLevel?: number;
  reelEnhancementLevel?: number;
  lineEnhancementLevel?: number;
  cargoProtectionPct?: number;
};

export type DangerousRealtimeModifiers = {
  reelEfficiencyPct: number;
  tensionControlPct: number;
  safeZoneBonusPct: number;
  cargoProtectionPct: number;
  staminaDamagePct: number;
  distanceRecoveryPct: number;
  lowTensionGraceTicks: number;
  telegraphCount: number;
  timeReductionPct: number;
  baitEffect: DangerousRealtimeBaitEffect;
};

function finiteInt(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function enhancementLevel(level: number | undefined): number {
  return Math.max(0, Math.min(3, finiteInt(level ?? 0)));
}

export function dangerousRealtimeLevelBonuses(level: number) {
  const endgame = Math.max(0, Math.min(50, finiteInt(level) - 50));
  return {
    reelEfficiencyPct: Math.floor((endgame * 12) / 50),
    tensionControlPct: Math.floor((endgame * 8) / 50),
  };
}

export function dangerousRealtimeBaitEffect(
  baitId: DangerousBaitId,
): DangerousRealtimeBaitEffect {
  return DANGEROUS_BAITS[baitId].realtimeEffect;
}

export function dangerousRealtimeModifiers(
  args: DangerousRealtimeModifierArgs,
): DangerousRealtimeModifiers {
  const levelBonuses = dangerousRealtimeLevelBonuses(args.fishingLevel);
  const baitEffect = dangerousRealtimeBaitEffect(args.baitId);
  const tensionControlPct =
    levelBonuses.tensionControlPct +
    Math.max(0, finiteInt(args.tensionControlBonus ?? 0));
  const staminaDamagePct =
    Math.max(0, finiteInt(args.staminaDamageBonus ?? 0)) +
    enhancementLevel(args.rodEnhancementLevel) * 6;
  const distanceRecoveryPct =
    Math.max(0, finiteInt(args.reelPowerBonus ?? 0)) +
    enhancementLevel(args.reelEnhancementLevel) * 5;
  const lineLevel = enhancementLevel(args.lineEnhancementLevel);
  const safeZoneBonusPct = lineLevel * 3;
  const cargoProtectionPct =
    Math.max(0, finiteInt(args.cargoProtectionPct ?? 0)) + lineLevel * 2;
  const timeReductionPct = Math.min(
    35,
    levelBonuses.reelEfficiencyPct +
      tensionControlPct +
      safeZoneBonusPct +
      staminaDamagePct +
      distanceRecoveryPct +
      baitEffect.maxTimeReductionPct,
  );

  return {
    reelEfficiencyPct: levelBonuses.reelEfficiencyPct,
    tensionControlPct,
    safeZoneBonusPct,
    cargoProtectionPct,
    staminaDamagePct,
    distanceRecoveryPct,
    lowTensionGraceTicks:
      (1 + Math.max(0, finiteInt(args.slackTolerance ?? 0))) * 20,
    telegraphCount: Math.max(
      0,
      Math.min(2, finiteInt(args.telegraphSteps ?? 0)),
    ),
    timeReductionPct,
    baitEffect,
  };
}
