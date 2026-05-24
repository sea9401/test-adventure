import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fiefdoms, guildMembers, guilds } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { defaultFiefdomState } from "@/adventure/fiefdom/builderData";
import { applyTick } from "@/adventure/fiefdom/tick";
import type { FiefdomState } from "@/adventure/fiefdom/types";

// GET /api/fiefdom/me — 내 길드의 영지 상태.
// 길드 미가입 → 403. 길드 있으면 fiefdom 행이 없을 경우 default state 자동 생성.
// 반환 전 applyTick — 마지막 활동 이후 누적 생산/훈련/regen 반영 후 DB 와 응답 동기화.
// 응답: { guildId, guildName, state, shieldUntil }.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const membership = await db
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!membership[0]) {
    return Response.json({ error: "no_guild" }, { status: 403 });
  }
  const guildId = membership[0].guildId;

  const guildRow = await db
    .select({ name: guilds.name })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);
  const guildName = guildRow[0]?.name ?? "길드";

  // 트랜잭션 — read + (필요시) tick 결과 write 를 한 번에.
  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(fiefdoms)
      .where(eq(fiefdoms.guildId, guildId))
      .limit(1)
      .for("update");

    const now = Date.now();
    if (!rows[0]) {
      const fresh = defaultFiefdomState();
      await tx.insert(fiefdoms).values({ guildId, state: fresh });
      return { state: fresh, shieldUntil: null as Date | null };
    }

    const { state: ticked } = applyTick(rows[0].state as FiefdomState, now);
    if (ticked !== rows[0].state) {
      await tx
        .update(fiefdoms)
        .set({ state: ticked, updatedAt: new Date(now) })
        .where(eq(fiefdoms.guildId, guildId));
    }
    return { state: ticked, shieldUntil: rows[0].shieldUntil };
  });

  return Response.json({
    guildId,
    guildName,
    state: result.state,
    shieldUntil: result.shieldUntil?.toISOString() ?? null,
  });
}
