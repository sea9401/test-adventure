import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, lte } from "drizzle-orm";
import type { DbExecutor } from "@/lib/server/savesKv";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  dangerousFishingBossContributions,
  dangerousFishingBossEvents,
  users,
} from "@/db/schema";
import {
  DANGEROUS_BOSSES,
  dangerousBossMaterialId,
  isDangerousBossId,
  type DangerousBossId,
  type DangerousFishRarity,
} from "@/adventure/data/v2/dangerousFishing";
import {
  applyDangerousEncounterAction,
  createDangerousEncounter,
  dangerousEncounterView,
  type DangerousFishingAction,
} from "@/adventure/v2/dangerousFishingEncounter";
import {
  DANGEROUS_FISHING_SAVE_KEY,
  parseDangerousFishingState,
  type DangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import {
  dangerousFishingEncounterModifiers,
  dangerousFishingHeritage,
  type DangerousFishingHeritage,
} from "@/adventure/v2/dangerousFishingHeritage";
import {
  emptyFishingProgression,
  FISHING_PROGRESS_KEY,
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { parseProficiencyForChar } from "@/adventure/data/v2/proficiency";
import { parseV2Class } from "@/adventure/data/v2/classes";
import { jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import {
  FISHING_WALLET_KEY,
  fishingWalletWithCoins,
  walletCoins,
} from "@/lib/server/fishing/coins";

export const DANGEROUS_BOSS_EVENT_DURATION_MS = 6 * 60 * 60_000;
export const DANGEROUS_BOSS_DISCOVERY_CHANCE = 0.08;

export type DangerousFishingBossEventStatus =
  | "active"
  | "defeated"
  | "expired";

export type DangerousFishingBossEventRecord = {
  id: string;
  bossId: DangerousBossId;
  discovererId: string | null;
  maxStamina: number;
  stamina: number;
  status: DangerousFishingBossEventStatus;
  spawnedAt: Date;
  expiresAt: Date;
  defeatedAt: Date | null;
  lastHaulUserId: string | null;
};

export type DangerousFishingBossContributionRecord = {
  eventId: string;
  userId: string;
  totalContribution: number;
  successfulAttempts: number;
  firstContributedAt: Date;
  lastContributedAt: Date;
  rewardClaimedAt: Date | null;
};

export interface DangerousFishingBossStore {
  findActive(now: Date): Promise<DangerousFishingBossEventRecord | null>;
  findLatest(): Promise<DangerousFishingBossEventRecord | null>;
  expireActive(now: Date): Promise<void>;
  createEvent(event: DangerousFishingBossEventRecord): Promise<boolean>;
  eventForUpdate(eventId: string): Promise<DangerousFishingBossEventRecord | null>;
  saveEvent(event: DangerousFishingBossEventRecord): Promise<void>;
  contributionForUpdate(
    eventId: string,
    userId: string,
  ): Promise<DangerousFishingBossContributionRecord | null>;
  saveContribution(
    contribution: DangerousFishingBossContributionRecord,
  ): Promise<void>;
  dangerousStateForUpdate(userId: string): Promise<DangerousFishingState>;
  heritageForUpdate(userId: string): Promise<DangerousFishingHeritage>;
  saveDangerousState(userId: string, state: DangerousFishingState): Promise<void>;
  characterForUpdate(userId: string): Promise<Record<string, unknown>>;
  saveCharacter(userId: string, character: Record<string, unknown>): Promise<void>;
  walletForUpdate(userId: string): Promise<unknown>;
  saveWallet(userId: string, wallet: unknown): Promise<void>;
}

function mapEvent(
  row: typeof dangerousFishingBossEvents.$inferSelect,
): DangerousFishingBossEventRecord | null {
  if (!isDangerousBossId(row.bossId)) return null;
  if (
    row.status !== "active" &&
    row.status !== "defeated" &&
    row.status !== "expired"
  ) {
    return null;
  }
  return {
    id: row.id,
    bossId: row.bossId,
    discovererId: row.discovererId,
    maxStamina: row.maxStamina,
    stamina: row.stamina,
    status: row.status,
    spawnedAt: row.spawnedAt,
    expiresAt: row.expiresAt,
    defeatedAt: row.defeatedAt,
    lastHaulUserId: row.lastHaulUserId,
  };
}

function mapContribution(
  row: typeof dangerousFishingBossContributions.$inferSelect,
): DangerousFishingBossContributionRecord {
  return {
    eventId: row.eventId,
    userId: row.userId,
    totalContribution: row.totalContribution,
    successfulAttempts: row.successfulAttempts,
    firstContributedAt: row.firstContributedAt,
    lastContributedAt: row.lastContributedAt,
    rewardClaimedAt: row.rewardClaimedAt,
  };
}

export function drizzleDangerousFishingBossStore(
  tx: DbExecutor,
): DangerousFishingBossStore {
  return {
    async findActive(now) {
      const [row] = await tx
        .select()
        .from(dangerousFishingBossEvents)
        .where(
          and(
            eq(dangerousFishingBossEvents.status, "active"),
            gt(dangerousFishingBossEvents.expiresAt, now),
          ),
        )
        .orderBy(desc(dangerousFishingBossEvents.spawnedAt))
        .limit(1);
      return row ? mapEvent(row) : null;
    },
    async findLatest() {
      const [row] = await tx
        .select()
        .from(dangerousFishingBossEvents)
        .orderBy(desc(dangerousFishingBossEvents.spawnedAt))
        .limit(1);
      return row ? mapEvent(row) : null;
    },
    async expireActive(now) {
      await tx
        .update(dangerousFishingBossEvents)
        .set({ status: "expired" })
        .where(
          and(
            eq(dangerousFishingBossEvents.status, "active"),
            lte(dangerousFishingBossEvents.expiresAt, now),
          ),
        );
    },
    async createEvent(event) {
      const rows = await tx
        .insert(dangerousFishingBossEvents)
        .values(event)
        .onConflictDoNothing()
        .returning({ id: dangerousFishingBossEvents.id });
      return rows.length === 1;
    },
    async eventForUpdate(eventId) {
      const [row] = await tx
        .select()
        .from(dangerousFishingBossEvents)
        .where(eq(dangerousFishingBossEvents.id, eventId))
        .for("update")
        .limit(1);
      return row ? mapEvent(row) : null;
    },
    async saveEvent(event) {
      await tx
        .update(dangerousFishingBossEvents)
        .set({
          stamina: event.stamina,
          status: event.status,
          defeatedAt: event.defeatedAt,
          lastHaulUserId: event.lastHaulUserId,
        })
        .where(eq(dangerousFishingBossEvents.id, event.id));
    },
    async contributionForUpdate(eventId, userId) {
      const [row] = await tx
        .select()
        .from(dangerousFishingBossContributions)
        .where(
          and(
            eq(dangerousFishingBossContributions.eventId, eventId),
            eq(dangerousFishingBossContributions.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      return row ? mapContribution(row) : null;
    },
    async saveContribution(contribution) {
      await tx
        .insert(dangerousFishingBossContributions)
        .values(contribution)
        .onConflictDoUpdate({
          target: [
            dangerousFishingBossContributions.eventId,
            dangerousFishingBossContributions.userId,
          ],
          set: {
            totalContribution: contribution.totalContribution,
            successfulAttempts: contribution.successfulAttempts,
            lastContributedAt: contribution.lastContributedAt,
            rewardClaimedAt: contribution.rewardClaimedAt,
          },
        });
    },
    async dangerousStateForUpdate(userId) {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for("update")
        .limit(1);
      return parseDangerousFishingState(
        await lockSaveForUpdate(tx, userId, DANGEROUS_FISHING_SAVE_KEY, {}),
      );
    },
    async saveDangerousState(userId, state) {
      await upsertSave(tx, userId, DANGEROUS_FISHING_SAVE_KEY, state);
    },
    async heritageForUpdate(userId) {
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
      const character = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const proficiency = parseProficiencyForChar(
        await lockSaveForUpdate(tx, userId, "proficiency.v2", {}),
        character,
      );
      const currentClass = parseV2Class(character.class);
      return dangerousFishingHeritage({
        fishingProgression: progress,
        proficiency,
        currentJobId: jobIdFromLegacy(
          currentClass,
          typeof character.specChoice === "string"
            ? character.specChoice
            : null,
        ),
        equippedSkillIds: skills.equipped,
      });
    },
    async characterForUpdate(userId) {
      return lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "character.v2",
        {},
      );
    },
    async saveCharacter(userId, character) {
      await upsertSave(tx, userId, "character.v2", character);
    },
    async walletForUpdate(userId) {
      return lockSaveForUpdate(tx, userId, FISHING_WALLET_KEY, {});
    },
    async saveWallet(userId, wallet) {
      await upsertSave(tx, userId, FISHING_WALLET_KEY, wallet);
    },
  };
}

export async function activeDangerousFishingBoss(
  store: DangerousFishingBossStore,
  now: Date,
): Promise<DangerousFishingBossEventRecord | null> {
  await store.expireActive(now);
  return store.findActive(now);
}

export async function readDangerousFishingBossView(
  store: DangerousFishingBossStore,
  userId: string,
  now: Date,
) {
  await store.expireActive(now);
  const event = await store.findLatest();
  const state = await store.dangerousStateForUpdate(userId);
  if (!event) {
    return {
      ok: true as const,
      now: now.getTime(),
      event: null,
      contribution: null,
      attempt: null,
      eligible: false,
      claimed: false,
      rewardPreview: null,
    };
  }
  const contribution = await store.contributionForUpdate(event.id, userId);
  const rewardPreview = contribution
    ? dangerousBossReward(
        contribution.successfulAttempts,
        contribution.totalContribution,
        event.maxStamina,
        event.discovererId === userId,
      )
    : null;
  return {
    ok: true as const,
    now: now.getTime(),
    event: {
      id: event.id,
      bossId: event.bossId,
      name: DANGEROUS_BOSSES[event.bossId].name,
      stamina: event.stamina,
      maxStamina: event.maxStamina,
      status: event.status,
      spawnedAt: event.spawnedAt.getTime(),
      expiresAt: event.expiresAt.getTime(),
      defeatedAt: event.defeatedAt?.getTime() ?? null,
      isDiscoverer: event.discovererId === userId,
      isLastHaul: event.lastHaulUserId === userId,
    },
    contribution: contribution
      ? {
          totalContribution: contribution.totalContribution,
          successfulAttempts: contribution.successfulAttempts,
          rewardClaimedAt: contribution.rewardClaimedAt?.getTime() ?? null,
        }
      : null,
    attempt:
      state.bossAttempt?.eventId === event.id
        ? {
            eventId: event.id,
            encounter: dangerousEncounterView(state.bossAttempt.encounter),
          }
        : null,
    eligible: (contribution?.successfulAttempts ?? 0) > 0,
    claimed: contribution?.rewardClaimedAt != null,
    rewardPreview,
  };
}

export async function maybeSpawnDangerousFishingBoss(
  store: DangerousFishingBossStore,
  args: {
    userId: string;
    risk: number;
    rarity: DangerousFishRarity;
    discoveryBonusPct?: number;
    now: Date;
    random?: () => number;
    eventId?: string;
  },
): Promise<DangerousFishingBossEventRecord | null> {
  if (
    args.risk < 4 ||
    (args.rarity !== "epic" && args.rarity !== "legendary")
  ) {
    return null;
  }
  const random = args.random ?? Math.random;
  const discoveryBonusPct = Math.max(
    0,
    Math.min(20, args.discoveryBonusPct ?? 0),
  );
  const discoveryChance =
    DANGEROUS_BOSS_DISCOVERY_CHANCE * (1 + discoveryBonusPct / 100);
  if (random() >= discoveryChance) return null;
  const active = await activeDangerousFishingBoss(store, args.now);
  if (active) return null;
  const bossId: DangerousBossId =
    args.risk >= 5 && args.rarity === "legendary" && random() < 0.45
      ? "abyss_kraken"
      : "tidal_colossus";
  const boss = DANGEROUS_BOSSES[bossId];
  const event: DangerousFishingBossEventRecord = {
    id: args.eventId ?? randomUUID(),
    bossId,
    discovererId: args.userId,
    maxStamina: boss.eventStamina,
    stamina: boss.eventStamina,
    status: "active",
    spawnedAt: args.now,
    expiresAt: new Date(args.now.getTime() + DANGEROUS_BOSS_EVENT_DURATION_MS),
    defeatedAt: null,
    lastHaulUserId: null,
  };
  return (await store.createEvent(event)) ? event : store.findActive(args.now);
}

function eventError(event: DangerousFishingBossEventRecord | null, now: Date) {
  if (!event) return "not_found" as const;
  if (event.status === "defeated" || event.stamina <= 0) {
    return "already_defeated" as const;
  }
  if (event.status === "expired" || event.expiresAt <= now) {
    return "expired" as const;
  }
  return null;
}

export async function startBossAttemptInTx(
  store: DangerousFishingBossStore,
  args: {
    userId: string;
    eventId: string;
    now: Date;
    random?: () => number;
    encounterId?: string;
  },
) {
  const state = await store.dangerousStateForUpdate(args.userId);
  if (state.bossAttempt || state.voyage?.encounter) {
    return { ok: false as const, error: "encounter_active" as const };
  }
  const heritage = await store.heritageForUpdate(args.userId);
  if (!heritage.unlocked) {
    return { ok: false as const, error: "fishing_level_locked" as const };
  }
  const event = await store.eventForUpdate(args.eventId);
  const error = eventError(event, args.now);
  if (error) return { ok: false as const, error };
  const validEvent = event as DangerousFishingBossEventRecord;
  const boss = DANGEROUS_BOSSES[validEvent.bossId];
  const modifiers = dangerousFishingEncounterModifiers(
    heritage,
    state.loadout,
  );
  const encounter = createDangerousEncounter({
    id: args.encounterId ?? randomUUID(),
    targetKind: "boss",
    target: {
      id: boss.id,
      stamina: boss.attemptStamina,
      distance: boss.attemptDistance,
      baseTension: boss.baseTension,
      behaviorPattern: boss.behaviorPattern,
    },
    rod: modifiers.rod,
    reel: modifiers.reel,
    line: modifiers.line,
    startedAt: args.now.getTime(),
    patternSeed: Math.floor((args.random ?? Math.random)() * 2 ** 31),
    assistance: {
      ...modifiers.assistance,
      telegraphSteps: modifiers.telegraphSteps,
    },
  });
  const nextState: DangerousFishingState = {
    ...state,
    bossAttempt: { eventId: validEvent.id, encounter },
  };
  await store.saveDangerousState(args.userId, nextState);
  return {
    ok: true as const,
    event: validEvent,
    encounter: dangerousEncounterView(encounter),
  };
}

export async function applyBossActionInTx(
  store: DangerousFishingBossStore,
  args: {
    userId: string;
    eventId: string;
    encounterId: string;
    revision: number;
    action: DangerousFishingAction;
    now: Date;
  },
) {
  const state = await store.dangerousStateForUpdate(args.userId);
  const attempt = state.bossAttempt;
  if (
    !attempt ||
    attempt.eventId !== args.eventId ||
    attempt.encounter.id !== args.encounterId
  ) {
    return { ok: false as const, error: "no_attempt" as const };
  }
  const event = await store.eventForUpdate(args.eventId);
  const error = eventError(event, args.now);
  if (error) {
    await store.saveDangerousState(args.userId, { ...state, bossAttempt: null });
    return { ok: false as const, error };
  }
  const validEvent = event as DangerousFishingBossEventRecord;
  const transition = applyDangerousEncounterAction(
    attempt.encounter,
    args.action,
    args.now.getTime(),
    args.revision,
  );
  if (transition.event === "stale" || transition.event === "too_fast") {
    return { ok: false as const, error: transition.event };
  }
  if (transition.event === "progress") {
    await store.saveDangerousState(args.userId, {
      ...state,
      bossAttempt: { ...attempt, encounter: transition.encounter },
    });
    return {
      ok: true as const,
      event: transition.event,
      encounter: dangerousEncounterView(transition.encounter),
    };
  }

  await store.saveDangerousState(args.userId, { ...state, bossAttempt: null });
  if (transition.event !== "caught") {
    return {
      ok: true as const,
      event: transition.event,
      contribution: 0,
      defeated: false,
    };
  }

  const boss = DANGEROUS_BOSSES[validEvent.bossId];
  const contribution = Math.min(validEvent.stamina, boss.attemptStamina);
  const defeated = validEvent.stamina - contribution <= 0;
  const nextEvent: DangerousFishingBossEventRecord = {
    ...validEvent,
    stamina: Math.max(0, validEvent.stamina - contribution),
    status: defeated ? "defeated" : "active",
    defeatedAt: defeated ? args.now : null,
    lastHaulUserId: defeated ? args.userId : validEvent.lastHaulUserId,
  };
  await store.saveEvent(nextEvent);
  const previous = await store.contributionForUpdate(args.eventId, args.userId);
  const nextContribution: DangerousFishingBossContributionRecord = previous
    ? {
        ...previous,
        totalContribution: previous.totalContribution + contribution,
        successfulAttempts: previous.successfulAttempts + 1,
        lastContributedAt: args.now,
      }
    : {
        eventId: args.eventId,
        userId: args.userId,
        totalContribution: contribution,
        successfulAttempts: 1,
        firstContributedAt: args.now,
        lastContributedAt: args.now,
        rewardClaimedAt: null,
      };
  await store.saveContribution(nextContribution);
  return {
    ok: true as const,
    event: "caught" as const,
    contribution,
    totalContribution: nextContribution.totalContribution,
    defeated,
    publicStamina: nextEvent.stamina,
  };
}

export type DangerousBossReward = {
  tier: "base" | "silver" | "gold" | "legend";
  fishingCoins: number;
  materialCount: number;
  discovererBonus: boolean;
};

export function dangerousBossReward(
  successfulAttempts: number,
  totalContribution: number,
  maxStamina: number,
  discoverer: boolean,
): DangerousBossReward | null {
  if (successfulAttempts <= 0 || totalContribution <= 0) return null;
  const ratio = totalContribution / Math.max(1, maxStamina);
  const base =
    ratio >= 0.1
      ? { tier: "legend" as const, fishingCoins: 220, materialCount: 4 }
      : ratio >= 0.05
        ? { tier: "gold" as const, fishingCoins: 190, materialCount: 3 }
        : ratio >= 0.02
          ? { tier: "silver" as const, fishingCoins: 140, materialCount: 2 }
          : { tier: "base" as const, fishingCoins: 80, materialCount: 1 };
  return {
    ...base,
    fishingCoins: base.fishingCoins + (discoverer ? 40 : 0),
    materialCount: base.materialCount + (discoverer ? 1 : 0),
    discovererBonus: discoverer,
  };
}

export async function claimBossRewardInTx(
  store: DangerousFishingBossStore,
  args: { userId: string; eventId: string; now: Date },
) {
  const state = await store.dangerousStateForUpdate(args.userId);
  const event = await store.eventForUpdate(args.eventId);
  if (!event) return { ok: false as const, error: "not_found" as const };
  if (event.status !== "defeated" || event.stamina > 0) {
    return { ok: false as const, error: "not_defeated" as const };
  }
  const contribution = await store.contributionForUpdate(
    args.eventId,
    args.userId,
  );
  if (!contribution || contribution.successfulAttempts <= 0) {
    return { ok: false as const, error: "no_contribution" as const };
  }
  const reward = dangerousBossReward(
    contribution.successfulAttempts,
    contribution.totalContribution,
    event.maxStamina,
    event.discovererId === args.userId,
  );
  if (!reward) return { ok: false as const, error: "no_contribution" as const };
  if (contribution.rewardClaimedAt) {
    return { ok: true as const, alreadyClaimed: true, reward };
  }

  const character = await store.characterForUpdate(args.userId);
  const wallet = await store.walletForUpdate(args.userId);
  const materialId = dangerousBossMaterialId(event.bossId);
  await store.saveCharacter(args.userId, {
    ...character,
    materials: mergeDrops(character.materials, {
      [materialId]: reward.materialCount,
    }),
  });
  await store.saveWallet(
    args.userId,
    fishingWalletWithCoins(wallet, walletCoins(wallet) + reward.fishingCoins),
  );
  const previousCodex = state.bossCodex[event.bossId];
  await store.saveDangerousState(args.userId, {
    ...state,
    bossCodex: {
      ...state.bossCodex,
      [event.bossId]: {
        defeats: (previousCodex?.defeats ?? 0) + 1,
        firstDefeatedAt: previousCodex?.firstDefeatedAt ?? args.now.getTime(),
        lastDefeatedAt: args.now.getTime(),
        bestContribution: Math.max(
          previousCodex?.bestContribution ?? 0,
          contribution.totalContribution,
        ),
      },
    },
  });
  await store.saveContribution({
    ...contribution,
    rewardClaimedAt: args.now,
  });
  return {
    ok: true as const,
    alreadyClaimed: false,
    reward,
    materialId,
    lastHaul: event.lastHaulUserId === args.userId,
  };
}
