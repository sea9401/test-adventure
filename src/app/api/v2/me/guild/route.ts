import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";

// GET /api/v2/me/guild — viewer 의 길드 id 조회. 무소속이면 guildId=null.
// (옛 POST 시맨틱 — 자동 1인 길드 생성 — 폐기. 길드는 명시적 생성/가입.)
//
// 응답: { ok: true, guildId: number | null }
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guildId = await db.transaction(async (tx) => getGuildId(tx, userId));
  return Response.json({ ok: true, guildId });
}
