import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { getViewerGuild } from "@/lib/server/bulletinAccess";
import { isCurrentUserAdmin } from "@/lib/server/isAdmin";

// GET /api/bulletin/permissions — 클라가 글쓰기 폼에 공지사항 옵션을 노출할지 결정용.
// ADMIN_EMAILS 는 서버 환경변수라 클라에서 직접 비교할 수 없어 별도 엔드포인트가 필요.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const [isAdmin, guild] = await Promise.all([
    isCurrentUserAdmin(),
    getViewerGuild(db, userId),
  ]);
  return Response.json({
    isAdmin,
    guild: guild == null ? null : { id: guild.guildId, name: guild.guildName },
  });
}
