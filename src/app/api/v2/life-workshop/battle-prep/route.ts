// 전투 준비물(숫돌·보강재·어유) 제작.
// GET  /api/v2/life-workshop/battle-prep — 제작 화면용 12행(보유량·막힌 이유·최대 제작 수).
// POST /api/v2/life-workshop/battle-prep — { itemId, quantity } 제작. 결과는 character.v2 재료.
//   어유는 fishing-stock.v1 의 어획물도 쓴다. 잠금 순서는 fishing-stock.v1 → character.v2 —
//   낚시하면서 만드는 경우가 가장 흔하므로 챔질 라우트(fishing/reel)와 같은 순서로 맞춘다.

import { db } from "@/db";
import {
  BATTLE_PREP_ITEM_BY_ID,
  battlePrepCraftRows,
  craftBattlePrep,
  type BattlePrepCraftContext,
  type BattlePrepCraftError,
} from "@/adventure/data/v2/battlePrep";
import { FISHING_STOCK_KEY, emptyFishingStock, parseFishingStock } from "@/adventure/v2/fishingStock";
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
    levels: { mining: levels.mining, woodcutting: levels.woodcutting, fishing: levels.fishing },
    masterCraft: {
      mining: lifeMajorCanCraft(major, "mining"),
      woodcutting: lifeMajorCanCraft(major, "woodcutting"),
      fishing: lifeMajorCanCraft(major, "fishing"),
    },
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const [character, stockRaw, context] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readSave<unknown>(db, userId, FISHING_STOCK_KEY, emptyFishingStock()),
    readCraftContext(db, userId),
  ]);
  return Response.json({
    ok: true,
    rows: battlePrepCraftRows({
      materials: character.materials ?? {},
      catchItems: parseFishingStock(stockRaw).items,
      ...context,
    }),
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
    // 어획물을 쓰는 품목일 때만 재고 세이브를 잠근다. 그 밖에는 행 표시용으로 읽기만 한다.
    const usesCatchStock =
      typeof body?.itemId === "string" && BATTLE_PREP_ITEM_BY_ID.get(body.itemId)?.catchCosts !== undefined;
    const stock = parseFishingStock(
      usesCatchStock
        ? await lockSaveForUpdate<unknown>(tx, userId, FISHING_STOCK_KEY, emptyFishingStock())
        : await readSave<unknown>(tx, userId, FISHING_STOCK_KEY, emptyFishingStock()),
    );
    const character = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
    const context = await readCraftContext(tx, userId);
    const crafted = craftBattlePrep({
      materials: character.materials ?? {},
      catchItems: stock.items,
      itemId: body?.itemId,
      quantity: body?.quantity,
      ...context,
    });
    if (!crafted.ok) {
      return { status: ERROR_STATUS[crafted.error], body: { ok: false as const, error: crafted.error } };
    }
    await upsertSave(tx, userId, "character.v2", { ...character, materials: crafted.materials });
    if (crafted.usesCatchStock) {
      await upsertSave(tx, userId, FISHING_STOCK_KEY, { ...stock, items: crafted.catchItems });
    }
    return {
      status: 200,
      body: {
        ok: true as const,
        itemId: crafted.item.id,
        crafted: crafted.quantity,
        rows: battlePrepCraftRows({ materials: crafted.materials, catchItems: crafted.catchItems, ...context }),
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}
