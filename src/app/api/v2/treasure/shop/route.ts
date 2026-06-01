// 발굴 코인 상점 — 발굴 코인(treasure-wallet.v1)으로 칭호 구매. fishing 샵 라우트 미러.
//
// GET  /api/v2/treasure/shop — { coins, ownedTitleIds } (상점 UI 초기 상태).
// POST /api/v2/treasure/shop — body { titleId } 구매.
//   트랜잭션: treasure-wallet.v1 잠금 → 코인 검증 → 칭호 부여(idempotent) → 코인 차감.
//     코인 부족 → 402, 이미 보유 → 409(차감 없음).
// 락 순서: treasure-wallet.v1 → adventure-log.v2(grantTitleIfMissingInTx 내부). 분해는
// collection → wallet 이라 wallet 을 쥔 채 collection 을 잡는 경로 없음 → 순환 대기 없음.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  TREASURE_WALLET_KEY,
  walletCoins,
  type TreasureWallet,
} from "@/lib/server/treasure/coins";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import {
  TREASURE_SHOP_TITLES,
  treasureShopPriceFor,
} from "@/adventure/v2/treasureShop";

async function ownedShopTitleIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")))
    .limit(1);
  const raw = (rows[0]?.value as { titles?: unknown } | undefined)?.titles;
  const titles =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return TREASURE_SHOP_TITLES.map((t) => t.titleId).filter((id) => id in titles);
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
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, TREASURE_WALLET_KEY)))
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
  const price = treasureShopPriceFor(titleId);
  if (price === undefined) {
    return Response.json({ ok: false, error: "unknown_title" }, { status: 400 });
  }

  const outcome = await db.transaction(async (tx) => {
    const wallet = await lockSaveForUpdate<TreasureWallet>(
      tx,
      userId,
      TREASURE_WALLET_KEY,
      { coins: 0 },
    );
    const coins = walletCoins(wallet);
    if (coins < price) return { kind: "insufficient" as const, coins };
    const granted = await grantTitleIfMissingInTx(tx, userId, titleId, Date.now());
    if (!granted) return { kind: "owned" as const, coins };
    const coinBalance = coins - price;
    await upsertSave(tx, userId, TREASURE_WALLET_KEY, { coins: coinBalance });
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
