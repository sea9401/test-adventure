// 보물 주간 시즌 — PvP·낚시와 동일한 ISO 주차 경계(월 00:00 KST 시작)를 그대로 재사용.

import {
  seasonIdFor,
  weekEndUtcFor,
  weekStartUtcFor,
} from "@/lib/server/pvp/season";

export function currentTreasureSeasonId(now: Date = new Date()): string {
  return seasonIdFor(weekStartUtcFor(now));
}

export function treasureSeasonBounds(now: Date = new Date()): {
  id: string;
  startAt: Date;
  endAt: Date;
} {
  const startAt = weekStartUtcFor(now);
  return { id: seasonIdFor(startAt), startAt, endAt: weekEndUtcFor(startAt) };
}
