import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import { currentAdminEmail, requireAdmin } from "@/lib/server/isAdmin";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  MASTERY_TOWER_SAVE_KEY,
  kstDateKey,
  masteryTowerClaimPreview,
  parseMasteryTowerState,
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
    const rawTower = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      MASTERY_TOWER_SAVE_KEY,
      {},
    );
    const date = kstDateKey();
    const previous = parseMasteryTowerState(rawTower, date);
    const previousClaimPreview = masteryTowerClaimPreview(previous);
    const tower = resetMasteryTowerDailyProgress(previous, date);

    await upsertSave(tx, userId, MASTERY_TOWER_SAVE_KEY, tower);

    return {
      previous,
      tower,
      lostPendingReward: previous.claimed ? 0 : previousClaimPreview.total,
    };
  });

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "mastery-tower.reset-daily",
    targetUserId: userId,
    detail: {
      gameName: target.gameName,
      previousTodayBestFloor: result.previous.todayBestFloor,
      previousClaimed: result.previous.claimed,
      lostPendingReward: result.lostPendingReward,
    },
  });

  return Response.json({ ok: true, ...result });
}
