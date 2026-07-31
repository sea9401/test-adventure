import { createHash } from "node:crypto";
import type { InboxPayload } from "@/lib/server/inboxPayload";
import { TITLES } from "@/adventure/data/titles";
import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_COSMETIC_BOX_ITEM_IDS,
  type MuseunCosmeticBoxItemId,
} from "@/adventure/data/v2/museunCashItems";

const MAX_REWARD_AMOUNT = 1_000_000;

export type CouponReward = Extract<InboxPayload, { kind: "admin_gift" }>;

export function normalizeCouponCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 12 && normalized.length <= 40 ? normalized : null;
}

export function hashCouponCode(normalizedCode: string): string {
  return createHash("sha256").update(normalizedCode, "utf8").digest("hex");
}

export function parseCouponReward(value: unknown): CouponReward | null {
  if (typeof value !== "object" || value === null) return null;
  const reward = value as Record<string, unknown>;
  const gold = boundedAmount(reward.gold);
  const staminaPotions = boundedAmount(reward.staminaPotions);
  const museunCoins = boundedAmount(reward.museunCoins);
  const adventureSupportDays = boundedAmount(reward.adventureSupportDays, 3650);
  const titleIds = couponTitleIds(reward.titleIds);
  const cashItems = couponCashItems(reward.cashItems);
  if (
    gold === null ||
    staminaPotions === null ||
    museunCoins === null ||
    adventureSupportDays === null ||
    titleIds === null ||
    cashItems === null
  ) {
    return null;
  }

  // 일반 장비·재료는 캠페인 보상에서 계속 막고, 중복 없는 꾸미기 상자 3종만 허용한다.
  // 특정 외형을 직접 지급하는 entitlement 는 기간 시작 시점이 달라질 수 있어 제외한다.
  if (!isEmptyArray(reward.materials) || !isEmptyArray(reward.items)) {
    return null;
  }
  if (
    gold + staminaPotions + museunCoins + adventureSupportDays <= 0 &&
    titleIds.length === 0 &&
    cashItems.length === 0
  ) {
    return null;
  }

  return {
    kind: "admin_gift",
    gold,
    materials: [],
    items: [],
    staminaPotions,
    museunCoins,
    cashItems,
    adventureSupportDays,
    ...(titleIds.length > 0 ? { titleIds } : {}),
  };
}

export function couponRewardLabels(reward: CouponReward): string[] {
  const labels: string[] = [];
  for (const titleId of reward.titleIds ?? []) {
    const title = TITLES[titleId];
    if (title) labels.push(`칭호 ‘${title.name}’`);
  }
  if (reward.gold > 0) labels.push(`${reward.gold.toLocaleString("ko-KR")} 골드`);
  if (reward.museunCoins > 0) {
    labels.push(`무슨 코인 ${reward.museunCoins.toLocaleString("ko-KR")}개`);
  }
  if (reward.staminaPotions > 0) {
    labels.push(`스태미나 회복약 ${reward.staminaPotions.toLocaleString("ko-KR")}개`);
  }
  if (reward.adventureSupportDays > 0) {
    labels.push(`모험 지원권 ${reward.adventureSupportDays.toLocaleString("ko-KR")}일`);
  }
  for (const item of reward.cashItems) {
    labels.push(
      `${MUSEUN_CASH_ITEMS[item.itemId].name} ${item.count.toLocaleString("ko-KR")}개`,
    );
  }
  return labels;
}

export function couponAvailability(
  startsAt: Date,
  endsAt: Date | null,
  now: Date = new Date(),
): "not_started" | "expired" | null {
  if (now < startsAt) return "not_started";
  if (endsAt && now >= endsAt) return "expired";
  return null;
}

function boundedAmount(value: unknown, max = MAX_REWARD_AMOUNT): number | null {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const amount = Math.trunc(value);
  return amount >= 0 && amount <= max ? amount : null;
}

function isEmptyArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

function couponTitleIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !Object.prototype.hasOwnProperty.call(TITLES, item)
    ) {
      return null;
    }
    ids.add(item);
  }
  return [...ids];
}

function couponCashItems(
  value: unknown,
): CouponReward["cashItems"] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const counts = new Map<MuseunCosmeticBoxItemId, number>();
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const row = item as Record<string, unknown>;
    if (
      typeof row.itemId !== "string" ||
      !(MUSEUN_COSMETIC_BOX_ITEM_IDS as readonly string[]).includes(row.itemId)
    ) {
      return null;
    }
    const count = boundedAmount(row.count);
    if (count === null || count <= 0) return null;
    const itemId = row.itemId as MuseunCosmeticBoxItemId;
    const next = (counts.get(itemId) ?? 0) + count;
    if (next > MAX_REWARD_AMOUNT) return null;
    counts.set(itemId, next);
  }

  return MUSEUN_COSMETIC_BOX_ITEM_IDS.flatMap((itemId) => {
    const count = counts.get(itemId);
    return count ? [{ itemId, count }] : [];
  });
}
