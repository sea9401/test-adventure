// v2 거점 인접 그래프 — 좌표 근접 자동 계산 후 "적당히 솎은" 길망.
//
// 거점 데이터(outposts.ts)에는 좌표만 있고 연결 정보가 없다. 이동을 "인접 거점으로만"
// 제한하고 지도에 길을 그리려면 인접 기준이 필요한데, 좌표로부터 만든다:
//
//  1) Gabriel 그래프로 인접 "후보" 를 뽑는다 — 두 거점 a, b 는 지름이 선분 ab 인 원 안에
//     다른 거점이 하나도 없을 때 후보. (각 acb 가 둔각 ⇔ d2(a,c)+d2(b,c) < d2(a,b).)
//     평면 그래프에 가까워 선 교차가 적다. 단, 후보를 전부 이으면 거미줄처럼 빽빽하다.
//  2) 그래서 전부 잇지 않는다. Euclidean MST(최소 신장 트리)는 무조건 유지해 전체가
//     하나로 연결됨을 보장하고(고립 거점 0), 나머지 후보는 EXTRA_EDGE_FRACTION 만큼만
//     "적당히 무작위로" 더 잇는다. 무작위는 엣지 id 해시 기반이라 결정적 —
//     리로드/서버·클라에서 늘 같은 모양(깜빡임·하이드레이션 불일치 없음).
//
// n=96 이라 모듈 로드 시 한 번만 계산하고 캐시한다.
//
// 특정 구간을 손보고 싶으면 아래 MANUAL_ADD / MANUAL_REMOVE 에 [idA, idB] 한 줄.

import { OUTPOSTS, START_OUTPOST_ID } from "./outposts";

export type OutpostEdge = { a: string; b: string };

// 추가 연결 밀도 — MST 외의 Gabriel 후보 중 이 비율만큼만 무작위로 더 잇는다.
// 1.0 = 후보 전부(빽빽한 거미줄), 0 = 순수 트리(가장 성김). 0~1.
const EXTRA_EDGE_FRACTION = 0.35;

// 막다른 거점 완화 — 각 거점이 최소 이만큼의 연결을 갖도록 가장 가까운 미포함 후보를 더한다
// (차수 1 = 들어가면 왔던 길로만 나오는 막다른 길). 후보가 모자라면 최선까지만.
const MIN_OUTPOST_DEGREE = 2;

// 수동 보정 훅 — 자동 그래프 위에 강제로 잇거나(ADD) 끊는다(REMOVE). 순서 무관.
// REMOVE 가 ADD 보다 우선. (REMOVE 가 MST 간선을 끊으면 연결이 깨질 수 있으니 주의.)
const MANUAL_ADD: ReadonlyArray<readonly [string, string]> = [];
const MANUAL_REMOVE: ReadonlyArray<readonly [string, string]> = [];

const pairKey = (a: string, b: string): string =>
  a < b ? `${a} ${b}` : `${b} ${a}`;

// 결정적 해시 → [0,1). 같은 엣지는 늘 같은 값이라 그래프가 안정적이다(매 로드 동일).
// FNV-1a 32bit. Math.random/Date 미사용 — 서버·클라 동일 결과 보장.
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

const N = OUTPOSTS.length;
const XS = OUTPOSTS.map((o) => o.position.x);
const YS = OUTPOSTS.map((o) => o.position.y);
const ID_INDEX = new Map(OUTPOSTS.map((o, i) => [o.id, i]));
const dist2 = (i: number, j: number): number => {
  const dx = XS[i] - XS[j];
  const dy = YS[i] - YS[j];
  return dx * dx + dy * dy;
};

// Gabriel 인접 후보.
function computeGabrielEdges(): OutpostEdge[] {
  const edges: OutpostEdge[] = [];
  for (let i = 0; i < N; i += 1) {
    for (let j = i + 1; j < N; j += 1) {
      const dij = dist2(i, j);
      // 같은 좌표(dij===0)인 두 거점은 자명히 인접하게 둔다 — 아래 blocker 검사에서
      // 어떤 c 도 dist2(i,k)+dist2(j,k) < 0 을 만들 수 없어 edge 가 그대로 생긴다.
      let blocked = false;
      for (let k = 0; k < N; k += 1) {
        if (k === i || k === j) continue;
        if (dist2(i, k) + dist2(j, k) < dij) {
          blocked = true;
          break;
        }
      }
      if (!blocked) edges.push({ a: OUTPOSTS[i].id, b: OUTPOSTS[j].id });
    }
  }
  return edges;
}

