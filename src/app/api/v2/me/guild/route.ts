import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { ensureSoloGuild } from "@/lib/server/v2EnsureSoloGuild";

// POST /api/v2/me/guild — v2 자동 1인 길드 보장.
//
// 모든 거점 점령이 길드 명의로 가는 흐름의 인프라.
// idempotent — 이미 길드 있으면 그 guildId 그대로 리턴.
// V2GameFlow mount 시 1회 호출 권장.
//
// 응답: { ok: true, guildId: number }
export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const guildId = await db.transaction(async (tx) => {
      return ensureSoloGuild(tx, userId);
    });
    return Response.json({ ok: true, guildId });
  } catch (e) {
    console.error("[v2/me/guild] ", e);
    return Response.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
