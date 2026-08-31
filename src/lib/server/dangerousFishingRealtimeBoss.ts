import { randomUUID } from "node:crypto";
import {
  DANGEROUS_BOSSES,
  isDangerousBaitId,
} from "@/adventure/data/v2/dangerousFishing";
import {
  isDangerousRealtimeEncounter,
  type DangerousRealtimeCompletion,
  type DangerousRealtimeEncounter,
} from "@/adventure/v2/dangerousFishingEncounter";
import {
  DANGEROUS_REALTIME_BALANCE_REVISION,
  createDangerousRealtimeState,
  dangerousRealtimeMaxTicks,
  dangerousRealtimeTargetCalibration,
  dangerousRealtimeView,
  replayDangerousRealtimeInputs,
  validateDangerousRealtimeInputs,
  DANGEROUS_REALTIME_TICK_MS,
  DANGEROUS_REALTIME_START_DELAY_MS,
  type DangerousRealtimeConfig,
  type DangerousRealtimeInput,
} from "@/adventure/v2/dangerousFishingRealtime";
import { dangerousRealtimeModifiers } from "@/adventure/v2/dangerousFishingRealtimeModifiers";
import {
  dangerousFishingEncounterModifiers,
  dangerousFishingRealtimeProjection,
} from "@/adventure/v2/dangerousFishingHeritage";
import {
  DANGEROUS_REALTIME_FINISH_GRACE_MS,
  recoverExpiredRealtimeBossAttempt,
  type DangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import { consumeDangerousBait } from "@/adventure/v2/dangerousFishingShop";
import type {
  DangerousFishingBossContributionRecord,
  DangerousFishingBossEventRecord,
  DangerousFishingBossStore,
} from "@/lib/server/dangerousFishingBoss";

const COMPLETION_LIMIT = 32;

type RealtimeBossError = {
  ok: false;
  error: string;
  [key: string]: unknown;
};

export type RealtimeBossResult =
  | RealtimeBossError
  | ({ ok: true } & Record<string, unknown>);

export type RealtimeBossStartRequest = {
  userId: string;
  eventId: string;
  baitId: unknown;
  now: Date;
  random?: () => number;
  encounterId?: string;
};

export type RealtimeBossCheckpointRequest = {
  userId: string;
  eventId: unknown;
  encounterId: unknown;
  revision: unknown;
  inputs: unknown;
  clientTick: unknown;
  now: Date;
};

export type RealtimeBossFinishRequest = RealtimeBossCheckpointRequest & {
  requestId: unknown;
};

function fail(
  error: string,
  detail: Record<string, unknown> = {},
): RealtimeBossError {
  return { ok: false, error, ...detail };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseInputs(raw: unknown): DangerousRealtimeInput[] | null {
  if (!Array.isArray(raw)) return null;
  const inputs: DangerousRealtimeInput[] = [];
  for (const rawInput of raw) {
    const input = objectRecord(rawInput);
    if (
      !input ||
      !Number.isSafeInteger(input.tick) ||
      (input.mode !== "reel" && input.mode !== "release")
    ) {
      return null;
    }
    inputs.push({ tick: input.tick as number, mode: input.mode });
  }
  return inputs;
}

function validEncounterRequest(request: RealtimeBossCheckpointRequest): boolean {
  return (
    typeof request.eventId === "string" &&
    request.eventId.length > 0 &&
    typeof request.encounterId === "string" &&
    request.encounterId.length > 0 &&
    Number.isSafeInteger(request.revision) &&
    (request.revision as number) >= 0 &&
    Number.isSafeInteger(request.clientTick) &&
    (request.clientTick as number) >= 0
  );
}

function elapsedTick(encounter: DangerousRealtimeEncounter, now: Date): number {
  return Math.min(
    encounter.config.maxTicks,
    Math.max(
      0,
      Math.floor(
        (now.getTime() - encounter.startedAt) / DANGEROUS_REALTIME_TICK_MS,
      ),
    ),
  );
}

function findCompletionByEncounter(
  state: DangerousFishingState,
  encounterId: string,
): DangerousRealtimeCompletion | undefined {
  return state.realtimeCompletions.findLast(
    (completion) => completion.encounterId === encounterId,
  );
}

function completionResult(
  completion: DangerousRealtimeCompletion,
): RealtimeBossResult | null {
  const result = objectRecord(completion.result);
  if (!result || typeof result.ok !== "boolean") return null;
  if (result.ok === false && typeof result.error !== "string") return null;
  return result as RealtimeBossResult;
}

function withCompletion(
  state: DangerousFishingState,
  completion: DangerousRealtimeCompletion,
): DangerousFishingState {
  return {
    ...state,
    realtimeCompletions: [
      ...state.realtimeCompletions.filter(
        (entry) => entry.requestId !== completion.requestId,
      ),
      completion,
    ].slice(-COMPLETION_LIMIT),
  };
}

function clearedWithCompletion(
  state: DangerousFishingState,
  encounter: DangerousRealtimeEncounter,
  requestId: string,
  result: RealtimeBossResult,
): DangerousFishingState {
  return withCompletion(
    { ...state, bossAttempt: null },
    { requestId, encounterId: encounter.id, result },
  );
}

function attemptFor(
  state: DangerousFishingState,
  eventId: unknown,
  encounterId: unknown,
): DangerousRealtimeEncounter | null {
  const attempt = state.bossAttempt;
  if (
    !attempt ||
    attempt.eventId !== eventId ||
    attempt.encounter.id !== encounterId ||
    !isDangerousRealtimeEncounter(attempt.encounter)
  ) {
    return null;
  }
  return attempt.encounter;
}

function eventMatchesAttempt(
  event: DangerousFishingBossEventRecord,
  encounter: DangerousRealtimeEncounter,
): boolean {
  return (
    encounter.targetKind === "boss" &&
    encounter.targetId === event.bossId &&
    encounter.config.targetKind === "boss" &&
    encounter.config.risk === DANGEROUS_BOSSES[event.bossId].minRisk
  );
}

export function dangerousFishingBossEventError(
  event: DangerousFishingBossEventRecord | null,
  now: Date,
) {
  if (!event) return "not_found" as const;
  if (event.status === "defeated" || event.stamina <= 0) {
    return "already_defeated" as const;
  }
  if (event.status === "expired" || event.expiresAt <= now) {
    return "expired" as const;
  }
  return null;
}

export function dangerousRealtimeBossEncounterView(
  encounter: DangerousRealtimeEncounter,
) {
  const { config, checkpoint } = encounter;
  return {
    simulationVersion: 2 as const,
    balanceRevision: encounter.balanceRevision,
    id: encounter.id,
    targetKind: encounter.targetKind,
    targetId: encounter.targetId,
    config: {
      seed: config.seed,
      risk: config.risk,
      targetKind: config.targetKind,
      rarity: config.rarity,
      behaviorPattern: [...config.behaviorPattern],
      initialTension: config.initialTension,
      maxTension: config.maxTension,
      initialStamina: config.initialStamina,
      initialDistance: config.initialDistance,
      maxTicks: config.maxTicks,
      modifiers: {
        reelEfficiencyPct: config.modifiers.reelEfficiencyPct,
        tensionControlPct: config.modifiers.tensionControlPct,
        safeZoneBonusPct: config.modifiers.safeZoneBonusPct,
        cargoProtectionPct: config.modifiers.cargoProtectionPct,
        staminaDamagePct: config.modifiers.staminaDamagePct,
        distanceRecoveryPct: config.modifiers.distanceRecoveryPct,
        lowTensionGraceTicks: config.modifiers.lowTensionGraceTicks,
        telegraphCount: config.modifiers.telegraphCount,
        timeReductionPct: config.modifiers.timeReductionPct,
        baitEffect: { ...config.modifiers.baitEffect },
      },
    },
    checkpoint: {
      tick: checkpoint.tick,
      mode: checkpoint.mode,
      status: checkpoint.status,
      tension: checkpoint.tension,
      maxTension: checkpoint.maxTension,
      stamina: checkpoint.stamina,
      maxStamina: checkpoint.maxStamina,
      distance: checkpoint.distance,
      startDistance: checkpoint.startDistance,
      lowTensionTicks: checkpoint.lowTensionTicks,
      behavior: checkpoint.behavior,
      nextBehavior: checkpoint.nextBehavior,
      behaviorCursor: checkpoint.behaviorCursor,
      phase: checkpoint.phase,
      phaseTicksRemaining: checkpoint.phaseTicksRemaining,
      chainRemaining: checkpoint.chainRemaining,
      rngState: checkpoint.rngState,
      targetTicks: checkpoint.targetTicks,
      maxTicks: checkpoint.maxTicks,
      performanceScalePermille: checkpoint.performanceScalePermille,
    },
    view: dangerousRealtimeView(checkpoint, config),
    approvedTick: encounter.approvedTick,
    revision: encounter.revision,
    startedAt: encounter.startedAt,
    expiresAt: encounter.expiresAt,
  };
}

export async function startRealtimeBossAttemptInTx(
  store: DangerousFishingBossStore,
  args: RealtimeBossStartRequest,
): Promise<RealtimeBossResult> {
  if (!isDangerousBaitId(args.baitId)) return fail("invalid_bait");
  const activeAutoActivity = await store.activeAutoActivityForUpdate(
    args.userId,
  );
  if (activeAutoActivity) {
    return fail("auto_active", { activeAutoActivity });
  }
  let state = await store.dangerousStateForUpdate(args.userId);
  const expired = recoverExpiredRealtimeBossAttempt(state, {
    now: args.now.getTime(),
    result: fail("expired"),
  });
  if (expired.encounter) {
    state = expired.state;
    await store.saveDangerousState(args.userId, state);
  }
  if (state.voyage) return fail("voyage_active");
  if (state.bossAttempt) {
    if (state.bossAttempt.eventId === args.eventId) {
      return fail("encounter_active");
    }
    const previousEvent = await store.eventForUpdate(state.bossAttempt.eventId);
    if (!dangerousFishingBossEventError(previousEvent, args.now)) {
      return fail("encounter_active");
    }
  }

  const heritage = await store.heritageForUpdate(args.userId);
  if (!heritage.unlocked) {
    return fail("fishing_level_locked", { requiredLevel: 15 });
  }
  const event = await store.eventForUpdate(args.eventId);
  const eventError = dangerousFishingBossEventError(event, args.now);
  if (eventError) return fail(eventError);
  const validEvent = event as DangerousFishingBossEventRecord;
  const boss = DANGEROUS_BOSSES[validEvent.bossId];
  const consumed = consumeDangerousBait(state, args.baitId);
  if (!consumed.ok) return fail(consumed.error);
  const inherited = dangerousFishingEncounterModifiers(heritage, state.loadout);
  const projection = dangerousFishingRealtimeProjection(inherited);
  const modifierSource = {
    fishingLevel: heritage.fishingLevel,
    baitId: args.baitId,
    rodId: state.loadout.rodId,
    reelId: state.loadout.reelId,
    lineId: state.loadout.lineId,
    ...projection,
    rodEnhancementLevel:
      state.gearEnhancements.rods[state.loadout.rodId] ?? 0,
    reelEnhancementLevel:
      state.gearEnhancements.reels[state.loadout.reelId] ?? 0,
    lineEnhancementLevel:
      state.gearEnhancements.lines[state.loadout.lineId] ?? 0,
    targetStamina: boss.attemptStamina,
    targetDistance: boss.attemptDistance,
    targetBaseTension: boss.baseTension,
  };
  const realtimeModifiers = dangerousRealtimeModifiers({
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
  const targetCalibration = dangerousRealtimeTargetCalibration({
    stamina: modifierSource.targetStamina,
    distance: modifierSource.targetDistance,
    baseTension: modifierSource.targetBaseTension,
    maxTensionBonus: modifierSource.maxTensionBonus,
  });
  const configBase: DangerousRealtimeConfig = {
    seed: Math.floor((args.random ?? Math.random)() * 2 ** 31),
    risk: boss.minRisk,
    targetKind: "boss",
    rarity: "boss",
    behaviorPattern: [...boss.behaviorPattern],
    ...targetCalibration,
    maxTicks: 0,
    modifiers: realtimeModifiers,
  };
  const config = {
    ...configBase,
    maxTicks: dangerousRealtimeMaxTicks(configBase),
  };
  const startedAt = args.now.getTime() + DANGEROUS_REALTIME_START_DELAY_MS;
  const encounter: DangerousRealtimeEncounter = {
    simulationVersion: 2,
    balanceRevision: DANGEROUS_REALTIME_BALANCE_REVISION,
    id: args.encounterId ?? randomUUID(),
    targetKind: "boss",
    targetId: boss.id,
    modifierSource,
    config,
    checkpoint: createDangerousRealtimeState(config),
    approvedTick: 0,
    revision: 0,
    startedAt,
    expiresAt: startedAt + config.maxTicks * DANGEROUS_REALTIME_TICK_MS,
  };
  await store.saveDangerousState(args.userId, {
    ...consumed.state,
    bossAttempt: { eventId: validEvent.id, encounter },
  });
  return {
    ok: true,
    event: validEvent,
    encounter: dangerousRealtimeBossEncounterView(encounter),
  };
}

export async function checkpointRealtimeBossAttemptInTx(
  store: DangerousFishingBossStore,
  request: RealtimeBossCheckpointRequest,
): Promise<RealtimeBossResult> {
  if (typeof request.encounterId !== "string" || request.encounterId.length === 0) {
    return fail("bad_request");
  }
  const state = await store.dangerousStateForUpdate(request.userId);
  const completed = findCompletionByEncounter(state, request.encounterId);
  if (completed) {
    return completionResult(completed) ?? fail("invalid_completion");
  }
  if (!validEncounterRequest(request)) return fail("bad_request");
  const inputs = parseInputs(request.inputs);
  if (!inputs) return fail("invalid_inputs");
  const encounter = attemptFor(state, request.eventId, request.encounterId);
  if (!encounter) {
    const attempt = state.bossAttempt;
    return fail(
      attempt && !isDangerousRealtimeEncounter(attempt.encounter)
        ? "legacy_attempt"
        : "no_attempt",
    );
  }
  const expired = recoverExpiredRealtimeBossAttempt(state, {
    now: request.now.getTime(),
    result: fail("expired"),
  });
  if (expired.encounter) {
    await store.saveDangerousState(request.userId, expired.state);
    return fail("expired");
  }
  if (request.revision !== encounter.revision) {
    return fail("stale", {
      encounter: dangerousRealtimeBossEncounterView(encounter),
    });
  }
  try {
    validateDangerousRealtimeInputs(
      encounter.config,
      inputs,
      request.clientTick as number,
      encounter.checkpoint.tick,
    );
  } catch {
    return fail("invalid_inputs", {
      encounter: dangerousRealtimeBossEncounterView(encounter),
    });
  }
  if (request.now.getTime() > encounter.expiresAt) return fail("expired");
  if ((request.clientTick as number) > elapsedTick(encounter, request.now)) {
    return fail("future_tick", {
      encounter: dangerousRealtimeBossEncounterView(encounter),
    });
  }
  let checkpoint;
  try {
    checkpoint = replayDangerousRealtimeInputs(
      encounter.config,
      inputs,
      request.clientTick as number,
      encounter.checkpoint,
      encounter.balanceRevision,
    );
  } catch {
    return fail("invalid_inputs", {
      encounter: dangerousRealtimeBossEncounterView(encounter),
    });
  }
  const event = await store.eventForUpdate(request.eventId as string);
  const eventError = dangerousFishingBossEventError(event, request.now);
  if (eventError) {
    await store.saveDangerousState(request.userId, { ...state, bossAttempt: null });
    return fail(eventError);
  }
  if (!eventMatchesAttempt(event as DangerousFishingBossEventRecord, encounter)) {
    return fail("invalid_attempt");
  }
  const nextEncounter: DangerousRealtimeEncounter = {
    ...encounter,
    checkpoint,
    approvedTick: checkpoint.tick,
    revision: encounter.revision + 1,
  };
  await store.saveDangerousState(request.userId, {
    ...state,
    bossAttempt: {
      eventId: request.eventId as string,
      encounter: nextEncounter,
    },
  });
  return {
    ok: true,
    encounter: dangerousRealtimeBossEncounterView(nextEncounter),
  };
}

export async function finishRealtimeBossAttemptInTx(
  store: DangerousFishingBossStore,
  request: RealtimeBossFinishRequest,
): Promise<RealtimeBossResult> {
  if (
    typeof request.requestId !== "string" ||
    request.requestId.length === 0 ||
    request.requestId.length > 128 ||
    typeof request.encounterId !== "string" ||
    request.encounterId.length === 0
  ) {
    return fail("bad_request");
  }
  const state = await store.dangerousStateForUpdate(request.userId);
  const duplicate = state.realtimeCompletions.find(
    (completion) => completion.requestId === request.requestId,
  );
  if (duplicate) {
    if (duplicate.encounterId !== request.encounterId) {
      return fail("request_id_collision");
    }
    return completionResult(duplicate) ?? fail("invalid_completion");
  }
  if (!validEncounterRequest(request)) return fail("bad_request");
  const inputs = parseInputs(request.inputs);
  if (!inputs) return fail("invalid_inputs");
  const encounter = attemptFor(state, request.eventId, request.encounterId);
  if (!encounter) {
    const attempt = state.bossAttempt;
    return fail(
      attempt && !isDangerousRealtimeEncounter(attempt.encounter)
        ? "legacy_attempt"
        : "no_attempt",
    );
  }
  const expired = recoverExpiredRealtimeBossAttempt(state, {
    now: request.now.getTime(),
    result: fail("expired"),
    requestId: request.requestId as string,
  });
  if (expired.encounter) {
    await store.saveDangerousState(request.userId, expired.state);
    return fail("expired");
  }
  if (request.revision !== encounter.revision) {
    return fail("stale", {
      encounter: dangerousRealtimeBossEncounterView(encounter),
    });
  }
  try {
    validateDangerousRealtimeInputs(
      encounter.config,
      inputs,
      request.clientTick as number,
      encounter.checkpoint.tick,
    );
  } catch {
    return fail("invalid_inputs", {
      encounter: dangerousRealtimeBossEncounterView(encounter),
    });
  }
  if (
    request.now.getTime() >
    encounter.expiresAt + DANGEROUS_REALTIME_FINISH_GRACE_MS
  ) {
    return fail("expired");
  }
  if ((request.clientTick as number) > elapsedTick(encounter, request.now)) {
    return fail("future_tick", {
      encounter: dangerousRealtimeBossEncounterView(encounter),
    });
  }
  let checkpoint;
  try {
    checkpoint = replayDangerousRealtimeInputs(
      encounter.config,
      inputs,
      request.clientTick as number,
      encounter.checkpoint,
      encounter.balanceRevision,
    );
  } catch {
    return fail("invalid_inputs", {
      encounter: dangerousRealtimeBossEncounterView(encounter),
    });
  }
  if (checkpoint.status === "active") {
    return fail("not_finished", {
      encounter: dangerousRealtimeBossEncounterView({
        ...encounter,
        checkpoint,
        approvedTick: checkpoint.tick,
      }),
    });
  }

  const finishedEncounter: DangerousRealtimeEncounter = {
    ...encounter,
    checkpoint,
    approvedTick: checkpoint.tick,
  };
  const event = await store.eventForUpdate(request.eventId as string);
  const eventError = dangerousFishingBossEventError(event, request.now);
  if (eventError) {
    const result = fail(eventError);
    await store.saveDangerousState(
      request.userId,
      clearedWithCompletion(
        state,
        finishedEncounter,
        request.requestId,
        result,
      ),
    );
    return result;
  }
  const validEvent = event as DangerousFishingBossEventRecord;
  if (!eventMatchesAttempt(validEvent, finishedEncounter)) {
    return fail("invalid_attempt");
  }

  if (checkpoint.status !== "caught") {
    const result: RealtimeBossResult = {
      ok: true,
      event: checkpoint.status,
      contribution: 0,
      defeated: false,
    };
    await store.saveDangerousState(
      request.userId,
      clearedWithCompletion(
        state,
        finishedEncounter,
        request.requestId,
        result,
      ),
    );
    return result;
  }

  const boss = DANGEROUS_BOSSES[validEvent.bossId];
  const contribution = Math.min(validEvent.stamina, boss.attemptStamina);
  const defeated = validEvent.stamina - contribution <= 0;
  const nextEvent: DangerousFishingBossEventRecord = {
    ...validEvent,
    stamina: Math.max(0, validEvent.stamina - contribution),
    status: defeated ? "defeated" : "active",
    defeatedAt: defeated ? request.now : null,
    lastHaulUserId: defeated ? request.userId : validEvent.lastHaulUserId,
  };
  const previous = await store.contributionForUpdate(
    request.eventId as string,
    request.userId,
  );
  const nextContribution: DangerousFishingBossContributionRecord = previous
    ? {
        ...previous,
        totalContribution: previous.totalContribution + contribution,
        successfulAttempts: previous.successfulAttempts + 1,
        lastContributedAt: request.now,
      }
    : {
        eventId: request.eventId as string,
        userId: request.userId,
        totalContribution: contribution,
        successfulAttempts: 1,
        firstContributedAt: request.now,
        lastContributedAt: request.now,
        rewardClaimedAt: null,
      };
  const result: RealtimeBossResult = {
    ok: true,
    event: "caught",
    contribution,
    totalContribution: nextContribution.totalContribution,
    defeated,
    publicStamina: nextEvent.stamina,
  };
  await store.saveEvent(nextEvent);
  await store.saveContribution(nextContribution);
  await store.saveDangerousState(
    request.userId,
    clearedWithCompletion(
      state,
      finishedEncounter,
      request.requestId,
      result,
    ),
  );
  return result;
}