// 후보 위의 Euclidean MST 간선 키 — Kruskal(union-find). Gabriel 은 EMST 를 포함하므로
// 후보만으로 전체를 잇는 트리가 반드시 나온다(고립 거점 0 보장).
function computeMstKeys(candidates: OutpostEdge[]): Set<string> {
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const sorted = [...candidates].sort(
    (e1, e2) =>
      dist2(ID_INDEX.get(e1.a)!, ID_INDEX.get(e1.b)!) -
      dist2(ID_INDEX.get(e2.a)!, ID_INDEX.get(e2.b)!),
  );
  const keys = new Set<string>();
  for (const e of sorted) {
    const ra = find(ID_INDEX.get(e.a)!);
    const rb = find(ID_INDEX.get(e.b)!);
    if (ra !== rb) {
      parent[ra] = rb;
      keys.add(pairKey(e.a, e.b));
    }
  }
  return keys;
}

function buildEdges(): OutpostEdge[] {
  const candidates = computeGabrielEdges();
  const mst = computeMstKeys(candidates);
  const removed = new Set(MANUAL_REMOVE.map(([a, b]) => pairKey(a, b)));
  const byKey = new Map<string, OutpostEdge>();
  for (const e of candidates) {
    const k = pairKey(e.a, e.b);
    if (removed.has(k)) continue;
    // MST 간선은 무조건(연결 보장). 나머지 후보는 시드 해시로 일부만 — 거미줄 완화.
    if (mst.has(k) || hash01(k) < EXTRA_EDGE_FRACTION) byKey.set(k, e);
  }

  // 막다른 거점 완화 — 차수 < MIN_OUTPOST_DEGREE 인 거점에 가장 가까운 미포함 후보를 더한다.
  // 거점별 후보를 거리 오름차순으로 모아두고, OUTPOSTS 순서대로(결정적) 부족분을 채운다.
  const degree = new Map<string, number>();
  for (const o of OUTPOSTS) degree.set(o.id, 0);
  for (const { a, b } of byKey.values()) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  const candByNode = new Map<string, { key: string; e: OutpostEdge; d: number }[]>();
  for (const e of candidates) {
    const k = pairKey(e.a, e.b);
    if (removed.has(k)) continue;
    const d = dist2(ID_INDEX.get(e.a)!, ID_INDEX.get(e.b)!);
    for (const n of [e.a, e.b] as const) {
      const list = candByNode.get(n) ?? candByNode.set(n, []).get(n)!;
      list.push({ key: k, e, d });
    }
  }
  // 거리 오름차순, 동점은 키 문자열로 — sort 안정성에 기대지 않고 결정성을 못박는다.
  for (const list of candByNode.values()) {
    list.sort((x, y) => x.d - y.d || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  }
  for (const o of OUTPOSTS) {
    for (const { key, e } of candByNode.get(o.id) ?? []) {
      if ((degree.get(o.id) ?? 0) >= MIN_OUTPOST_DEGREE) break;
      if (byKey.has(key)) continue;
      byKey.set(key, e);
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    }
  }

  for (const [a, b] of MANUAL_ADD) {
    if (a === b) continue;
    const k = pairKey(a, b);
    if (removed.has(k) || byKey.has(k)) continue;
    byKey.set(k, a < b ? { a, b } : { a: b, b: a });
  }
  return [...byKey.values()];
}

// 선 렌더용 유니크 쌍 목록.
export const OUTPOST_EDGES: OutpostEdge[] = buildEdges();

// 양방향 인접 조회 — 모듈 로드 시 1회 빌드 후 캐시.
const NEIGHBORS: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  for (const o of OUTPOSTS) m.set(o.id, new Set());
  for (const { a, b } of OUTPOST_EDGES) {
    m.get(a)?.add(b);
    m.get(b)?.add(a);
  }
  return m;
})();

export function getOutpostNeighbors(id: string): string[] {
  return [...(NEIGHBORS.get(id) ?? [])];
}

