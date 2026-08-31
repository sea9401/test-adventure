import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  DANGEROUS_BAITS,
  DANGEROUS_DEPTHS,
  DANGEROUS_FISH,
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
  DANGEROUS_ZONES,
  isDangerousBaitId,
  isDangerousDepthId,
  isDangerousLineId,
  isDangerousReelId,
  isDangerousRodId,
  isDangerousZoneId,
  type DangerousBaitId,
  type DangerousDepthId,
  type DangerousFish,
  type DangerousGearKind,
  type DangerousZoneId,
} from "@/adventure/data/v2/dangerousFishing";
import { parseV2Class } from "@/adventure/data/v2/classes";
import {
  addJobCumLevel,
  addJobHistory,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";
import {
  highestVisitedFishingJobId,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  applyDangerousEncounterAction,
  createDangerousEncounter,
  dangerousEncounterView,
  isDangerousRealtimeEncounter,
  type DangerousRealtimeEncounter,
  type DangerousFishingAction,
} from "@/adventure/v2/dangerousFishingEncounter";
import { dangerousRealtimeView } from "@/adventure/v2/dangerousFishingRealtime";
import { dangerousReturnFishingCoins } from "@/adventure/v2/dangerousFishingRewards";
import {
  dangerousFishingEncounterModifiers,
  dangerousFishingHeritage,
} from "@/adventure/v2/dangerousFishingHeritage";
import {
  applyDangerousAccidentAndReturn,
  DANGEROUS_FISHING_SAVE_KEY,
  dangerousRiskPreview,
  parseDangerousFishingState,
  recoverExpiredRealtimeBossAttempt,
  recoverExpiredRealtimeVoyageEncounter,
  resolvePersonalEncounter,
  returnDangerousVoyage,
  startDangerousVoyage,
  startPersonalEncounter,
  type DangerousFishingReturn,
  type DangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import {
  buyDangerousBaitPack,
  buyDangerousGear,
  consumeDangerousBait,
  equipDangerousGear,
} from "@/adventure/v2/dangerousFishingShop";
import {
  FISHING_PROGRESS_KEY,
  emptyFishingProgression,
  fishingLevelForXp,
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";
import {
  ACTIVITY_GUARD_KEY,
  parseActivityGuardState,
  recordActivityCompletion,
} from "@/lib/server/activityGuard";
import {
  FISHING_WALLET_KEY,
  fishingWalletWithCoins,
  walletCoins,
} from "@/lib/server/fishing/coins";
import {
  dangerousFishingWalletCoins,
  dangerousFishingWalletWithAddedCoins,
  mergeDangerousFishingMaterials,
} from "@/lib/server/dangerousFishingSettlement";
import {
  activeAutoGatheringActivity,
  lockAutoGatheringStatesForUpdate,
  lockLifeActivityUserForUpdate,
  readActiveAutoGatheringActivity,
} from "@/lib/server/lifeActivityLock";
import {
  lockSavesForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
  type DbTransactionExecutor,
} from "@/lib/server/savesKv";
import { recordCodexMasteryGameplayBatch } from "@/lib/server/codexMasteryGameplay";
import {
  drizzleDangerousFishingBossStore,
  maybeSpawnDangerousFishingBoss,
} from "@/lib/server/dangerousFishingBoss";

type ServiceError = {
  ok: false;
  error: string;
  status: number;
  [key: string]: unknown;
};

type CharacterSave = Record<string, unknown> & {
  class?: unknown;
  specChoice?: unknown;
  materials?: unknown;
};

function fail(error: string, status: number, detail = {}): ServiceError {
  return { ok: false, error, status, ...detail };
}

export function dangerousRealtimeEncounterView(
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

export function publicState(state: DangerousFishingState) {
  const { realtimeCompletions: _realtimeCompletions, ...publicStateBase } = state;
  const bossAttempt = state.bossAttempt
    ? {
        ...state.bossAttempt,
        encounter: isDangerousRealtimeEncounter(state.bossAttempt.encounter)
          ? dangerousRealtimeEncounterView(state.bossAttempt.encounter)
          : dangerousEncounterView(state.bossAttempt.encounter),
      }
    : null;
  if (!state.voyage?.encounter) return { ...publicStateBase, bossAttempt };
  return {
    ...publicStateBase,
    bossAttempt,
    voyage: {
      ...state.voyage,
      encounter: isDangerousRealtimeEncounter(state.voyage.encounter)
        ? dangerousRealtimeEncounterView(state.voyage.encounter)
        : dangerousEncounterView(state.voyage.encounter),
    },
  };
}

async function readHeritageInputs(executor: DbExecutor, userId: string) {
  const [dangerousRaw, progressRaw, skillsRaw, characterRaw, proficiencyRaw, walletRaw] =
    await Promise.all([
      readSave(executor, userId, DANGEROUS_FISHING_SAVE_KEY, {}),
      readSave(executor, userId, FISHING_PROGRESS_KEY, emptyFishingProgression()),
      readSave(executor, userId, "skills.v2", emptyV2SkillsState()),
      readSave(executor, userId, "character.v2", {}),
      readSave(executor, userId, "proficiency.v2", {}),
      readSave(executor, userId, FISHING_WALLET_KEY, {}),
    ]);
  const character = characterRaw as CharacterSave;
  const currentClass = parseV2Class(character.class);
  const currentJobId = jobIdFromLegacy(
    currentClass,
    typeof character.specChoice === "string" ? character.specChoice : null,
  );
  const fishingProgression = parseFishingProgression(progressRaw);
  const proficiency = parseProficiencyForChar(proficiencyRaw, character);
  const skills = parseV2SkillsState(skillsRaw);
  return {
    state: parseDangerousFishingState(dangerousRaw),
    fishingProgression,
    skills,
    character,
    proficiency,
    currentJobId,
    fishingCoins: walletCoins(walletRaw),
    walletRaw,
    heritage: dangerousFishingHeritage({
      fishingProgression,
      proficiency,
      currentJobId,
      equippedSkillIds: skills.equipped,
    }),
  };
}

export async function readDangerousFishingView(
  executor: DbExecutor,
  userId: string,
  now: number,
) {
  await lockLifeActivityUserForUpdate(executor, userId);
  const locked = await lockSavesForUpdate(executor, userId, {
    [DANGEROUS_FISHING_SAVE_KEY]: {},
  });
  const recoveredVoyage = recoverExpiredRealtimeVoyageEncounter(
    parseDangerousFishingState(locked[DANGEROUS_FISHING_SAVE_KEY]),
    { now, result: fail("expired", 409) },
  );
  const recoveredBoss = recoverExpiredRealtimeBossAttempt(
    recoveredVoyage.state,
    { now, result: fail("expired", 409) },
  );
  if (recoveredVoyage.encounter || recoveredBoss.encounter) {
    await upsertSave(
      executor,
      userId,
      DANGEROUS_FISHING_SAVE_KEY,
      recoveredBoss.state,
    );
  }
  const inputs = await readHeritageInputs(executor, userId);
  const activeAutoActivity = await readActiveAutoGatheringActivity(executor, userId);
  return {
    ok: true as const,
    now,
    state: publicState(inputs.state),
    heritage: inputs.heritage,
    fishingCoins: inputs.fishingCoins,
    activeAutoActivity,
    catalogs: {
      zones: DANGEROUS_ZONES,
      depths: DANGEROUS_DEPTHS,
      fish: DANGEROUS_FISH,
      rods: DANGEROUS_RODS,
      reels: DANGEROUS_REELS,
      lines: DANGEROUS_LINES,
      baits: DANGEROUS_BAITS,
    },
    riskPreview: inputs.state.voyage
      ? dangerousRiskPreview(inputs.state.voyage.risk)
      : dangerousRiskPreview(0),
  };
}

export async function startVoyageInTx(
  tx: DbExecutor,
  userId: string,
  args: { zoneId: unknown; depthId: unknown; now: number },
) {
  if (!isDangerousZoneId(args.zoneId)) return fail("invalid_zone", 400);
  if (!isDangerousDepthId(args.depthId)) return fail("invalid_depth", 400);

  const autoStates = await lockAutoGatheringStatesForUpdate(tx, userId);
  const activeAutoActivity = activeAutoGatheringActivity(autoStates);
  if (activeAutoActivity) {
    return fail("auto_active", 409, { activeAutoActivity });
  }
  const saves = await lockSavesForUpdate(tx, userId, {
    [DANGEROUS_FISHING_SAVE_KEY]: {},
    [FISHING_PROGRESS_KEY]: emptyFishingProgression(),
  });
  let dangerous = parseDangerousFishingState(
    saves[DANGEROUS_FISHING_SAVE_KEY],
  );
  const recoveredBoss = recoverExpiredRealtimeBossAttempt(dangerous, {
    now: args.now,
    result: fail("expired", 409),
  });
  if (recoveredBoss.encounter) {
    dangerous = recoveredBoss.state;
    await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, dangerous);
  }
  if (dangerous.bossAttempt) {
    return fail("encounter_active", 409, {
      eventId: dangerous.bossAttempt.eventId,
    });
  }
  const progress = parseFishingProgression(saves[FISHING_PROGRESS_KEY]);
  const fishingLevel = fishingLevelForXp(progress.xp);
  if (fishingLevel < 15) {
    return fail("fishing_level_locked", 403, { requiredLevel: 15 });
  }
  const zone = DANGEROUS_ZONES[args.zoneId];
  if (fishingLevel < zone.unlockLevel) {
    return fail("zone_level_locked", 403, { requiredLevel: zone.unlockLevel });
  }
  const risk = Math.min(
    5,
    zone.baseRisk + DANGEROUS_DEPTHS[args.depthId].riskBonus,
  );
  const started = startDangerousVoyage(dangerous, {
    id: randomUUID(),
    zoneId: args.zoneId,
    depthId: args.depthId,
    risk,
    startedAt: args.now,
  });
  if (!started.ok) return fail(started.error, 409);
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, started.state);
  return { ok: true as const, status: 200, state: publicState(started.state) };
}

function settleReturnIntoCharacter(
  character: CharacterSave,
  returned: DangerousFishingReturn,
) {
  return {
    ...character,
    materials: mergeDangerousFishingMaterials(
      character.materials,
      returned.materials,
    ),
  };
}

function settleReturnIntoWallet(
  walletRaw: unknown,
  returned: DangerousFishingReturn,
  risk: number,
) {
  const currentCoins = dangerousFishingWalletCoins(walletRaw);
  const calculated = dangerousReturnFishingCoins(
    returned.retainedCargoValue,
    risk,
  );
  const remainingCapacity = Math.max(
    0,
    Number.MAX_SAFE_INTEGER - currentCoins,
  );
  const returnFishingCoinsGained = Math.max(
    0,
    Math.min(calculated, remainingCapacity),
  );
  return {
    returnFishingCoinsGained,
    wallet: fishingWalletWithCoins(
      walletRaw,
      currentCoins + returnFishingCoinsGained,
    ),
  };
}

export async function returnVoyageInTx(
  tx: DbExecutor,
  userId: string,
  args: { now: number },
) {
  await lockLifeActivityUserForUpdate(tx, userId);
  const saves = await lockSavesForUpdate(tx, userId, {
    [DANGEROUS_FISHING_SAVE_KEY]: {},
    "character.v2": {},
    [FISHING_WALLET_KEY]: {},
  });
  let state = parseDangerousFishingState(saves[DANGEROUS_FISHING_SAVE_KEY]);
  const expired = recoverExpiredRealtimeVoyageEncounter(state, {
    now: args.now,
    result: fail("expired", 409),
  });
  if (expired.encounter) state = expired.state;
  if (!state.voyage) return fail("no_voyage", 409);
  if (state.voyage.encounter) return fail("encounter_active", 409);
  const character = saves["character.v2"] as CharacterSave;
  const risk = state.voyage.risk;
  const returned = returnDangerousVoyage(state);
  const walletSettlement = settleReturnIntoWallet(
    saves[FISHING_WALLET_KEY],
    returned,
    risk,
  );
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, returned.state);
  await upsertSave(
    tx,
    userId,
    "character.v2",
    settleReturnIntoCharacter(character, returned),
  );
  await upsertSave(
    tx,
    userId,
    FISHING_WALLET_KEY,
    walletSettlement.wallet,
  );
  return {
    ok: true as const,
    status: 200,
    ...returned,
    returnFishingCoinsGained: walletSettlement.returnFishingCoinsGained,
    state: publicState(returned.state),
  };
}

export function pickFish(
  zoneId: DangerousZoneId,
  depthId: DangerousDepthId,
  baitId: DangerousBaitId,
  random: number,
): DangerousFish {
  const depthIndex: Record<DangerousDepthId, number> = {
    surface: 0,
    midwater: 1,
    deep: 2,
  };
  const depthAffinity = [1, 0.22, 0.05] as const;
  const candidates = Object.values(DANGEROUS_FISH)
    .filter((fish) => fish.zoneId === zoneId)
    .sort(
      (left, right) =>
        Math.abs(depthIndex[left.depthId] - depthIndex[depthId]) -
        Math.abs(depthIndex[right.depthId] - depthIndex[depthId]),
    );
  const bait = DANGEROUS_BAITS[baitId];
  const weighted = candidates.map((fish) => ({
    fish,
    weight:
      fish.spawnWeight *
      depthAffinity[Math.abs(depthIndex[fish.depthId] - depthIndex[depthId])] *
      (bait.targetBehaviors.some((behavior) => fish.behaviorPattern.includes(behavior))
        ? 1.5
        : 1) *
      (bait.targetRarities.includes(fish.rarity)
        ? 1 + bait.rarityBonus
        : 1),
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.max(0, Math.min(0.999999, random)) * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.fish;
  }
  return weighted.at(-1)?.fish ?? DANGEROUS_FISH.razor_sardine;
}

export async function settleIncidentFromLockedSaves(
  tx: DbExecutor,
  userId: string,
  state: DangerousFishingState,
  character: CharacterSave,
  walletRaw: unknown,
  roll: number,
  cargoProtectionPct: number,
) {
  const incident = applyDangerousAccidentAndReturn(
    state,
    roll,
    cargoProtectionPct,
  );
  if (!incident.incident) return null;
  const risk = state.voyage?.risk ?? 0;
  const walletSettlement = settleReturnIntoWallet(walletRaw, incident, risk);
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, incident.state);
  await upsertSave(
    tx,
    userId,
    "character.v2",
    settleReturnIntoCharacter(character, incident),
  );
  await upsertSave(
    tx,
    userId,
    FISHING_WALLET_KEY,
    walletSettlement.wallet,
  );
  return {
    ok: true as const,
    status: 200,
    ...incident,
    returnFishingCoinsGained: walletSettlement.returnFishingCoinsGained,
    state: publicState(incident.state),
  };
}

export async function startEncounterInTx(
  tx: DbExecutor,
  userId: string,
  args: { baitId: unknown; now: number; random: () => number },
) {
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
  const recoveredBoss = recoverExpiredRealtimeBossAttempt(expiredVoyage.state, {
    now: args.now,
    result: fail("expired", 409),
  });
  if (expiredVoyage.encounter || recoveredBoss.encounter) {
    state = recoveredBoss.state;
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
  const modifiers = dangerousFishingEncounterModifiers(heritage, state.loadout);
  const incident = await settleIncidentFromLockedSaves(
    tx,
    userId,
    state,
    character,
    saves[FISHING_WALLET_KEY],
    args.random(),
    modifiers.cargoProtectionPct,
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
  const encounter = createDangerousEncounter({
    id: randomUUID(),
    targetKind: "fish",
    target: fish,
    rod: modifiers.rod,
    reel: modifiers.reel,
    line: modifiers.line,
    startedAt: args.now,
    patternSeed: Math.floor(args.random() * 2 ** 31),
    assistance: {
      ...modifiers.assistance,
      telegraphSteps: modifiers.telegraphSteps,
    },
  });
  const started = startPersonalEncounter(state, encounter);
  if (!started.ok) return fail(started.error, 409);
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, started.state);
  return {
    ok: true as const,
    status: 200,
    state: publicState(started.state),
    encounter: dangerousEncounterView(encounter),
    fishHint: modifiers.targetReadingPct > 0 ? { rarity: fish.rarity } : null,
  };
}

export function caughtSize(fish: DangerousFish, random: number, sizeBonusPct: number) {
  const span = fish.maxSizeCm - fish.minSizeCm + 1;
  const base = fish.minSizeCm + Math.floor(Math.max(0, Math.min(0.999999, random)) * span);
  return Math.min(fish.maxSizeCm, Math.floor(base * (1 + sizeBonusPct / 100)));
}

export function prepareDangerousFishingCatchFromLockedSaves(
  state: DangerousFishingState,
  saves: Record<string, unknown>,
) {
  const progress = parseFishingProgression(
    saves[FISHING_PROGRESS_KEY],
  );
  const skills = parseV2SkillsState(
    saves["skills.v2"],
  );
  const character = (saves["character.v2"] ?? {}) as CharacterSave;
  const proficiency = parseProficiencyForChar(
    saves["proficiency.v2"],
    character,
  );
  const walletRaw = saves[FISHING_WALLET_KEY] ?? {};
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
  return {
    progress,
    proficiency,
    walletRaw,
    activityGuardRaw: saves[ACTIVITY_GUARD_KEY] ?? {},
    currentJobId,
    modifiers: dangerousFishingEncounterModifiers(heritage, state.loadout),
  };
}

export async function settleDangerousFishingCatchRewardsInTx(
  tx: DbTransactionExecutor,
  userId: string,
  args: {
    state: DangerousFishingState;
    fish: DangerousFish;
    sizeCm: number;
    now: number;
    random: () => number;
    prepared: ReturnType<typeof prepareDangerousFishingCatchFromLockedSaves>;
  },
) {
  const {
    progress,
    proficiency,
    currentJobId,
    walletRaw,
    activityGuardRaw,
    modifiers,
  } =
    args.prepared;
  const nextProgress = { ...progress, xp: progress.xp + args.fish.fishingXp };
  const highestFishingJobId = highestVisitedFishingJobId(
    proficiency,
    currentJobId,
  );
  const nextProficiency = highestFishingJobId
    ? addJobHistory(
        addJobCumLevel(proficiency, highestFishingJobId, 1),
        highestFishingJobId,
      )
    : proficiency;
  const guard = recordActivityCompletion(
    parseActivityGuardState(activityGuardRaw),
    "fishing",
    args.now,
  );
  await upsertSave(tx, userId, FISHING_PROGRESS_KEY, nextProgress);
  await upsertSave(tx, userId, "proficiency.v2", nextProficiency);
  await upsertSave(
    tx,
    userId,
    FISHING_WALLET_KEY,
    dangerousFishingWalletWithAddedCoins(
      walletRaw,
      args.fish.fishingCoinReward,
    ),
  );
  await upsertSave(tx, userId, ACTIVITY_GUARD_KEY, guard.state);
  if (highestFishingJobId) {
    await recordCodexMasteryGameplayBatch(tx, userId, [{
      category: "job",
      entryId: highestFishingJobId,
      amount: 1,
      source: "job.activity",
    }], new Date(args.now));
  }
  const risk = args.state.voyage?.risk ?? 0;
  const bossSpawn =
    risk >= 4 &&
    (args.fish.rarity === "epic" || args.fish.rarity === "legendary")
      ? await maybeSpawnDangerousFishingBoss(
          drizzleDangerousFishingBossStore(tx),
          {
            userId,
            risk,
            rarity: args.fish.rarity,
            discoveryBonusPct: modifiers.traceBonusPct,
            now: new Date(args.now),
            random: args.random,
          },
        )
      : null;
  return {
    fish: { id: args.fish.id, name: args.fish.name, sizeCm: args.sizeCm },
    fishingXpGained: args.fish.fishingXp,
    masteryGained: highestFishingJobId ? 1 : 0,
    fishingCoinsGained: args.fish.fishingCoinReward,
    bossSpawn: bossSpawn
      ? {
          id: bossSpawn.id,
          bossId: bossSpawn.bossId,
          expiresAt: bossSpawn.expiresAt.getTime(),
        }
      : null,
  };
}

export async function actOnEncounterInTx(
  tx: DbTransactionExecutor,
  userId: string,
  args: {
    action: DangerousFishingAction;
    encounterId: unknown;
    revision: unknown;
    now: number;
    random: () => number;
  },
) {
  if (typeof args.encounterId !== "string" || !Number.isInteger(args.revision)) {
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
  const state = parseDangerousFishingState(saves[DANGEROUS_FISHING_SAVE_KEY]);
  const encounter = state.voyage?.encounter;
  if (!encounter || encounter.id !== args.encounterId) {
    return fail(
      state.resolvedEncounterIds.includes(args.encounterId)
        ? "stale"
        : "no_encounter",
      409,
    );
  }
  if (isDangerousRealtimeEncounter(encounter)) {
    return fail("realtime_encounter", 409);
  }
  const transition = applyDangerousEncounterAction(
    encounter,
    args.action,
    args.now,
    args.revision as number,
  );
  if (transition.event === "stale") return fail("stale", 409);
  if (transition.event === "too_fast") {
    return fail("too_fast", 429, {
      retryAfterMs: Math.max(1, encounter.nextActionAt - args.now),
    });
  }

  let caught:
    | { fishId: keyof typeof DANGEROUS_FISH; sizeCm: number; quantity: number }
    | undefined;
  let prepared:
    | ReturnType<typeof prepareDangerousFishingCatchFromLockedSaves>
    | null = null;

  if (transition.event === "caught") {
    prepared = prepareDangerousFishingCatchFromLockedSaves(state, saves);
    const fish = DANGEROUS_FISH[encounter.targetId as keyof typeof DANGEROUS_FISH];
    caught = {
      fishId: fish.id,
      sizeCm: caughtSize(fish, args.random(), prepared.modifiers.sizeBonusPct),
      quantity: 1,
    };
  }

  const resolved = resolvePersonalEncounter(
    state,
    transition,
    args.now,
    caught,
  );
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, resolved.state);
  if (resolved.outcome !== "caught" || !caught || !prepared) {
    return {
      ok: true as const,
      status: 200,
      event: transition.event,
      state: publicState(resolved.state),
      encounter: dangerousEncounterView(transition.encounter),
    };
  }

  const fish = DANGEROUS_FISH[caught.fishId];
  const rewards = await settleDangerousFishingCatchRewardsInTx(tx, userId, {
    state,
    fish,
    sizeCm: caught.sizeCm,
    now: args.now,
    random: args.random,
    prepared,
  });
  return {
    ok: true as const,
    status: 200,
    event: "caught" as const,
    state: publicState(resolved.state),
    ...rewards,
  };
}

export async function purchaseDangerousFishingItemInTx(
  tx: DbExecutor,
  userId: string,
  args: { kind: unknown; id: unknown; action: unknown },
) {
  if (
    (args.kind !== "rod" &&
      args.kind !== "reel" &&
      args.kind !== "line" &&
      args.kind !== "bait") ||
    typeof args.id !== "string" ||
    (args.action !== "buy" && args.action !== "equip")
  ) {
    return fail("bad_request", 400);
  }
  await lockLifeActivityUserForUpdate(tx, userId);
  const saves = await lockSavesForUpdate(tx, userId, {
    [DANGEROUS_FISHING_SAVE_KEY]: {},
    [FISHING_WALLET_KEY]: {},
  });
  let state = parseDangerousFishingState(saves[DANGEROUS_FISHING_SAVE_KEY]);
  if (state.voyage?.encounter) return fail("encounter_active", 409);

  if (args.action === "equip") {
    if (args.kind === "bait") return fail("bad_request", 400);
    const equipped = equipDangerousGear(
      state,
      args.kind as DangerousGearKind,
      args.id,
    );
    if (!equipped.ok) return fail(equipped.error, 409);
    await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, equipped.state);
    return { ok: true as const, status: 200, state: publicState(equipped.state) };
  }

  const walletRaw = saves[FISHING_WALLET_KEY];
  const coins = walletCoins(walletRaw);
  const purchased =
    args.kind === "bait"
      ? buyDangerousBaitPack(state, coins, args.id)
      : buyDangerousGear(state, coins, args.kind, args.id);
  if (!purchased.ok) {
    return fail(purchased.error, purchased.error === "invalid_item" ? 400 : 409);
  }
  state = purchased.state;
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, state);
  await upsertSave(
    tx,
    userId,
    FISHING_WALLET_KEY,
    fishingWalletWithCoins(walletRaw, purchased.coins),
  );
  return {
    ok: true as const,
    status: 200,
    state: publicState(state),
    fishingCoins: purchased.coins,
  };
}

export async function withDangerousFishingTransaction<T>(
  callback: (tx: DbTransactionExecutor) => Promise<T>,
): Promise<T> {
  return db.transaction(callback);
}

export function validateDangerousShopId(kind: unknown, id: unknown): boolean {
  if (typeof id !== "string") return false;
  if (kind === "rod") return isDangerousRodId(id);
  if (kind === "reel") return isDangerousReelId(id);
  if (kind === "line") return isDangerousLineId(id);
  return kind === "bait" && isDangerousBaitId(id);
}
