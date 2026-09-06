import { V2_CLASS_DEFS, jobDisplayName, parseV2Class } from "@/adventure/data/v2/classes";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import {
  gridDungeonDayKey,
  parseGridDungeonSupportRole,
  type GridDungeonSupportRole,
  type GridDungeonSupporterSnapshot,
} from "@/adventure/data/v2/gridDungeon";
import { parseHonor, parseHonorEarned } from "@/adventure/data/v2/honor";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
  smartDefaultPatternFromEquipped,
} from "@/adventure/data/v2/v2Skills";
import { guildMembers, guilds, savesKv } from "@/db/schema";
import { derivePlayerCombatV2 } from "./derivePlayerCombatV2";
import { lockSaveForUpdate, upsertSave, type DbExecutor } from "./savesKv";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

export type CharSave = {
  gold?: number;
  bankedGold?: number;
  tilePos?: { col?: number; row?: number; at?: number };
  hp?: number;
  mp?: number;
  hpRegenSince?: number;
  element?: unknown;
  materials?: unknown;
  [k: string]: unknown;
};


export type GridDungeonSupportCandidate = {
  userId: string;
  name: string;
  level: number;
  job: string;
  supportLimit: number;
  supportRemaining: number;
  supportRole: GridDungeonSupportRole | null;
};


export type GridDungeonSupportDaily = {
  dayKey: string;
  used: number;
  rewarded: number;
};


export type GridDungeonSupportProfile = {
  role: GridDungeonSupportRole | null;
  updatedAt: number;
};


export const GRID_DUNGEON_SUPPORT_DAILY_KEY =
  "grid-dungeon-support-daily.v2" as const;

export const GRID_DUNGEON_SUPPORT_PROFILE_KEY =
  "grid-dungeon-support-profile.v2" as const;

export const GRID_DUNGEON_SUPPORT_DAILY_USE_LIMIT = 5;

export const GRID_DUNGEON_SUPPORT_DAILY_REWARD_LIMIT = 5;

export const GRID_DUNGEON_SUPPORT_HONOR_REWARD = 5;


export function parseSupporterIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 2) break;
  }
  return ids;
}


export function normalizeGridDungeonFrontlineId({
  raw,
  userId,
  supporterIds,
}: {
  raw: unknown;
  userId: string;
  supporterIds: string[];
}) {
  if (raw === "main" || raw === userId) return userId;
  return typeof raw === "string" && supporterIds.includes(raw) ? raw : userId;
}


export function lockOrderedUserIds(userIds: string[]): string[] {
  return [...userIds].sort();
}


export function displayJobFromCharacter(raw: unknown): string {
  const char = raw as { class?: unknown; specChoice?: unknown } | null;
  const cls = parseV2Class(char?.class);
  const spec = typeof char?.specChoice === "string" ? char.specChoice : null;
  return V2_CORE_LOOP_V2
    ? jobDisplayName(cls, spec)
    : cls === "none"
      ? "모험가"
      : (V2_CLASS_DEFS[cls]?.name ?? "모험가");
}


export function parseGridDungeonSupportDaily(
  raw: unknown,
  now = Date.now(),
): GridDungeonSupportDaily {
  const today = gridDungeonDayKey(now);
  if (!raw || typeof raw !== "object") {
    return { dayKey: today, used: 0, rewarded: 0 };
  }
  const save = raw as Partial<GridDungeonSupportDaily>;
  if (save.dayKey !== today) return { dayKey: today, used: 0, rewarded: 0 };
  return {
    dayKey: today,
    used: Math.max(0, Math.floor(Number(save.used) || 0)),
    rewarded: Math.max(0, Math.floor(Number(save.rewarded) || 0)),
  };
}


export function parseGridDungeonSupportProfile(
  raw: unknown,
): GridDungeonSupportProfile {
  if (!raw || typeof raw !== "object") return { role: null, updatedAt: 0 };
  const save = raw as Partial<GridDungeonSupportProfile>;
  return {
    role: parseGridDungeonSupportRole(save.role),
    updatedAt: Math.max(0, Math.floor(Number(save.updatedAt) || 0)),
  };
}


