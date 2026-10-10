// GET /api/cron/fishing-season-rewards — 주간 롤오버 직후(KST 월요일 새벽) 실행.
//
// 끝난(현재 시즌이 아닌) 낚시 시즌 중 아직 보상 미지급인 것에 종별 순위 코인을 일괄 지급한다.
// 이어서 끝난 생활 축제 주차의 순위 보상(축제 증표)도 지급한다.
// rewardsGrantedAt 으로 시즌당 1회 idempotent — 중복/재실행해도 두 번 지급되지 않는다.

import { grantPendingFishingRewards } from "@/lib/server/fishing/seasonRewards";
import { grantPendingLifeFestivalRewards } from "@/lib/server/lifeFestival/settlement";
import { requireCronAuth } from "@/lib/server/cronAuth";

export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const now = new Date();
  const { results } = await grantPendingFishingRewards(now);
  // 생활 축제 주간 순위도 같은 주간 롤오버 시점에 정산한다(서버 crontab 추가 없이).
  const lifeFestival = await grantPendingLifeFestivalRewards(now);

  return Response.json({
    ok: true,
    granted: results.filter((r) => r.kind === "ok").length,
    seasons: results,
    lifeFestival: {
      granted: lifeFestival.results.filter((r) => r.kind === "ok").length,
      weeks: lifeFestival.results,
    },
  });
}
