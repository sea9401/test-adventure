// 겨울 이벤트 주사위 말판 — 서버 서비스. 설계: docs/superpowers/specs/2026-11-12-winter-dice-board-design.md
//
// 잠금 순서: winter-board.v1 을 가장 먼저 잠그고, 그 뒤 지급 대상 세이브를 요청당 하나만 잠근다.
// winter-board.v1 은 이 파일만 잠그므로 다른 경로와 순환하지 않는다.

import { db } from "@/db";
import { savesKv } from "@/db/schema";
import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import { addMuseunCashItem } from "@/adventure/data/v2/museunCashItems";
import {
  WINTER_BOARD_SAVE_KEY,
  WINTER_MILESTONES,
  WINTER_QUEST_DICE_DAILY_CAP,
  WINTER_ROLLING_ENDS_AT,
  WINTER_SHOP_ENDS_AT,
  WINTER_SHOP_ITEMS,
  buyWinterShopItem,
  claimWinterMilestone,
  parseWinterBoardState,
  rollWinterDice,
  syncWinterDaily,
  winterBattleCoinTiersView,
  winterDailyCapped,
  winterPendingCount,
  winterPhase,
  type WinterBoardState,
  type WinterBoardView,
  type WinterDailyProgress,
  type WinterPhase,
  type WinterReward,
  type WinterRollResult,
} from "@/adventure/data/v2/winterBoard";
import {
  grantStaminaPotions,
  STAMINA_POTIONS_KEY,
} from "@/adventure/v2/staminaPotions";
import { kstDayKey } from "@/lib/kst";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { hasCompletedOnboarding } from "@/lib/server/profile";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "@/lib/server/savesKv";
import { readWinterDailyProgress } from "@/lib/server/winterBoardQuestDice";

export type { WinterBoardView };

export type WinterBoardFailure = { ok: false; error: string; status: number };

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validWinterRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

function failure(error: string, status: number): WinterBoardFailure {
  return { ok: false, error, status };
}

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function toView(state: WinterBoardState, now: Date): WinterBoardView {
  const nowMs = now.getTime();
  const dayKey = kstDayKey(now);
  const sameDay = state.dayKey === dayKey;
  return {
    ok: true,
    phase: winterPhase(nowMs),
    rollingEndsAt: WINTER_ROLLING_ENDS_AT,
    shopEndsAt: WINTER_SHOP_ENDS_AT,
    serverNow: nowMs,
    position: state.position,
    laps: state.laps,
    dice: state.dice,
    coins: state.coins,
    today: {
      visitGranted: sameDay && state.visitGranted,
      questDiceGranted: sameDay ? state.questDiceGranted : 0,
      questDiceCap: WINTER_QUEST_DICE_DAILY_CAP,
      battleCoins: winterBattleCoinTiersView(state, dayKey),
    },
    milestones: WINTER_MILESTONES.map((milestone) => {
      const claimed = state.claimedMilestones.includes(milestone.laps);
      return {
        laps: milestone.laps,
        label: milestone.label,
        claimed,
        claimable: !claimed && state.laps >= milestone.laps,
      };
    }),
    shop: WINTER_SHOP_ITEMS.map((item) => ({
      id: item.id,
      name: item.name,
      cost: item.cost,
      limit: item.limit,
      purchased: state.purchases[item.id] ?? 0,
    })),
    recentRolls: state.recentRolls,
    pending: winterPhase(nowMs) === "active"
      ? winterPendingCount(state)
      : winterPendingCount({ ...state, dice: 0 }),
  };
}

/** 참여 가능 여부. 통과하면 현재 단계를 돌려준다. */
async function gate(
  userId: string,
  now: Date,
): Promise<WinterBoardFailure | Exclude<WinterPhase, "ended">> {
  const phase = winterPhase(now.getTime());
  if (phase === "ended") return failure("event_ended", 410);
  if (!(await hasCompletedOnboarding(userId))) return failure("no_character", 409);
  return phase;
}

