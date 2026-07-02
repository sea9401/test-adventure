import { requireCronAuth } from "@/lib/server/cronAuth";
// GET /api/cron/pvp-season-rollover — 매주 월요일 00:02 KST (= UTC 일요일 15:02) 실행.
//
// 1) 만료된 active 시즌 → closed 로 마킹 (closeExpiredSeasons)
// 2) 이번 주 시즌이 없으면 생성 (getOrCreateCurrentSeason)
//
// 둘 다 getOrCreateCurrentSeason 자체의 self-heal 로도 트리거되지만, 다음 두 가지 이유로
// cron 도 유지:
//   - 첫 PvP 호출이 늦으면 시즌 종료가 늦어짐 (보상 지급 cron 들이 그 사이 돌면 데이터 어긋남)
//   - 보상 지급 cron 이 추가되면 "닫힌 직후" 시점 보장이 필요
//
// 보상 지급은 별도 cron (다음 PR) — 여기선 시즌 경계만.

import {
  closeExpiredSeasons,
  getOrCreateCurrentSeason,
} from "@/lib/server/pvp/season";

export async function GET(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const now = new Date();
  const closed = await closeExpiredSeasons(now);
  const current = await getOrCreateCurrentSeason(now);

  return Response.json({
    ok: true,
    closed,
    current: {
      id: current.id,
      startAt: current.startAt,
      endAt: current.endAt,
    },
  });
}
