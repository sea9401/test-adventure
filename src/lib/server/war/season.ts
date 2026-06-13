// v2 전쟁 주간 시즌 — PvP·낚시·보물과 동일한 ISO 주차 경계(월 00:00 KST = 일 15:00 UTC).
// 별도 시즌 테이블 없이 시각에서 파생한다(보물 시즌과 같은 패턴). 점수 원장
// (war_score_events)이 season_id 로 스코프되고, 주간 롤오버 크론이 "직전 시즌"을 닫는다.

import {
  seasonIdFor,
  weekEndUtcFor,
  weekStartUtcFor,
} from "@/lib/server/pvp/season";

export function currentWarSeasonId(now: Date = new Date()): string {
  return seasonIdFor(weekStartUtcFor(now));
}

export function warSeasonBounds(now: Date = new Date()): {
  id: string;
  startAt: Date;
  endAt: Date;
} {
  const startAt = weekStartUtcFor(now);
  return { id: seasonIdFor(startAt), startAt, endAt: weekEndUtcFor(startAt) };
}

// 주간 롤오버 시 활성 쟁탈 거점 점령 처리 결정(순수). 경계-인식형 중립화 —
// 시즌 경계(15:00)와 롤오버 크론(15:03) 사이 창에서 정당하게 점령된 "새 시즌 첫 점령"이
// 지난 시즌 잔재와 섞여 삭제되는 것을 막는다.
//   already-neutral: 점령자 없음(이미 중립) → 무동작.
//   keep:            새 시즌 경계 이후 점령 → 유지(증발 방지).
//   neutralize:      경계 이전 점령(지난 시즌 보유자) → 중립화(row 삭제).
export function rolloverDecision(
  occupiedByUserId: string | null | undefined,
  occupiedAt: Date,
  seasonStart: Date,
): "already-neutral" | "keep" | "neutralize" {
  if (occupiedByUserId == null) return "already-neutral";
  return occupiedAt.getTime() >= seasonStart.getTime() ? "keep" : "neutralize";
}
