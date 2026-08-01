import { requireCronAuth } from "@/lib/server/cronAuth";
import { ensureArenaTournament } from "@/lib/server/pvp/arenaTournamentService";

// GET /api/cron/pvp-tournament — 일요일 00:00 KST에 예선 순위·대진을 확정하고,
// 18:00 KST에 전투 템플릿을 최종 동결한 뒤 19:00부터 15분마다 경기를 확정·정산한다.
// 20:00 3·4위전, 20:15 결승까지 진행한다.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const result = await ensureArenaTournament(new Date());
  return Response.json({
    ok: result.kind === "ok",
    result,
  });
}