/** 오늘 더 적립할 주사위나 전투 주화가 남아 있을 때만 일일 퀘스트 완료 수와 전투 횟수를 다시 센다. */
async function dailyProgressFor(
  userId: string,
  now: Date,
  state: WinterBoardState,
): Promise<WinterDailyProgress> {
  // 다 채운 날의 0은 "더 줄 것 없음"으로 읽힌다(적립은 이미 준 수보다 줄지 않는다).
  return winterDailyCapped(state, kstDayKey(now))
    ? { completedDailyQuests: 0, battlesToday: 0 }
    : readWinterDailyProgress(userId, now);
}

/**
 * 행이 없으면 FOR UPDATE 가 잠글 대상이 없어 첫 요청 둘이 동시에 적립할 수 있다.
 * 빈 행을 멱등 선삽입한 뒤 잠근다.
 */
async function lockWinterState(
  tx: DbExecutor,
  userId: string,
): Promise<WinterBoardState> {
  await tx
    .insert(savesKv)
    .values({ userId, key: WINTER_BOARD_SAVE_KEY, value: {} })
    .onConflictDoNothing();
  return parseWinterBoardState(
    await lockSaveForUpdate<unknown>(tx, userId, WINTER_BOARD_SAVE_KEY, {}),
  );
}

/** 보상 종류에 맞는 세이브 하나를 잠가 지급한다. */
async function grantReward(
  tx: DbExecutor,
  userId: string,
  reward: WinterReward,
  nowMs: number,
): Promise<void> {
  switch (reward.kind) {
    case "stamina_potion": {
      const raw = await lockSaveForUpdate<unknown>(tx, userId, STAMINA_POTIONS_KEY, {});
      await upsertSave(
        tx,
        userId,
        STAMINA_POTIONS_KEY,
        grantStaminaPotions(raw, reward.count, { bound: true }),
      );
      return;
    }
    case "mastery_certificate": {
      const inventory = record(await lockSaveForUpdate(tx, userId, "inventory.v2", {}));
      await upsertSave(tx, userId, "inventory.v2", {
        ...inventory,
        [MASTERY_CERTIFICATE_KEY]: count(inventory[MASTERY_CERTIFICATE_KEY]) + reward.count,
      });
      return;
    }
    case "cash_item": {
      const character = record(await lockSaveForUpdate(tx, userId, "character.v2", {}));
      await upsertSave(tx, userId, "character.v2", {
        ...character,
        cashItems: addMuseunCashItem(character.cashItems, reward.itemId, reward.count),
      });
      return;
    }
    case "title":
      await grantTitleIfMissingInTx(tx, userId, reward.titleId, nowMs);
      return;
  }
}

function rewardLog(reward: WinterReward): { itemKind: string; itemId: string; quantity: number } {
  switch (reward.kind) {
    case "stamina_potion":
      return { itemKind: "stamina_potion", itemId: "stamina_potion", quantity: reward.count };
    case "mastery_certificate":
      return { itemKind: "mastery_certificate", itemId: MASTERY_CERTIFICATE_KEY, quantity: reward.count };
    case "cash_item":
      return { itemKind: "cash_item", itemId: reward.itemId, quantity: reward.count };
    case "title":
      return { itemKind: "title", itemId: reward.titleId, quantity: 1 };
  }
}

export async function readWinterBoard(
  userId: string,
  now: Date,
): Promise<WinterBoardView | WinterBoardFailure> {
  const phase = await gate(userId, now);
  if (typeof phase !== "string") return phase;
  let state = parseWinterBoardState(
    await readSave<unknown>(db, userId, WINTER_BOARD_SAVE_KEY, {}),
  );
  if (phase === "active") {
    const dayKey = kstDayKey(now);
    const progress = await dailyProgressFor(userId, now, state);
    if (syncWinterDaily(state, dayKey, progress).state !== state) {
      state = await db.transaction(async (tx) => {
        const locked = await lockWinterState(tx, userId);
        const synced = syncWinterDaily(locked, dayKey, progress).state;
        if (synced !== locked) {
          await upsertSave(tx, userId, WINTER_BOARD_SAVE_KEY, synced);
        }
        return synced;
      });
    }
  }
  return toView(state, now);
}