// 중심 거점에서 maxHops 홉(칸) 이내 거점 id 집합 (BFS, 중심 포함).
export function outpostsWithinHops(centerId: string, maxHops: number): Set<string> {
  const seen = new Set<string>([centerId]);
  let frontier = [centerId];
  for (let h = 0; h < maxHops; h++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of getOutpostNeighbors(id)) {
        if (!seen.has(nb)) {
          seen.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

// 분쟁지대 — 중앙 자유 도시(START_OUTPOST_ID)에서 2홉(칸) 이내 거점. 지도에서 왕국색 대신
//   무소속 색으로 칠한다(중앙 격전지가 인접 왕국색으로 물들어 헷갈린다는 피드백, 2026-06-09).
//   다이얼 = 홉 수. 모듈 로드 시 1회 계산.
export const CONFLICT_ZONE_IDS: Set<string> = outpostsWithinHops(
  START_OUTPOST_ID,
  2,
);

export function areOutpostsAdjacent(a: string, b: string): boolean {
  return NEIGHBORS.get(a)?.has(b) ?? false;
}

// 발견(안개) — 신규 플레이어의 초기 발견 집합: 시작 거점 + 그 인접(첫 탐험 발판).
export function seededDiscovery(): string[] {
  return [START_OUTPOST_ID, ...getOutpostNeighbors(START_OUTPOST_ID)];
}

// 거점 방문 시 발견 확장 — 방문한 거점 + 그 인접을 더한다(인접은 "보이지만 미방문" 프런티어).
// current 가 비어 있으면 시드(시작 거점+인접)부터 시작. 결과는 정렬 없이 유니크 id 목록.
export function expandDiscovery(
  current: readonly string[] | undefined,
  visitedId: string,
): string[] {
  const set = new Set<string>(
    current && current.length > 0 ? current : seededDiscovery(),
  );
  if (NEIGHBORS.has(visitedId)) {
    set.add(visitedId);
    for (const n of getOutpostNeighbors(visitedId)) set.add(n);
  }
  return [...set];
}

// 최단 경로(홉 수 기준 BFS) — from→to 로 거쳐갈 거점 id 목록(양 끝 포함). 연결 그래프라
// 보통 항상 존재하고, 닿지 못하면 null. 다중 홉 자동 이동(경로 미리보기 + 한 칸씩 순차
// 진입)에 쓴다. from===to 면 [from].
// 저장된 현재 거점 id 를 실제 기준점으로 정규화 — 없거나(신규) 알 수 없는 값(레거시/손상)
// 이면 시작 거점(START_OUTPOST_ID)으로 폴백. 클라 기본값과 같아 정상 첫 이동이 잘못
// 거부되지 않는다.
export function resolveCurrentOutpostId(
  savedOutpostId: string | null | undefined,
): string {
  return savedOutpostId && NEIGHBORS.has(savedOutpostId)
    ? savedOutpostId
    : START_OUTPOST_ID;
}

// 서버 이동 게이트의 권위 규칙(순수) — 저장된 현재 거점에서 target 으로 갈 수 있는가.
// 같은 거점 재진입은 허용, 그 외엔 인접해야 한다. visit-outpost 라우트가 이걸 쓴다.
export function canMoveToOutpost(
  savedOutpostId: string | null | undefined,
  targetId: string,
): boolean {
  const current = resolveCurrentOutpostId(savedOutpostId);
  return current === targetId || areOutpostsAdjacent(current, targetId);
}

// 워프 게이트의 권위 규칙(순수) — 이미 발견한 거점으로만 순간이동(인접 무관).
// 빈/레거시 discoveredOutpostIds 는 시드 발견(시작 거점+인접)으로 판정해 신규/구버전이
// 막히지 않게. 미지의 outpostId 는 false. visit-outpost 라우트의 mode="warp" 가 쓴다.
export function canWarpToOutpost(
  discoveredOutpostIds: readonly string[] | undefined,
  targetId: string,
): boolean {
  if (!NEIGHBORS.has(targetId)) return false;
  const discovered =
    discoveredOutpostIds && discoveredOutpostIds.length > 0
      ? discoveredOutpostIds
      : seededDiscovery();
  return new Set(discovered).has(targetId);
}

// 최단 경로(홉 수 기준 BFS) — from→to 로 거쳐갈 거점 id 목록(양 끝 포함). 연결 그래프라
// 보통 항상 존재하고, 닿지 못하면 null. 다중 홉 자동 이동(경로 미리보기 + 한 칸씩 순차
// 진입)에 쓴다. from===to 면 [from].
// allowed 가 주어지면 그 집합 안의 거점만 거쳐간다(발견 게이트형 안개 — 미발견 지역은
// 통과/목적지 불가). from(현재 위치)은 allowed 와 무관하게 늘 출발점으로 허용.
export function shortestOutpostPath(
  from: string,
  to: string,
  allowed?: ReadonlySet<string>,
): string[] | null {
  if (!NEIGHBORS.has(from) || !NEIGHBORS.has(to)) return null;
  if (allowed && !allowed.has(to)) return null;
  if (from === to) return [from];
  const prev = new Map<string, string>();
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    for (const nb of NEIGHBORS.get(cur)!) {
      if (seen.has(nb)) continue;
      if (allowed && !allowed.has(nb)) continue;
      seen.add(nb);
      prev.set(nb, cur);
      if (nb === to) {
        const path: string[] = [to];
        let c = to;
        while (c !== from) {
          c = prev.get(c)!;
          path.push(c);
        }
        return path.reverse();
      }
      queue.push(nb);
    }
  }
  return null;
}
