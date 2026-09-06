import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import {
  GRID_DUNGEON_DAILY_REWARDS_KEY,
  GRID_DUNGEON_ENTRANCE,
  GRID_DUNGEON_HISTORY_KEY,
  GRID_DUNGEON_MAX_HP,
  GRID_DUNGEON_SAVE_KEY,
  appendGridDungeonHistory,
  createGridDungeonRun,
  gridDungeonRewardQuota,
  isAtGridDungeonEntrance,
  isGridDungeonCombatTile,
  moveGridDungeonRun,
  parseGridDungeonDailyRewards,
  parseGridDungeonRouteId,
  parseGridDungeonRun,
  parseGridDungeonSupportRole,
  rollGridDungeonDrops,
  type GridDungeonMoveDir,
} from "@/adventure/data/v2/gridDungeon";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";
import { db } from "@/db";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { ensureUser } from "@/lib/server/ensureUser";
import { resolveGridDungeonCombat } from "@/lib/server/gridDungeonBattle";
import {
  failureDetailForFailedMove,
  failureReasonForFailedMove,
  historyEntryFromRun,
  publicState,
  targetTileForMove,
} from "@/lib/server/gridDungeonReadModel";
import {
  GRID_DUNGEON_SUPPORT_DAILY_KEY,
  GRID_DUNGEON_SUPPORT_PROFILE_KEY,
  gridDungeonSupportSnapshots,
  guildSupportCandidateRows,
  normalizeGridDungeonFrontlineId,
  parseSupporterIds,
  reserveGridDungeonSupportUses,
  rewardGridDungeonSupporters,
  type CharSave,
  type GridDungeonSupportProfile,
} from "@/lib/server/gridDungeonSupport";
import { enforceHighCostRateLimit } from "@/lib/server/highCostRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";

type GridDungeonAction =
  | {
      action?: "start";
      supporterIds?: unknown;
      frontlineId?: unknown;
      routeId?: unknown;
    }
  | { action?: "move"; dir?: GridDungeonMoveDir }
  | { action?: "claim" }
  | { action?: "abandon" }
  | { action?: "support-profile"; role?: unknown };


export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceHighCostRateLimit(req, userId, "gridDungeonRead");
  if (limited) return limited;
  const [
    run,
    charSave,
    dailyRewards,
    history,
    supportCandidates,
    supportProfile,
    supportDaily,
  ] = await Promise.all([
    readSave(db, userId, GRID_DUNGEON_SAVE_KEY, null),
    readSave<CharSave>(db, userId, "character.v2", {}),
    readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
    readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
    guildSupportCandidateRows(db, userId),
    readSave(db, userId, GRID_DUNGEON_SUPPORT_PROFILE_KEY, null),
    readSave(db, userId, GRID_DUNGEON_SUPPORT_DAILY_KEY, null),
  ]);
  return Response.json(
    publicState(
      run,
      charSave,
      dailyRewards,
      history,
      supportCandidates,
      supportProfile,
      supportDaily,
    ),
  );
}


