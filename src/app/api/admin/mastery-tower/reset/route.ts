import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import { currentAdminEmail, requireAdmin } from "@/lib/server/isAdmin";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { settleMasteryTowerRollover } from "@/lib/server/masteryTowerRollover";
import { upsertSave } from "@/lib/server/savesKv";
import {
  MASTERY_CERTIFICATE_KEY,
  MASTERY_TOWER_SAVE_KEY,
  kstDateKey,
  masteryTowerClaimPreview,
  resetMasteryTowerDailyProgress,
} from "@/adventure/data/v2/masteryTower";

// POST /api/admin/mastery-tower/reset — body { userId }
// 대상 유저의 숙련의 탑 "오늘 진행"만 초기화한다.
// lifetimeBestFloor / firstClearRewardsClaimed 는 보존해서 최초 돌파 보상을 중복 지급하지 않는다.
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  let body: { userId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return Response.json({ ok: false, error: "missing_userId" }, { status: 400 });
  }

  const [target] = await db
    .select({ id: users.id, gameName: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return Response.json(
      { ok: false, error: "user_not_found" },
      { status: 404 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const rollover = await settleMasteryTowerRollover(
      tx,
      userId,
      kstDateKey(),
    );
    const previous = rollover.tower;
    const previousClaimPreview = masteryTowerClaimPreview(previous);
    const tower = resetMasteryTowerDailyProgress(previous, previous.date);

    await upsertSave(tx, userId, MASTERY_TOWER_SAVE_KEY, tower);

    return {
      previous,
      tower,
      lostPendingReward: previous.claimed ? 0 : previousClaimPreview.total,
      autoClaimedReward: rollover.autoClaimedReward,
    };
  });

  if (result.autoClaimedReward) {
    recordEconomyEventSoon({
      userId,
      eventType: "reward.mastery_tower.certificate",
      itemKind: "mastery_certificate",
      itemId: MASTERY_CERTIFICATE_KEY,
      quantity: result.autoClaimedReward.total,
      detail: {
        automatic: true,
        previousDate: result.autoClaimedReward.previousDate,
        previousBestFloor: result.autoClaimedReward.previousBestFloor,
        base: result.autoClaimedReward.base,
        firstClearBonus: result.autoClaimedReward.firstClearBonus,
      },
    });
  }

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "mastery-tower.reset-daily",
    targetUserId: userId,
    detail: {
      gameName: target.gameName,
      previousTodayBestFloor: result.previous.todayBestFloor,
      previousClaimed: result.previous.claimed,
      lostPendingReward: result.lostPendingReward,
      autoClaimedReward: result.autoClaimedReward?.total ?? 0,
    },
  });

  return Response.json({ ok: true, ...result });
}
