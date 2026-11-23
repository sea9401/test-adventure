// 퀘스트 보상 가운데 가방에 들어가는 것(회복약, 귀속 회복약, 숙련 증서)을 지급한다.
// 한 건 수령과 모두 받기가 같이 쓴다.

import { MASTERY_CERTIFICATE_KEY } from "@/adventure/data/v2/masteryTower";
import type { QuestReward } from "@/adventure/data/v2/v2Quests";
import {
  grantStaminaPotions,
  STAMINA_POTIONS_KEY,
} from "@/adventure/v2/staminaPotions";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { lockSaveForUpdate, upsertSave, type DbExecutor } from "@/lib/server/savesKv";

export type QuestItemRewards = {
  staminaPotions: number;
  boundStaminaPotions: number;
  masteryCertificates: number;
};

function count(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function questItemRewards(reward: QuestReward): QuestItemRewards {
  return {
    staminaPotions: count(reward.staminaPotions),
    boundStaminaPotions: count(reward.boundStaminaPotions),
    masteryCertificates: count(reward.masteryCertificates),
  };
}

export function sumQuestItemRewards(
  rewards: readonly QuestReward[],
): QuestItemRewards {
  const total: QuestItemRewards = {
    staminaPotions: 0,
    boundStaminaPotions: 0,
    masteryCertificates: 0,
  };
  for (const reward of rewards) {
    const items = questItemRewards(reward);
    total.staminaPotions += items.staminaPotions;
    total.boundStaminaPotions += items.boundStaminaPotions;
    total.masteryCertificates += items.masteryCertificates;
  }
  return total;
}

/**
 * 잠금 순서: inventory.v2 → stamina-potions.v1. 회복약 세이브는 수령 경로에서 늘 마지막에 잠근다.
 * 부르는 쪽은 character.v2 등 앞선 세이브를 이미 잠근 상태여야 한다.
 */
export async function grantQuestItemRewardsInTx(
  tx: DbExecutor,
  userId: string,
  items: QuestItemRewards,
): Promise<void> {
  if (items.masteryCertificates > 0) {
    const inventory = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "inventory.v2",
      {},
    );
    await upsertSave(tx, userId, "inventory.v2", {
      ...inventory,
      [MASTERY_CERTIFICATE_KEY]:
        count(inventory[MASTERY_CERTIFICATE_KEY]) + items.masteryCertificates,
    });
  }
  if (items.staminaPotions > 0 || items.boundStaminaPotions > 0) {
    let potions = await lockSaveForUpdate<unknown>(tx, userId, STAMINA_POTIONS_KEY, {
      count: 0,
    });
    if (items.staminaPotions > 0) {
      potions = grantStaminaPotions(potions, items.staminaPotions);
    }
    if (items.boundStaminaPotions > 0) {
      potions = grantStaminaPotions(potions, items.boundStaminaPotions, {
        bound: true,
      });
    }
    await upsertSave(tx, userId, STAMINA_POTIONS_KEY, potions);
  }
}

export function recordQuestItemRewardEvents(
  userId: string,
  questId: string,
  items: QuestItemRewards,
  extraDetail: Record<string, unknown> = {},
): void {
  const detail = { questId, ...extraDetail };
  if (items.staminaPotions > 0) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.quest.stamina_potion",
      itemKind: "stamina_potion",
      quantity: items.staminaPotions,
      detail,
    });
  }
  if (items.boundStaminaPotions > 0) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.quest.stamina_potion",
      itemKind: "stamina_potion",
      quantity: items.boundStaminaPotions,
      detail: { ...detail, bound: true },
    });
  }
  if (items.masteryCertificates > 0) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.quest.mastery_certificate",
      itemKind: "mastery_certificate",
      quantity: items.masteryCertificates,
      detail,
    });
  }
}
