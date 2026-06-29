import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  GRID_DUNGEON_ENTRANCE,
  GRID_DUNGEON_SAVE_KEY,
  createGridDungeonRun,
  isAtGridDungeonEntrance,
  moveGridDungeonRun,
  parseGridDungeonRun,
  withGridDungeonLayout,
  type GridDungeonMoveDir,
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

function publicState(run: unknown, charSave: CharSave | null = null) {
  const parsed = parseGridDungeonRun(run);
  return {
    ok: true,
    entrance: GRID_DUNGEON_ENTRANCE,
    atEntrance: isAtGridDungeonEntrance(charSave?.tilePos ?? null),
    run: withGridDungeonLayout(parsed),
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [run, charSave] = await Promise.all([
    readSave(db, userId, GRID_DUNGEON_SAVE_KEY, null),
    readSave<CharSave>(db, userId, "character.v2", {}),
  ]);
  return Response.json(publicState(run, charSave));
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
    return Response.json(publicState(result.run, result.charSave));
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
      await upsertSave(tx, userId, GRID_DUNGEON_SAVE_KEY, moved.run);
      return { ok: true as const, run: moved.run };
    });
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 409 });
    }
    return Response.json(publicState(result.run));
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
      const rewardGold = Math.max(0, Math.floor(run.pendingGold));
      const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
      const claimed = {
        ...run,
        status: "claimed" as const,
        pendingGold: 0,
        claimedAt: Date.now(),
        updatedAt: Date.now(),
        lastMessage: `${rewardGold.toLocaleString()}G를 정산했습니다.`,
      };
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        gold: gold + rewardGold,
      });
      await upsertSave(tx, userId, GRID_DUNGEON_SAVE_KEY, claimed);
      return { ok: true as const, run: claimed, charSave };
    });
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 409 });
    }
    return Response.json(publicState(result.run, result.charSave));
  }

  if (body.action === "abandon") {
    const run = createGridDungeonRun();
    await upsertSave(db, userId, GRID_DUNGEON_SAVE_KEY, {
      ...run,
      status: "failed",
      hp: 0,
      pendingGold: 0,
      lastMessage: "탐험을 포기했습니다.",
    });
    const charSave = await readSave<CharSave>(db, userId, "character.v2", {});
    return Response.json(publicState(null, charSave));
  }

  return Response.json({ ok: false, error: "bad_action" }, { status: 400 });
}
