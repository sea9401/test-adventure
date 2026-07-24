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

export async function completeReferral(
  tx: DbExecutor,
  referredUserId: string,
  referredName: string,
  rawCode: unknown,
): Promise<{ rewarded: boolean; rewardGold: number }> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { rewarded: false, rewardGold: 0 };

  const [owner] = await tx
    .select({ userId: referralCodes.userId })
    .from(referralCodes)
    .where(and(eq(referralCodes.code, code), isNull(referralCodes.disabledAt)))
    .limit(1);
  if (!owner || owner.userId === referredUserId) {
    return { rewarded: false, rewardGold: 0 };
  }

  const rewardGold = referralRewardGold();
  const [conversion] = await tx
    .insert(referralConversions)
    .values({
      referredUserId,
      referrerUserId: owner.userId,
      referralCode: code,
      rewardGold,
    })
    .onConflictDoNothing({ target: referralConversions.referredUserId })
    .returning({ referredUserId: referralConversions.referredUserId });
  if (!conversion) return { rewarded: false, rewardGold: 0 };

  if (rewardGold > 0) {
    await tx.insert(marketplaceInbox).values(
      inboxValues({
        userId: owner.userId,
        payload: {
          kind: "admin_gift",
          gold: rewardGold,
          materials: [],
          items: [],
          staminaPotions: 0,
          museunCoins: 0,
          cashItems: [],
          adventureSupportDays: 0,
        },
        message: `${referredName}님이 홍보 링크로 모험을 시작했습니다. 홍보 보상을 받아 주세요.`,
      }),
    );
  }

  return { rewarded: true, rewardGold };
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
