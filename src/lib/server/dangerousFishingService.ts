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
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
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
  type DangerousFishingAction,
} from "@/adventure/v2/dangerousFishingEncounter";
import {
  dangerousFishingEncounterModifiers,
  dangerousFishingHeritage,
} from "@/adventure/v2/dangerousFishingHeritage";
import {
  applyDangerousAccidentAndReturn,
  DANGEROUS_FISHING_SAVE_KEY,
  dangerousRiskPreview,
  parseDangerousFishingState,
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
  activeAutoGatheringActivity,
  lockAutoGatheringStatesForUpdate,
  readActiveAutoGatheringActivity,
} from "@/lib/server/lifeActivityLock";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";
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

function publicState(state: DangerousFishingState) {
  const bossAttempt = state.bossAttempt
    ? {
        ...state.bossAttempt,
        encounter: dangerousEncounterView(state.bossAttempt.encounter),
      }
    : null;
  if (!state.voyage?.encounter) return { ...state, bossAttempt };
  return {
    ...state,
    bossAttempt,
    voyage: {
      ...state.voyage,
      encounter: dangerousEncounterView(state.voyage.encounter),
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
  const dangerous = parseDangerousFishingState(
    await lockSaveForUpdate(tx, userId, DANGEROUS_FISHING_SAVE_KEY, {}),
  );
  const progress = parseFishingProgression(
    await lockSaveForUpdate(
      tx,
      userId,
      FISHING_PROGRESS_KEY,
      emptyFishingProgression(),
    ),
  );
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
    materials: mergeDrops(character.materials, returned.materials),
  };
}

export async function returnVoyageInTx(
  tx: DbExecutor,
  userId: string,
) {
  const state = parseDangerousFishingState(
    await lockSaveForUpdate(tx, userId, DANGEROUS_FISHING_SAVE_KEY, {}),
  );
  if (!state.voyage) return fail("no_voyage", 409);
  if (state.voyage.encounter) return fail("encounter_active", 409);
  const character = (await lockSaveForUpdate(
    tx,
    userId,
    "character.v2",
    {},
  )) as CharacterSave;
  const returned = returnDangerousVoyage(state);
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, returned.state);
  await upsertSave(
    tx,
    userId,
    "character.v2",
    settleReturnIntoCharacter(character, returned),
  );
  return { ok: true as const, status: 200, ...returned, state: publicState(returned.state) };
}

