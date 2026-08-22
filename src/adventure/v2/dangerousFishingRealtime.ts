import type {
  DangerousFishBehavior,
  DangerousFishRarity,
} from "@/adventure/data/v2/dangerousFishing";
import {
  DANGEROUS_REALTIME_RISK_RULES,
  type DangerousRealtimeModifiers,
} from "./dangerousFishingRealtimeModifiers";

export const DANGEROUS_REALTIME_TICK_MS = 50;
export const DANGEROUS_REALTIME_START_DELAY_MS = 1_000;
export const DANGEROUS_REALTIME_LOW_TENSION_GRACE_TICKS = 20;
export const DANGEROUS_REALTIME_TELEGRAPH_TICKS = 5;
export const DANGEROUS_REALTIME_START_TENSION = 500;
export const DANGEROUS_REALTIME_MAX_TENSION = 1_000;
export const DANGEROUS_REALTIME_START_STAMINA = 10_000;
export const DANGEROUS_REALTIME_START_DISTANCE = 10_000;
export const DANGEROUS_REALTIME_TOTAL_TARGET_WORK = 20_000;
export const DANGEROUS_REALTIME_LEGACY_BALANCE_REVISION = 1 as const;
export const DANGEROUS_REALTIME_CALIBRATED_BALANCE_REVISION = 2 as const;
export const DANGEROUS_REALTIME_FULL_PERFORMANCE_BALANCE_REVISION = 3 as const;
export const DANGEROUS_REALTIME_BALANCE_REVISION = 4 as const;
export type DangerousRealtimeBalanceRevision =
  | typeof DANGEROUS_REALTIME_LEGACY_BALANCE_REVISION
  | typeof DANGEROUS_REALTIME_CALIBRATED_BALANCE_REVISION
  | typeof DANGEROUS_REALTIME_FULL_PERFORMANCE_BALANCE_REVISION
  | typeof DANGEROUS_REALTIME_BALANCE_REVISION;

export function isDangerousRealtimeBalanceRevision(
  value: unknown,
): value is DangerousRealtimeBalanceRevision {
  return (
    value === DANGEROUS_REALTIME_LEGACY_BALANCE_REVISION ||
    value === DANGEROUS_REALTIME_CALIBRATED_BALANCE_REVISION ||
    value === DANGEROUS_REALTIME_FULL_PERFORMANCE_BALANCE_REVISION ||
    value === DANGEROUS_REALTIME_BALANCE_REVISION
  );
}
/** Immutable revision-2 calibration retained for persisted encounter replay. */
export const DANGEROUS_REALTIME_PERFORMANCE_SCALE_PERMILLE = 461;
export const DANGEROUS_REALTIME_BASELINE_OVERRUN_TICKS = 50;
export const DANGEROUS_REALTIME_RETAINED_DURATION_PERMILLE = 650;

export function dangerousRealtimeMinimumCatchTick(targetTicks: number): number {
  return Math.ceil(
    ((Math.max(0, Math.floor(targetTicks)) +
      DANGEROUS_REALTIME_BASELINE_OVERRUN_TICKS) *
      DANGEROUS_REALTIME_RETAINED_DURATION_PERMILLE) /
      1_000,
  );
}

export const DANGEROUS_REALTIME_REEL_DUTY_BY_RISK = {
  0: 830,
  1: 820,
  2: 730,
  3: 710,
  4: 680,
  5: 660,
} as const;
export const DANGEROUS_REALTIME_RELEASE_RECOVERY_PERMILLE = 200;
export const DANGEROUS_REALTIME_REEL_TENSION = 6;
export const DANGEROUS_REALTIME_RELEASE_TENSION = -18;

export const DANGEROUS_REALTIME_TARGET_TICK_BANDS = {
  common: { min: 160, max: 300 },
  rare: { min: 240, max: 400 },
  epic: { min: 240, max: 400 },
  legendary: { min: 360, max: 500 },
  boss: { min: 500, max: 800 },
} as const;

/**
 * Active behavior tuning uses integer permille multipliers. Outside the active
 * phase, reeling still makes progress but receives no behavior impulse.
 */
export const DANGEROUS_REALTIME_BEHAVIOR_BALANCE = {
  charge: {
    activeTicks: 8,
    tensionImpulse: 11,
    staminaWorkPermille: 1_000,
    distanceWorkPermille: 900,
    releaseRecoveryPermille: 1_000,
  },
  thrash: {
    activeTicks: 10,
    tensionImpulse: 8,
    staminaWorkPermille: 1_200,
    distanceWorkPermille: 1_000,
    releaseRecoveryPermille: 700,
  },
  turn: {
    activeTicks: 9,
    tensionImpulse: 2,
    staminaWorkPermille: 1_300,
    distanceWorkPermille: 1_300,
    releaseRecoveryPermille: 1_400,
  },
  dive: {
    activeTicks: 12,
    tensionImpulse: 6,
    staminaWorkPermille: 800,
    distanceWorkPermille: 700,
    releaseRecoveryPermille: 1_800,
  },
} as const satisfies Record<
  DangerousFishBehavior,
  {
    activeTicks: number;
    tensionImpulse: number;
    staminaWorkPermille: number;
    distanceWorkPermille: number;
    releaseRecoveryPermille: number;
  }
