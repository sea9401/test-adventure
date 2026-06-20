import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  FISHING_WALLET_KEY,
  walletCoins,
  type FishingWallet,
} from "@/lib/server/fishing/coins";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";
import {
  FISHING_DAILY_KEY,
  deriveFishingDailyViews,
  fishingDailyById,
  parseFishingDaily,
  rolloverFishingDaily,
} from "@/adventure/data/v2/fishingDailyChallenges";

// POST /api/v2/fishing/challenges/claim — body { id }. 완료된 일일 도전 보상(낚시 코인) 수령.
//   락 순서: 일일트래커 → 지갑(reel 은 트래커만, 정산 크론은 지갑만 → 순환 없음, 데드락 안전).
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const def = fishingDailyById(id);
  if (!def) {
    return Response.json(
      { ok: false, error: "unknown_challenge" },
      { status: 400 },
    );
  }

  const now = new Date();
  const dayKey = kstDailyKey(now);

  const result = await db.transaction(async (tx) => {
    const state = rolloverFishingDaily(
      parseFishingDaily(
        await lockSaveForUpdate(tx, userId, FISHING_DAILY_KEY, {}),
      ),
      dayKey,
    );
    const view = deriveFishingDailyViews(state).find((v) => v.id === id);
    if (!view) {
      return { status: 400, body: { ok: false as const, error: "unknown_challenge" } };
    }
    if (view.claimed) {
      return { status: 409, body: { ok: false as const, error: "already_claimed" } };
    }
    if (!view.claimable) {
      return { status: 400, body: { ok: false as const, error: "not_complete" } };
    }

    const wallet = await lockSaveForUpdate<FishingWallet>(
      tx,
      userId,
      FISHING_WALLET_KEY,
      { coins: 0 },
    );
    const coins = walletCoins(wallet) + def.rewardCoins;
    await upsertSave(tx, userId, FISHING_WALLET_KEY, { coins });
    await upsertSave(tx, userId, FISHING_DAILY_KEY, {
      ...state,
      claimed: [...state.claimed, id],
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        challengeId: id,
        reward: def.rewardCoins,
        coins,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
