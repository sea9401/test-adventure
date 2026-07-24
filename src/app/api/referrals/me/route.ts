import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { referralCodes, referralConversions, users } from "@/db/schema";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";
import { ensureOriginalUser } from "@/lib/server/ensureUser";
import {
  createReferralCode,
  referralRewardGold,
} from "@/lib/server/referrals";

async function requireUser(req: Request): Promise<string | Response> {
  const userId = await ensureOriginalUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await requireActiveDeviceSession(userId, req);
  return sessionFail ?? userId;
}

async function referralSummary(userId: string) {
  const [codeRow, totals, recent] = await Promise.all([
    db
      .select({ code: referralCodes.code, disabledAt: referralCodes.disabledAt })
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId))
      .limit(1),
    db
      .select({
        count: sql<number>`count(*)::int`,
        rewardGold: sql<number>`coalesce(sum(${referralConversions.rewardGold}), 0)::int`,
      })
      .from(referralConversions)
      .where(eq(referralConversions.referrerUserId, userId)),
    db
      .select({
        name: users.gameName,
        rewardGold: referralConversions.rewardGold,
        convertedAt: referralConversions.convertedAt,
      })
      .from(referralConversions)
      .innerJoin(users, eq(users.id, referralConversions.referredUserId))
      .where(eq(referralConversions.referrerUserId, userId))
      .orderBy(desc(referralConversions.convertedAt))
      .limit(10),
  ]);

  return {
    code: codeRow[0]?.disabledAt ? null : (codeRow[0]?.code ?? null),
    rewardGoldPerReferral: referralRewardGold(),
    completedCount: totals[0]?.count ?? 0,
    totalRewardGold: totals[0]?.rewardGold ?? 0,
    recent: recent.map((row) => ({
      name: row.name ?? "새 모험가",
      rewardGold: row.rewardGold,
      convertedAt: row.convertedAt.toISOString(),
    })),
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
