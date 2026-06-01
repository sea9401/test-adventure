import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { ANTIQUES, ANTIQUE_TIERS } from "@/adventure/data/v2/antique";
import {
  TREASURE_COLLECTION_KEY,
  parseTreasureCollection,
  removeInstanceById,
} from "@/adventure/v2/treasureCollection";
import {
  TREASURE_WALLET_KEY,
  walletCoins,
  type TreasureWallet,
} from "@/lib/server/treasure/coins";

// POST /api/v2/treasure/dismantle — body { instanceId }. 골동품 한 점을 감정사에게 분해해
// 발굴 코인으로 바꾼다(티어별 고정 dismantleCoins). 보관함에서 제거 + 지갑 적립.
// 락 순서: treasure-collection → treasure-wallet. (샵은 wallet→adventure-log, dig 는
// session→collection→codex — fragments/wallet 을 쥔 채 collection 을 역방향으로 잡는 경로 없음.)
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const instanceId =
    typeof (body as { instanceId?: unknown })?.instanceId === "string"
      ? (body as { instanceId: string }).instanceId
      : null;
  if (!instanceId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const outcome = await db.transaction(async (tx) => {
    const collection = parseTreasureCollection(
      await lockSaveForUpdate(tx, userId, TREASURE_COLLECTION_KEY, {}),
    );
    const removed = removeInstanceById(collection, instanceId);
    // 보관함에 없음(이미 분해/거래/없는 id) — 적립 없이 거부(중복 분해 차단).
    if (!removed) return { kind: "not_found" as const };

    const coinsGained =
      ANTIQUE_TIERS[ANTIQUES[removed.removed.antiqueId].tier].dismantleCoins;
    await upsertSave(tx, userId, TREASURE_COLLECTION_KEY, removed.collection);

    const wallet = await lockSaveForUpdate<TreasureWallet>(
      tx,
      userId,
      TREASURE_WALLET_KEY,
      { coins: 0 },
    );
    const coins = walletCoins(wallet) + coinsGained;
    await upsertSave(tx, userId, TREASURE_WALLET_KEY, { coins });
    return { kind: "ok" as const, coinsGained, coins };
  });

  if (outcome.kind === "not_found") {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return Response.json({
    ok: true,
    instanceId,
    coinsGained: outcome.coinsGained,
    coins: outcome.coins,
  });
}
