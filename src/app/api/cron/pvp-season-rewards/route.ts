// GET /api/cron/pvp-season-rewards — 주간 롤오버 직후(KST 월요일 00:05 권장) 실행.
//
// 닫힌(만료) 시즌 중 아직 보상 미지급(rewardsGrantedAt null)인 것 전부에 순위별 투기장 코인을
// 지급한다. grantPendingSeasonRewards 가 closeExpiredSeasons 를 선행하므로 롤오버 cron 과
// 독립적으로도 안전(만료 시즌을 스스로 닫고 지급). rewardsGrantedAt 으로 시즌당 1회 idempotent —
// 중복/재실행해도 두 번 지급되지 않는다.

import { grantPendingSeasonRewards } from "@/lib/server/pvp/seasonRewards";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const { closed, results } = await grantPendingSeasonRewards(new Date());

  return Response.json({
    ok: true,
    closed,
    granted: results.filter((r) => r.kind === "ok").length,
    seasons: results,
  });
}