export async function rollWinterBoard(
  userId: string,
  input: { requestId: string; all: boolean },
  now: Date,
  rng: () => number = Math.random,
): Promise<(WinterBoardView & { result: WinterRollResult }) | WinterBoardFailure> {
  const phase = await gate(userId, now);
  if (typeof phase !== "string") return phase;
  if (phase !== "active") return failure("rolling_closed", 409);

  const dayKey = kstDayKey(now);
  const preview = parseWinterBoardState(
    await readSave<unknown>(db, userId, WINTER_BOARD_SAVE_KEY, {}),
  );
  const progress = await dailyProgressFor(userId, now, preview);

  type RollOutcome =
    | { error: "no_dice" }
    | { state: WinterBoardState; result: WinterRollResult; replay: boolean };
  const outcome = await db.transaction(async (tx): Promise<RollOutcome> => {
    const locked = await lockWinterState(tx, userId);
    if (locked.lastRoll?.requestId === input.requestId) {
      return { state: locked, result: locked.lastRoll.result, replay: true };
    }
    const synced = syncWinterDaily(locked, dayKey, progress).state;
    const rolled = rollWinterDice(synced, { all: input.all, rng });
    if ("error" in rolled) {
      if (synced !== locked) {
        await upsertSave(tx, userId, WINTER_BOARD_SAVE_KEY, synced);
      }
      return { error: rolled.error };
    }
    const next: WinterBoardState = {
      ...rolled.state,
      lastRoll: { requestId: input.requestId, result: rolled.result },
    };
    await upsertSave(tx, userId, WINTER_BOARD_SAVE_KEY, next);
    if (rolled.result.potions > 0) {
      await grantReward(
        tx,
        userId,
        { kind: "stamina_potion", count: rolled.result.potions },
        now.getTime(),
      );
    }
    return { state: next, result: rolled.result, replay: false };
  });

  if ("error" in outcome) return failure(outcome.error, 409);
  if (!outcome.replay) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.winter_board.roll",
      itemKind: "stamina_potion",
      itemId: "stamina_potion",
      quantity: outcome.result.potions,
      detail: {
        rolls: outcome.result.events.length,
        coins: outcome.result.coins,
        laps: outcome.result.lapsGained,
      },
    });
  }
  return { ...toView(outcome.state, now), result: outcome.result };
}

export async function claimWinterBoardMilestone(
  userId: string,
  laps: number,
  now: Date,
): Promise<(WinterBoardView & { reward: WinterReward }) | WinterBoardFailure> {
  const phase = await gate(userId, now);
  if (typeof phase !== "string") return phase;

  const outcome = await db.transaction(async (tx) => {
    const locked = await lockWinterState(tx, userId);
    const claimed = claimWinterMilestone(locked, laps);
    if ("error" in claimed) return { error: claimed.error };
    await upsertSave(tx, userId, WINTER_BOARD_SAVE_KEY, claimed.state);
    await grantReward(tx, userId, claimed.reward, now.getTime());
    return claimed;
  });

  if ("error" in outcome) {
    return failure(outcome.error, outcome.error === "unknown_milestone" ? 400 : 409);
  }
  recordEconomyEventSoon({
    userId,
    eventType: "reward.winter_board.milestone",
    ...rewardLog(outcome.reward),
    detail: { laps },
  });
  return { ...toView(outcome.state, now), reward: outcome.reward };
}

export async function buyWinterBoardItem(
  userId: string,
  itemId: string,
  now: Date,
): Promise<(WinterBoardView & { item: { id: string; name: string } }) | WinterBoardFailure> {
  const phase = await gate(userId, now);
  if (typeof phase !== "string") return phase;

  const outcome = await db.transaction(async (tx) => {
    const locked = await lockWinterState(tx, userId);
    const bought = buyWinterShopItem(locked, itemId);
    if ("error" in bought) return { error: bought.error };
    await upsertSave(tx, userId, WINTER_BOARD_SAVE_KEY, bought.state);
    await grantReward(tx, userId, bought.item.reward, now.getTime());
    return bought;
  });

  if ("error" in outcome) {
    return failure(outcome.error, outcome.error === "unknown_item" ? 400 : 409);
  }
  recordEconomyEventSoon({
    userId,
    eventType: "reward.winter_board.shop",
    ...rewardLog(outcome.item.reward),
    itemId: outcome.item.id,
    detail: { cost: outcome.item.cost },
  });
  return {
    ...toView(outcome.state, now),
    item: { id: outcome.item.id, name: outcome.item.name },
  };
}
