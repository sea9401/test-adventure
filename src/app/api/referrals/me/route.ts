import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  referralCodes,
  referralConversions,
  savesKv,
  users,
} from "@/db/schema";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";
import { ensureOriginalUser } from "@/lib/server/ensureUser";
import {
  REFERRAL_TUTORIAL_TASKS,
  normalizeReferralProgressTaskIds,
} from "@/adventure/data/v2/referralTutorial";
import {
  createReferralCode,
  REFERRAL_NEW_USER_STAMINA_POTIONS,
  REFERRAL_REFERRER_SIGNUP_STAMINA_POTIONS,
  REFERRAL_TUTORIAL_STAMINA_POTIONS_PER_TASK,
} from "@/lib/server/referrals";

async function requireUser(req: Request): Promise<string | Response> {
  const userId = await ensureOriginalUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await requireActiveDeviceSession(userId, req);
  return sessionFail ?? userId;
}

async function referralSummary(userId: string) {
  const [codeRow, currentProgressRows, referrals] = await Promise.all([
    db
      .select({ code: referralCodes.code, disabledAt: referralCodes.disabledAt })
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId))
      .limit(1),
    db
      .select({
        referrerSignupRewardedAt:
          referralConversions.referrerSignupRewardedAt,
        completedTutorialTaskIds:
          referralConversions.completedTutorialTaskIds,
      })
      .from(referralConversions)
      .where(eq(referralConversions.referredUserId, userId))
      .limit(1),
    db
      .select({
        currentName: users.gameName,
        referredName: referralConversions.referredName,
        referredUserId: referralConversions.referredUserId,
        referredDeletedAt: referralConversions.referredDeletedAt,
        character: savesKv.value,
        completedTutorialTaskIds:
          referralConversions.completedTutorialTaskIds,
        referrerSignupRewardedAt:
          referralConversions.referrerSignupRewardedAt,
        convertedAt: referralConversions.convertedAt,
      })
      .from(referralConversions)
      .leftJoin(users, eq(users.id, referralConversions.referredUserId))
      .leftJoin(
        savesKv,
        and(
          eq(savesKv.userId, referralConversions.referredUserId),
          eq(savesKv.key, "character.v2"),
        ),
      )
      .where(eq(referralConversions.referrerUserId, userId))
      .orderBy(desc(referralConversions.convertedAt)),
  ]);

  const referralRows = referrals.map((row) => {
    const deleted =
      row.referredUserId === null || row.referredDeletedAt !== null;
    const character = row.character as { frontierDepth?: unknown } | null;
    const currentFrontierDepth = deleted
      ? 2
      : Math.max(2, Math.floor(Number(character?.frontierDepth) || 2));
    const completedTaskIds = normalizeReferralProgressTaskIds(
      row.completedTutorialTaskIds,
    );
    const signupRewarded = row.referrerSignupRewardedAt !== null;
    return {
      name: deleted
        ? "탈퇴한 사용자"
        : (row.currentName ?? row.referredName ?? "새 모험가"),
      deleted,
      currentFrontierDepth,
      signupRewarded,
      completedTaskIds,
      completedRewardStages:
        completedTaskIds.length + (signupRewarded ? 1 : 0),
      convertedAt: row.convertedAt.toISOString(),
    };
  });
  const currentProgress = currentProgressRows[0];
  const myCompletedTaskIds = currentProgress
    ? normalizeReferralProgressTaskIds(
        currentProgress.completedTutorialTaskIds,
      )
    : [];
  const mySignupRewarded = currentProgress?.referrerSignupRewardedAt != null;

  return {
    code: codeRow[0]?.disabledAt ? null : (codeRow[0]?.code ?? null),
    newUserStaminaPotions: REFERRAL_NEW_USER_STAMINA_POTIONS,
    referrerSignupStaminaPotions:
      REFERRAL_REFERRER_SIGNUP_STAMINA_POTIONS,
    tutorialTaskStaminaPotions:
      REFERRAL_TUTORIAL_STAMINA_POTIONS_PER_TASK,
    tutorialTasks: REFERRAL_TUTORIAL_TASKS,
    hasReferrer: currentProgress != null,
    myReferralProgress: currentProgress
      ? {
          signupRewarded: mySignupRewarded,
          completedTaskIds: myCompletedTaskIds,
          completedRewardStages:
            myCompletedTaskIds.length + (mySignupRewarded ? 1 : 0),
        }
      : null,
    attributedCount: referralRows.length,
    totalRewardStaminaPotions: referralRows.reduce(
      (sum, referral) =>
        sum +
        (referral.signupRewarded
          ? REFERRAL_REFERRER_SIGNUP_STAMINA_POTIONS
          : 0) +
        referral.completedTaskIds.length *
          REFERRAL_TUTORIAL_STAMINA_POTIONS_PER_TASK,
      0,
    ),
    referrals: referralRows,
  };
}

// 내 홍보 코드와 완료 실적. 링크를 발급하지 않은 사용자는 code=null.
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  return Response.json({ ok: true, ...(await referralSummary(auth)) });
}

// 사용자당 영구 코드 하나를 멱등 발급한다. 극히 드문 랜덤 코드 충돌은 재시도한다.
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await db
      .insert(referralCodes)
      .values({ code: createReferralCode(), userId: auth })
      .onConflictDoNothing();

    const [row] = await db
      .select({ code: referralCodes.code, disabledAt: referralCodes.disabledAt })
      .from(referralCodes)
      .where(eq(referralCodes.userId, auth))
      .limit(1);
    if (row && !row.disabledAt) {
      return Response.json({ ok: true, ...(await referralSummary(auth)) });
    }
  }

  return Response.json({ ok: false, error: "issue_failed" }, { status: 503 });
}
