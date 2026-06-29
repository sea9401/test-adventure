import { db } from "@/db";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { guildMembers, guilds, savesKv } from "@/db/schema";
import type { Monster } from "@/adventure/data/monsters/types";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { enemiesForDepth } from "@/adventure/data/v2/dungeon";
import { scaleMonsterForFloor } from "@/adventure/data/v2/monsterScale";
import {
  V2_ELEMENT_ADV_PCT,
  V2_ELEMENT_DIS_PCT,
  elementDamageMult,
  parseV2Element,
} from "@/adventure/data/v2/elements";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
  smartDefaultPatternFromEquipped,
} from "@/adventure/data/v2/v2Skills";
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import {
  V2_CLASS_DEFS,
  jobDisplayName,
  parseV2Class,
} from "@/adventure/data/v2/classes";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { parseHonor, parseHonorEarned } from "@/adventure/data/v2/honor";
import { mergeDrops, type DropResult } from "@/adventure/data/v2/dungeonDrops";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";
import { sanitizeCombatLoadout } from "@/lib/server/v2Skills";
import {
  GRID_DUNGEON_DAILY_REWARDS_KEY,
  GRID_DUNGEON_ENTRANCE,
  GRID_DUNGEON_HISTORY_KEY,
  GRID_DUNGEON_SAVE_KEY,
  appendGridDungeonHistory,
  createGridDungeonRun,
  gridDungeonDayKey,
  gridDungeonKey,
  gridDungeonRewardQuota,
  gridDungeonTileAt,
  isGridDungeonCombatTile,
  isAtGridDungeonEntrance,
  moveGridDungeonRun,
  parseGridDungeonDailyRewards,
  parseGridDungeonHistory,
  parseGridDungeonRun,
  parseGridDungeonSupportRole,
  rollGridDungeonDrops,
  withGridDungeonLayout,
  type GridDungeonMoveDir,
  type GridDungeonResolvedCombat,
  type GridDungeonRun,
  type GridDungeonSupportRole,
  type GridDungeonSupporterSnapshot,
  type GridDungeonTileKind,
} from "@/adventure/data/v2/gridDungeon";
import {
  GRID_DUNGEON_PARTY_SCALING,
  makeGridDungeonPartyActor,
  resolveGridDungeonPartyCombat,
} from "@/adventure/data/v2/gridDungeonCombat";

type CharSave = {
  gold?: number;
  bankedGold?: number;
  tilePos?: { col?: number; row?: number; at?: number };
  hp?: number;
  mp?: number;
  element?: unknown;
  materials?: unknown;
  [k: string]: unknown;
};

type GridDungeonAction =
  | { action?: "start"; supporterIds?: unknown; frontlineId?: unknown }
  | { action?: "move"; dir?: GridDungeonMoveDir }
  | { action?: "claim" }
  | { action?: "abandon" }
  | { action?: "support-profile"; role?: unknown };

type GridDungeonSupportCandidate = {
  userId: string;
  name: string;
  level: number;
  job: string;
  supportLimit: number;
  supportRemaining: number;
  supportRole: GridDungeonSupportRole | null;
};

type GridDungeonSupportDaily = {
  dayKey: string;
  used: number;
  rewarded: number;
};

type GridDungeonSupportProfile = {
  role: GridDungeonSupportRole | null;
  updatedAt: number;
};

const GRID_DUNGEON_SUPPORT_DAILY_KEY =
  "grid-dungeon-support-daily.v2" as const;
const GRID_DUNGEON_SUPPORT_PROFILE_KEY =
  "grid-dungeon-support-profile.v2" as const;
const GRID_DUNGEON_SUPPORT_DAILY_USE_LIMIT = 5;
const GRID_DUNGEON_SUPPORT_DAILY_REWARD_LIMIT = 5;
const GRID_DUNGEON_SUPPORT_HONOR_REWARD = 5;

