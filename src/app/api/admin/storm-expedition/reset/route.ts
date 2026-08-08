import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  STORM_EXPEDITION_DAILY_ATTEMPTS,
  STORM_EXPEDITION_SAVE_KEY,
  parseStormExpeditionState,
  stormExpeditionDateKey,
} from "@/adventure/data/v2/stormExpedition";
import { logAdminAction } from "@/lib/server/adminAudit";
import { currentAdminEmail, requireAdminRole } from "@/lib/server/isAdmin";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

// POST /api/admin/storm-expedition/reset — body { userId }
// 대상 유저가 오늘 사용한 폭풍 원정 입장 횟수만 0회로 되돌린다.
// 진행 중 원정, 누적 완주, SP 열매 천장/획득 기록은 보존한다.
export async function POST(req: Request) {
  const gate = await requireAdminRole("reward");
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

  const date = stormExpeditionDateKey();
  const result = await db.transaction(async (tx) => {
    const raw = await lockSaveForUpdate<unknown>(
      tx,
      userId,
      STORM_EXPEDITION_SAVE_KEY,
      {},
    );
    const previous = parseStormExpeditionState(raw, date);
    const expedition = { ...previous, attemptsUsed: 0 };

    if (previous.attemptsUsed > 0) {
      await upsertSave(tx, userId, STORM_EXPEDITION_SAVE_KEY, expedition);
    }

    return {
      previousAttemptsUsed: previous.attemptsUsed,
      expedition,
      activePreserved: previous.active !== null,
    };
  });

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "storm-expedition.reset-daily-attempts",
    targetUserId: userId,
    detail: {
      gameName: target.gameName,
      date,
      previousAttemptsUsed: result.previousAttemptsUsed,
      activePreserved: result.activePreserved,
      changed: result.previousAttemptsUsed > 0,
    },
  });

  return Response.json({
    ok: true,
    date,
    previousAttemptsUsed: result.previousAttemptsUsed,
    attemptsUsed: result.expedition.attemptsUsed,
    attemptsLeft: STORM_EXPEDITION_DAILY_ATTEMPTS,
    activePreserved: result.activePreserved,
  });
}
