// 전투 준비물(숫돌·보강재) 제작.
// GET  /api/v2/life-workshop/battle-prep — 제작 화면용 8행(보유량·막힌 이유·최대 제작 수).
// POST /api/v2/life-workshop/battle-prep — { itemId, quantity } 제작. 재료·결과 모두 character.v2 재료.

import { db } from "@/db";
import {
  battlePrepCraftRows,
  craftBattlePrep,
  type BattlePrepCraftContext,
  type BattlePrepCraftError,
} from "@/adventure/data/v2/battlePrep";
import { LIFE_MAJOR_SAVE_KEY, lifeMajorCanCraft, parseLifeMajorState } from "@/adventure/v2/lifeMajor";
import { ensureUser } from "@/lib/server/ensureUser";
import { readLifeLevels } from "@/lib/server/lifeMajor";
import { lockSaveForUpdate, readSave, upsertSave, type DbExecutor } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

type CharacterSave = Record<string, unknown> & { materials?: Record<string, number> };

const ERROR_STATUS: Record<BattlePrepCraftError, number> = {
  bad_item: 400,
  invalid_quantity: 400,
  level_required: 409,
  major_required: 409,
  not_enough_materials: 409,
};

async function readCraftContext(executor: DbExecutor, userId: string): Promise<BattlePrepCraftContext> {
  const [levels, majorRaw] = await Promise.all([
    readLifeLevels(executor, userId),
    readSave(executor, userId, LIFE_MAJOR_SAVE_KEY, {}),
  ]);
  const major = parseLifeMajorState(majorRaw);
  return {
    levels: { mining: levels.mining, woodcutting: levels.woodcutting },
    masterCraft: {
      mining: lifeMajorCanCraft(major, "mining"),
      woodcutting: lifeMajorCanCraft(major, "woodcutting"),
    },
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const [character, context] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readCraftContext(db, userId),
  ]);
  return Response.json({
    ok: true,
    rows: battlePrepCraftRows({ materials: character.materials ?? {}, ...context }),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:life-workshop:battle-prep",
    userLimit: 30,
    ipLimit: 200,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { itemId?: unknown; quantity?: unknown } | null;

  const result = await db.transaction(async (tx) => {
    const character = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
    const context = await readCraftContext(tx, userId);
    const crafted = craftBattlePrep({
      materials: character.materials ?? {},
      itemId: body?.itemId,
      quantity: body?.quantity,
      ...context,
    });
    if (!crafted.ok) {
      return { status: ERROR_STATUS[crafted.error], body: { ok: false as const, error: crafted.error } };
    }
    await upsertSave(tx, userId, "character.v2", { ...character, materials: crafted.materials });
    return {
      status: 200,
      body: {
        ok: true as const,
        itemId: crafted.item.id,
        crafted: crafted.quantity,
        rows: battlePrepCraftRows({ materials: crafted.materials, ...context }),
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}
