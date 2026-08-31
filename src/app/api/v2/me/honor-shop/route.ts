import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_SETTLEMENT_WARFARE,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { parseHonor, parseHonorEarned } from "@/adventure/data/v2/honor";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import {
  HONOR_SHOP_ITEMS,
  honorShopItem,
} from "@/adventure/data/v2/honorShop";
import {
  grantStaminaPotions,
  STAMINA_POTIONS_KEY,
} from "@/adventure/v2/staminaPotions";

// 명성상점 — 정착지 전쟁 개인 화폐(명성/honor) 소비처. 설계: docs/v2-settlement-warfare-plan.md §2.5.
//   GET — 보유 명성 + 누적 명성 + 품목. POST { itemId } — 구매(보유 명성 차감 + 아이템 지급).
//   🔑 구매는 보유(honor)만 차감 — 누적(honorEarned)·길드 명성은 불변(누적과 소비는 별개 카운트).
//   초기 품목 = 스태미나 회복약 1종(후속 확장). 플래그 off → 404.

type HonorSave = {
  honor?: unknown;
  honorEarned?: unknown;
  materials?: unknown;
  [k: string]: unknown;
};
type PotSave = { count?: unknown; [k: string]: unknown };

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
  const save = row?.value as HonorSave | undefined;
  const honor = parseHonor(save?.honor);
  const honorEarned = parseHonorEarned(save?.honorEarned, honor);
  return Response.json({ ok: true, honor, honorEarned, items: HONOR_SHOP_ITEMS });
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
  const item = honorShopItem(body.itemId);
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
    const honorEarned = parseHonorEarned(charSave.honorEarned, honor);
    if (honor < item.cost) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_honor", honor },
      };
    }
    // 보유(honor)만 차감 — 누적(honorEarned)은 보존(spread + 미수정). "소비 ≠ 누적" 분리.
    const nextCharSave: HonorSave = {
      ...charSave,
      honor: honor - item.cost,
      ...(item.grantKind === "material"
        ? {
            materials: mergeDrops(charSave.materials, {
              [item.targetId]: item.quantity,
            }),
          }
        : {}),
    };
    await upsertSave(tx, userId, "character.v2", nextCharSave);

    let staminaPotions: number | undefined;
    if (item.grantKind === "stamina_potion") {
      const potSave = await lockSaveForUpdate<PotSave>(
        tx,
        userId,
        STAMINA_POTIONS_KEY,
        {},
      );
      const nextPotions = grantStaminaPotions(potSave, item.quantity, {
        bound: true,
      });
      staminaPotions = nextPotions.count;
      await upsertSave(tx, userId, STAMINA_POTIONS_KEY, nextPotions);
    }
    return {
      status: 200,
      body: {
        ok: true as const,
        honor: honor - item.cost,
        honorEarned,
        granted: {
          itemId: item.id,
          name: item.name,
          kind: item.grantKind,
          targetId: item.targetId,
          quantity: item.quantity,
        },
        ...(item.grantKind === "material"
          ? { materials: nextCharSave.materials }
          : {}),
        ...(typeof staminaPotions === "number" ? { staminaPotions } : {}),
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}