export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceHighCostRateLimit(req, userId, "gridDungeonAction");
  if (limited) return limited;

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
    const [run, charSave, dailyRewards, history, supportCandidates, supportDaily] =
      await Promise.all([
        readSave(db, userId, GRID_DUNGEON_SAVE_KEY, null),
        readSave<CharSave>(db, userId, "character.v2", {}),
        readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
        readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
        guildSupportCandidateRows(db, userId, now),
        readSave(db, userId, GRID_DUNGEON_SUPPORT_DAILY_KEY, null),
      ]);
    return Response.json(
      publicState(
        run,
        charSave,
        dailyRewards,
        history,
        supportCandidates,
        supportProfile,
        supportDaily,
      ),
    );
  }

  if (body.action === "start") {
    const supporterIds = parseSupporterIds(body.supporterIds);
    const routeId = parseGridDungeonRouteId(body.routeId);
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
      const player = await derivePlayerCombatV2(userId, tx, {
        character: charSave,
      });
      const expeditionMaxHp = Math.max(
        1,
        Math.floor(player?.maxHp ?? GRID_DUNGEON_MAX_HP),
      );
      const regen = applyHpRegen(
        Math.max(0, charSave.hp ?? expeditionMaxHp),
        expeditionMaxHp,
        parseHpRegenSince(charSave.hpRegenSince, now),
        now,
      );
      if (regen.hp <= 0) {
        return { ok: false as const, error: "need_heal" as const };
      }
      const characterAtStart = {
        ...charSave,
        hp: regen.hp,
        hpRegenSince: now,
      };
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
        routeId,
        expeditionMaxHp,
        regen.hp,
      );
      await upsertSave(tx, userId, "character.v2", characterAtStart);
      await upsertSave(tx, userId, GRID_DUNGEON_SAVE_KEY, run);
      return { ok: true as const, run, charSave: characterAtStart };
    });
    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error, entrance: GRID_DUNGEON_ENTRANCE },
        { status: 409 },
      );
    }
    const [
      dailyRewards,
      history,
      supportCandidates,
      supportProfile,
      supportDaily,
    ] = await Promise.all([
      readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
      readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
      guildSupportCandidateRows(db, userId),
      readSave(db, userId, GRID_DUNGEON_SUPPORT_PROFILE_KEY, null),
      readSave(db, userId, GRID_DUNGEON_SUPPORT_DAILY_KEY, null),
    ]);
    return Response.json(
      publicState(
        result.run,
        result.charSave,
        dailyRewards,
        history,
        supportCandidates,
        supportProfile,
        supportDaily,
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
              routeId: run.routeId,
              runHp: run.hp,
              runMaxHp: run.maxHp,
            })
          : null;
      const eventDrops =
        (target.tile === "treasure" || target.tile === "relic") &&
        !run.clearedEvents.includes(target.key)
          ? rollGridDungeonDrops(target.tile, Math.random, run.routeId)
          : {};
      const now = Date.now();
      const moved = moveGridDungeonRun(run, dir, now, combat, eventDrops);
      if (!moved.ok) return moved;
      let nextHistory: unknown = null;
      if (moved.run.status === "failed") {
        const failureReason = failureReasonForFailedMove({
          tile: target.tile,
          combat,
        });
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
            detailReason: failureDetailForFailedMove({
              reason: failureReason,
              combat,
            }),
            failureReason,
          }),
        );
        await upsertSave(tx, userId, GRID_DUNGEON_HISTORY_KEY, nextHistory);
      }
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        hp: moved.run.hp,
        hpRegenSince: now,
      });
      await upsertSave(tx, userId, GRID_DUNGEON_SAVE_KEY, moved.run);
      return { ok: true as const, run: moved.run, history: nextHistory };
    });
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 409 });
    }
    const [dailyRewards, history, supportProfile, supportDaily] = await Promise.all([
      readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
      result.history != null
        ? Promise.resolve(result.history)
        : readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
      readSave(db, userId, GRID_DUNGEON_SUPPORT_PROFILE_KEY, null),
      readSave(db, userId, GRID_DUNGEON_SUPPORT_DAILY_KEY, null),
    ]);
    return Response.json(
      publicState(
        result.run,
        null,
        dailyRewards,
        history,
        [],
        supportProfile,
        supportDaily,
      ),
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
      const rewardGold = Math.max(0, Math.floor(run.pendingGold));
      const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
      const rewardDrops = quota.remaining > 0 ? (run.pendingDrops ?? {}) : {};
      const hasRewardDrops = Object.values(rewardDrops).some(
        (amount) => (amount ?? 0) > 0,
      );
      const hasRewardGold = rewardGold > 0;
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
            ? hasRewardGold
              ? `${rewardGold.toLocaleString()}G를 정산했습니다. 오늘 재료 보상 횟수는 모두 사용했습니다.`
              : "오늘 던전 재료 보상 횟수를 모두 사용해 재료 없이 정산했습니다."
            : hasRewardDrops
              ? hasRewardGold
                ? `${rewardGold.toLocaleString()}G와 던전 재료 보상을 정산했습니다.`
                : "던전 재료 보상을 정산했습니다."
              : hasRewardGold
                ? `${rewardGold.toLocaleString()}G를 정산했습니다. 이번 탐험에서 획득한 재료는 없습니다.`
                : "이번 탐험에서 획득한 보상이 없습니다.",
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
          rewardLimited: quota.remaining <= 0,
          detailReason:
            quota.remaining <= 0
              ? "일일 재료 보상 횟수 소진으로 골드만 정산"
              : hasRewardDrops
                ? "출구 도달 후 골드와 재료 정산"
                : "출구 도달 후 골드 정산",
          at: now,
        }),
      );
      const nextCharSave = {
        ...charSave,
        gold: gold + rewardGold,
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
    const [supportProfile, supportDaily] = await Promise.all([
      readSave(db, userId, GRID_DUNGEON_SUPPORT_PROFILE_KEY, null),
      readSave(db, userId, GRID_DUNGEON_SUPPORT_DAILY_KEY, null),
    ]);
    return Response.json(
      publicState(
        result.run,
        result.charSave,
        result.dailyRewards,
        result.history,
        [],
        supportProfile,
        supportDaily,
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
          detailReason: "탐험 직접 포기",
          at: now,
        }),
      );
      await upsertSave(tx, userId, GRID_DUNGEON_SAVE_KEY, nextRun);
      await upsertSave(tx, userId, GRID_DUNGEON_HISTORY_KEY, history);
      return { history };
    });
    const [charSave, dailyRewards, supportProfile, supportDaily] = await Promise.all([
      readSave<CharSave>(db, userId, "character.v2", {}),
      readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
      readSave(db, userId, GRID_DUNGEON_SUPPORT_PROFILE_KEY, null),
      readSave(db, userId, GRID_DUNGEON_SUPPORT_DAILY_KEY, null),
    ]);
    return Response.json(
      publicState(
        null,
        charSave,
        dailyRewards,
        abandoned.history,
        [],
        supportProfile,
        supportDaily,
      ),
    );
  }

  return Response.json({ ok: false, error: "bad_action" }, { status: 400 });
}
