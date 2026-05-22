// POST /api/pvp/shop — 투기장 코인으로 상점 칭호 구매.
//
// body: { titleId }
//   1) 카탈로그 가격 조회 (미등재 → 400)
//   2) 트랜잭션: pvp-wallet.v1 잠금 → 코인 검증 → 칭호 부여(idempotent) → 코인 차감
//      - 코인 부족 → 402 (지급/부여 없음)
//      - 이미 보유 → 409 (차감 없음)
//   3) 응답: { ok, titleId, coinBalance }
//
// 락 순서: pvp-wallet.v1 → adventure-log.v2(grantTitleIfMissingInTx 내부). 다른 경로는 이 둘을
// 역순으로 안 잡으므로(battleClaim 은 pvp-wallet 미접근) 데드락 없음.

import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { checkSession } from "@/lib/server/checkSession";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { PVP_WALLET_KEY, type PvpWallet } from "@/lib/server/pvp/coins";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { pvpShopPriceFor } from "@/adventure/pvp/shop";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await checkSession(userId, req);
  if (sessionFail) return sessionFail;

  let body: { titleId?: unknown };
  try {
    body = (await req.json()) as { titleId?: unknown };
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const titleId = typeof body.titleId === "string" ? body.titleId : null;
  if (!titleId) return new Response("titleId required", { status: 400 });

  const price = pvpShopPriceFor(titleId);
  if (price === undefined) {
    return new Response(`unknown shop title: ${titleId}`, { status: 400 });
  }

  const outcome = await db.transaction(async (tx) => {
    const wallet = await lockSaveForUpdate<PvpWallet>(tx, userId, PVP_WALLET_KEY, {
      coins: 0,
    });
    const coins = typeof wallet.coins === "number" ? wallet.coins : 0;
    if (coins < price) {
      return { kind: "insufficient" as const, coinBalance: coins };
    }
    // 부여 먼저(소유 확인) — 이미 보유면 차감 없이 종료.
    const granted = await grantTitleIfMissingInTx(tx, userId, titleId, Date.now());
    if (!granted) {
      return { kind: "owned" as const, coinBalance: coins };
    }
    const coinBalance = coins - price;
    await upsertSave(tx, userId, PVP_WALLET_KEY, { coins: coinBalance });
    return { kind: "ok" as const, coinBalance };
  });

  if (outcome.kind === "insufficient") {
    return Response.json(
      { error: "insufficient_coins", coinBalance: outcome.coinBalance },
      { status: 402 },
    );
  }
  if (outcome.kind === "owned") {
    return Response.json(
      { error: "already_owned", coinBalance: outcome.coinBalance },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, titleId, coinBalance: outcome.coinBalance });
}
