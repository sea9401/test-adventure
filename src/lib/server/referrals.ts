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
export const REFERRAL_NEW_USER_STAMINA_POTIONS = 2;
export const REFERRAL_REFERRER_STAMINA_POTIONS_PER_MILESTONE = 1;
export const REFERRAL_REWARD_DEPTHS = [6, 12, 18, 24, 36] as const;

export type ReferralRewardMilestone = {
  frontierDepth: (typeof REFERRAL_REWARD_DEPTHS)[number];
  referrerStaminaPotions: number;
};

type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export function referralRewardMilestones(): ReferralRewardMilestone[] {
  return REFERRAL_REWARD_DEPTHS.map((frontierDepth) => ({
    frontierDepth,
    referrerStaminaPotions:
      REFERRAL_REFERRER_STAMINA_POTIONS_PER_MILESTONE,
  }));
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
      rewardedStaminaDepth: 0,
    })
    .onConflictDoNothing({ target: referralConversions.referredUserId })
    .returning({ referredUserId: referralConversions.referredUserId });
  if (!conversion) return { attributed: false };

  await tx.insert(marketplaceInbox).values(
    inboxValues({
      userId: referredUserId,
      payload: {
        kind: "admin_gift",
        gold: 0,
        materials: [],
        items: [],
        staminaPotions: REFERRAL_NEW_USER_STAMINA_POTIONS,
        museunCoins: 0,
        cashItems: [],
        adventureSupportDays: 0,
      },
      message: `홍보 링크로 모험을 시작해 주셔서 스태미나 회복약 ${REFERRAL_NEW_USER_STAMINA_POTIONS}개를 드립니다.`,
    }),
  );
  return { attributed: true };
}

export async function rewardReferralProgress(
  tx: DbExecutor,
  referredUserId: string,
  referredName: string,
  frontierDepthRaw: unknown,
): Promise<{ staminaPotions: number; rewardedDepth: number }> {
  const frontierDepth = Math.max(0, Math.floor(Number(frontierDepthRaw) || 0));
  const milestones = referralRewardMilestones();
  const reached = milestones.filter(
    (milestone) => milestone.frontierDepth <= frontierDepth,
  );
  const targetDepth = reached.at(-1)?.frontierDepth ?? 0;
  if (targetDepth === 0) return { staminaPotions: 0, rewardedDepth: 0 };

  const [conversion] = await tx
    .select({
      referrerUserId: referralConversions.referrerUserId,
      rewardedStaminaDepth: referralConversions.rewardedStaminaDepth,
    })
    .from(referralConversions)
    .where(eq(referralConversions.referredUserId, referredUserId))
    .for("update")
    .limit(1);
  if (!conversion || conversion.rewardedStaminaDepth >= targetDepth) {
    return {
      staminaPotions: 0,
      rewardedDepth: conversion?.rewardedStaminaDepth ?? 0,
    };
  }

  const dueMilestoneCount = milestones
    .filter(
      (milestone) =>
        milestone.frontierDepth > conversion.rewardedStaminaDepth &&
        milestone.frontierDepth <= targetDepth,
    )
    .length;
  const dueStaminaPotions =
    dueMilestoneCount * REFERRAL_REFERRER_STAMINA_POTIONS_PER_MILESTONE;

  await tx
    .update(referralConversions)
    .set({
      rewardedStaminaDepth: targetDepth,
    })
    .where(eq(referralConversions.referredUserId, referredUserId));

  if (dueStaminaPotions > 0) {
    await tx.insert(marketplaceInbox).values(
      inboxValues({
        userId: conversion.referrerUserId,
        payload: {
          kind: "admin_gift",
          gold: 0,
          materials: [],
          items: [],
          staminaPotions: dueStaminaPotions,
          museunCoins: 0,
          cashItems: [],
          adventureSupportDays: 0,
        },
        message: `${referredName}님이 프론티어 ${targetDepth}에 도달했습니다. 홍보 보상 스태미나 회복약 ${dueStaminaPotions}개를 받아 주세요.`,
      }),
    );
  }

  return { staminaPotions: dueStaminaPotions, rewardedDepth: targetDepth };
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
