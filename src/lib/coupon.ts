import { createHash } from "node:crypto";
import type { InboxPayload } from "@/lib/server/inboxPayload";
import { TITLES } from "@/adventure/data/titles";

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
  if (
    gold === null ||
    staminaPotions === null ||
    museunCoins === null ||
    adventureSupportDays === null ||
    titleIds === null
  ) {
    return null;
  }

  // 쿠폰 발급 CLI 는 수량형 보상과 영구 칭호만 만든다. 아이템 배열은 향후 관리자 UI가
  // 생겨도 기존 admin_gift 계약을 그대로 쓸 수 있도록 빈 배열만 허용한다.
  if (
    !isEmptyArray(reward.materials) ||
    !isEmptyArray(reward.items) ||
    !isEmptyArray(reward.cashItems)
  ) {
    return null;
  }
  if (
    gold + staminaPotions + museunCoins + adventureSupportDays <= 0 &&
    titleIds.length === 0
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
    cashItems: [],
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
