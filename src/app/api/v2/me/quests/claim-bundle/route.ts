import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  recordEconomyEventSoon,
  recordRewardFailureSoon,
} from "@/lib/server/economyLog";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  assembleQuestExtras,
  buildRepeatSignals,
  REPEAT_QUESTS_KEY,
} from "@/lib/server/v2QuestContext";
import {
  deriveRepeatBundle,
  parseRepeatSave,
  rolloverRepeatSave,
} from "@/adventure/data/v2/v2RepeatQuests";
import {
  STAMINA_POTIONS_KEY,
  staminaPotionCount,
} from "@/adventure/v2/staminaPotions";
import {
  FARM_DAILY_QUEST_SEED_POUCH_NAME,
  FARM_DAILY_QUEST_SEED_REWARD,
  FARM_SAVE_KEY,
  emptyFarmState,
  grantFarmSeeds,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";

// POST /api/v2/me/quests/claim-bundle { scope: "daily"|"weekly" } — 마일스톤 번들 보상 수령.
//   일일 4개 / 주간 3개 "완료"(진행도≥목표) 달성 시 번들 지급. 주기당 1회(bundleClaimed).
//   서버가 완료 수를 세이브에서 재판정(클라 신뢰 안 함) + 미수령 확인. 락 순서: repeat-quests.v2
//   → farm.v2(일일 씨앗 주머니) → stamina-potions.v1 (stamina-potions 는 leaf — 항상 마지막 잠금). 신호 무락 read.

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let body: { scope?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const scope = body.scope;
  if (scope !== "daily" && scope !== "weekly") {
    return Response.json({ ok: false, error: "bad_scope" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const repeatRaw = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      REPEAT_QUESTS_KEY,
      {},
    );
    const advLogRaw = await readSave(tx, userId, "adventure-log.v2", {});
    const extras = await assembleQuestExtras(tx, userId);
    const now = new Date();
    const nowMs = now.getTime();
    const signals = buildRepeatSignals(advLogRaw, extras);
    const rolled = rolloverRepeatSave(parseRepeatSave(repeatRaw), now, signals);
    const bundle = deriveRepeatBundle(rolled.save, signals, scope);
    if (bundle.claimed) {
      return {
        status: 409,
        body: { ok: false as const, error: "already_claimed" as const },
      };
    }
    if (!bundle.claimable) {
      return {
        status: 400,
        body: { ok: false as const, error: "not_complete" as const },
      };
    }
    // 번들 수령 표시 + 저장.
    const period = scope === "daily" ? rolled.save.daily! : rolled.save.weekly!;
    period.bundleClaimed = true;
    await upsertSave(tx, userId, REPEAT_QUESTS_KEY, rolled.save);
    const seedPouch =
      scope === "daily"
        ? {
            name: FARM_DAILY_QUEST_SEED_POUCH_NAME,
            seeds: FARM_DAILY_QUEST_SEED_REWARD,
          }
        : null;
    if (seedPouch) {
      const farmRaw = await lockSaveForUpdate(
        tx,
        userId,
        FARM_SAVE_KEY,
        emptyFarmState(nowMs),
      );
      const farm = normalizeFarmForDay(parseFarmState(farmRaw), nowMs);
      await upsertSave(tx, userId, FARM_SAVE_KEY, grantFarmSeeds(farm, seedPouch.seeds));
    }
    // 스태미나 포션 지급(leaf 마지막 잠금).
    const count = staminaPotionCount(
      await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, { count: 0 }),
    );
    const staminaPotions = count + bundle.potions;
    await upsertSave(tx, userId, STAMINA_POTIONS_KEY, { count: staminaPotions });
    return {
      status: 200,
      body: {
        ok: true as const,
        scope,
        potions: bundle.potions,
        staminaPotions,
        seedPouch,
      },
    };
  });

  if (result.status === 200 && result.body.ok && result.body.potions > 0) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.quest_bundle.stamina_potion",
      itemKind: "stamina_potion",
      quantity: result.body.potions,
      detail: { scope: result.body.scope },
    });
    if (result.body.seedPouch) {
      recordEconomyEventSoon({
        userId,
        eventType: "reward.quest_bundle.farm_seed_pouch",
        itemKind: "farm_seed",
        quantity: Object.values(result.body.seedPouch.seeds).reduce(
          (sum, count) => sum + count,
          0,
        ),
        detail: {
          scope: result.body.scope,
          pouch: result.body.seedPouch.name,
          seeds: result.body.seedPouch.seeds,
        },
      });
    }
  } else if (result.status !== 200 && !result.body.ok) {
    recordRewardFailureSoon({
      userId,
      source: "quest_bundle",
      error: result.body.error,
      detail: { scope, status: result.status },
    });
  }

  return Response.json(result.body, { status: result.status });
}