>;

const IDLE_BALANCE = {
  tensionImpulse: 0,
  staminaWorkPermille: 1_100,
  distanceWorkPermille: 1_100,
  releaseRecoveryPermille: 1_000,
} as const;

const FALLBACK_SEED = 0x6d2b79f5;

export type DangerousRealtimeMode = "reel" | "release";
export type DangerousRealtimeInput = {
  tick: number;
  mode: DangerousRealtimeMode;
};
export type DangerousRealtimeStatus =
  | "active"
  | "caught"
  | "line_broken"
  | "hook_lost"
  | "timeout";
export type DangerousRealtimePhase = "idle" | "telegraph" | "active";
export type DangerousRealtimeRarity = DangerousFishRarity | "boss";

export type DangerousRealtimeConfig = {
  seed: number;
  risk: number;
  targetKind: "fish" | "boss";
  rarity: DangerousRealtimeRarity;
  behaviorPattern: readonly DangerousFishBehavior[];
  initialTension: number;
  maxTension: number;
  initialStamina: number;
  initialDistance: number;
  /** Timeout tick, fixed by the server at twice the seeded target tick. */
  maxTicks: number;
  modifiers: DangerousRealtimeModifiers;
};

export type DangerousRealtimeState = {
  tick: number;
  mode: DangerousRealtimeMode;
  status: DangerousRealtimeStatus;
  tension: number;
  maxTension: number;
  stamina: number;
  maxStamina: number;
  distance: number;
  startDistance: number;
  lowTensionTicks: number;
  behavior: DangerousFishBehavior;
  nextBehavior: DangerousFishBehavior;
  behaviorCursor: number;
  phase: DangerousRealtimePhase;
  phaseTicksRemaining: number;
  chainRemaining: number;
  rngState: number;
  targetTicks: number;
  maxTicks: number;
  /** Scale applied once to raw time-shortening contributors. */
  performanceScalePermille: number;
};

export type DangerousRealtimeView = Omit<
  DangerousRealtimeState,
  "rngState" | "nextBehavior"
> & {
  safeTensionMin: number;
  safeTensionMax: number;
  remainingTicks: number;
  telegraphs: readonly DangerousFishBehavior[];
};

function realtimeRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function realtimeNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isConfiguredRealtimeBehavior(
  value: unknown,
  config: DangerousRealtimeConfig,
): value is DangerousFishBehavior {
  return (
    (value === "charge" ||
      value === "thrash" ||
      value === "turn" ||
      value === "dive") &&
    config.behaviorPattern.includes(value)
  );
}

/**
 * Client-safe validation for checkpoints crossing a persistence or network
 * boundary. Keep this next to the deterministic engine so browser recovery and
 * durable server parsing cannot drift apart.
 */
