// 보급선식 점령 — 거점은 길드가 이미 소유한 거점이나 중립 자유도시에 "인접"해야 점령할 수
// 있다. 점령이 영토에서 연속되게(또는 중립 발판에서 시작) 강제하는 규칙. 인접 기준은 거점
// 연결 그래프(getOutpostNeighbors) — 지도에 그려진 길과 동일.
//
// claim 라우트가 이 순수 함수를 쓴다(DB 없이 단위 테스트 가능). 라우트는 길드 소유 거점
// id 목록만 넘긴다.

import { OUTPOSTS } from "./outposts";
import { getOutpostNeighbors } from "./outpostGraph";

// 중립 자유도시 — 어느 길드 영토도 아니지만, 인접하면 첫 점령의 발판이 된다(항상 열린 앵커).
const NEUTRAL_ANCHOR_IDS: ReadonlySet<string> = new Set(
  OUTPOSTS.filter((o) => o.neutral).map((o) => o.id),
);

// target 을 점령할 수 있는가 — 길드 소유 거점 또는 중립 자유도시에 인접해야 한다.
// (target 자체가 이미 소유/중립인 경우는 호출 전에 별도로 걸러진다 — 여기선 인접만 판정.)
export function canClaimOutpost(
  targetId: string,
  ownedOutpostIds: Iterable<string>,
): boolean {
  const owned =
    ownedOutpostIds instanceof Set
      ? (ownedOutpostIds as Set<string>)
      : new Set(ownedOutpostIds);
  for (const nb of getOutpostNeighbors(targetId)) {
    if (NEUTRAL_ANCHOR_IDS.has(nb) || owned.has(nb)) return true;
  }
  return false;
}