export async function readSupportDailyByUser(
  executor: DbExecutor,
  userIds: string[],
  now = Date.now(),
): Promise<Map<string, GridDungeonSupportDaily>> {
  const result = new Map<string, GridDungeonSupportDaily>();
  if (userIds.length === 0) return result;
  const rows = await executor
    .select({ userId: savesKv.userId, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        inArray(savesKv.userId, userIds),
        eq(savesKv.key, GRID_DUNGEON_SUPPORT_DAILY_KEY),
      ),
    );
  for (const row of rows) {
    result.set(row.userId, parseGridDungeonSupportDaily(row.value, now));
  }
  return result;
}


export async function reserveGridDungeonSupportUses({
  tx,
  supporterIds,
  now,
}: {
  tx: DbExecutor;
  supporterIds: string[];
  now: number;
}): Promise<{ ok: true } | { ok: false; error: "support_limit_reached" }> {
  for (const supporterId of lockOrderedUserIds(supporterIds)) {
    const raw = await lockSaveForUpdate(
      tx,
      supporterId,
      GRID_DUNGEON_SUPPORT_DAILY_KEY,
      null,
    );
    const daily = parseGridDungeonSupportDaily(raw, now);
    if (daily.used >= GRID_DUNGEON_SUPPORT_DAILY_USE_LIMIT) {
      return { ok: false, error: "support_limit_reached" };
    }
    await upsertSave(tx, supporterId, GRID_DUNGEON_SUPPORT_DAILY_KEY, {
      ...daily,
      used: daily.used + 1,
    });
  }
  return { ok: true };
}


export async function rewardGridDungeonSupporters({
  tx,
  supporters,
  now,
}: {
  tx: DbExecutor;
  supporters: GridDungeonSupporterSnapshot[];
  now: number;
}) {
  const supportersByLockOrder = [...supporters].sort((a, b) =>
    a.userId.localeCompare(b.userId),
  );
  for (const supporter of supportersByLockOrder) {
    const raw = await lockSaveForUpdate(
      tx,
      supporter.userId,
      GRID_DUNGEON_SUPPORT_DAILY_KEY,
      null,
    );
    const daily = parseGridDungeonSupportDaily(raw, now);
    if (daily.rewarded >= GRID_DUNGEON_SUPPORT_DAILY_REWARD_LIMIT) continue;
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      supporter.userId,
      "character.v2",
      {},
    );
    const honorBefore = parseHonor(charSave.honor);
    await upsertSave(tx, supporter.userId, "character.v2", {
      ...charSave,
      honor: honorBefore + GRID_DUNGEON_SUPPORT_HONOR_REWARD,
      honorEarned:
        parseHonorEarned(charSave.honorEarned, honorBefore) +
        GRID_DUNGEON_SUPPORT_HONOR_REWARD,
    });
    const member = (
      await tx
        .select({ guildId: guildMembers.guildId })
        .from(guildMembers)
        .where(eq(guildMembers.userId, supporter.userId))
        .limit(1)
    )[0];
    if (member) {
      await tx
        .update(guilds)
        .set({
          fameTotal: sql`${guilds.fameTotal} + ${GRID_DUNGEON_SUPPORT_HONOR_REWARD}`,
          fameAvailable: sql`${guilds.fameAvailable} + ${GRID_DUNGEON_SUPPORT_HONOR_REWARD}`,
        })
        .where(eq(guilds.id, member.guildId));
    }
    await upsertSave(tx, supporter.userId, GRID_DUNGEON_SUPPORT_DAILY_KEY, {
      ...daily,
      rewarded: daily.rewarded + 1,
    });
  }
}


