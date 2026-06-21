// v2 전쟁 쟁탈 거점 — 분쟁지대 아레나. (docs/v2-war-redesign-plan.md)
//
// 점령 가능한 거점 전부(현 OUTPOSTS)는 그대로 둔다. 그 위에 "쟁탈 거점" 레이어만 얹는다.
// 쟁탈 거점 = 주간 시즌 점수가 집계되고 매주 월 00:00 KST 중립 리셋되는 진짜 전장.
// 나머지 거점은 기존처럼 영구 영토 + PvE 세금 공간으로 남는다(아무것도 제거하지 않음).
//
// CONTESTABLE_OUTPOST_IDS = 중앙 분쟁지대 후보 풀. 순서 = 활성 우선순위(0번 = 앵커, 항상
// 활성). 앞쪽은 분쟁지대 반경(outpostDefense.ts CONFLICT_RADIUS) 안이라 수비 게이트 0 —
// 진입이 쉽다. 뒤로 갈수록 외곽이라 수비 전투력 게이트가 붙는다.
//
// WAR_ACTIVE_OUTPOST_COUNT = 활성 개수 다이얼. 현재 친구 테스트(~18명)에서는 1 — 모두를
// 앵커(카스트라) 한 점에 모은다. 인구가 차오르면 이 숫자만 올려 분쟁지대 전역을 전장으로
// 연다(~100명이면 풀 크기까지). 활성 선정은 풀 앞에서부터(결정론)라 앵커가 늘 첫 전장으로
// 고정된다 — 작은 규모에서 "전쟁은 카스트라에서"가 명확하도록.

import { OUTPOST_BY_ID } from "./outposts";

// 쟁탈 거점 후보 풀 — 순서가 활성 우선순위. 대부분 중앙 분쟁지대(평원·수비 게이트 면제),
// 외곽 2개(발마르·알토렌)는 분쟁 반경 밖이라 tier 수비 게이트가 있다.
export const CONTESTABLE_OUTPOST_IDS: readonly string[] = [
  "war_central_fort", // 카스트라 — 중앙 분쟁지대 핵심 요새(앵커, 늘 첫 전장)
  "war_central_tower", // 아르카눔
  "war_central_mine", // 베나리움
  "war_south_mine", // 카베르나
  "outpost_central_post", // 비길리아
  "outpost_plain_square", // 콩코르디아
  "outpost_plain_fort", // 발마르 (외곽 — 수비 게이트 있음)
  "outpost_plain_tower", // 알토렌 (외곽 — 수비 게이트 있음)
];

// 활성 쟁탈 거점 수 — 다이얼. 1 = 단일 전장(테스트). 인구 차오르면 상향(≤ 풀 크기).
export const WAR_ACTIVE_OUTPOST_COUNT = 1;

const CONTESTABLE_SET: ReadonlySet<string> = new Set(CONTESTABLE_OUTPOST_IDS);

// 이번 시즌 활성 쟁탈 거점 id (풀 앞에서부터 N개, 결정론·시즌 무관 고정).
export const ACTIVE_CONTEST_OUTPOST_IDS: readonly string[] =
  CONTESTABLE_OUTPOST_IDS.slice(0, WAR_ACTIVE_OUTPOST_COUNT);

const ACTIVE_SET: ReadonlySet<string> = new Set(ACTIVE_CONTEST_OUTPOST_IDS);

// 후보 풀에 든 거점인가(주간 시즌 대상이 될 수 있는 거점인가).
export function isContestableOutpost(id: string): boolean {
  return CONTESTABLE_SET.has(id);
}

// 이번 시즌 실제 활성 전장인가(점수 집계 + 주간 중립 리셋 대상).
export function isActiveContestOutpost(id: string): boolean {
  return ACTIVE_SET.has(id);
}

// 후보 풀의 모든 id 가 실재하는 점령 가능 거점인지(중립 아님) 정적 검증용 — 테스트에서 호출.
export function validateContestablePool(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const id of CONTESTABLE_OUTPOST_IDS) {
    const o = OUTPOST_BY_ID.get(id);
    if (!o) problems.push(`unknown outpost: ${id}`);
    else if (o.neutral) problems.push(`neutral cannot be contestable: ${id}`);
  }
  if (WAR_ACTIVE_OUTPOST_COUNT < 1) problems.push("active count < 1");
  if (WAR_ACTIVE_OUTPOST_COUNT > CONTESTABLE_OUTPOST_IDS.length)
    problems.push("active count > pool size");
  return { ok: problems.length === 0, problems };
}