function parseSupporterIds(raw: unknown): string[] {
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

function normalizeGridDungeonFrontlineId({
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

function displayJobFromCharacter(raw: unknown): string {
  const char = raw as { class?: unknown; specChoice?: unknown } | null;
  const cls = parseV2Class(char?.class);
  const spec = typeof char?.specChoice === "string" ? char.specChoice : null;
  return V2_CORE_LOOP_V2
    ? jobDisplayName(cls, spec)
    : cls === "none"
      ? "모험가"
      : (V2_CLASS_DEFS[cls]?.name ?? "모험가");
}

function parseGridDungeonSupportDaily(
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

function parseGridDungeonSupportProfile(
  raw: unknown,
): GridDungeonSupportProfile {
  if (!raw || typeof raw !== "object") return { role: null, updatedAt: 0 };
  const save = raw as Partial<GridDungeonSupportProfile>;
  return {
    role: parseGridDungeonSupportRole(save.role),
    updatedAt: Math.max(0, Math.floor(Number(save.updatedAt) || 0)),
  };
}

async function readSupportDailyByUser(
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

async function reserveGridDungeonSupportUses({
  tx,
  supporterIds,
  now,
}: {
  tx: DbExecutor;
  supporterIds: string[];
  now: number;
}): Promise<{ ok: true } | { ok: false; error: "support_limit_reached" }> {
  for (const supporterId of supporterIds) {
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

async function rewardGridDungeonSupporters({
  tx,
  supporters,
  now,
}: {
  tx: DbExecutor;
  supporters: GridDungeonSupporterSnapshot[];
  now: number;
}) {
  for (const supporter of supporters) {
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

async function guildSupportCandidateRows(
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

async function gridDungeonSupportSnapshots({
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
  const candidateById = new Map(candidates.map((candidate) => [candidate.userId, candidate]));
  const supporters: GridDungeonSupporterSnapshot[] = [];
  for (const supporterId of supporterIds) {
    const skillsRaw = await lockSaveForUpdate(
      tx,
      supporterId,
      "skills.v2",
      emptyV2SkillsState(),
    );
    const skills = parseV2SkillsState(skillsRaw);
    const derived = await derivePlayerCombatV2(supporterId, tx, { skillsRaw: skills });
    const candidate = candidateById.get(supporterId);
    if (!derived || !candidate) return { ok: false, error: "invalid_supporter" };
    const savedPattern = skills.pattern ?? { blocks: [] };
    const pattern =
      savedPattern.blocks.length > 0
        ? savedPattern
        : smartDefaultPatternFromEquipped(skills.equipped);
    supporters.push({
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
      def: derived.player.def,
      spd: derived.player.spd,
      healMult: derived.player.healMult ?? 1,
      element: derived.player.characterElement ?? "neutral",
      skills: skills.equipped,
      pattern,
      capturedAt: now,
    });
  }
  return { ok: true, supporters };
}

function publicState(
  run: unknown,
  charSave: CharSave | null = null,
  dailyRewards: unknown = null,
  historyRaw: unknown = null,
  supportCandidates: GridDungeonSupportCandidate[] = [],
  supportProfileRaw: unknown = null,
) {
  const parsed = parseGridDungeonRun(run);
  return {
    ok: true,
    entrance: GRID_DUNGEON_ENTRANCE,
    atEntrance: isAtGridDungeonEntrance(charSave?.tilePos ?? null),
    rewardQuota: gridDungeonRewardQuota(dailyRewards),
    history: parseGridDungeonHistory(historyRaw),
    mySupportRole: parseGridDungeonSupportProfile(supportProfileRaw).role,
    supportCandidates,
    run: withGridDungeonLayout(parsed),
  };
}

function historyEntryFromRun({
  run,
  outcome,
  rewardGold = 0,
  drops = {},
  at = Date.now(),
}: {
  run: GridDungeonRun;
  outcome: "cleared" | "failed" | "abandoned";
  rewardGold?: number;
  drops?: DropResult;
  at?: number;
}) {
  const outcomeLabel =
    outcome === "cleared" ? "클리어" : outcome === "failed" ? "실패" : "포기";
  return {
    id: `${run.id}:${outcome}:${at}`,
    outcome,
    at,
    rewardGold,
    drops,
    exploredTiles: new Set(run.visited).size,
    hp: run.hp,
    message: `${GRID_DUNGEON_ENTRANCE.name} ${outcomeLabel}`,
  };
}

const GRID_DUNGEON_COMBAT_REWARD: Partial<Record<GridDungeonTileKind, number>> = {
  monster: 0,
  elite: 0,
  boss: 0,
};

const GRID_DUNGEON_COMBAT_DEPTH: Partial<Record<GridDungeonTileKind, number>> = {
  monster: 2,
  elite: 4,
  boss: 6,
};

const GRID_DUNGEON_COMBAT_BASE_LOSS: Partial<Record<GridDungeonTileKind, number>> = {
  monster: 2,
  elite: 3,
  boss: 4,
};

function targetTileForMove(run: GridDungeonRun, dir: GridDungeonMoveDir) {
  const delta: Record<GridDungeonMoveDir, { x: number; y: number }> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const d = delta[dir];
  const next = { x: run.pos.x + d.x, y: run.pos.y + d.y };
  return {
    next,
    key: gridDungeonKey(next.x, next.y),
    tile: gridDungeonTileAt(next.x, next.y, run.layout),
  };
}

function pickGridDungeonEnemy(tile: GridDungeonTileKind) {
  const depth = GRID_DUNGEON_COMBAT_DEPTH[tile] ?? 1;
  const pool = enemiesForDepth(depth);
  if (pool.length === 0) return null;
  const index = tile === "boss" ? pool.length - 1 : tile === "elite" ? 2 : 0;
  return { depth, enemy: pool[Math.min(index, pool.length - 1)] };
}

function dungeonHpLoss({
  won,
  baseLoss,
  damageTaken,
  playerMaxHp,
  runHp,
}: {
  won: boolean;
  baseLoss: number;
  damageTaken: number;
  playerMaxHp: number;
  runHp: number;
}) {
  if (!won) return Math.max(1, runHp);
  if (playerMaxHp <= 0) return baseLoss;
  const damageRatio = Math.max(0, damageTaken / playerMaxHp);
  return Math.max(
    0,
    Math.min(baseLoss + 2, Math.ceil(baseLoss * (0.35 + damageRatio))),
  );
}

async function resolveGridDungeonCombat({
  tx,
  userId,
  charSave,
  supporters,
  frontlineId,
  tile,
  runHp,
}: {
  tx: DbExecutor;
  userId: string;
  charSave: CharSave;
  supporters: GridDungeonSupporterSnapshot[];
  frontlineId: string;
  tile: GridDungeonTileKind;
  runHp: number;
}): Promise<GridDungeonResolvedCombat | null> {
  if (!isGridDungeonCombatTile(tile)) return null;
  const picked = pickGridDungeonEnemy(tile);
  if (!picked) return null;
  const baseMonster = V2_MONSTERS[picked.enemy.key];
  if (!baseMonster) return null;

  const equipmentSave = await lockSaveForUpdate(tx, userId, "equipment.v2", {});
  const skillsRaw = await lockSaveForUpdate(
    tx,
    userId,
    "skills.v2",
    emptyV2SkillsState() as unknown as Record<string, unknown>,
  );
  const proficiencyRaw = await lockSaveForUpdate(
    tx,
    userId,
    "proficiency.v2",
    emptyProficiency(),
  );
  const parsedSkills = parseV2SkillsState(skillsRaw);
  const codexBonus = V2_CORE_LOOP_V2 ? await readCodexSpBonus(tx, userId) : null;
  const v2Skills = V2_CORE_LOOP_V2
    ? sanitizeCombatLoadout(
        parsedSkills,
        charSave,
        proficiencyRaw,
        codexBonus?.total ?? 0,
    )
    : parsedSkills;
  const combatSkillsRaw = { ...parsedSkills, equipped: v2Skills.equipped };
  const player = await derivePlayerCombatV2(userId, tx, {
    character: charSave,
    equipmentSave,
    proficiencyRaw,
    skillsRaw: combatSkillsRaw,
  });
  if (!player) return null;

  const playerElement = parseV2Element(charSave.element);
  const basicAttackElement =
    player.weaponElement !== "neutral" ? player.weaponElement : playerElement;
  const monsterElement = picked.enemy.element ?? "neutral";
  const elemMult = elementDamageMult(
    basicAttackElement,
    monsterElement,
    V2_ELEMENT_ADV_PCT + (player.player.elementAdvPctBonus ?? 0),
    V2_ELEMENT_DIS_PCT + (player.player.elementDisPctBonus ?? 0),
  );
  const seededMonsterSkills = [
    picked.enemy.statusSkill,
    picked.enemy.castSkill,
  ].filter((s): s is NonNullable<typeof s> => s != null);
  const scaledEnemy = scaleMonsterForFloor(baseMonster, picked.depth);
  const enemyMonster: Monster = {
    ...scaledEnemy,
    name:
      tile === "boss"
        ? "유적의 파수꾼"
        : tile === "elite"
          ? "정예 수문장"
          : picked.enemy.name,
    image: picked.enemy.image ?? baseMonster.image,
    element: monsterElement,
    ...(seededMonsterSkills.length
      ? {
          v2Skills: {
            learned: seededMonsterSkills,
            equipped: seededMonsterSkills,
          },
        }
      : {}),
  };
  const playerMaxHp = Math.max(1, player.maxHp);
  const playerForBattle = {
    ...player.player,
    hp: playerMaxHp,
    mp: player.player.maxMp ?? player.player.mp,
    atk: Math.max(1, Math.round(player.player.atk * elemMult)),
    magicAtk: Math.max(
      0,
      Math.round((player.player.magicAtk ?? 0) * elemMult),
    ),
    attackElement: basicAttackElement,
    characterElement: playerElement,
  };
  const partyResult =
    supporters.length > 0
      ? resolveGridDungeonPartyCombat({
          main: makeGridDungeonPartyActor({
            id: userId,
            name: "나",
            maxHp: playerMaxHp,
            atk: Math.max(1, playerForBattle.atk),
            magicAtk: Math.max(0, playerForBattle.magicAtk ?? 0),
            def: Math.max(0, playerForBattle.def),
            spd: Math.max(1, playerForBattle.spd),
            healMult: playerForBattle.healMult ?? 1,
            isMain: true,
          }),
          supporters,
          enemy: enemyMonster,
          frontlineId,
          scaling: GRID_DUNGEON_PARTY_SCALING[tile] ?? {
            hpPerSupporter: 0.45,
            atkPerSupporter: 0.16,
          },
        })
      : null;
  const soloResult = partyResult
    ? null
    : resolveBattle(playerForBattle, enemyMonster, "모험가", {
      pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
      potions: {},
      v2Skills,
      depth: picked.depth,
      isBoss: tile === "boss",
    });
  const won = partyResult
    ? partyResult.outcome === "win"
    : soloResult?.outcome === "win";
  const rewardGold = won ? (GRID_DUNGEON_COMBAT_REWARD[tile] ?? 0) : 0;
  const drops = won ? rollGridDungeonDrops(tile) : {};
  const playerHpAfter = partyResult
    ? partyResult.playerHpAfter
    : (soloResult?.finalState.playerHp ?? 0);
  const enemyHpAfter = partyResult
    ? partyResult.enemyHp
    : (soloResult?.finalState.enemyHp ?? 0);
  const enemyMaxHp = partyResult ? partyResult.enemyMaxHp : enemyMonster.hp;
  const combatLog = partyResult
    ? partyResult.log
    : (soloResult?.finalState.log ?? [])
        .filter((entry) => entry.kind !== "hp_bar")
        .map((entry) => entry.text)
        .filter(Boolean)
        .slice(-4);
  const damageTaken = Math.max(0, playerMaxHp - playerHpAfter);
  const hpLost = dungeonHpLoss({
    won,
    baseLoss: GRID_DUNGEON_COMBAT_BASE_LOSS[tile] ?? 2,
    damageTaken,
    playerMaxHp,
    runHp,
  });
  const enemyName = enemyMonster.name;
  const message = won
    ? tile === "boss"
      ? `${enemyName}을(를) 쓰러뜨렸습니다. 출구가 열렸습니다.`
      : `${enemyName}을(를) 쓰러뜨렸습니다.`
    : `${enemyName}과의 전투에서 밀려 탐험을 이어갈 수 없습니다.`;

  return {
    outcome: won ? "win" : "lose",
    hpLost,
    rewardGold,
    drops,
    message,
    summary: {
      enemyName,
      outcome: won ? "win" : "lose",
      turns: partyResult?.turns ?? soloResult?.turns ?? 0,
      hpLost,
      playerHpBefore: playerMaxHp,
      playerHpAfter: Math.max(0, playerHpAfter),
      playerMaxHp,
      enemyHp: Math.max(0, enemyHpAfter),
      enemyMaxHp: Math.max(1, enemyMaxHp),
      rewardGold,
      ...(partyResult ? { party: partyResult.party } : {}),
      log: combatLog,
    },
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [
    run,
    charSave,
    dailyRewards,
    history,
    supportCandidates,
    supportProfile,
  ] = await Promise.all([
    readSave(db, userId, GRID_DUNGEON_SAVE_KEY, null),
    readSave<CharSave>(db, userId, "character.v2", {}),
    readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
    readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
    guildSupportCandidateRows(db, userId),
    readSave(db, userId, GRID_DUNGEON_SUPPORT_PROFILE_KEY, null),
  ]);
  return Response.json(
    publicState(
      run,
      charSave,
      dailyRewards,
      history,
      supportCandidates,
      supportProfile,
    ),
  );
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: GridDungeonAction;
  try {
    body = (await req.json()) as GridDungeonAction;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.action === "support-profile") {
    const now = Date.now();
    const supportProfile: GridDungeonSupportProfile = {
      role: parseGridDungeonSupportRole(body.role),
      updatedAt: now,
    };
    await upsertSave(
      db,
      userId,
      GRID_DUNGEON_SUPPORT_PROFILE_KEY,
      supportProfile,
    );
    const [run, charSave, dailyRewards, history, supportCandidates] =
      await Promise.all([
        readSave(db, userId, GRID_DUNGEON_SAVE_KEY, null),
        readSave<CharSave>(db, userId, "character.v2", {}),
        readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
        readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
        guildSupportCandidateRows(db, userId, now),
      ]);
    return Response.json(
      publicState(
        run,
        charSave,
        dailyRewards,
        history,
        supportCandidates,
        supportProfile,
      ),
    );
  }

  if (body.action === "start") {
    const supporterIds = parseSupporterIds(body.supporterIds);
    const frontlineId = normalizeGridDungeonFrontlineId({
      raw: body.frontlineId,
      userId,
      supporterIds,
    });
    const result = await db.transaction(async (tx) => {
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      if (!isAtGridDungeonEntrance(charSave.tilePos ?? null)) {
        return { ok: false as const, error: "not_at_entrance" as const };
      }
      const now = Date.now();
      const support = await gridDungeonSupportSnapshots({
        tx,
        userId,
        supporterIds,
        now,
      });
      if (!support.ok) return { ok: false as const, error: support.error };
      const reserved = await reserveGridDungeonSupportUses({
        tx,
        supporterIds: support.supporters.map((supporter) => supporter.userId),
        now,
      });
      if (!reserved.ok) return { ok: false as const, error: reserved.error };
      const run = createGridDungeonRun(
        now,
        Math.random,
        support.supporters,
        frontlineId,
      );
      await upsertSave(tx, userId, GRID_DUNGEON_SAVE_KEY, run);
      return { ok: true as const, run, charSave };
    });
    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error, entrance: GRID_DUNGEON_ENTRANCE },
        { status: 409 },
      );
    }
    const [dailyRewards, history, supportCandidates, supportProfile] = await Promise.all([
      readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
      readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
      guildSupportCandidateRows(db, userId),
      readSave(db, userId, GRID_DUNGEON_SUPPORT_PROFILE_KEY, null),
    ]);
    return Response.json(
      publicState(
        result.run,
        result.charSave,
        dailyRewards,
        history,
        supportCandidates,
        supportProfile,
      ),
    );
  }

  if (body.action === "move") {
    const dir = body.dir;
    if (dir !== "up" && dir !== "down" && dir !== "left" && dir !== "right") {
      return Response.json({ ok: false, error: "bad_direction" }, { status: 400 });
    }
    const result = await db.transaction(async (tx) => {
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const raw = await lockSaveForUpdate(
        tx,
        userId,
        GRID_DUNGEON_SAVE_KEY,
        null,
      );
      const run = parseGridDungeonRun(raw);
      if (!run) return { ok: false as const, error: "no_run" as const };
      const target = targetTileForMove(run, dir);
      const combat =
        target.tile &&
        isGridDungeonCombatTile(target.tile) &&
        !run.clearedEvents.includes(target.key)
          ? await resolveGridDungeonCombat({
              tx,
              userId,
              charSave,
              supporters: run.supporters,
              frontlineId:
                run.frontlineId === "main" || !run.frontlineId
                  ? userId
                  : run.frontlineId,
              tile: target.tile,
              runHp: run.hp,
            })
          : null;
      const eventDrops =
        target.tile === "treasure" && !run.clearedEvents.includes(target.key)
          ? rollGridDungeonDrops("treasure")
          : {};
      const moved = moveGridDungeonRun(run, dir, Date.now(), combat, eventDrops);
      if (!moved.ok) return moved;
      let nextHistory: unknown = null;
      if (moved.run.status === "failed") {
        const historyRaw = await lockSaveForUpdate(
          tx,
          userId,
          GRID_DUNGEON_HISTORY_KEY,
          null,
        );
        nextHistory = appendGridDungeonHistory(
          historyRaw,
          historyEntryFromRun({
            run: moved.run,
            outcome: "failed",
            at: moved.run.updatedAt,
          }),
        );
        await upsertSave(tx, userId, GRID_DUNGEON_HISTORY_KEY, nextHistory);
      }
      await upsertSave(tx, userId, GRID_DUNGEON_SAVE_KEY, moved.run);
      return { ok: true as const, run: moved.run, history: nextHistory };
    });
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 409 });
    }
    const [dailyRewards, history, supportProfile] = await Promise.all([
      readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
      result.history != null
        ? Promise.resolve(result.history)
        : readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
      readSave(db, userId, GRID_DUNGEON_SUPPORT_PROFILE_KEY, null),
    ]);
    return Response.json(
      publicState(result.run, null, dailyRewards, history, [], supportProfile),
    );
  }

  if (body.action === "claim") {
    const result = await db.transaction(async (tx) => {
      const charSave = await lockSaveForUpdate<CharSave>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const raw = await lockSaveForUpdate(
        tx,
        userId,
        GRID_DUNGEON_SAVE_KEY,
        null,
      );
      const run = parseGridDungeonRun(raw);
      if (!run) return { ok: false as const, error: "no_run" as const };
      if (run.status !== "cleared") {
        return { ok: false as const, error: "not_cleared" as const };
      }
      const now = Date.now();
      const dailyRaw = await lockSaveForUpdate(
        tx,
        userId,
        GRID_DUNGEON_DAILY_REWARDS_KEY,
        null,
      );
      const daily = parseGridDungeonDailyRewards(dailyRaw, now);
      const quota = gridDungeonRewardQuota(daily, now);
      const rewardGold = 0;
      const rewardDrops = quota.remaining > 0 ? (run.pendingDrops ?? {}) : {};
      const hasRewardDrops = Object.values(rewardDrops).some(
        (amount) => (amount ?? 0) > 0,
      );
      const nextClaimed =
        quota.remaining > 0
          ? Math.min(quota.limit, daily.claimed + 1)
          : daily.claimed;
      const claimed = {
        ...run,
        status: "claimed" as const,
        pendingGold: 0,
        pendingDrops: {},
        claimedAt: now,
        updatedAt: now,
        lastMessage:
          quota.remaining <= 0
            ? "오늘 던전 보상 횟수를 모두 사용해 보상 없이 정산했습니다."
            : hasRewardDrops
              ? "던전 재료 보상을 정산했습니다."
              : "이번 탐험에서 획득한 재료가 없습니다.",
      };
      const historyRaw = await lockSaveForUpdate(
        tx,
        userId,
        GRID_DUNGEON_HISTORY_KEY,
        null,
      );
      const history = appendGridDungeonHistory(
        historyRaw,
        historyEntryFromRun({
          run: claimed,
          outcome: "cleared",
          rewardGold,
          drops: rewardDrops,
          at: now,
        }),
      );
      const nextCharSave = {
        ...charSave,
        ...(hasRewardDrops
          ? { materials: mergeDrops(charSave.materials, rewardDrops) }
          : {}),
      };
      await upsertSave(tx, userId, "character.v2", nextCharSave);
      await rewardGridDungeonSupporters({
        tx,
        supporters: run.supporters,
        now,
      });
      await upsertSave(tx, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, {
        dayKey: daily.dayKey,
        claimed: nextClaimed,
      });
      await upsertSave(tx, userId, GRID_DUNGEON_HISTORY_KEY, history);
      await upsertSave(tx, userId, GRID_DUNGEON_SAVE_KEY, claimed);
      return {
        ok: true as const,
        run: claimed,
        charSave,
        dailyRewards: { dayKey: daily.dayKey, claimed: nextClaimed },
        history,
      };
    });
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 409 });
    }
    const supportProfile = await readSave(
      db,
      userId,
      GRID_DUNGEON_SUPPORT_PROFILE_KEY,
      null,
    );
    return Response.json(
      publicState(
        result.run,
        result.charSave,
        result.dailyRewards,
        result.history,
        [],
        supportProfile,
      ),
    );
  }

  if (body.action === "abandon") {
    const abandoned = await db.transaction(async (tx) => {
      const raw = await lockSaveForUpdate(
        tx,
        userId,
        GRID_DUNGEON_SAVE_KEY,
        null,
      );
      const existing = parseGridDungeonRun(raw);
      const now = Date.now();
      const run =
        existing?.status === "active" || existing?.status === "cleared"
          ? existing
          : createGridDungeonRun(now);
      const nextRun = {
        ...run,
        status: "failed" as const,
        hp: 0,
        pendingGold: 0,
        updatedAt: now,
        lastMessage: "탐험을 포기했습니다.",
      };
      const historyRaw = await lockSaveForUpdate(
        tx,
        userId,
        GRID_DUNGEON_HISTORY_KEY,
        null,
      );
      const history = appendGridDungeonHistory(
        historyRaw,
        historyEntryFromRun({
          run: nextRun,
          outcome: "abandoned",
          at: now,
        }),
      );
      await upsertSave(tx, userId, GRID_DUNGEON_SAVE_KEY, nextRun);
      await upsertSave(tx, userId, GRID_DUNGEON_HISTORY_KEY, history);
      return { history };
    });
    const [charSave, dailyRewards, supportProfile] = await Promise.all([
      readSave<CharSave>(db, userId, "character.v2", {}),
      readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
      readSave(db, userId, GRID_DUNGEON_SUPPORT_PROFILE_KEY, null),
    ]);
    return Response.json(
      publicState(null, charSave, dailyRewards, abandoned.history, [], supportProfile),
    );
  }

  return Response.json({ ok: false, error: "bad_action" }, { status: 400 });
}
