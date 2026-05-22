import type { AdventureLog } from "../log/storage";
import {
  WORLD_MAP,
  getAdjacent,
  getMap,
  getRegion,
  type EdgeRequirement,
  type EdgeRequirementKind,
  type RegionId,
} from "./world";

export type EdgeRequirementStatus = {
  met: boolean;
  /** 시련처럼 "도전" 액션을 거쳐야 하는 종류면 true. UI 가 다른 버튼을 보여줄 수 있게. */
  challengeable?: boolean;
  /** 진행도 (보유/필요) 표시용. */
  progress?: { current: number; total: number; label: string };
  /** 미충족 사유 한 줄 — UI 노출용. */
  reason?: string;
  /** 조건 종류. UI 측에서 분기 처리 시 사용. */
  kind?: EdgeRequirementKind;
};

export type EvaluateContext = {
  log: AdventureLog;
  /**
   * 시련 통과한 지역 검사 — req.kind === "trial" 일 때 enemiesFrom 으로 조회.
   * 한 번 통과하면 같은 enemiesFrom 을 요구하는 모든 엣지가 자동 해금된다.
   */
  isTrialCleared?: (regionId: RegionId) => boolean;
  /** story flag 검사 — story 종류 엣지 평가에만 사용. */
  hasStoryFlag?: (flagId: string) => boolean;
  /** 방문한 지역 — kind: "visited" 엣지 평가용 (마을 간 직통 이동). */
  visitedRegionIds?: RegionId[];
  from?: RegionId;
  to?: RegionId;
};

const edgeRequirementKey = (fromId: RegionId, toId: RegionId) =>
  `${fromId} ${toId}`;

const EDGE_REQUIREMENT_BY_ROUTE: Map<string, EdgeRequirement | undefined> =
  new Map();

for (const edge of WORLD_MAP.edges) {
  const key = edgeRequirementKey(edge.from, edge.to);
  if (!EDGE_REQUIREMENT_BY_ROUTE.has(key)) {
    EDGE_REQUIREMENT_BY_ROUTE.set(key, edge.requires);
  }
}

export function evaluateEdgeRequirement(
  req: EdgeRequirement | undefined,
  ctx: EvaluateContext,
): EdgeRequirementStatus {
  if (!req) return { met: true };

  if (req.kind === "bestiary") {
    const region = WORLD_MAP.regions.find((r) => r.id === req.regionId);
    if (!region || region.enemies.length === 0) {
      return { met: true, kind: "bestiary" };
    }
    const total = region.enemies.length;
    const current = region.enemies.filter(
      (name) => ctx.log.monsters[name]?.encountered,
    ).length;
    return {
      met: current === total,
      kind: "bestiary",
      progress: {
        current,
        total,
        label: `${region.name}의 모험의 서`,
      },
    };
  }

  if (req.kind === "trial") {
    const target = WORLD_MAP.regions.find((r) => r.id === req.enemiesFrom);
    const label = target
      ? `${target.name} 시련 (${req.battles}전 연승)`
      : `시련 (${req.battles}전 연승)`;
    // enemiesFrom 지역의 시련을 이미 다른 진입로에서 통과했다면 자동 해금.
    if (ctx.isTrialCleared?.(req.enemiesFrom)) {
      return { met: true, kind: "trial" };
    }
    return {
      met: false,
      challengeable: true,
      kind: "trial",
      reason: `${label} 통과 필요`,
      progress: { current: 0, total: req.battles, label },
    };
  }

  if (req.kind === "visited") {
    const visited = ctx.visitedRegionIds?.includes(req.regionId) ?? false;
    const target = WORLD_MAP.regions.find((r) => r.id === req.regionId);
    return {
      met: visited,
      kind: "visited",
      reason: visited
        ? undefined
        : `${target?.name ?? "그 마을"}을(를) 한 번 다녀와야 길을 안다.`,
    };
  }

  if (req.kind === "story") {
    const has = ctx.hasStoryFlag?.(req.flagId) ?? false;
    return {
      met: has,
      kind: "story",
      reason: has ? undefined : req.reason ?? "아직 길을 알지 못한다.",
    };
  }

  if (req.kind === "locked") {
    return {
      met: false,
      kind: "locked",
      reason: req.reason ?? "아직 갈 수 없다.",
    };
  }

  return { met: true };
}

export function findEdgeRequirement(
  fromId: RegionId,
  toId: RegionId,
): EdgeRequirement | undefined {
  return EDGE_REQUIREMENT_BY_ROUTE.get(edgeRequirementKey(fromId, toId));
}

export type CrossMapGate = {
  to: RegionId;
  name: string;
  status: EdgeRequirementStatus;
};

/**
 * 현재 지역에서 "다른 맵(본토↔별빛)" 으로 넘어가는 인접 게이트 목록 + 각 충족 상태.
 * cross-map 엣지는 좌표계가 달라 지도에 선으로 못 그리므로(MapView), UI 가 이 목록을
 * 별도 배너로 노출해 진입 동선을 보여준다. 같은 맵 인접은 지도에 이미 그려지므로 제외.
 *
 * 요구조건 방향 정책은 MapView 의 selectedReq 와 동일 — 진행 방향(현재→목적지) 우선,
 * 역방향은 visited 게이트일 때만(한 번 발견한 길은 자유로이 되돌아가기).
 */
export function crossMapGatesFrom(
  currentRegionId: RegionId,
  ctx: Omit<EvaluateContext, "from" | "to">,
): CrossMapGate[] {
  const curMap = getMap(currentRegionId);
  const gates: CrossMapGate[] = [];
  for (const to of getAdjacent(WORLD_MAP, currentRegionId)) {
    if (getMap(to) === curMap) continue;
    const region = getRegion(to);
    if (!region) continue;
    const fwd = findEdgeRequirement(currentRegionId, to);
    const rev = findEdgeRequirement(to, currentRegionId);
    const req = fwd ?? (rev?.kind === "visited" ? rev : undefined);
    const status = evaluateEdgeRequirement(req, {
      ...ctx,
      from: currentRegionId,
      to,
    });
    gates.push({ to, name: region.name, status });
  }
  return gates;
}