export function isDangerousRealtimeCheckpoint(
  raw: unknown,
  config: DangerousRealtimeConfig,
  balanceRevision: DangerousRealtimeBalanceRevision,
): raw is DangerousRealtimeState {
  if (!realtimeRecord(raw)) return false;
  const scalarKeys = [
    "tick",
    "tension",
    "maxTension",
    "stamina",
    "maxStamina",
    "distance",
    "startDistance",
    "lowTensionTicks",
    "behaviorCursor",
    "phaseTicksRemaining",
    "chainRemaining",
    "rngState",
    "targetTicks",
    "maxTicks",
    "performanceScalePermille",
  ] as const;
  if (!scalarKeys.every((key) => realtimeNonNegativeInt(raw[key]))) {
    return false;
  }
  const checkpoint = raw as unknown as DangerousRealtimeState;
  const risk = config.risk as 0 | 1 | 2 | 3 | 4 | 5;
  const riskRules = DANGEROUS_REALTIME_RISK_RULES[risk];
  if (
    !riskRules ||
    (checkpoint.mode !== "reel" && checkpoint.mode !== "release") ||
    (checkpoint.status !== "active" &&
      checkpoint.status !== "caught" &&
      checkpoint.status !== "line_broken" &&
      checkpoint.status !== "hook_lost" &&
      checkpoint.status !== "timeout") ||
    !isConfiguredRealtimeBehavior(checkpoint.behavior, config) ||
    !isConfiguredRealtimeBehavior(checkpoint.nextBehavior, config) ||
    checkpoint.tick > config.maxTicks ||
    checkpoint.maxTension !== config.maxTension ||
    checkpoint.maxStamina !== config.initialStamina ||
    checkpoint.startDistance !== config.initialDistance ||
    checkpoint.stamina > checkpoint.maxStamina ||
    checkpoint.distance > checkpoint.startDistance * 2 ||
    checkpoint.lowTensionTicks > config.modifiers.lowTensionGraceTicks ||
    checkpoint.behaviorCursor > config.maxTicks ||
    checkpoint.chainRemaining > riskRules.maxChain ||
    checkpoint.rngState === 0 ||
    checkpoint.targetTicks !== dangerousRealtimeTargetTicks(config) ||
    checkpoint.maxTicks !== config.maxTicks ||
    checkpoint.performanceScalePermille !==
      dangerousRealtimePerformanceScalePermille(
        config.modifiers,
        balanceRevision,
      )
  ) {
    return false;
  }
  const phaseMax =
    checkpoint.phase === "telegraph"
      ? DANGEROUS_REALTIME_TELEGRAPH_TICKS
      : checkpoint.phase === "active"
        ? 12
        : checkpoint.phase === "idle"
          ? 32
          : 0;
  if (
    phaseMax === 0 ||
    checkpoint.phaseTicksRemaining === 0 ||
    checkpoint.phaseTicksRemaining > phaseMax
  ) {
    return false;
  }

  const terminalCatch = dangerousRealtimeCatchReady(
    checkpoint,
    config,
    balanceRevision,
  );
  const terminalLineBreak = checkpoint.tension > checkpoint.maxTension;
  const terminalHookLoss =
    checkpoint.lowTensionTicks >= config.modifiers.lowTensionGraceTicks;
  const terminalTimeout = checkpoint.tick >= checkpoint.maxTicks;
  switch (checkpoint.status) {
    case "caught":
      return !terminalLineBreak && !terminalHookLoss && terminalCatch;
    case "line_broken":
      return terminalLineBreak;
    case "hook_lost":
      return !terminalLineBreak && terminalHookLoss;
    case "timeout":
      return (
        !terminalLineBreak &&
        !terminalHookLoss &&
        !terminalCatch &&
        terminalTimeout
      );
    case "active":
      return (
        !terminalCatch &&
        !terminalLineBreak &&
        !terminalHookLoss &&
        !terminalTimeout
      );
  }
}

