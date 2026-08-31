import type {
  DangerousFishBehavior,
  DangerousBaitId,
  DangerousLineId,
  DangerousLine,
  DangerousReelId,
  DangerousReel,
  DangerousRodId,
  DangerousRod,
} from "@/adventure/data/v2/dangerousFishing";
import type {
  DangerousRealtimeBalanceRevision,
  DangerousRealtimeConfig,
  DangerousRealtimeState,
} from "./dangerousFishingRealtime";

export type DangerousFishingAction = "reel" | "give" | "brace";
export type DangerousEncounterStatus = "active" | "caught" | "failed";
export type DangerousEncounterEvent =
  | "progress"
  | "line_broken"
  | "hook_lost"
  | "caught"
  | "timeout"
  | "too_fast"
  | "stale";

export type DangerousEncounter = {
  id: string;
  targetKind: "fish" | "boss";
  targetId: string;
  status: DangerousEncounterStatus;
  tension: number;
  maxTension: number;
  stamina: number;
  maxStamina: number;
  distance: number;
  startDistance: number;
  slackTurns: number;
  slackTolerance: number;
  step: number;
  revision: number;
  nextActionAt: number;
  expiresAt: number;
  patternSeed: number;
  behaviorPattern: readonly DangerousFishBehavior[];
  reelPowerBonus: number;
  staminaDamageBonus: number;
  tensionControlBonus: number;
  telegraphSteps?: number;
};

export type DangerousRealtimeEncounter = {
  simulationVersion: 2;
  balanceRevision: DangerousRealtimeBalanceRevision;
  id: string;
  targetKind: "fish" | "boss";
  targetId: string;
  modifierSource: DangerousRealtimeModifierSource;
  config: DangerousRealtimeConfig;
  checkpoint: DangerousRealtimeState;
  approvedTick: number;
  revision: number;
  startedAt: number;
  expiresAt: number;
};

export type DangerousRealtimeModifierSource = {
  fishingLevel: number;
  baitId: DangerousBaitId;
  rodId: DangerousRodId;
  reelId: DangerousReelId;
  lineId: DangerousLineId;
  maxTensionBonus: number;
  reelPowerBonus: number;
  staminaDamageBonus: number;
  tensionControlBonus: number;
  slackTolerance: number;
  telegraphSteps: number;
  rodEnhancementLevel: number;
  reelEnhancementLevel: number;
  lineEnhancementLevel: number;
  cargoProtectionPct: number;
  targetStamina: number;
  targetDistance: number;
  targetBaseTension: number;
};

export type DangerousStoredEncounter =
  | DangerousV1StoredEncounter
  | DangerousRealtimeEncounter;

export type DangerousV1StoredEncounter = DangerousEncounter & {
  simulationVersion: 1;
};

export type DangerousRealtimeCompletion = {
  requestId: string;
  encounterId: string;
  result: unknown;
};

export type DangerousRealtimeEncounterRecoveryView = {
  simulationVersion: 2;
  balanceRevision: DangerousRealtimeBalanceRevision;
  id: string;
  targetKind: "fish" | "boss";
  targetId: string;
  revision: number;
};

export function isDangerousRealtimeEncounter(
  value: DangerousStoredEncounter | null | undefined,
): value is DangerousRealtimeEncounter {
  return value?.simulationVersion === 2;
}

export type DangerousEncounterView = Omit<
  DangerousEncounter,
  "patternSeed" | "behaviorPattern"
> & {
  behavior: DangerousFishBehavior;
  telegraph?: DangerousFishBehavior[];
};

export type DangerousEncounterTransition = {
  event: DangerousEncounterEvent;
  encounter: DangerousEncounter;
};

export type DangerousEncounterTarget = {
  id: string;
  stamina: number;
  distance: number;
  baseTension: number;
  behaviorPattern: readonly DangerousFishBehavior[];
};

export const DANGEROUS_ACTION_COOLDOWN_MS = 850;
export const DANGEROUS_ENCOUNTER_DURATION_MS = 3 * 60 * 1_000;
const SLACK_TENSION = 5;

function finiteInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.floor(value);
}

