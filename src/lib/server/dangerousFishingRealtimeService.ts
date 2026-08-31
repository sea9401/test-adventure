import { randomUUID } from "node:crypto";
import {
  DANGEROUS_FISH,
  isDangerousBaitId,
  type DangerousFish,
} from "@/adventure/data/v2/dangerousFishing";
import { parseV2Class } from "@/adventure/data/v2/classes";
import { parseProficiencyForChar } from "@/adventure/data/v2/proficiency";
import { jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  isDangerousRealtimeEncounter,
  type DangerousEncounter,
  type DangerousEncounterEvent,
  type DangerousRealtimeCompletion,
  type DangerousRealtimeEncounter,
} from "@/adventure/v2/dangerousFishingEncounter";
import {
  DANGEROUS_REALTIME_BALANCE_REVISION,
  createDangerousRealtimeState,
  dangerousRealtimeMaxTicks,
  dangerousRealtimeTargetCalibration,
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
  dangerousFishingHeritage,
  dangerousFishingRealtimeProjection,
} from "@/adventure/v2/dangerousFishingHeritage";
import {
  DANGEROUS_FISHING_SAVE_KEY,
  DANGEROUS_REALTIME_FINISH_GRACE_MS,
  parseDangerousFishingState,
  recoverExpiredRealtimeBossAttempt,
  recoverExpiredRealtimeVoyageEncounter,
  resolvePersonalEncounter,
  type DangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import { consumeDangerousBait } from "@/adventure/v2/dangerousFishingShop";
import {
  FISHING_PROGRESS_KEY,
  emptyFishingProgression,
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";
import { ACTIVITY_GUARD_KEY } from "@/lib/server/activityGuard";
import { FISHING_WALLET_KEY } from "@/lib/server/fishing/coins";
import {
  activeAutoGatheringActivity,
  lockAutoGatheringStatesForUpdate,
  lockLifeActivityUserForUpdate,
} from "@/lib/server/lifeActivityLock";
import {
  lockSavesForUpdate,
  upsertSave,
  type DbExecutor,
  type DbTransactionExecutor,
} from "@/lib/server/savesKv";
import {
  caughtSize,
  dangerousRealtimeEncounterView,
  pickFish,
  prepareDangerousFishingCatchFromLockedSaves,
  publicState,
  settleDangerousFishingCatchRewardsInTx,
  settleIncidentFromLockedSaves,
} from "@/lib/server/dangerousFishingService";

const COMPLETION_LIMIT = 32;

type CharacterSave = Record<string, unknown> & {
  class?: unknown;
  specChoice?: unknown;
};

type RealtimeServiceError = {
  ok: false;
  error: string;
  status: number;
  [key: string]: unknown;
};

export type RealtimeServiceResult =
  | RealtimeServiceError
  | ({ ok: true; status: number } & Record<string, unknown>);

function fail(
  error: string,
  status: number,
  detail: Record<string, unknown> = {},
): RealtimeServiceError {
  return { ok: false, error, status, ...detail };
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
    inputs.push({
      tick: input.tick as number,
      mode: input.mode,
    });
  }
  return inputs;
}

function validEncounterRequest(
  encounterId: unknown,
  revision: unknown,
  clientTick: unknown,
): encounterId is string {
  return (
    typeof encounterId === "string" &&
    encounterId.length > 0 &&
    Number.isSafeInteger(revision) &&
    (revision as number) >= 0 &&
    Number.isSafeInteger(clientTick) &&
    (clientTick as number) >= 0
  );
}

function elapsedTick(encounter: DangerousRealtimeEncounter, now: number): number {
  return Math.min(
    encounter.config.maxTicks,
    Math.max(0, Math.floor((now - encounter.startedAt) / DANGEROUS_REALTIME_TICK_MS)),
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
): RealtimeServiceResult | null {
  const result = objectRecord(completion.result);
  if (
    !result ||
    typeof result.ok !== "boolean" ||
    !Number.isInteger(result.status) ||
    (result.status as number) < 100 ||
    (result.status as number) > 599
  ) {
    return null;
  }
  return result as RealtimeServiceResult;
}

function isJsonSerializable(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    const valid = value.every((entry) => isJsonSerializable(entry, seen));
    seen.delete(value);
    return valid;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const valid = Object.values(value).every((entry) =>
    isJsonSerializable(entry, seen),
  );
  seen.delete(value);
  return valid;
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

function legacyEncounterForResolution(
  encounter: DangerousRealtimeEncounter,
  event: Exclude<DangerousEncounterEvent, "progress" | "too_fast" | "stale">,
): DangerousEncounter {
  const checkpoint = encounter.checkpoint;
  return {
    id: encounter.id,
    targetKind: encounter.targetKind,
    targetId: encounter.targetId,
    status: event === "caught" ? "caught" : "failed",
    tension: checkpoint.tension,
    maxTension: checkpoint.maxTension,
    stamina: checkpoint.stamina,
    maxStamina: checkpoint.maxStamina,
    distance: checkpoint.distance,
    startDistance: checkpoint.startDistance,
    slackTurns: checkpoint.lowTensionTicks,
    slackTolerance: 0,
    step: checkpoint.tick,
    revision: encounter.revision,
    nextActionAt: encounter.startedAt,
    expiresAt: encounter.expiresAt,
    patternSeed: encounter.config.seed,
    behaviorPattern: encounter.config.behaviorPattern,
    reelPowerBonus: 0,
    staminaDamageBonus: 0,
    tensionControlBonus: 0,
    telegraphSteps: Math.min(
      2,
      encounter.config.modifiers.telegraphCount +
        encounter.config.modifiers.baitEffect.telegraphCount,
    ),
  };
}

function stateWithLegacyResolutionEncounter(
  state: DangerousFishingState,
  encounter: DangerousRealtimeEncounter,
  legacy: DangerousEncounter,
): DangerousFishingState {
  if (!state.voyage) return state;
  return {
    ...state,
    voyage: {
      ...state.voyage,
      encounter: { ...legacy, simulationVersion: 1 },
    },
  };
}

export async function startRealtimeEncounterInTx(
  tx: DbTransactionExecutor,
  userId: string,
  args: { baitId: unknown; now: number; random: () => number },
): Promise<RealtimeServiceResult> {
  if (!isDangerousBaitId(args.baitId)) return fail("invalid_bait", 400);
  const autoStates = await lockAutoGatheringStatesForUpdate(tx, userId);
  const activeAutoActivity = activeAutoGatheringActivity(autoStates);
  if (activeAutoActivity) {
    return fail("auto_active", 409, { activeAutoActivity });
  }
  const saves = await lockSavesForUpdate(tx, userId, {
    [DANGEROUS_FISHING_SAVE_KEY]: {},
    [FISHING_PROGRESS_KEY]: emptyFishingProgression(),
    [FISHING_WALLET_KEY]: {},
    "character.v2": {},
    "proficiency.v2": {},
    "skills.v2": emptyV2SkillsState(),
  });
  let state = parseDangerousFishingState(saves[DANGEROUS_FISHING_SAVE_KEY]);
  const expiredVoyage = recoverExpiredRealtimeVoyageEncounter(state, {
    now: args.now,
    result: fail("expired", 409),
  });
  const expiredBoss = recoverExpiredRealtimeBossAttempt(expiredVoyage.state, {
    now: args.now,
    result: fail("expired", 409),
  });
  if (expiredVoyage.encounter || expiredBoss.encounter) {
    state = expiredBoss.state;
    await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, state);
  }
  if (state.bossAttempt) {
    return fail("encounter_active", 409, {
      eventId: state.bossAttempt.eventId,
    });
  }
  if (!state.voyage) return fail("no_voyage", 409);
  if (state.voyage.encounter) return fail("encounter_active", 409);

  const progress = parseFishingProgression(saves[FISHING_PROGRESS_KEY]);
  const skills = parseV2SkillsState(saves["skills.v2"]);
  const character = saves["character.v2"] as CharacterSave;
  const proficiency = parseProficiencyForChar(
    saves["proficiency.v2"],
    character,
  );
  const currentClass = parseV2Class(character.class);
  const currentJobId = jobIdFromLegacy(
    currentClass,
    typeof character.specChoice === "string" ? character.specChoice : null,
  );
  const heritage = dangerousFishingHeritage({
    fishingProgression: progress,
    proficiency,
    currentJobId,
    equippedSkillIds: skills.equipped,
  });
  if (!heritage.unlocked) {
    return fail("fishing_level_locked", 403, { requiredLevel: 15 });
  }
  const inherited = dangerousFishingEncounterModifiers(heritage, state.loadout);
  const projection = dangerousFishingRealtimeProjection(inherited);
  const modifierSourceBase = {
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
  };
  const realtimeModifiers = dangerousRealtimeModifiers({
    fishingLevel: modifierSourceBase.fishingLevel,
    baitId: modifierSourceBase.baitId,
    reelPowerBonus: modifierSourceBase.reelPowerBonus,
    staminaDamageBonus: modifierSourceBase.staminaDamageBonus,
    tensionControlBonus: modifierSourceBase.tensionControlBonus,
    slackTolerance: modifierSourceBase.slackTolerance,
    telegraphSteps: modifierSourceBase.telegraphSteps,
    rodEnhancementLevel: modifierSourceBase.rodEnhancementLevel,
    reelEnhancementLevel: modifierSourceBase.reelEnhancementLevel,
    lineEnhancementLevel: modifierSourceBase.lineEnhancementLevel,
    cargoProtectionPct: modifierSourceBase.cargoProtectionPct,
  });
  const incident = await settleIncidentFromLockedSaves(
    tx,
    userId,
    state,
    character,
    saves[FISHING_WALLET_KEY],
    args.random(),
    realtimeModifiers.cargoProtectionPct,
  );
  if (incident) return incident;

  const consumed = consumeDangerousBait(state, args.baitId);
  if (!consumed.ok) return fail(consumed.error, 409);
  state = consumed.state;
  if (!state.voyage) return fail("no_voyage", 409);
  const fish = pickFish(
    state.voyage.zoneId,
    state.voyage.depthId,
    args.baitId,
    args.random(),
  );
  const modifierSource = {
    ...modifierSourceBase,
    targetStamina: fish.stamina,
    targetDistance: fish.distance,
    targetBaseTension: fish.baseTension,
  };
  const targetCalibration = dangerousRealtimeTargetCalibration({
    stamina: modifierSource.targetStamina,
    distance: modifierSource.targetDistance,
    baseTension: modifierSource.targetBaseTension,
    maxTensionBonus: modifierSource.maxTensionBonus,
  });
  const configBase: DangerousRealtimeConfig = {
    seed: Math.floor(args.random() * 2 ** 31),
    risk: state.voyage.risk,
    targetKind: "fish",
    rarity: fish.rarity,
    behaviorPattern: [...fish.behaviorPattern],
    ...targetCalibration,
    maxTicks: 0,
    modifiers: realtimeModifiers,
  };
  const config = { ...configBase, maxTicks: dangerousRealtimeMaxTicks(configBase) };
  const startedAt = args.now + DANGEROUS_REALTIME_START_DELAY_MS;
  const encounter: DangerousRealtimeEncounter = {
    simulationVersion: 2,
    balanceRevision: DANGEROUS_REALTIME_BALANCE_REVISION,
    id: randomUUID(),
    targetKind: "fish",
    targetId: fish.id,
    modifierSource,
    config,
    checkpoint: createDangerousRealtimeState(config),
    approvedTick: 0,
    revision: 0,
    startedAt,
    expiresAt: startedAt + config.maxTicks * DANGEROUS_REALTIME_TICK_MS,
  };
  const nextState: DangerousFishingState = {
    ...state,
    voyage: { ...state.voyage, encounter },
  };
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, nextState);
  return {
    ok: true,
    status: 200,
    state: publicState(nextState),
    encounter: dangerousRealtimeEncounterView(encounter),
    fishHint: inherited.targetReadingPct > 0 ? { rarity: fish.rarity } : null,
  };
}

export async function checkpointRealtimeEncounterInTx(
  tx: DbExecutor,
  userId: string,
  request: {
    encounterId: unknown;
    revision: unknown;
    inputs: unknown;
    clientTick: unknown;
    now: number;
  },
): Promise<RealtimeServiceResult> {
  if (typeof request.encounterId !== "string" || request.encounterId.length === 0) {
    return fail("bad_request", 400);
  }
  await lockLifeActivityUserForUpdate(tx, userId);
  const saves = await lockSavesForUpdate(tx, userId, {
    [DANGEROUS_FISHING_SAVE_KEY]: {},
  });
  const state = parseDangerousFishingState(
    saves[DANGEROUS_FISHING_SAVE_KEY],
  );
  const completed = findCompletionByEncounter(state, request.encounterId);
  if (completed) {
    return completionResult(completed) ?? fail("invalid_completion", 500);
  }
  if (
    !validEncounterRequest(
      request.encounterId,
      request.revision,
      request.clientTick,
    )
  ) {
    return fail("bad_request", 400);
  }
  const inputs = parseInputs(request.inputs);
  if (!inputs) return fail("invalid_inputs", 400);
  const encounter = state.voyage?.encounter;
  if (!encounter || encounter.id !== request.encounterId) {
    return fail(
      state.resolvedEncounterIds.includes(request.encounterId) ? "stale" : "no_encounter",
      409,
    );
  }
  if (!isDangerousRealtimeEncounter(encounter)) {
    return fail("legacy_encounter", 409);
  }
  const expired = recoverExpiredRealtimeVoyageEncounter(state, {
    now: request.now,
    result: fail("expired", 409),
  });
  if (expired.encounter) {
    await upsertSave(
      tx,
      userId,
      DANGEROUS_FISHING_SAVE_KEY,
      expired.state,
    );
    return fail("expired", 409);
  }
  if (request.revision !== encounter.revision) {
    return fail("stale", 409, {
      encounter: dangerousRealtimeEncounterView(encounter),
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
    return fail("invalid_inputs", 400, {
      encounter: dangerousRealtimeEncounterView(encounter),
    });
  }
  if (request.now > encounter.expiresAt) return fail("expired", 409);
  if ((request.clientTick as number) > elapsedTick(encounter, request.now)) {
    return fail("future_tick", 409, {
      encounter: dangerousRealtimeEncounterView(encounter),
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
    return fail("invalid_inputs", 400, {
      encounter: dangerousRealtimeEncounterView(encounter),
    });
  }
  const nextEncounter: DangerousRealtimeEncounter = {
    ...encounter,
    checkpoint,
    approvedTick: checkpoint.tick,
    revision: encounter.revision + 1,
  };
  const nextState: DangerousFishingState = {
    ...state,
    voyage: state.voyage
      ? { ...state.voyage, encounter: nextEncounter }
      : state.voyage,
  };
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, nextState);
  return {
    ok: true,
    status: 200,
    state: publicState(nextState),
    encounter: dangerousRealtimeEncounterView(nextEncounter),
  };
}

export async function finishRealtimeEncounterInTx(
  tx: DbTransactionExecutor,
  userId: string,
  request: {
    encounterId: unknown;
    revision: unknown;
    inputs: unknown;
    clientTick: unknown;
    requestId: unknown;
    now: number;
    random: () => number;
  },
): Promise<RealtimeServiceResult> {
  if (
    typeof request.requestId !== "string" ||
    request.requestId.length === 0 ||
    request.requestId.length > 128 ||
    typeof request.encounterId !== "string" ||
    request.encounterId.length === 0
  ) {
    return fail("bad_request", 400);
  }
  await lockLifeActivityUserForUpdate(tx, userId);
  const saves = await lockSavesForUpdate(tx, userId, {
    [ACTIVITY_GUARD_KEY]: {},
    [DANGEROUS_FISHING_SAVE_KEY]: {},
    [FISHING_PROGRESS_KEY]: emptyFishingProgression(),
    [FISHING_WALLET_KEY]: {},
    "character.v2": {},
    "proficiency.v2": {},
    "skills.v2": emptyV2SkillsState(),
  });
  let state = parseDangerousFishingState(saves[DANGEROUS_FISHING_SAVE_KEY]);
  const duplicate = state.realtimeCompletions.find(
    (completion) => completion.requestId === request.requestId,
  );
  if (duplicate) {
    if (duplicate.encounterId !== request.encounterId) {
      return fail("request_id_collision", 409);
    }
    return completionResult(duplicate) ?? fail("invalid_completion", 500);
  }
  if (
    !validEncounterRequest(
      request.encounterId,
      request.revision,
      request.clientTick,
    )
  ) {
    return fail("bad_request", 400);
  }
  const inputs = parseInputs(request.inputs);
  if (!inputs) return fail("invalid_inputs", 400);
  const encounter = state.voyage?.encounter;
  if (!encounter || encounter.id !== request.encounterId) {
    return fail(
      state.resolvedEncounterIds.includes(request.encounterId) ? "stale" : "no_encounter",
      409,
    );
  }
  if (!isDangerousRealtimeEncounter(encounter)) {
    return fail("legacy_encounter", 409);
  }
  const expired = recoverExpiredRealtimeVoyageEncounter(state, {
    now: request.now,
    result: fail("expired", 409),
    requestId: request.requestId as string,
  });
  if (expired.encounter) {
    await upsertSave(
      tx,
      userId,
      DANGEROUS_FISHING_SAVE_KEY,
      expired.state,
    );
    return fail("expired", 409);
  }
  if (request.revision !== encounter.revision) {
    return fail("stale", 409, {
      encounter: dangerousRealtimeEncounterView(encounter),
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
    return fail("invalid_inputs", 400, {
      encounter: dangerousRealtimeEncounterView(encounter),
    });
  }
  if (request.now > encounter.expiresAt + DANGEROUS_REALTIME_FINISH_GRACE_MS) {
    return fail("expired", 409);
  }
  if ((request.clientTick as number) > elapsedTick(encounter, request.now)) {
    return fail("future_tick", 409, {
      encounter: dangerousRealtimeEncounterView(encounter),
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
    return fail("invalid_inputs", 400, {
      encounter: dangerousRealtimeEncounterView(encounter),
    });
  }
  if (checkpoint.status === "active") {
    return fail("not_finished", 409, {
      encounter: dangerousRealtimeEncounterView({
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
  const event = checkpoint.status as Exclude<
    DangerousEncounterEvent,
    "progress" | "too_fast" | "stale"
  >;
  const legacy = legacyEncounterForResolution(finishedEncounter, event);
  const resolutionState = stateWithLegacyResolutionEncounter(
    state,
    finishedEncounter,
    legacy,
  );
  let caught:
    | { fishId: keyof typeof DANGEROUS_FISH; sizeCm: number; quantity: number }
    | undefined;
  let fish: DangerousFish | undefined;
  let prepared:
    | ReturnType<typeof prepareDangerousFishingCatchFromLockedSaves>
    | undefined;
  if (event === "caught") {
    fish = DANGEROUS_FISH[finishedEncounter.targetId as keyof typeof DANGEROUS_FISH];
    if (!fish) return fail("invalid_target", 500);
    prepared = prepareDangerousFishingCatchFromLockedSaves(state, saves);
    caught = {
      fishId: fish.id,
      sizeCm: caughtSize(fish, request.random(), prepared.modifiers.sizeBonusPct),
      quantity: 1,
    };
  }
  const resolved = resolvePersonalEncounter(
    resolutionState,
    { event, encounter: legacy },
    request.now,
    caught,
  );
  let result: RealtimeServiceResult = {
    ok: true,
    status: 200,
    event,
  };
  if (resolved.outcome === "caught" && caught && fish && prepared) {
    const rewards = await settleDangerousFishingCatchRewardsInTx(tx, userId, {
      state,
      fish,
      sizeCm: caught.sizeCm,
      now: request.now,
      random: request.random,
      prepared,
    });
    result = { ...result, ...rewards };
  }
  if (!isJsonSerializable(result)) {
    throw new TypeError("realtime completion result must be JSON-serializable");
  }
  state = withCompletion(resolved.state, {
    requestId: request.requestId,
    encounterId: encounter.id,
    result,
  });
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, state);
  return result;
}
