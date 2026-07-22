import { requireCronAuth } from "@/lib/server/cronAuth";
import { ensureArenaTournament } from "@/lib/server/pvp/arenaTournamentService";

// GET /api/cron/pvp-tournament — 일요일 00:00 KST에 대진·전투 템플릿을 동결하고,
// 19:00 KST부터 15분마다 재호출해 같은 라운드 경기를 일괄 확정·베팅 정산한다.
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