export async function guildSupportCandidateRows(
  executor: DbExecutor,
  userId: string,
  now = Date.now(),
): Promise<GridDungeonSupportCandidate[]> {
  const mem = (
    await executor
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  if (!mem) return [];
  const members = await executor
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(and(eq(guildMembers.guildId, mem.guildId), ne(guildMembers.userId, userId)));
  const ids = members.map((m) => m.userId);
  if (ids.length === 0) return [];
  const rows = await executor
    .select({ userId: savesKv.userId, key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        inArray(savesKv.userId, ids),
        inArray(savesKv.key, [
          "character-profile.v2",
          "character.v2",
          GRID_DUNGEON_SUPPORT_PROFILE_KEY,
        ]),
      ),
    );
  const nameByUser = new Map<string, string>();
  const charByUser = new Map<string, unknown>();
  const supportProfileByUser = new Map<string, GridDungeonSupportProfile>();
  const dailyByUser = await readSupportDailyByUser(executor, ids, now);
  for (const row of rows) {
    if (row.key === "character-profile.v2") {
      const profile = row.value as { name?: string } | null;
      const name = profile?.name?.trim();
      if (name) nameByUser.set(row.userId, name);
    } else if (row.key === "character.v2") {
      charByUser.set(row.userId, row.value);
    } else if (row.key === GRID_DUNGEON_SUPPORT_PROFILE_KEY) {
      supportProfileByUser.set(
        row.userId,
        parseGridDungeonSupportProfile(row.value),
      );
    }
  }
  return ids
    .map((id) => {
      const char = charByUser.get(id) as { level?: number } | undefined;
      return {
        userId: id,
        name: nameByUser.get(id) ?? "모험가",
        level: Math.max(1, Math.floor(Number(char?.level) || 1)),
        job: displayJobFromCharacter(char),
        supportLimit: GRID_DUNGEON_SUPPORT_DAILY_USE_LIMIT,
        supportRemaining: Math.max(
          0,
          GRID_DUNGEON_SUPPORT_DAILY_USE_LIMIT -
            (dailyByUser.get(id)?.used ?? 0),
        ),
        supportRole: supportProfileByUser.get(id)?.role ?? null,
      };
    })
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "ko-KR"));
}


export async function gridDungeonSupportSnapshots({
  tx,
  userId,
  supporterIds,
  now,
}: {
  tx: DbExecutor;
  userId: string;
  supporterIds: string[];
  now: number;
}): Promise<
  | { ok: true; supporters: GridDungeonSupporterSnapshot[] }
  | { ok: false; error: "not_in_guild" | "invalid_supporter" }
> {
  if (supporterIds.length === 0) return { ok: true, supporters: [] };
  const mem = (
    await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  if (!mem) return { ok: false, error: "not_in_guild" };
  const validRows = await tx
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(
      and(
        eq(guildMembers.guildId, mem.guildId),
        inArray(guildMembers.userId, supporterIds),
        ne(guildMembers.userId, userId),
      ),
    );
  const valid = new Set(validRows.map((row) => row.userId));
  if (valid.size !== supporterIds.length) {
    return { ok: false, error: "invalid_supporter" };
  }
  const candidates = await guildSupportCandidateRows(tx, userId);
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.userId, candidate]),
  );
  const supporterById = new Map<string, GridDungeonSupporterSnapshot>();
  for (const supporterId of lockOrderedUserIds(supporterIds)) {
    const skillsRaw = await lockSaveForUpdate(
      tx,
      supporterId,
      "skills.v2",
      emptyV2SkillsState(),
    );
    const skills = parseV2SkillsState(skillsRaw);
    const derived = await derivePlayerCombatV2(supporterId, tx, {
      skillsRaw: skills,
    });
    const candidate = candidateById.get(supporterId);
    if (!derived || !candidate) {
      return { ok: false, error: "invalid_supporter" };
    }
    const savedPattern = skills.pattern ?? { blocks: [] };
    const pattern =
      savedPattern.blocks.length > 0
        ? savedPattern
        : smartDefaultPatternFromEquipped(skills.equipped);
    supporterById.set(supporterId, {
      userId: supporterId,
      name: candidate.name,
      level: candidate.level,
      job: candidate.job,
      supportRole: candidate.supportRole,
      maxHp: derived.player.maxHp,
      maxMp: derived.player.maxMp ?? 0,
      mp: derived.player.mp ?? derived.player.maxMp ?? 0,
      atk: derived.player.atk,
      magicAtk: derived.player.magicAtk ?? 0,
      str: derived.player.strStat ?? 0,
      int: derived.player.intStat ?? 0,
      spi: derived.player.spiStat ?? 0,
      def: derived.player.def,
      spd: derived.player.spd,
      healMult: derived.player.healMult ?? 1,
      element: derived.player.characterElement ?? "neutral",
      skills: skills.equipped,
      pattern,
      capturedAt: now,
    });
  }
  const supporters: GridDungeonSupporterSnapshot[] = [];
  for (const supporterId of supporterIds) {
    const supporter = supporterById.get(supporterId);
    if (!supporter) return { ok: false, error: "invalid_supporter" };
    supporters.push(supporter);
  }
  return { ok: true, supporters };
}
