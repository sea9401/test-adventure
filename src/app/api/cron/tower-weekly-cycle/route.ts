import { runTowerWeeklyCycle } from "@/lib/server/tower/weeklyCycle";
import { requireCronAuth } from "@/lib/server/cronAuth";

// GET /api/cron/tower-weekly-cycle — 매주 월요일 00:01 KST 자동 실행.
// 지난 주 자격(weekHighest >= TOWER_WEEKLY_MIN_FLOOR) 유저들에 백분위 tier 칭호 부여.
// 길드 주간 cron(00:00) 과 분리 — 호스트 부담 분산 + 실패 시 영향 범위 격리.
export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const result = await runTowerWeeklyCycle();
  return Response.json({ ok: true, ...result });
}
