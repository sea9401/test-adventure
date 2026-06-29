import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  GRID_DUNGEON_DAILY_REWARDS_KEY,
  GRID_DUNGEON_ENTRANCE,
  GRID_DUNGEON_HISTORY_KEY,
  GRID_DUNGEON_SAVE_KEY,
  appendGridDungeonHistory,
  createGridDungeonRun,
  gridDungeonRewardQuota,
  isAtGridDungeonEntrance,
  moveGridDungeonRun,
  parseGridDungeonDailyRewards,
  parseGridDungeonHistory,
  parseGridDungeonRun,
  withGridDungeonLayout,
  type GridDungeonMoveDir,
  type GridDungeonRun,
} from "@/adventure/data/v2/gridDungeon";

type CharSave = {
  gold?: number;
  bankedGold?: number;
  tilePos?: { col?: number; row?: number; at?: number };
  [k: string]: unknown;
};

type GridDungeonAction =
  | { action?: "start" }
  | { action?: "move"; dir?: GridDungeonMoveDir }
  | { action?: "claim" }
  | { action?: "abandon" };

function publicState(
  run: unknown,
  charSave: CharSave | null = null,
  dailyRewards: unknown = null,
  historyRaw: unknown = null,
) {
  const parsed = parseGridDungeonRun(run);
  return {
    ok: true,
    entrance: GRID_DUNGEON_ENTRANCE,
    atEntrance: isAtGridDungeonEntrance(charSave?.tilePos ?? null),
    rewardQuota: gridDungeonRewardQuota(dailyRewards),
    history: parseGridDungeonHistory(historyRaw),
    run: withGridDungeonLayout(parsed),
  };
}

function historyEntryFromRun({
  run,
  outcome,
  rewardGold = 0,
  at = Date.now(),
}: {
  run: GridDungeonRun;
  outcome: "cleared" | "failed" | "abandoned";
  rewardGold?: number;
  at?: number;
}) {
  const outcomeLabel =
    outcome === "cleared" ? "클리어" : outcome === "failed" ? "실패" : "포기";
  return {
    id: `${run.id}:${outcome}:${at}`,
    outcome,
    at,
    rewardGold,
    exploredTiles: new Set(run.visited).size,
    hp: run.hp,
    message: `${GRID_DUNGEON_ENTRANCE.name} ${outcomeLabel}`,
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [run, charSave, dailyRewards, history] = await Promise.all([
    readSave(db, userId, GRID_DUNGEON_SAVE_KEY, null),
    readSave<CharSave>(db, userId, "character.v2", {}),
    readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
    readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
  ]);
  return Response.json(publicState(run, charSave, dailyRewards, history));
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

  if (body.action === "start") {
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
      const run = createGridDungeonRun();
      await upsertSave(tx, userId, GRID_DUNGEON_SAVE_KEY, run);
      return { ok: true as const, run, charSave };
    });
    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error, entrance: GRID_DUNGEON_ENTRANCE },
        { status: 409 },
      );
    }
    const [dailyRewards, history] = await Promise.all([
      readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
      readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
    ]);
    return Response.json(
      publicState(result.run, result.charSave, dailyRewards, history),
    );
  }

  if (body.action === "move") {
    const dir = body.dir;
    if (dir !== "up" && dir !== "down" && dir !== "left" && dir !== "right") {
      return Response.json({ ok: false, error: "bad_direction" }, { status: 400 });
    }
    const result = await db.transaction(async (tx) => {
      const raw = await lockSaveForUpdate(
        tx,
        userId,
        GRID_DUNGEON_SAVE_KEY,
        null,
      );
      const run = parseGridDungeonRun(raw);
      if (!run) return { ok: false as const, error: "no_run" as const };
      const moved = moveGridDungeonRun(run, dir);
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
    const [dailyRewards, history] = await Promise.all([
      readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
      result.history != null
        ? Promise.resolve(result.history)
        : readSave(db, userId, GRID_DUNGEON_HISTORY_KEY, null),
    ]);
    return Response.json(publicState(result.run, null, dailyRewards, history));
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
      const baseRewardGold = Math.max(0, Math.floor(run.pendingGold));
      const rewardGold = quota.remaining > 0 ? baseRewardGold : 0;
      const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
      const nextClaimed =
        rewardGold > 0 ? Math.min(quota.limit, daily.claimed + 1) : daily.claimed;
      const claimed = {
        ...run,
        status: "claimed" as const,
        pendingGold: 0,
        claimedAt: now,
        updatedAt: now,
        lastMessage:
          rewardGold > 0
            ? `${rewardGold.toLocaleString()}G를 정산했습니다.`
            : "오늘 던전 보상 횟수를 모두 사용해 보상 없이 정산했습니다.",
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
          at: now,
        }),
      );
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        gold: gold + rewardGold,
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
    return Response.json(
      publicState(result.run, result.charSave, result.dailyRewards, result.history),
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
    const [charSave, dailyRewards] = await Promise.all([
      readSave<CharSave>(db, userId, "character.v2", {}),
      readSave(db, userId, GRID_DUNGEON_DAILY_REWARDS_KEY, null),
    ]);
    return Response.json(
      publicState(null, charSave, dailyRewards, abandoned.history),
    );
  }

  return Response.json({ ok: false, error: "bad_action" }, { status: 400 });
}