function finiteInt(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function dangerousRealtimeTargetCalibration(
  args: {
    stamina: number;
    distance: number;
    baseTension: number;
    maxTensionBonus: number;
  },
  balanceRevision: DangerousRealtimeBalanceRevision =
    DANGEROUS_REALTIME_BALANCE_REVISION,
): Pick<
  DangerousRealtimeConfig,
  "initialTension" | "maxTension" | "initialStamina" | "initialDistance"
> {
  const stamina = Math.max(1, finiteInt(args.stamina, 1));
  const distance = Math.max(1, finiteInt(args.distance, 1));
  const total = stamina + distance;
  const initialStamina = clamp(
    Math.floor((DANGEROUS_REALTIME_TOTAL_TARGET_WORK * stamina) / total),
    1,
    DANGEROUS_REALTIME_TOTAL_TARGET_WORK - 1,
  );
  const initialDistance =
    DANGEROUS_REALTIME_TOTAL_TARGET_WORK - initialStamina;
  const rawMaxTensionBonus = finiteInt(args.maxTensionBonus, 0);
  const maxTensionBonus =
    balanceRevision === DANGEROUS_REALTIME_CALIBRATED_BALANCE_REVISION
      ? Math.trunc(
          (rawMaxTensionBonus *
            DANGEROUS_REALTIME_PERFORMANCE_SCALE_PERMILLE) /
            1_000,
        )
      : rawMaxTensionBonus;
  const maxTension = Math.max(200, (100 + maxTensionBonus) * 10);
  return {
    initialTension: clamp(
      finiteInt(args.baseTension, 40) * 10,
      0,
      maxTension,
    ),
    maxTension,
    initialStamina,
    initialDistance,
  };
}

function normalizeSeed(seed: number): number {
  return (finiteInt(seed, FALLBACK_SEED) >>> 0) || FALLBACK_SEED;
}

function nextRandom(state: number): { state: number; value: number } {
  let value = normalizeSeed(state);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  value >>>= 0;
  return { state: value || FALLBACK_SEED, value };
}

function mixedSeed(seed: number): number {
  let value = normalizeSeed(seed);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

export function dangerousRealtimeTargetTicks(args: {
  seed: number;
  targetKind: "fish" | "boss";
  rarity: DangerousRealtimeRarity;
}): number {
  const band =
    args.targetKind === "boss"
      ? DANGEROUS_REALTIME_TARGET_TICK_BANDS.boss
      : DANGEROUS_REALTIME_TARGET_TICK_BANDS[args.rarity === "boss" ? "common" : args.rarity];
  const span = band.max - band.min;
  const seededMin = band.min + Math.floor((span * 45) / 100);
  const seededMax = band.max - Math.floor((span * 45) / 100);
  return seededMin + (mixedSeed(args.seed) % (seededMax - seededMin + 1));
}

export function dangerousRealtimeMaxTicks(args: {
  seed: number;
  targetKind: "fish" | "boss";
  rarity: DangerousRealtimeRarity;
}): number {
  return dangerousRealtimeTargetTicks(args) * 2;
}

function riskRule(config: DangerousRealtimeConfig) {
  const risk = clamp(finiteInt(config.risk, 0), 0, 5) as 0 | 1 | 2 | 3 | 4 | 5;
  return DANGEROUS_REALTIME_RISK_RULES[risk];
}

function behaviorPattern(
  config: DangerousRealtimeConfig,
): readonly DangerousFishBehavior[] {
  return config.behaviorPattern.length > 0 ? config.behaviorPattern : ["turn"];
}

function drawInitialBehavior(
  rngState: number,
  config: DangerousRealtimeConfig,
): { behavior: DangerousFishBehavior; behaviorCursor: number; rngState: number } {
  const random = nextRandom(rngState);
  const pattern = behaviorPattern(config);
  const behaviorCursor = random.value % pattern.length;
  return {
    behavior: pattern[behaviorCursor],
    behaviorCursor,
    rngState: random.state,
  };
}

function behaviorAfter(
  behaviorCursor: number,
  config: DangerousRealtimeConfig,
): DangerousFishBehavior {
  const pattern = behaviorPattern(config);
  return pattern[(behaviorCursor + 1) % pattern.length];
}

function drawChain(
  rngState: number,
  config: DangerousRealtimeConfig,
): { chainRemaining: number; rngState: number } {
  const random = nextRandom(rngState);
  const maxChain = riskRule(config).maxChain;
  return {
    chainRemaining: random.value % maxChain,
    rngState: random.state,
  };
}

export function dangerousRealtimePerformanceScalePermille(
  modifiers: DangerousRealtimeModifiers,
  balanceRevision: DangerousRealtimeBalanceRevision =
    DANGEROUS_REALTIME_BALANCE_REVISION,
): number {
  if (balanceRevision === DANGEROUS_REALTIME_LEGACY_BALANCE_REVISION) {
    const rawPct =
      Math.max(0, finiteInt(modifiers.reelEfficiencyPct, 0)) +
      Math.max(0, finiteInt(modifiers.tensionControlPct, 0)) +
      Math.max(0, finiteInt(modifiers.safeZoneBonusPct, 0)) +
      Math.max(0, finiteInt(modifiers.staminaDamagePct, 0)) +
      Math.max(0, finiteInt(modifiers.distanceRecoveryPct, 0)) +
      Math.max(0, finiteInt(modifiers.baitEffect.maxTimeReductionPct, 0));
    if (rawPct === 0) return 1_000;
    const budgetPct = clamp(finiteInt(modifiers.timeReductionPct, 0), 0, 35);
    return Math.min(1_000, Math.floor((budgetPct * 1_000) / rawPct));
  }
  if (balanceRevision === DANGEROUS_REALTIME_CALIBRATED_BALANCE_REVISION) {
    return modifiers.timeReductionPct > 0
      ? DANGEROUS_REALTIME_PERFORMANCE_SCALE_PERMILLE
      : 1_000;
  }
  return 1_000;
}

function scaledPerformancePct(rawPct: number, scalePermille: number): number {
  return Math.floor(
    (Math.max(0, finiteInt(rawPct, 0)) * scalePermille) / 1_000,
  );
}

function effectiveModifierProjectionAtScale(
  modifiers: DangerousRealtimeModifiers,
  performanceScalePermille: number,
) {
  const baitEffect = modifiers.baitEffect;
  return {
    performanceScalePermille,
    reelEfficiencyPct: scaledPerformancePct(
      modifiers.reelEfficiencyPct,
      performanceScalePermille,
    ),
    tensionControlPct: scaledPerformancePct(
      modifiers.tensionControlPct,
      performanceScalePermille,
    ),
    safeZoneBonusPct: scaledPerformancePct(
      modifiers.safeZoneBonusPct,
      performanceScalePermille,
    ),
    cargoProtectionPct: modifiers.cargoProtectionPct,
    staminaDamagePct: scaledPerformancePct(
      modifiers.staminaDamagePct,
      performanceScalePermille,
    ),
    distanceRecoveryPct: scaledPerformancePct(
      modifiers.distanceRecoveryPct,
      performanceScalePermille,
    ),
    lowTensionGraceTicks: modifiers.lowTensionGraceTicks,
    telegraphCount: modifiers.telegraphCount,
    timeReductionPct: modifiers.timeReductionPct,
    baitEffect: {
      turnDistanceRecoveryReductionPct: scaledPerformancePct(
        baitEffect.turnDistanceRecoveryReductionPct,
        performanceScalePermille,
      ),
      turnTensionImpactReductionPct: scaledPerformancePct(
        baitEffect.turnTensionImpactReductionPct,
        performanceScalePermille,
      ),
      chargeAndThrashStaminaDamagePct: scaledPerformancePct(
        baitEffect.chargeAndThrashStaminaDamagePct,
        performanceScalePermille,
      ),
      telegraphCount: baitEffect.telegraphCount,
      diveSpeedReductionPct: scaledPerformancePct(
        baitEffect.diveSpeedReductionPct,
        performanceScalePermille,
      ),
      startingStaminaReductionPct: scaledPerformancePct(
        baitEffect.startingStaminaReductionPct,
        performanceScalePermille,
      ),
      tensionImpulseReductionPct: scaledPerformancePct(
        baitEffect.tensionImpulseReductionPct,
        performanceScalePermille,
      ),
      maxTimeReductionPct: baitEffect.maxTimeReductionPct,
    },
  };
}

export function dangerousRealtimeEffectiveModifierProjection(
  modifiers: DangerousRealtimeModifiers,
  balanceRevision: DangerousRealtimeBalanceRevision =
    DANGEROUS_REALTIME_BALANCE_REVISION,
) {
  return effectiveModifierProjectionAtScale(
    modifiers,
    dangerousRealtimePerformanceScalePermille(modifiers, balanceRevision),
  );
}

function multiplyPermille(value: number, permille: number): number {
  return Math.max(0, Math.floor((value * permille) / 1_000));
}

function increaseByPct(value: number, pct: number): number {
  return Math.max(1, Math.floor((value * (100 + pct)) / 100));
}

function calibratedWorkPerReelTick(
  amount: number,
  targetTicks: number,
  dutyPermille: number,
): number {
  return Math.max(
    1,
    Math.ceil(
      (Math.max(1, amount) * 1_000) /
        Math.max(1, targetTicks * dutyPermille),
    ),
  );
}

function safeTensionBounds(
  state: Pick<DangerousRealtimeState, "maxTension" | "performanceScalePermille">,
  config: DangerousRealtimeConfig,
): { min: number; max: number } {
  const effective = effectiveModifierProjectionAtScale(
    config.modifiers,
    state.performanceScalePermille,
  );
  const widthPct = clamp(
    riskRule(config).safeZonePct + effective.safeZoneBonusPct,
    1,
    100,
  );
  const width = Math.floor((state.maxTension * widthPct) / 100);
  const min = Math.floor((state.maxTension - width) / 2);
  return { min, max: min + width };
}

function dangerousRealtimeLowTensionGraceTicks(
  config: DangerousRealtimeConfig,
): number {
  return Math.max(
    DANGEROUS_REALTIME_LOW_TENSION_GRACE_TICKS,
    finiteInt(
      config.modifiers.lowTensionGraceTicks,
      DANGEROUS_REALTIME_LOW_TENSION_GRACE_TICKS,
    ),
  );
}

function dangerousRealtimeCatchReady(
  state: DangerousRealtimeState,
  config: DangerousRealtimeConfig,
  balanceRevision: DangerousRealtimeBalanceRevision,
): boolean {
  if (state.stamina !== 0 || state.distance !== 0) return false;
  if (balanceRevision === DANGEROUS_REALTIME_LEGACY_BALANCE_REVISION) {
    return true;
  }
  if (state.tick < dangerousRealtimeMinimumCatchTick(state.targetTicks)) {
    return false;
  }
  if (balanceRevision !== DANGEROUS_REALTIME_BALANCE_REVISION) return true;
  return (
    state.tension <= safeTensionBounds(state, config).max &&
    state.lowTensionTicks < dangerousRealtimeLowTensionGraceTicks(config)
  );
}

export function createDangerousRealtimeState(
  config: DangerousRealtimeConfig,
  balanceRevision: DangerousRealtimeBalanceRevision =
    DANGEROUS_REALTIME_BALANCE_REVISION,
): DangerousRealtimeState {
  const targetTicks = dangerousRealtimeTargetTicks(config);
  const performanceScalePermille = dangerousRealtimePerformanceScalePermille(
    config.modifiers,
    balanceRevision,
  );
  const effective = effectiveModifierProjectionAtScale(
    config.modifiers,
    performanceScalePermille,
  );
  const startingReductionPct = effective.baitEffect.startingStaminaReductionPct;
  const maxStamina = Math.max(
    1,
    finiteInt(config.initialStamina, DANGEROUS_REALTIME_START_STAMINA),
  );
  const stamina = Math.max(
    1,
    Math.floor((maxStamina * (100 - startingReductionPct)) / 100),
  );
  const current = drawInitialBehavior(normalizeSeed(config.seed), config);
  const chain = drawChain(current.rngState, config);

  return {
    tick: 0,
    mode: "release",
    status: "active",
    tension: clamp(
      finiteInt(config.initialTension, DANGEROUS_REALTIME_START_TENSION),
      0,
      Math.max(1, finiteInt(config.maxTension, DANGEROUS_REALTIME_MAX_TENSION)),
    ),
    maxTension: Math.max(
      1,
      finiteInt(config.maxTension, DANGEROUS_REALTIME_MAX_TENSION),
    ),
    stamina,
    maxStamina,
    distance: Math.max(
      1,
      finiteInt(config.initialDistance, DANGEROUS_REALTIME_START_DISTANCE),
    ),
    startDistance: Math.max(
      1,
      finiteInt(config.initialDistance, DANGEROUS_REALTIME_START_DISTANCE),
    ),
    lowTensionTicks: 0,
    behavior: current.behavior,
    nextBehavior: behaviorAfter(current.behaviorCursor, config),
    behaviorCursor: current.behaviorCursor,
    phase: "telegraph",
    phaseTicksRemaining: DANGEROUS_REALTIME_TELEGRAPH_TICKS,
    chainRemaining: chain.chainRemaining,
    rngState: chain.rngState,
    targetTicks,
    maxTicks: Math.max(1, finiteInt(config.maxTicks, targetTicks * 2)),
    performanceScalePermille,
  };
}

function advanceBehaviorPhase(
  state: DangerousRealtimeState,
  config: DangerousRealtimeConfig,
): Pick<
  DangerousRealtimeState,
  | "behavior"
  | "nextBehavior"
  | "behaviorCursor"
  | "phase"
  | "phaseTicksRemaining"
  | "chainRemaining"
  | "rngState"
> {
  if (state.phaseTicksRemaining > 1) {
    return {
      behavior: state.behavior,
      nextBehavior: state.nextBehavior,
      behaviorCursor: state.behaviorCursor,
      phase: state.phase,
      phaseTicksRemaining: state.phaseTicksRemaining - 1,
      chainRemaining: state.chainRemaining,
      rngState: state.rngState,
    };
  }

  if (state.phase === "telegraph") {
    return {
      behavior: state.behavior,
      nextBehavior: state.nextBehavior,
      behaviorCursor: state.behaviorCursor,
      phase: "active",
      phaseTicksRemaining:
        DANGEROUS_REALTIME_BEHAVIOR_BALANCE[state.behavior].activeTicks,
      chainRemaining: state.chainRemaining,
      rngState: state.rngState,
    };
  }

  if (state.phase === "active" && state.chainRemaining > 0) {
    const behaviorCursor = state.behaviorCursor + 1;
    return {
      behavior: state.nextBehavior,
      nextBehavior: behaviorAfter(behaviorCursor, config),
      behaviorCursor,
      phase: "telegraph",
      phaseTicksRemaining: DANGEROUS_REALTIME_TELEGRAPH_TICKS,
      chainRemaining: state.chainRemaining - 1,
      rngState: state.rngState,
    };
  }

  if (state.phase === "active") {
    return {
      behavior: state.behavior,
      nextBehavior: state.nextBehavior,
      behaviorCursor: state.behaviorCursor,
      phase: "idle",
      phaseTicksRemaining: riskRule(config).minBehaviorTicks,
      chainRemaining: 0,
      rngState: state.rngState,
    };
  }

  const behaviorCursor = state.behaviorCursor + 1;
  const chain = drawChain(state.rngState, config);
  return {
    behavior: state.nextBehavior,
    nextBehavior: behaviorAfter(behaviorCursor, config),
    behaviorCursor,
    phase: "telegraph",
    phaseTicksRemaining: DANGEROUS_REALTIME_TELEGRAPH_TICKS,
    chainRemaining: chain.chainRemaining,
    rngState: chain.rngState,
  };
}

function tickProgress(
  state: DangerousRealtimeState,
  config: DangerousRealtimeConfig,
  mode: DangerousRealtimeMode,
): Pick<DangerousRealtimeState, "tension" | "stamina" | "distance"> {
  const balance =
    state.phase === "active"
      ? DANGEROUS_REALTIME_BEHAVIOR_BALANCE[state.behavior]
      : IDLE_BALANCE;
  const effective = effectiveModifierProjectionAtScale(
    config.modifiers,
    state.performanceScalePermille,
  );
  const reelEfficiencyPct = effective.reelEfficiencyPct;
  const staminaDamagePct = effective.staminaDamagePct;
  const distanceRecoveryPct = effective.distanceRecoveryPct;
  const behaviorStaminaPct =
    state.phase === "active" &&
    (state.behavior === "charge" || state.behavior === "thrash")
      ? effective.baitEffect.chargeAndThrashStaminaDamagePct
      : 0;
  const baseStaminaWork = calibratedWorkPerReelTick(
    Math.max(state.maxStamina, state.startDistance),
    state.targetTicks,
    DANGEROUS_REALTIME_REEL_DUTY_BY_RISK[
      clamp(finiteInt(config.risk, 0), 0, 5) as 0 | 1 | 2 | 3 | 4 | 5
    ],
  );
  const distanceNetDuty =
    DANGEROUS_REALTIME_REEL_DUTY_BY_RISK[
      clamp(finiteInt(config.risk, 0), 0, 5) as 0 | 1 | 2 | 3 | 4 | 5
    ] -
    Math.floor(
      ((1_000 -
        DANGEROUS_REALTIME_REEL_DUTY_BY_RISK[
          clamp(finiteInt(config.risk, 0), 0, 5) as 0 | 1 | 2 | 3 | 4 | 5
        ]) *
        DANGEROUS_REALTIME_RELEASE_RECOVERY_PERMILLE) /
        1_000,
    );
  const baseDistanceWork = calibratedWorkPerReelTick(
    Math.max(state.maxStamina, state.startDistance),
    state.targetTicks,
    distanceNetDuty,
  );

  let stamina = state.stamina;
  let distance = state.distance;
  if (mode === "reel") {
    let staminaWork = increaseByPct(
      baseStaminaWork,
      reelEfficiencyPct + staminaDamagePct + behaviorStaminaPct,
    );
    staminaWork = multiplyPermille(staminaWork, balance.staminaWorkPermille);
    let distanceWork = increaseByPct(
      baseDistanceWork,
      reelEfficiencyPct + distanceRecoveryPct,
    );
    distanceWork = multiplyPermille(distanceWork, balance.distanceWorkPermille);
    stamina = Math.max(0, stamina - staminaWork);
    distance = Math.max(0, distance - distanceWork);
  } else {
    let recoveryPermille: number = balance.releaseRecoveryPermille;
    if (state.phase === "active" && state.behavior === "turn") {
      recoveryPermille = Math.floor(
        (recoveryPermille *
          (100 -
            effective.baitEffect.turnDistanceRecoveryReductionPct)) /
          100,
      );
    }
    if (state.phase === "active" && state.behavior === "dive") {
      recoveryPermille = Math.floor(
        (recoveryPermille *
          (100 -
            effective.baitEffect.diveSpeedReductionPct)) /
          100,
      );
    }
    const recovery = multiplyPermille(
      multiplyPermille(
        baseDistanceWork,
        DANGEROUS_REALTIME_RELEASE_RECOVERY_PERMILLE,
      ),
      recoveryPermille,
    );
    distance = Math.min(state.startDistance * 2, distance + recovery);
  }

  let impulse: number = balance.tensionImpulse;
  if (state.phase === "active" && state.behavior === "turn") {
    impulse = Math.trunc(
      (impulse *
        (100 -
          effective.baitEffect.turnTensionImpactReductionPct)) /
        100,
    );
  }
  if (state.phase === "active" && state.behavior === "dive") {
    impulse = Math.trunc(
      (impulse *
        (100 -
          effective.baitEffect.diveSpeedReductionPct)) /
        100,
    );
  }
  impulse = Math.trunc((impulse * riskRule(config).tensionImpulsePermille) / 1_000);
  impulse = Math.trunc(
    (impulse *
      (100 -
        effective.baitEffect.tensionImpulseReductionPct)) /
      100,
  );
  const tensionControlPct = clamp(
    effective.tensionControlPct,
    0,
    90,
  );
  const inputTension =
    mode === "reel"
      ? Math.max(
          1,
          Math.floor(
            (DANGEROUS_REALTIME_REEL_TENSION * (100 - tensionControlPct)) / 100,
          ),
        )
      : Math.min(
          -1,
          Math.floor(
            (DANGEROUS_REALTIME_RELEASE_TENSION * (100 + tensionControlPct)) /
              100,
          ),
        );
  if (impulse > 0) {
    impulse = Math.floor((impulse * (100 - tensionControlPct)) / 100);
  }

  return {
    tension: Math.max(0, state.tension + inputTension + impulse),
    stamina,
    distance,
  };
}

export function advanceDangerousRealtimeTick(
  state: DangerousRealtimeState,
  config: DangerousRealtimeConfig,
  mode: DangerousRealtimeMode,
  balanceRevision: DangerousRealtimeBalanceRevision =
    DANGEROUS_REALTIME_BALANCE_REVISION,
): DangerousRealtimeState {
  if (state.status !== "active") return state;
  if (state.tension > state.maxTension) {
    return { ...state, mode, status: "line_broken" };
  }
  if (state.tick >= state.maxTicks) {
    return { ...state, mode, status: "timeout" };
  }
  if (state.stamina === 0 && state.distance === 0) {
    const nextTick = state.tick + 1;
    if (balanceRevision === DANGEROUS_REALTIME_BALANCE_REVISION) {
      if (
        dangerousRealtimeCatchReady(
          { ...state, tick: nextTick },
          config,
          balanceRevision,
        )
      ) {
        return { ...state, tick: nextTick, mode, status: "caught" };
      }
    } else {
      return {
        ...state,
        tick: nextTick,
        mode,
        status:
          balanceRevision === DANGEROUS_REALTIME_LEGACY_BALANCE_REVISION ||
          nextTick >= dangerousRealtimeMinimumCatchTick(state.targetTicks)
            ? "caught"
            : "active",
      };
    }
  }

  const rawProgress = tickProgress(state, config, mode);
  const progress =
    balanceRevision === DANGEROUS_REALTIME_BALANCE_REVISION &&
    state.stamina === 0 &&
    state.distance === 0
      ? { ...rawProgress, stamina: 0, distance: 0 }
      : rawProgress;
  const bounds = safeTensionBounds(state, config);
  const lowTensionTicks =
    progress.tension < bounds.min ? state.lowTensionTicks + 1 : 0;
  const nextTick = state.tick + 1;
  const nextState = {
    ...state,
    ...progress,
    tick: nextTick,
    lowTensionTicks,
  };
  let status: DangerousRealtimeStatus = "active";
  if (progress.tension > state.maxTension) {
    status = "line_broken";
  } else if (
    lowTensionTicks >= dangerousRealtimeLowTensionGraceTicks(config)
  ) {
    status = "hook_lost";
  } else if (dangerousRealtimeCatchReady(nextState, config, balanceRevision)) {
    status = "caught";
  } else if (nextTick >= state.maxTicks) {
    status = "timeout";
  }

  return {
    ...state,
    ...progress,
    ...advanceBehaviorPhase(state, config),
    tick: nextTick,
    mode,
    status,
    lowTensionTicks,
  };
}

export function dangerousRealtimeView(
  state: DangerousRealtimeState,
  config: DangerousRealtimeConfig,
): DangerousRealtimeView {
  const {
    rngState: _rngState,
    nextBehavior: _nextBehavior,
    ...publicState
  } = state;
  const bounds = safeTensionBounds(state, config);
  const pattern = behaviorPattern(config);
  const queuedPreviewCount =
    Math.max(0, finiteInt(config.modifiers.telegraphCount, 0)) +
    Math.max(0, finiteInt(config.modifiers.baitEffect.telegraphCount, 0));
  const includesCurrent = state.phase === "telegraph";
  const telegraphs = Array.from(
    {
      length: queuedPreviewCount + (includesCurrent ? 1 : 0),
    },
    (_, index) => {
      const offset = includesCurrent ? index : index + 1;
      return pattern[(state.behaviorCursor + offset) % pattern.length];
    },
  );
  return {
    ...publicState,
    safeTensionMin: bounds.min,
    safeTensionMax: bounds.max,
    remainingTicks: Math.max(0, state.maxTicks - state.tick),
    telegraphs,
  };
}

export function validateDangerousRealtimeInputs(
  config: DangerousRealtimeConfig,
  inputs: readonly DangerousRealtimeInput[],
  targetTick: number,
  initialTick = 0,
): void {
  if (!Number.isInteger(targetTick) || targetTick < 0) {
    throw new RangeError("target tick cannot be negative");
  }
  if (targetTick > config.maxTicks) {
    throw new RangeError("target tick exceeds maxTicks");
  }
  let previousTick = initialTick - 1;
  for (const input of inputs) {
    if (!Number.isInteger(input.tick) || input.tick < 0) {
      throw new RangeError("input tick cannot be negative");
    }
    if (input.tick <= previousTick) {
      throw new RangeError("input ticks must be strictly increasing");
    }
    if (input.tick > config.maxTicks) {
      throw new RangeError("input tick exceeds maxTicks");
    }
    if (input.tick > targetTick) {
      throw new RangeError("input tick exceeds target tick");
    }
    if (input.mode !== "reel" && input.mode !== "release") {
      throw new TypeError("input mode must be reel or release");
    }
    previousTick = input.tick;
  }
}

export function replayDangerousRealtimeInputs(
  config: DangerousRealtimeConfig,
  inputs: readonly DangerousRealtimeInput[],
  targetTick: number,
  initial?: DangerousRealtimeState,
  balanceRevision: DangerousRealtimeBalanceRevision =
    DANGEROUS_REALTIME_BALANCE_REVISION,
): DangerousRealtimeState {
  let state = initial ?? createDangerousRealtimeState(config, balanceRevision);
  validateDangerousRealtimeInputs(config, inputs, targetTick, state.tick);
  if (targetTick < state.tick) {
    throw new RangeError("target tick cannot precede initial state");
  }

  let inputIndex = 0;
  let mode = state.mode;
  while (state.tick < targetTick && state.status === "active") {
    if (inputs[inputIndex]?.tick === state.tick) {
      mode = inputs[inputIndex].mode;
      inputIndex += 1;
    }
    state = advanceDangerousRealtimeTick(
      state,
      config,
      mode,
      balanceRevision,
    );
  }
  if (
    state.status === "active" &&
    inputs[inputIndex]?.tick === state.tick
  ) {
    state = { ...state, mode: inputs[inputIndex].mode };
    inputIndex += 1;
  }
  if (state.status !== "active" && inputIndex < inputs.length) {
    throw new RangeError(
      `input transition follows terminal state ${state.status}`,
    );
  }
  return state;
}
