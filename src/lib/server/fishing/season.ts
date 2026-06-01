// 낚시 주간 시즌 — PvP 와 동일한 ISO 주차 경계(월 00:00 KST 시작)를 그대로 재사용한다.
// PR-4 는 리더보드만 — 시즌 라이프사이클 테이블/정산은 PR-5. 여기선 순수 계산만.

import {
  seasonIdFor,
  weekEndUtcFor,
  weekStartUtcFor,
} from "@/lib/server/pvp/season";

export function currentFishingSeasonId(now: Date = new Date()): string {
  return seasonIdFor(weekStartUtcFor(now));
}

export function fishingSeasonBounds(now: Date = new Date()): {
  id: string;
  startAt: Date;
  endAt: Date;
} {
  const startAt = weekStartUtcFor(now);
  return { id: seasonIdFor(startAt), startAt, endAt: weekEndUtcFor(startAt) };
}
