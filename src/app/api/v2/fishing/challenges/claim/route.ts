import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  FISHING_WALLET_KEY,
  fishingWalletWithCoins,
  walletCoins,
  type FishingWallet,
} from "@/lib/server/fishing/coins";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";
import {
  FISHING_DAILY_KEY,
  deriveFishingContractViews,
  deriveFishingDailyViews,
  fishingContractById,
  fishingDailyById,
  parseFishingDaily,
  rolloverFishingDaily,
} from "@/adventure/data/v2/fishingDailyChallenges";
import {
  FISHING_PROGRESS_KEY,
  deriveFishingGoalViews,
  emptyFishingProgression,
  fishingGoalById,
  parseFishingProgression,
} from "@/adventure/v2/fishingProgression";
import {
  FARM_FISHING_SEED_POUCH_NAME,
  FARM_SAVE_KEY,
  emptyFarmState,
  grantFarmSeeds,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  recordEconomyEventSoon,
  recordRewardFailureSoon,
} from "@/lib/server/economyLog";

// POST /api/v2/fishing/challenges/claim — body { id }. 완료된 일일 도전 보상(낚시 코인) 수령.
//   락 순서: 일일트래커 → 지갑 → 농장(reel 은 트래커만, 정산 크론은 지갑만 → 순환 없음).
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
  const dailyDef = fishingDailyById(id);
  const contractDef = fishingContractById(id);
  const goalDef = fishingGoalById(id);
  if (!dailyDef && !contractDef && !goalDef) {
    return Response.json(
      { ok: false, error: "unknown_challenge" },
      { status: 400 },
    );
  }

  const now = new Date();
  const nowMs = now.getTime();
  const dayKey = kstDailyKey(now);

  if (goalDef) {
    const result = await db.transaction(async (tx) => {
      const state = parseFishingProgression(
        await lockSaveForUpdate(
          tx,
          userId,
          FISHING_PROGRESS_KEY,
          emptyFishingProgression(),
        ),
      );
      const view = deriveFishingGoalViews(state).find((v) => v.id === id);
      if (!view) {
        return {
          status: 400,
          body: { ok: false as const, error: "unknown_challenge" },
        };
      }
      if (view.claimed) {
        return {
          status: 409,
          body: { ok: false as const, error: "already_claimed" },
        };
      }
      if (!view.claimable) {
        return {
          status: 400,
          body: { ok: false as const, error: "not_complete" },
        };
      }

      const wallet = await lockSaveForUpdate<FishingWallet>(
        tx,
        userId,
        FISHING_WALLET_KEY,
        { coins: 0 },
      );
      const coins = walletCoins(wallet) + goalDef.rewardCoins;
      await upsertSave(
        tx,
        userId,
        FISHING_WALLET_KEY,
        fishingWalletWithCoins(wallet, coins),
      );
      await upsertSave(tx, userId, FISHING_PROGRESS_KEY, {
        ...state,
        claimedGoals: [...state.claimedGoals, id],
      });

      return {
        status: 200,
        body: {
          ok: true as const,
          challengeId: id,
          reward: goalDef.rewardCoins,
          coins,
        },
      };
    });
    if (result.status === 200 && result.body.ok && result.body.reward > 0) {
      recordEconomyEventSoon({
        userId,
        eventType: "reward.fishing.challenge",
        itemKind: "fishing_coin",
        itemId: id,
        quantity: result.body.reward,
        detail: { challengeId: id, kind: "goal" },
      });
    } else if (result.status !== 200 && !result.body.ok) {
      recordRewardFailureSoon({
        userId,
        source: "fishing_challenge",
        error: result.body.error,
        detail: { challengeId: id, kind: "goal", status: result.status },
      });
    }
    return Response.json(result.body, { status: result.status });
  }

  const def = contractDef ?? dailyDef;
  if (!def) {
    return Response.json(
      { ok: false, error: "unknown_challenge" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const state = rolloverFishingDaily(
      parseFishingDaily(
        await lockSaveForUpdate(tx, userId, FISHING_DAILY_KEY, {}),
      ),
      dayKey,
    );
    const isContract = Boolean(contractDef);
    const view = isContract
      ? deriveFishingContractViews(state).find((v) => v.id === id)
      : deriveFishingDailyViews(state).find((v) => v.id === id);
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
    await upsertSave(
      tx,
      userId,
      FISHING_WALLET_KEY,
      fishingWalletWithCoins(wallet, coins),
    );

    const seedReward = def.rewardSeeds;
    const seedPouch =
      seedReward && Object.values(seedReward).some((count) => (count ?? 0) > 0)
        ? { name: FARM_FISHING_SEED_POUCH_NAME, seeds: seedReward }
        : undefined;
    if (seedPouch) {
      const farm = normalizeFarmForDay(
        parseFarmState(
          await lockSaveForUpdate(
            tx,
            userId,
            FARM_SAVE_KEY,
            emptyFarmState(nowMs),
          ),
        ),
        nowMs,
      );
      await upsertSave(
        tx,
        userId,
        FARM_SAVE_KEY,
        grantFarmSeeds(farm, seedPouch.seeds),
      );
    }

    await upsertSave(tx, userId, FISHING_DAILY_KEY, {
      ...state,
      claimed: isContract ? state.claimed : [...state.claimed, id],
      claimedContracts: isContract
        ? [...state.claimedContracts, id]
        : state.claimedContracts,
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        challengeId: id,
        reward: def.rewardCoins,
        coins,
        seedPouch,
      },
    };
  });

  if (result.status === 200 && result.body.ok && result.body.reward > 0) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.fishing.challenge",
      itemKind: "fishing_coin",
      itemId: id,
      quantity: result.body.reward,
      detail: { challengeId: id, kind: contractDef ? "contract" : "daily" },
    });
    if (result.body.seedPouch) {
      recordEconomyEventSoon({
        userId,
        eventType: "reward.fishing.seed_pouch",
        itemKind: "farm_seed_pouch",
        itemId: id,
        quantity: 1,
        detail: {
          challengeId: id,
          kind: contractDef ? "contract" : "daily",
          seeds: result.body.seedPouch.seeds,
        },
      });
    }
  } else if (result.status !== 200 && !result.body.ok) {
    recordRewardFailureSoon({
      userId,
      source: "fishing_challenge",
      error: result.body.error,
      detail: {
        challengeId: id,
        kind: contractDef ? "contract" : "daily",
        status: result.status,
      },
    });
  }

  return Response.json(result.body, { status: result.status });
}
