import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_SETTLEMENT_WARFARE,
  HONOR_SHOP_STAMINA_POTION_COST,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { parseHonor } from "@/adventure/data/v2/honor";
import {
  STAMINA_POTIONS_KEY,
  parseStaminaPotions,
} from "@/adventure/v2/staminaPotions";

// 명예상점 — 정착지 전쟁 개인 화폐(명예) 소비처. 설계: docs/v2-settlement-warfare-plan.md §2.5.
//   GET — 명예 잔액 + 품목. POST { itemId } — 구매(명예 차감 + 아이템 지급).
//   초기 품목 = 스태미나 회복약 1종(후속 확장). 플래그 off → 404.

type HonorSave = { honor?: unknown; [k: string]: unknown };
type PotSave = { count?: unknown; [k: string]: unknown };

const ITEMS = [
  {
    id: "stamina_potion",
    name: "스태미나 회복약",
    cost: HONOR_SHOP_STAMINA_POTION_COST,
  },
];

export async function GET() {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const row = (
    await db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
      .limit(1)
  )[0];
  const honor = parseHonor((row?.value as HonorSave | undefined)?.honor);
  return Response.json({ ok: true, honor, items: ITEMS });
}

export async function POST(req: Request) {
  if (!V2_SETTLEMENT_WARFARE) {
    return Response.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { itemId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const item = ITEMS.find((i) => i.id === body.itemId);
  if (!item) {
    return Response.json({ ok: false, error: "no_such_item" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    // 락 순서: character.v2 → stamina-potions.v1 (둘 다 같은 유저 세이브·키 알파벳순 일관).
    const charSave = await lockSaveForUpdate<HonorSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const honor = parseHonor(charSave.honor);
    if (honor < item.cost) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_honor", honor },
      };
    }
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      honor: honor - item.cost,
    });
    // 지급 — 스태미나 회복약 +1(전용 키 stamina-potions.v1).
    const potSave = await lockSaveForUpdate<PotSave>(
      tx,
      userId,
      STAMINA_POTIONS_KEY,
      {},
    );
    const count = parseStaminaPotions(potSave).count;
    await upsertSave(tx, userId, STAMINA_POTIONS_KEY, {
      ...potSave,
      count: count + 1,
    });
    return {
      status: 200,
      body: {
        ok: true as const,
        honor: honor - item.cost,
        granted: item.id,
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}
