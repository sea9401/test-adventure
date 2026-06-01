// GET /api/cron/treasure-season-rewards — 주간 롤오버 직후(KST 월요일 새벽) 실행.
//
// 끝난(현재 시즌이 아닌) 보물 시즌 중 아직 보상 미지급인 것에 순위 발굴 코인을 일괄 지급한다.
// rewardsGrantedAt 으로 시즌당 1회 idempotent — 중복/재실행해도 두 번 지급되지 않는다.

import { grantPendingTreasureRewards } from "@/lib/server/treasure/seasonRewards";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const { results } = await grantPendingTreasureRewards(new Date());

  return Response.json({
    ok: true,
    granted: results.filter((r) => r.kind === "ok").length,
    seasons: results,
  });
}
