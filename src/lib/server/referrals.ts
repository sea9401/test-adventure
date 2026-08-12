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
import {
  REFERRAL_TUTORIAL_TASKS,
  normalizeReferralProgressTaskIds,
  type ReferralTutorialProgressTaskId,
} from "@/adventure/data/v2/referralTutorial";
import {
  backfillReferralIdentityClaims,
  reserveReferralIdentityClaims,
} from "@/lib/server/referralIdentity";

export const REFERRAL_COOKIE = "adventure_referral";
export const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
export const REFERRAL_CODE_PATTERN = /^[a-f0-9]{16}$/;
export const REFERRAL_NEW_USER_STAMINA_POTIONS = 2;
export const REFERRAL_REFERRER_SIGNUP_STAMINA_POTIONS = 2;
export const REFERRAL_TUTORIAL_STAMINA_POTIONS_PER_TASK = 2;

type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export function createReferralCode(): string {
  return randomBytes(8).toString("hex");
}

export function referralLandingUrl(requestUrl: string): URL {
  // nginx 뒤에서는 request origin 이 내부 localhost:3000일 수 있다. 운영의 권위 공개
  // origin인 AUTH_URL을 우선해야 Location 헤더가 외부 사용자를 localhost로 보내지 않는다.
  const url = new URL("/sign-in", process.env.AUTH_URL ?? requestUrl);
  return url;
}

export async function attributeReferral(
  tx: DbExecutor,
  referredUserId: string,
  rawCode: unknown,
  referredName = "새 모험가",
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

  const identityReserved = await reserveReferralIdentityClaims(
    tx,
    referredUserId,
  );
  if (!identityReserved) return { attributed: false };

  const [conversion] = await tx
    .insert(referralConversions)
    .values({
      referredUserId,
      referrerUserId: owner.userId,
      referralCode: code,
      referredName,
      rewardGold: 0,
      rewardedDepth: 0,
      referrerSignupRewardedAt: new Date(),
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
  await tx.insert(marketplaceInbox).values(
    inboxValues({
      userId: owner.userId,
      payload: {
        kind: "admin_gift",
        gold: 0,
        materials: [],
        items: [],
        staminaPotions: REFERRAL_REFERRER_SIGNUP_STAMINA_POTIONS,
        museunCoins: 0,
        cashItems: [],
        adventureSupportDays: 0,
      },
      message: `${referredName}님이 홍보 링크로 합류했습니다. 가입 보상 스태미나 회복약 ${REFERRAL_REFERRER_SIGNUP_STAMINA_POTIONS}개를 받아 주세요.`,
    }),
  );
  return { attributed: true };
}

export async function rewardReferralTutorialTasks(
  tx: DbExecutor,
  referredUserId: string,
  referredName: string,
  candidateTaskIds: readonly ReferralTutorialProgressTaskId[],
): Promise<{
  staminaPotions: number;
  newlyCompletedTaskIds: ReferralTutorialProgressTaskId[];
  completedTaskIds: ReferralTutorialProgressTaskId[];
}> {
  const candidates = normalizeReferralProgressTaskIds(candidateTaskIds);
  if (candidates.length === 0) {
    return {
      staminaPotions: 0,
      newlyCompletedTaskIds: [],
      completedTaskIds: [],
    };
  }

  const [conversion] = await tx
    .select({
      referredUserId: referralConversions.referredUserId,
      referredName: referralConversions.referredName,
      referrerUserId: referralConversions.referrerUserId,
      completedTutorialTaskIds:
        referralConversions.completedTutorialTaskIds,
    })
    .from(referralConversions)
    .where(eq(referralConversions.referredUserId, referredUserId))
    .for("update")
    .limit(1);
  if (!conversion || conversion.referredUserId !== referredUserId) {
    return {
      staminaPotions: 0,
      newlyCompletedTaskIds: [],
      completedTaskIds: [],
    };
  }

  const completed = normalizeReferralProgressTaskIds(
    conversion.completedTutorialTaskIds,
  );
  const completedSet = new Set(completed);
  const newlyCompletedTaskIds = candidates.filter(
    (taskId) => !completedSet.has(taskId),
  );
  if (newlyCompletedTaskIds.length === 0) {
    return {
      staminaPotions: 0,
      newlyCompletedTaskIds: [],
      completedTaskIds: completed,
    };
  }

  const completedTaskIds = normalizeReferralProgressTaskIds([
    ...completed,
    ...newlyCompletedTaskIds,
  ]);
  const staminaPotions =
    newlyCompletedTaskIds.length * REFERRAL_TUTORIAL_STAMINA_POTIONS_PER_TASK;
  const displayName = conversion.referredName?.trim() || referredName;
  const taskNames = newlyCompletedTaskIds
    .map((taskId) =>
      REFERRAL_TUTORIAL_TASKS.find((task) => task.id === taskId)?.title)
    .filter((title) => title !== undefined)
    .join(", ");

  await tx
    .update(referralConversions)
    .set({ completedTutorialTaskIds: completedTaskIds })
    .where(eq(referralConversions.referredUserId, referredUserId));
  await tx.insert(marketplaceInbox).values(
    inboxValues({
      userId: referredUserId,
      payload: {
        kind: "admin_gift",
        gold: 0,
        materials: [],
        items: [],
        staminaPotions,
        museunCoins: 0,
        cashItems: [],
        adventureSupportDays: 0,
      },
      message: `홍보 이벤트 과제(${taskNames})를 완료했습니다. 스태미나 회복약 ${staminaPotions}개를 받아 주세요.`,
    }),
  );
  await tx.insert(marketplaceInbox).values(
    inboxValues({
      userId: conversion.referrerUserId,
      payload: {
        kind: "admin_gift",
        gold: 0,
        materials: [],
        items: [],
        staminaPotions,
        museunCoins: 0,
        cashItems: [],
        adventureSupportDays: 0,
      },
      message: `${displayName}님이 홍보 이벤트 과제(${taskNames})를 완료했습니다. 스태미나 회복약 ${staminaPotions}개를 받아 주세요.`,
    }),
  );

  return { staminaPotions, newlyCompletedTaskIds, completedTaskIds };
}

export async function preserveReferralBeforeUserDeletion(
  tx: DbExecutor,
  referredUserId: string,
): Promise<void> {
  const [conversion] = await tx
    .select({ id: referralConversions.id })
    .from(referralConversions)
    .where(eq(referralConversions.referredUserId, referredUserId))
    .limit(1);
  if (!conversion) return;

  await backfillReferralIdentityClaims(tx, referredUserId);
  await tx
    .update(referralConversions)
    .set({
      referredUserId: null,
      referredName: "탈퇴한 사용자",
      referredDeletedAt: new Date(),
    })
    .where(eq(referralConversions.id, conversion.id));
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
