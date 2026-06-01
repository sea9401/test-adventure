// 낚시 코인 상점 — 낚시 코인(fishing-wallet.v1)으로 칭호 구매.
//
// GET  /api/v2/fishing/shop — { coins, ownedTitleIds } (상점 UI 초기 상태).
// POST /api/v2/fishing/shop — body { titleId } 구매.
//   1) 카탈로그 가격 조회 (미등재 → 400)
//   2) 트랜잭션: fishing-wallet.v1 잠금 → 코인 검증 → 칭호 부여(idempotent) → 코인 차감
//      - 코인 부족 → 402 (지급/부여 없음)
//      - 이미 보유 → 409 (차감 없음)
// 락 순서: fishing-wallet.v1 → adventure-log.v2(grantTitleIfMissingInTx 내부). 정산(seasonRewards)
// 은 fishing_seasons → fishing-wallet 순이고 adventure-log 를 안 잡으므로 순환 대기 없음.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  FISHING_WALLET_KEY,
  walletCoins,
  type FishingWallet,
} from "@/lib/server/fishing/coins";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import {
  FISHING_SHOP_TITLES,
  fishingShopPriceFor,
} from "@/adventure/v2/fishingShop";

async function ownedShopTitleIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")))
    .limit(1);
  const raw = (rows[0]?.value as { titles?: unknown } | undefined)?.titles;
  const titles =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return FISHING_SHOP_TITLES.map((t) => t.titleId).filter((id) => id in titles);
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const [coins, ownedTitleIds] = await Promise.all([
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, FISHING_WALLET_KEY)))
      .limit(1)
      .then((rows) => walletCoins(rows[0]?.value)),
    ownedShopTitleIds(userId),
  ]);
  return Response.json({ ok: true, coins, ownedTitleIds });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { titleId?: unknown };
  try {
    body = (await req.json()) as { titleId?: unknown };
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const titleId = typeof body.titleId === "string" ? body.titleId : null;
  if (!titleId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const price = fishingShopPriceFor(titleId);
  if (price === undefined) {
    return Response.json(
      { ok: false, error: "unknown_title" },
      { status: 400 },
    );
  }

  const outcome = await db.transaction(async (tx) => {
    const wallet = await lockSaveForUpdate<FishingWallet>(
      tx,
      userId,
      FISHING_WALLET_KEY,
      { coins: 0 },
    );
    const coins = walletCoins(wallet);
    if (coins < price) return { kind: "insufficient" as const, coins };
    // 부여 먼저(소유 확인) — 이미 보유면 차감 없이 종료.
    const granted = await grantTitleIfMissingInTx(tx, userId, titleId, Date.now());
    if (!granted) return { kind: "owned" as const, coins };
    const coinBalance = coins - price;
    await upsertSave(tx, userId, FISHING_WALLET_KEY, { coins: coinBalance });
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
