import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guildActivityLog, guildMembers, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// GET /api/v2/guild/activity — viewer 길드의 최근 활동 내역(가입·임명·입금·국가선포·창단).
//   길드 정보 탭 하단 표시. 이름은 현재 닉네임으로 batch 해석(로그엔 userId 만 저장).
//   무소속 → activity=[].

const ACTIVITY_LIMIT = 30;

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 내 길드.
  const memRow = (
    await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  if (!memRow) {
    return Response.json({ ok: true, activity: [] });
  }
  const guildId = memRow.guildId;

  const rows = await db
    .select({
      id: guildActivityLog.id,
      type: guildActivityLog.type,
      actorUserId: guildActivityLog.actorUserId,
      targetUserId: guildActivityLog.targetUserId,
      meta: guildActivityLog.meta,
      createdAt: guildActivityLog.createdAt,
    })
    .from(guildActivityLog)
    .where(eq(guildActivityLog.guildId, guildId))
    .orderBy(desc(guildActivityLog.createdAt))
    .limit(ACTIVITY_LIMIT);

  // 이름 batch 해석 — character-profile.v2.name (info 라우트와 동일 출처).
  const ids = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.actorUserId, r.targetUserId])
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const nameByUser = new Map<string, string>();
  if (ids.length > 0) {
    const profileRows = await db
      .select({ userId: savesKv.userId, value: savesKv.value })
      .from(savesKv)
      .where(
        and(
          inArray(savesKv.userId, ids),
          eq(savesKv.key, "character-profile.v2"),
        ),
      );
    for (const r of profileRows) {
      const v = (r.value ?? null) as { name?: string } | null;
      const n = v?.name?.trim();
      if (n) nameByUser.set(r.userId, n);
    }
  }
  const nameOf = (uid: string | null): string | null =>
    uid ? (nameByUser.get(uid) ?? "모험가") : null;

  return Response.json({
    ok: true,
    activity: rows.map((r) => ({
      id: r.id,
      type: r.type,
      actorName: nameOf(r.actorUserId),
      targetName: nameOf(r.targetUserId),
      meta: (r.meta ?? null) as {
        amount?: number;
        role?: string;
        nationName?: string;
        questTitle?: string;
        deliveryTitle?: string;
        itemName?: string;
        smithyLevel?: number;
        artisanXp?: number;
        artisanRank?: number;
        titleName?: string;
        rewardGold?: number;
        rewardFame?: number;
      } | null,
      createdAt: r.createdAt,
    })),
  });
}