function behaviorIndex(seed: number, step: number, length: number): number {
  let value = (finiteInt(seed, 0) + Math.imul(step + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return (value >>> 0) % length;
}

function behaviorAt(encounter: DangerousEncounter): DangerousFishBehavior {
  const pattern = encounter.behaviorPattern;
  if (pattern.length === 0) return "turn";
  return pattern[behaviorIndex(encounter.patternSeed, encounter.step, pattern.length)];
}

function behaviorAtOffset(
  encounter: DangerousEncounter,
  offset: number,
): DangerousFishBehavior {
  const pattern = encounter.behaviorPattern;
  if (pattern.length === 0) return "turn";
  return pattern[
    behaviorIndex(
      encounter.patternSeed,
      encounter.step + Math.max(0, offset),
      pattern.length,
    )
  ];
}

export function createDangerousEncounter(args: {
  id: string;
  targetKind: "fish" | "boss";
  target: DangerousEncounterTarget;
  rod: DangerousRod;
  reel: DangerousReel;
  line: DangerousLine;
  startedAt: number;
  patternSeed: number;
  durationMs?: number;
  assistance?: {
    maxTensionBonus?: number;
    reelPowerBonus?: number;
    staminaDamageBonus?: number;
    tensionControlBonus?: number;
    slackTolerance?: number;
    telegraphSteps?: number;
  };
}): DangerousEncounter {
  const assistance = args.assistance ?? {};
  const stamina = Math.max(1, finiteInt(args.target.stamina, 1));
  const distance = Math.max(1, finiteInt(args.target.distance, 1));
  return {
    id: args.id,
    targetKind: args.targetKind,
    targetId: args.target.id,
    status: "active",
    tension: Math.max(0, finiteInt(args.target.baseTension, 40)),
    maxTension: Math.max(
      20,
      100 +
        args.rod.maxTensionBonus +
        args.line.maxTensionBonus +
        finiteInt(assistance.maxTensionBonus ?? 0, 0),
    ),
    stamina,
    maxStamina: stamina,
    distance,
    startDistance: distance,
    slackTurns: 0,
    slackTolerance: Math.max(
      0,
      args.line.slackTolerance + finiteInt(assistance.slackTolerance ?? 0, 0),
    ),
    step: 0,
    revision: 0,
    nextActionAt: finiteInt(args.startedAt, 0),
    expiresAt:
      finiteInt(args.startedAt, 0) +
      Math.max(10_000, finiteInt(args.durationMs ?? DANGEROUS_ENCOUNTER_DURATION_MS, DANGEROUS_ENCOUNTER_DURATION_MS)),
    patternSeed: finiteInt(args.patternSeed, 0),
    behaviorPattern: [...args.target.behaviorPattern],
    reelPowerBonus:
      args.reel.reelPowerBonus + finiteInt(assistance.reelPowerBonus ?? 0, 0),
    staminaDamageBonus:
      args.rod.staminaDamageBonus +
      finiteInt(assistance.staminaDamageBonus ?? 0, 0),
    tensionControlBonus:
      args.reel.tensionControlBonus +
      finiteInt(assistance.tensionControlBonus ?? 0, 0),
    telegraphSteps: Math.max(
      0,
      Math.min(2, finiteInt(assistance.telegraphSteps ?? 0, 0)),
    ),
  };
}

export function dangerousEncounterView(
  encounter: DangerousEncounter,
): DangerousEncounterView {
  const {
    patternSeed: _patternSeed,
    behaviorPattern: _behaviorPattern,
    ...publicEncounter
  } = encounter;
  return {
    ...publicEncounter,
    behavior: behaviorAt(encounter),
    telegraph: Array.from(
      { length: Math.max(0, Math.min(2, encounter.telegraphSteps ?? 0)) },
      (_, index) => behaviorAtOffset(encounter, index + 1),
    ),
  };
}

function progressFor(
  encounter: DangerousEncounter,
  action: DangerousFishingAction,
): Pick<DangerousEncounter, "tension" | "stamina" | "distance"> {
  const behavior = behaviorAt(encounter);
  const control = Math.max(0, encounter.tensionControlBonus);
  const damageBonus = Math.max(0, encounter.staminaDamageBonus);
  const reelBonus = Math.max(0, encounter.reelPowerBonus);

  if (action === "reel") {
    const isCounter = behavior === "turn";
    const tensionGain =
      behavior === "charge"
        ? 22
        : behavior === "thrash"
          ? 17
          : behavior === "dive"
            ? 14
            : 8;
    return {
      tension: encounter.tension + Math.max(2, tensionGain - control),
      stamina: Math.max(
        0,
        encounter.stamina -
          (isCounter ? 12 + damageBonus : 3 + Math.floor(damageBonus / 2)),
      ),
      distance: Math.max(0, encounter.distance - (9 + reelBonus)),
    };
  }

  if (action === "give") {
    const isCounter = behavior === "charge";
    return {
      tension: Math.max(0, encounter.tension - (22 + control)),
      stamina: Math.max(0, encounter.stamina - (isCounter ? 6 : 1)),
      distance: Math.min(
        encounter.startDistance * 2,
        encounter.distance + (isCounter ? 8 : 10),
      ),
    };
  }

  const isCounter = behavior === "thrash" || behavior === "dive";
  return {
    tension: Math.max(0, encounter.tension - (8 + control)),
    stamina: Math.max(
      0,
      encounter.stamina -
        (behavior === "thrash"
          ? 12 + damageBonus
          : behavior === "dive"
            ? 8 + damageBonus
            : 2),
    ),
    distance: Math.min(
      encounter.startDistance * 2,
      encounter.distance + (isCounter ? 3 : 5),
    ),
  };
}

export function applyDangerousEncounterAction(
  encounter: DangerousEncounter,
  action: DangerousFishingAction,
  now: number,
  expectedRevision: number,
): DangerousEncounterTransition {
  if (expectedRevision !== encounter.revision || encounter.status !== "active") {
    return { event: "stale", encounter };
  }
  if (now >= encounter.expiresAt) {
    return {
      event: "timeout",
      encounter: { ...encounter, status: "failed", revision: encounter.revision + 1 },
    };
  }
  if (now < encounter.nextActionAt) {
    return { event: "too_fast", encounter };
  }

  const progress = progressFor(encounter, action);
  const slackTurns =
    progress.tension <= SLACK_TENSION ? encounter.slackTurns + 1 : 0;
  let status: DangerousEncounterStatus = "active";
  let event: DangerousEncounterEvent = "progress";

  if (progress.tension > encounter.maxTension) {
    status = "failed";
    event = "line_broken";
  } else if (slackTurns >= 2 + encounter.slackTolerance) {
    status = "failed";
    event = "hook_lost";
  } else if (progress.stamina === 0 && progress.distance === 0) {
    status = "caught";
    event = "caught";
  }

  return {
    event,
    encounter: {
      ...encounter,
      ...progress,
      status,
      slackTurns,
      step: encounter.step + 1,
      revision: encounter.revision + 1,
      nextActionAt: now + DANGEROUS_ACTION_COOLDOWN_MS,
    },
  };
}
