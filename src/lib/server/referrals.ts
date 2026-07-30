import "server-only";

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { db } from "@/db";
import {
  marketplaceInbox,
  referralCodes,
  referralConversions,
  users,
} from "@/db/schema";
import { inboxValues } from "@/lib/server/inboxPayload";

export const REFERRAL_COOKIE = "adventure_referral";
export const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
export const REFERRAL_CODE_PATTERN = /^[a-f0-9]{16}$/;

const DEFAULT_REWARD_GOLD = 10_000;
const MAX_REWARD_GOLD = 1_000_000_000;

export const REFERRAL_REWARD_DEPTHS = [12, 24, 36] as const;

export type ReferralRewardMilestone = {
  frontierDepth: (typeof REFERRAL_REWARD_DEPTHS)[number];
  rewardGold: number;
};

type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export function referralRewardGold(): number {
  const raw = process.env.REFERRAL_REWARD_GOLD;
  if (raw === undefined || raw.trim() === "") return DEFAULT_REWARD_GOLD;
  const configured = Number(raw);
  if (!Number.isSafeInteger(configured) || configured < 0) {
    return DEFAULT_REWARD_GOLD;
  }
  return Math.min(configured, MAX_REWARD_GOLD);
}

export function referralRewardMilestones(
  totalRewardGold = referralRewardGold(),
): ReferralRewardMilestone[] {
  const total = Math.max(0, Math.floor(totalRewardGold));
  const first = Math.floor(total * 0.2);
  const second = Math.floor(total * 0.3);
  return [
    { frontierDepth: 12, rewardGold: first },
    { frontierDepth: 24, rewardGold: second },
    { frontierDepth: 36, rewardGold: total - first - second },
  ];
}

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export function createReferralCode(): string {
  return randomBytes(8).toString("hex");
}

export function referralLandingUrl(
  requestUrl: string,
  status: "accepted" | "invalid",
): URL {
  // nginx 뒤에서는 request origin 이 내부 localhost:3000일 수 있다. 운영의 권위 공개
  // origin인 AUTH_URL을 우선해야 Location 헤더가 외부 사용자를 localhost로 보내지 않는다.
  const url = new URL("/sign-in", process.env.AUTH_URL ?? requestUrl);
  url.searchParams.set("referral", status);
  return url;
}

export async function attributeReferral(
  tx: DbExecutor,
  referredUserId: string,
  rawCode: unknown,
): Promise<{ attributed: boolean }> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { attributed: false };

  const [owner] = await tx
    .select({ userId: referralCodes.userId })
    .from(referralCodes)
    .where(and(eq(referralCodes.code, code), isNull(referralCodes.disabledAt)))
    .limit(1);
  if (!owner || owner.userId === referredUserId) {
    return { attributed: false };
  }

  const [conversion] = await tx
    .insert(referralConversions)
    .values({
      referredUserId,
      referrerUserId: owner.userId,
      referralCode: code,
      rewardGold: 0,
      rewardedDepth: 0,
    })
    .onConflictDoNothing({ target: referralConversions.referredUserId })
    .returning({ referredUserId: referralConversions.referredUserId });
  return { attributed: !!conversion };
}

export async function rewardReferralProgress(
  tx: DbExecutor,
  referredUserId: string,
  referredName: string,
  frontierDepthRaw: unknown,
): Promise<{ rewardGold: number; rewardedDepth: number }> {
  const frontierDepth = Math.max(0, Math.floor(Number(frontierDepthRaw) || 0));
  const milestones = referralRewardMilestones();
  const reached = milestones.filter(
    (milestone) => milestone.frontierDepth <= frontierDepth,
  );
  const targetDepth = reached.at(-1)?.frontierDepth ?? 0;
  if (targetDepth === 0) return { rewardGold: 0, rewardedDepth: 0 };

  const [conversion] = await tx
    .select({
      referrerUserId: referralConversions.referrerUserId,
      rewardGold: referralConversions.rewardGold,
      rewardedDepth: referralConversions.rewardedDepth,
    })
    .from(referralConversions)
    .where(eq(referralConversions.referredUserId, referredUserId))
    .for("update")
    .limit(1);
  if (!conversion || conversion.rewardedDepth >= targetDepth) {
    return {
      rewardGold: 0,
      rewardedDepth: conversion?.rewardedDepth ?? 0,
    };
  }

  const dueGold = milestones
    .filter(
      (milestone) =>
        milestone.frontierDepth > conversion.rewardedDepth &&
        milestone.frontierDepth <= targetDepth,
    )
    .reduce((sum, milestone) => sum + milestone.rewardGold, 0);

  await tx
    .update(referralConversions)
    .set({
      rewardGold: conversion.rewardGold + dueGold,
      rewardedDepth: targetDepth,
    })
    .where(eq(referralConversions.referredUserId, referredUserId));

  if (dueGold > 0) {
    await tx.insert(marketplaceInbox).values(
      inboxValues({
        userId: conversion.referrerUserId,
        payload: {
          kind: "admin_gift",
          gold: dueGold,
          materials: [],
          items: [],
          staminaPotions: 0,
          museunCoins: 0,
          cashItems: [],
          adventureSupportDays: 0,
        },
        message: `${referredName}님이 프론티어 ${targetDepth}에 도달했습니다. 단계 홍보 보상을 받아 주세요.`,
      }),
    );
  }

  return { rewardGold: dueGold, rewardedDepth: targetDepth };
}

export async function referralCodeIsActive(
  executor: DbExecutor,
  rawCode: unknown,
): Promise<boolean> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return false;
  const [row] = await executor
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .innerJoin(users, eq(users.id, referralCodes.userId))
    .where(and(eq(referralCodes.code, code), isNull(referralCodes.disabledAt)))
    .limit(1);
  return !!row;
}
