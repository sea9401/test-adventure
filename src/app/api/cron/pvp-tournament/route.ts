import { requireCronAuth } from "@/lib/server/cronAuth";
import { ensureArenaTournament } from "@/lib/server/pvp/arenaTournamentService";

// GET /api/cron/pvp-tournament — 매주 일요일 00:00 KST(토요일 15:00 UTC).
// 토요일까지의 순위와 현재 아레나 전투 템플릿을 동결해 최대 32인 토너먼트를 한 번에 확정한다.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const result = await ensureArenaTournament(new Date());
  return Response.json({
    ok: result.kind === "ok",
    result,
  });
}