function pickFish(
  zoneId: DangerousZoneId,
  depthId: DangerousDepthId,
  baitId: DangerousBaitId,
  random: number,
): DangerousFish {
  let candidates = Object.values(DANGEROUS_FISH).filter(
    (fish) => fish.zoneId === zoneId && fish.depthId === depthId,
  );
  if (candidates.length === 0) {
    candidates = Object.values(DANGEROUS_FISH).filter(
      (fish) => fish.zoneId === zoneId,
    );
  }
  const bait = DANGEROUS_BAITS[baitId];
  const weighted = candidates.map((fish) => ({
    fish,
    weight:
      fish.spawnWeight *
      (bait.targetBehaviors.some((behavior) => fish.behaviorPattern.includes(behavior))
        ? 1.5
        : 1) *
      (fish.rarity === "epic" || fish.rarity === "legendary"
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

async function settleIncident(
  tx: DbExecutor,
  userId: string,
  state: DangerousFishingState,
  roll: number,
  cargoProtectionPct: number,
) {
  const incident = applyDangerousAccidentAndReturn(
    state,
    roll,
    cargoProtectionPct,
  );
  if (!incident.incident) return null;
  const character = (await lockSaveForUpdate(
    tx,
    userId,
    "character.v2",
    {},
  )) as CharacterSave;
  await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, incident.state);
  await upsertSave(
    tx,
    userId,
    "character.v2",
    settleReturnIntoCharacter(character, incident),
  );
  return {
    ok: true as const,
    status: 200,
    ...incident,
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
  let state = parseDangerousFishingState(
    await lockSaveForUpdate(tx, userId, DANGEROUS_FISHING_SAVE_KEY, {}),
  );
  if (!state.voyage) return fail("no_voyage", 409);
  if (state.voyage.encounter) return fail("encounter_active", 409);

  const progress = parseFishingProgression(
    await lockSaveForUpdate(
      tx,
      userId,
      FISHING_PROGRESS_KEY,
      emptyFishingProgression(),
    ),
  );
  const skills = parseV2SkillsState(
    await lockSaveForUpdate(tx, userId, "skills.v2", emptyV2SkillsState()),
  );
  const character = (await lockSaveForUpdate(
    tx,
    userId,
    "character.v2",
    {},
  )) as CharacterSave;
  const proficiency = parseProficiencyForChar(
    await lockSaveForUpdate(tx, userId, "proficiency.v2", {}),
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
  const incident = await settleIncident(
    tx,
    userId,
    state,
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

function caughtSize(fish: DangerousFish, random: number, sizeBonusPct: number) {
  const span = fish.maxSizeCm - fish.minSizeCm + 1;
  const base = fish.minSizeCm + Math.floor(Math.max(0, Math.min(0.999999, random)) * span);
  return Math.min(fish.maxSizeCm, Math.floor(base * (1 + sizeBonusPct / 100)));
}

export async function actOnEncounterInTx(
  tx: DbExecutor,
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
  const state = parseDangerousFishingState(
    await lockSaveForUpdate(tx, userId, DANGEROUS_FISHING_SAVE_KEY, {}),
  );
  const encounter = state.voyage?.encounter;
  if (!encounter || encounter.id !== args.encounterId) {
    return fail(
      state.resolvedEncounterIds.includes(args.encounterId)
        ? "stale"
        : "no_encounter",
      409,
    );
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
  let modifiers: ReturnType<typeof dangerousFishingEncounterModifiers> | null = null;
  let progress = null;
  let proficiency = null;
  let character: CharacterSave | null = null;
  let currentJobId: string | null = null;
  let walletRaw: unknown = {};

  if (transition.event === "caught") {
    progress = parseFishingProgression(
      await lockSaveForUpdate(
        tx,
        userId,
        FISHING_PROGRESS_KEY,
        emptyFishingProgression(),
      ),
    );
    const skills = parseV2SkillsState(
      await lockSaveForUpdate(tx, userId, "skills.v2", emptyV2SkillsState()),
    );
    character = (await lockSaveForUpdate(
      tx,
      userId,
      "character.v2",
      {},
    )) as CharacterSave;
    proficiency = parseProficiencyForChar(
      await lockSaveForUpdate(tx, userId, "proficiency.v2", {}),
      character,
    );
    walletRaw = await lockSaveForUpdate(tx, userId, FISHING_WALLET_KEY, {});
    const currentClass = parseV2Class(character.class);
    currentJobId = jobIdFromLegacy(
      currentClass,
      typeof character.specChoice === "string" ? character.specChoice : null,
    );
    const heritage = dangerousFishingHeritage({
      fishingProgression: progress,
      proficiency,
      currentJobId,
      equippedSkillIds: skills.equipped,
    });
    modifiers = dangerousFishingEncounterModifiers(heritage, state.loadout);
    const fish = DANGEROUS_FISH[encounter.targetId as keyof typeof DANGEROUS_FISH];
    caught = {
      fishId: fish.id,
      sizeCm: caughtSize(fish, args.random(), modifiers.sizeBonusPct),
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
  if (resolved.outcome !== "caught" || !caught || !progress || !proficiency) {
    return {
      ok: true as const,
      status: 200,
      event: transition.event,
      state: publicState(resolved.state),
      encounter: dangerousEncounterView(transition.encounter),
    };
  }

  const fish = DANGEROUS_FISH[caught.fishId];
  const nextProgress = { ...progress, xp: progress.xp + fish.fishingXp };
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
  const nextCoins = walletCoins(walletRaw) + fish.fishingCoinReward;
  const guard = recordActivityCompletion(
    parseActivityGuardState(
      await lockSaveForUpdate(tx, userId, ACTIVITY_GUARD_KEY, {}),
    ),
    "fishing",
    args.now,
  );
  await upsertSave(tx, userId, FISHING_PROGRESS_KEY, nextProgress);
  await upsertSave(tx, userId, "proficiency.v2", nextProficiency);
  await upsertSave(
    tx,
    userId,
    FISHING_WALLET_KEY,
    fishingWalletWithCoins(walletRaw, nextCoins),
  );
  await upsertSave(tx, userId, ACTIVITY_GUARD_KEY, guard.state);
  const risk = state.voyage?.risk ?? 0;
  const bossSpawn =
    risk >= 4 && (fish.rarity === "epic" || fish.rarity === "legendary")
      ? await maybeSpawnDangerousFishingBoss(
          drizzleDangerousFishingBossStore(tx),
          {
            userId,
            risk,
            rarity: fish.rarity,
            discoveryBonusPct: modifiers?.traceBonusPct ?? 0,
            now: new Date(args.now),
            random: args.random,
          },
        )
      : null;
  return {
    ok: true as const,
    status: 200,
    event: "caught" as const,
    state: publicState(resolved.state),
    fish: { id: fish.id, name: fish.name, sizeCm: caught.sizeCm },
    fishingXpGained: fish.fishingXp,
    masteryGained: highestFishingJobId ? 1 : 0,
    fishingCoinsGained: fish.fishingCoinReward,
    bossSpawn: bossSpawn
      ? {
          id: bossSpawn.id,
          bossId: bossSpawn.bossId,
          expiresAt: bossSpawn.expiresAt.getTime(),
        }
      : null,
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
  let state = parseDangerousFishingState(
    await lockSaveForUpdate(tx, userId, DANGEROUS_FISHING_SAVE_KEY, {}),
  );
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

  const walletRaw = await lockSaveForUpdate(tx, userId, FISHING_WALLET_KEY, {});
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
  callback: (tx: DbExecutor) => Promise<T>,
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
