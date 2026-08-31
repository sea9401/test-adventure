// 투기장 코인 상점 — 투기장 코인(pvp-wallet.v1)으로 칭호/소비품 구매. (낚시 코인 상점 미러.)
//
// GET  /api/v2/arena/shop — { coins, ownedTitleIds, staminaPotions } (상점 UI 초기 상태).
// POST /api/v2/arena/shop — body { titleId } | { itemId } 구매.
//   1) 카탈로그 가격 조회 (미등재 → 400)
//   2) 트랜잭션: pvp-wallet.v1 잠금 → 코인 검증 → 칭호/소비품 지급 → 코인 차감
//      - 코인 부족 → 402 (지급/부여 없음)
//      - 이미 보유 → 409 (차감 없음)
// 락 순서: pvp-wallet.v1 → adventure-log.v2 또는 stamina-potions.v1. 시즌 보상 지급
// (pvp seasonRewards)은 pvp_seasons → marketplace_inbox 순이고 pvp-wallet·adventure-log 를
// 안 잡으므로 순환 대기 없음.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  PVP_WALLET_KEY,
  pvpWalletCoins,
  type PvpWallet,
} from "@/lib/server/pvp/coins";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import {
  ARENA_SHOP_TITLES,
  arenaShopConsumablePriceFor,
  arenaShopPriceFor,
} from "@/adventure/v2/arenaShop";
import {
  grantStaminaPotions,
  STAMINA_POTIONS_KEY,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";

async function ownedShopTitleIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")))
    .limit(1);
  const raw = (rows[0]?.value as { titles?: unknown } | undefined)?.titles;
  const titles =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return ARENA_SHOP_TITLES.map((t) => t.titleId).filter((id) => id in titles);
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [coins, ownedTitleIds, staminaPotions] = await Promise.all([
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, PVP_WALLET_KEY)))
      .limit(1)
      .then((rows) => pvpWalletCoins(rows[0]?.value)),
    ownedShopTitleIds(userId),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(eq(savesKv.userId, userId), eq(savesKv.key, STAMINA_POTIONS_KEY)),
      )
      .limit(1)
      .then((rows) => staminaPotionCount(rows[0]?.value)),
  ]);
  return Response.json({ ok: true, coins, ownedTitleIds, staminaPotions });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { titleId?: unknown; itemId?: unknown };
  try {
    body = (await req.json()) as { titleId?: unknown; itemId?: unknown };
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  if (itemId) {
    return buyConsumable(userId, itemId);
  }

  const titleId = typeof body.titleId === "string" ? body.titleId : null;
  if (!titleId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const price = arenaShopPriceFor(titleId);
  if (price === undefined) {
    return Response.json({ ok: false, error: "unknown_title" }, { status: 400 });
  }

  const outcome = await db.transaction(async (tx) => {
    const wallet = await lockSaveForUpdate<PvpWallet>(
      tx,
      userId,
      PVP_WALLET_KEY,
      { coins: 0 },
    );
    const coins = pvpWalletCoins(wallet);
    if (coins < price) return { kind: "insufficient" as const, coins };
    // 부여 먼저(소유 확인) — 이미 보유면 차감 없이 종료.
    const granted = await grantTitleIfMissingInTx(tx, userId, titleId, Date.now());
    if (!granted) return { kind: "owned" as const, coins };
    const coinBalance = coins - price;
    await upsertSave(tx, userId, PVP_WALLET_KEY, { coins: coinBalance });
    return { kind: "ok" as const, coinBalance };
  });

  if (outcome.kind === "insufficient") {
    return Response.json(
      { ok: false, error: "insufficient_coins", coins: outcome.coins },
      { status: 402 },
    );
  }
  if (outcome.kind === "owned") {
    return Response.json(
      { ok: false, error: "already_owned", coins: outcome.coins },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, titleId, coins: outcome.coinBalance });
}

// 보관형 소비템은 반복 구매 가능. 락 순서: pvp-wallet.v1 → stamina-potions.v1.
async function buyConsumable(userId: string, itemId: string): Promise<Response> {
  const price = arenaShopConsumablePriceFor(itemId);
  if (price === undefined || itemId !== "stamina_potion") {
    return Response.json({ ok: false, error: "unknown_item" }, { status: 400 });
  }

  const outcome = await db.transaction(async (tx) => {
    const wallet = await lockSaveForUpdate<PvpWallet>(
      tx,
      userId,
      PVP_WALLET_KEY,
      { coins: 0 },
    );
    const coins = pvpWalletCoins(wallet);
    if (coins < price) return { kind: "insufficient" as const, coins };

    const potionSave = await lockSaveForUpdate<{ count: number }>(
      tx,
      userId,
      STAMINA_POTIONS_KEY,
      { count: 0 },
    );
    const nextPotions = grantStaminaPotions(potionSave, 1, { bound: true });
    const staminaPotions = nextPotions.count;
    await upsertSave(tx, userId, STAMINA_POTIONS_KEY, nextPotions);

    const coinBalance = coins - price;
    await upsertSave(tx, userId, PVP_WALLET_KEY, { coins: coinBalance });
    return { kind: "ok" as const, coinBalance, staminaPotions };
  });

  if (outcome.kind === "insufficient") {
    return Response.json(
      { ok: false, error: "insufficient_coins", coins: outcome.coins },
      { status: 402 },
    );
  }
  return Response.json({
    ok: true,
    itemId,
    coins: outcome.coinBalance,
    staminaPotions: outcome.staminaPotions,
  });
}
