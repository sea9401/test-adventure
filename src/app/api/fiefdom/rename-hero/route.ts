import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fiefdoms, guildMembers } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { applyTick } from "@/adventure/fiefdom/tick";
import type { FiefdomState } from "@/adventure/fiefdom/types";

// POST /api/fiefdom/rename-hero — 영웅 이름 변경.
// 본문: { name: string } (1~20자 trim). tick 안 필요(이름은 영웅 상태와 독립)지만 일관성
// 위해 동일 패턴 적용.

const MAX_NAME_LEN = 20;

export async function POST(req: Request) {
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

  let body: { name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (typeof body.name !== "string") {
    return Response.json({ error: "bad_intent" }, { status: 400 });
  }
  const trimmed = body.name.trim().slice(0, MAX_NAME_LEN);
  if (!trimmed) {
    return Response.json({ error: "name_empty" }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(fiefdoms)
        .where(eq(fiefdoms.guildId, guildId))
        .limit(1)
        .for("update");
      if (!rows[0]) return { kind: "error" as const, status: 404, reason: "fiefdom_missing" };

      const now = Date.now();
      const { state: ticked } = applyTick(rows[0].state as FiefdomState, now);
      const newState: FiefdomState = {
        ...ticked,
        hero: { ...ticked.hero, name: trimmed },
      };
      await tx
        .update(fiefdoms)
        .set({ state: newState, updatedAt: new Date(now) })
        .where(eq(fiefdoms.guildId, guildId));

      return { kind: "ok" as const, state: newState };
    });

    if (result.kind === "error") {
      return Response.json({ error: result.reason }, { status: result.status });
    }
    return Response.json({ state: result.state });
  } catch (e) {
    console.error("[fiefdom/rename-hero] failed", e);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
