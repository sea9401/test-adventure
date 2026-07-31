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
  createReferralCode,
  REFERRAL_NEW_USER_STAMINA_POTIONS,
  REFERRAL_REFERRER_STAMINA_POTIONS_PER_MILESTONE,
  referralRewardMilestones,
} from "@/lib/server/referrals";

async function requireUser(req: Request): Promise<string | Response> {
  const userId = await ensureOriginalUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await requireActiveDeviceSession(userId, req);
  return sessionFail ?? userId;
}

async function referralSummary(userId: string) {
  const milestones = referralRewardMilestones();
  const [codeRow, referrals] = await Promise.all([
    db
      .select({ code: referralCodes.code, disabledAt: referralCodes.disabledAt })
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId))
      .limit(1),
    db
      .select({
        name: users.gameName,
        character: savesKv.value,
        rewardedDepth: referralConversions.rewardedStaminaDepth,
        convertedAt: referralConversions.convertedAt,
      })
      .from(referralConversions)
      .innerJoin(users, eq(users.id, referralConversions.referredUserId))
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
    const character = row.character as { frontierDepth?: unknown } | null;
    const currentFrontierDepth = Math.max(
      2,
      Math.floor(Number(character?.frontierDepth) || 2),
    );
    const completedMilestones = milestones.filter(
      (milestone) => milestone.frontierDepth <= row.rewardedDepth,
    ).length;
    return {
      name: row.name ?? "새 모험가",
      currentFrontierDepth,
      rewardedDepth: row.rewardedDepth,
      completedMilestones,
      convertedAt: row.convertedAt.toISOString(),
    };
  });

  return {
    code: codeRow[0]?.disabledAt ? null : (codeRow[0]?.code ?? null),
    newUserStaminaPotions: REFERRAL_NEW_USER_STAMINA_POTIONS,
    referrerStaminaPotionsPerMilestone:
      REFERRAL_REFERRER_STAMINA_POTIONS_PER_MILESTONE,
    rewardMilestones: milestones,
    attributedCount: referralRows.length,
    totalRewardStaminaPotions: referralRows.reduce(
      (sum, referral) =>
        sum +
        referral.completedMilestones *
          REFERRAL_REFERRER_STAMINA_POTIONS_PER_MILESTONE,
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
