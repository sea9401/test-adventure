import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  couponCampaigns,
  couponCodes,
  economyEvents,
  marketplaceInbox,
} from "@/db/schema";
import {
  couponAvailability,
  couponRewardLabels,
  hashCouponCode,
  normalizeCouponCode,
  parseCouponReward,
} from "@/lib/coupon";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";
import { ensureUser } from "@/lib/server/ensureUser";
import { inboxValues } from "@/lib/server/inboxPayload";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

type RedeemError =
  | "invalid_code"
  | "not_available"
  | "not_started"
  | "expired"
  | "already_used"
  | "already_redeemed"
  | "not_eligible"
  | "invalid_reward";

export async function POST(req: Request) {
  const userId = await ensureUser({ skipDeviceCheck: true });
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sessionFail = await requireActiveDeviceSession(userId, req);
  if (sessionFail) return sessionFail;

  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:coupon:redeem",
    userLimit: 8,
    ipLimit: 40,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  let body: { code?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return couponError("invalid_code", 400);
  }
  const normalized = normalizeCouponCode(body.code);
  if (!normalized) return couponError("invalid_code", 400);

  const codeHash = hashCouponCode(normalized);
  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          codeId: couponCodes.id,
          restrictedUserId: couponCodes.restrictedUserId,
          redeemedByUserId: couponCodes.redeemedByUserId,
          redeemedAt: couponCodes.redeemedAt,
          campaignId: couponCampaigns.id,
          campaignSlug: couponCampaigns.slug,
          campaignName: couponCampaigns.name,
          reward: couponCampaigns.reward,
          message: couponCampaigns.message,
          startsAt: couponCampaigns.startsAt,
          endsAt: couponCampaigns.endsAt,
          active: couponCampaigns.active,
        })
        .from(couponCodes)
        .innerJoin(couponCampaigns, eq(couponCodes.campaignId, couponCampaigns.id))
        .where(eq(couponCodes.codeHash, codeHash))
        .limit(1)
        .for("update");

      if (!row) return fail("invalid_code", 404);
      if (!row.active) return fail("not_available", 409);

      const now = new Date();
      const availability = couponAvailability(row.startsAt, row.endsAt, now);
      if (availability === "not_started") return fail(availability, 409);
      if (availability === "expired") return fail(availability, 409);
      if (row.redeemedAt) {
        return row.redeemedByUserId === userId
          ? fail("already_redeemed", 409)
          : fail("already_used", 409);
      }
      if (row.restrictedUserId && row.restrictedUserId !== userId) {
        return fail("not_eligible", 403);
      }

      const reward = parseCouponReward(row.reward);
      if (!reward) return fail("invalid_reward", 500);

      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId,
          payload: reward,
          message: row.message || `${row.campaignName} 보상이 도착했습니다.`,
          fromName: "운영자",
        }),
      );
      const updated = await tx
        .update(couponCodes)
        .set({ redeemedByUserId: userId, redeemedAt: now })
        .where(and(eq(couponCodes.id, row.codeId), isNull(couponCodes.redeemedAt)))
        .returning({ id: couponCodes.id });
      if (updated.length !== 1) return fail("already_used", 409);

      await tx.insert(economyEvents).values({
        userId,
        eventType: "coupon.redeem",
        itemKind: "coupon_campaign",
        itemId: row.campaignSlug,
        quantity: 1,
        detail: { campaignId: row.campaignId, codeSuffix: normalized.slice(-4) },
      });

      return {
        ok: true as const,
        campaignName: row.campaignName,
        rewards: couponRewardLabels(reward),
      };
    });

    if (!result.ok) return couponError(result.error, result.status);
    return Response.json(result);
  } catch (error) {
    console.error("[coupons.redeem]", error);
    return couponError("not_available", 500);
  }
}

function fail(error: RedeemError, status: number) {
  return { ok: false as const, error, status };
}

function couponError(error: RedeemError, status: number) {
  return Response.json({ ok: false, error }, { status });
}
