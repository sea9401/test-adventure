"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import {
  WORLD_MAP,
  ZONES,
  MAPS,
  getAdjacent,
  getGameMap,
  getMap,
  getRegion,
  getZone,
  type MapId,
  type RegionId,
  type ZoneId,
} from "./data/world";
import { TabBar } from "@/components/ui/TabBar";
import {
  evaluateEdgeRequirement,
  findEdgeRequirement,
  type EdgeRequirementStatus,
} from "./data/edge-requirement";
import type { MapProgress } from "@/lib/map-progress";
import type { AdventureLog } from "./log/storage";
import { MapEdge } from "./MapEdge";
import { MapNode, type NodeState } from "./MapNode";
import { MapCanvas } from "./MapCanvas";
import { RegionDetail } from "./RegionDetail";
import { Card } from "@/components/ui/Card";
import { useModalA11y } from "@/lib/useModalA11y";
import { useGame } from "./GameContext";

export function MapView({
  progress,
  onProgressChange,
  log,
  playerHp,
  isTrialCleared,
  hasStoryFlag,
  onTrialStart,
}: {
  progress: MapProgress;
  onProgressChange: (next: MapProgress) => void;
  log: AdventureLog;
  playerHp: number;
  isTrialCleared: (regionId: RegionId) => boolean;
  hasStoryFlag: (flagId: string) => boolean;
  onTrialStart: (from: RegionId, to: RegionId) => void;
}) {
  const { addNotification, autoHunt } = useGame();
  const [selectedId, setSelectedId] = useState<RegionId | null>(null);
  const [lowHpBlocked, setLowHpBlocked] = useState(false);

  // 활성 맵 — 본토/별빛은 각자의 SVG·좌표계로 한 번에 하나만 그린다. 기본 = 현재 지역의 맵.
  const [activeMap, setActiveMap] = useState<MapId>(() =>
    getMap(progress.currentRegionId),
  );
  // 포커스 클러스터 — MapCanvas 가 진입/전환 시 어느 권역 bounds 로 줌할지. 권역 탭은 없애서
  // 사용자가 직접 못 바꾸지만, 거대한 본토 맵을 통째로 축소하지 않고 "지금 있는 곳" 으로
  // 프레이밍하기 위해 내부적으로 유지한다. 기본 = 현재 지역의 권역.
  const [activeZone, setActiveZone] = useState<ZoneId>(() =>
    getZone(progress.currentRegionId),
  );
  // fitNonce 증가 → MapCanvas 가 포커스 클러스터 bounds 로 재줌.
  const [fitNonce, setFitNonce] = useState(0);

  // 맵에 속한 권역 중 첫 번째 — 현재 지역이 그 맵에 없을 때의 fallback 포커스.
  const firstZoneOfMap = (m: MapId): ZoneId | null =>
    ZONES.find((z) =>
      WORLD_MAP.regions.some((r) => getZone(r.id) === z.id && getMap(r.id) === m),
    )?.id ?? null;

  const selectMap = (m: MapId) => {
    setActiveMap(m);
    // 새 맵으로 줌할 클러스터를 정한다 — 현재 지역이 그 맵에 있으면 그 권역(지금 있는 곳),
    // 아니면 그 맵의 첫 권역.
    const z =
      getMap(progress.currentRegionId) === m
        ? getZone(progress.currentRegionId)
        : firstZoneOfMap(m);
    if (z) setActiveZone(z);
    setFitNonce((n) => n + 1);
  };

  // 이동으로 맵/권역이 바뀌면 활성 탭을 따라가며 그곳으로 재줌 (같은 권역 내 이동은 그대로 둠).
  // 게이트 통과(본토↔별빛)는 맵까지 자동 전환한다.
  const lastMapRef = useRef(getMap(progress.currentRegionId));
  const lastZoneRef = useRef(getZone(progress.currentRegionId));
  useEffect(() => {
    const m = getMap(progress.currentRegionId);
    const z = getZone(progress.currentRegionId);
    const mapChanged = m !== lastMapRef.current;
    const zoneChanged = z !== lastZoneRef.current;
    if (!mapChanged && !zoneChanged) return;
    lastMapRef.current = m;
    lastZoneRef.current = z;
    if (mapChanged) setActiveMap(m);
    setActiveZone(z);
    setFitNonce((n) => n + 1);
  }, [progress.currentRegionId]);

  // 활성 맵의 viewBox·배경. 맵이 바뀌면 MapCanvas 를 key 로 재마운트해 새 bounds 로 초기화.
  const gameMap = getGameMap(activeMap);

  // 포커스 클러스터에 속한 지역들의 좌표 bounds — MapCanvas 가 이 영역을 화면에 꽉 채운다.
  const zoneBounds = useMemo(() => {
    const pts = WORLD_MAP.regions
      .filter((r) => getZone(r.id) === activeZone)
      .map((r) => r.position);
    if (pts.length === 0) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }, [activeZone]);

  const visitedSet = new Set(progress.visitedRegionIds);
  const adjacentToCurrent = new Set(
    getAdjacent(WORLD_MAP, progress.currentRegionId),
  );

  const stateOf = (id: RegionId): NodeState => {
    if (id === progress.currentRegionId) return "current";
    if (visitedSet.has(id)) return "visited";
    for (const v of progress.visitedRegionIds) {
      if (!getAdjacent(WORLD_MAP, v).includes(id)) continue;
      // 마을 직통 이동 (kind: "visited") 은 목적지 발견 후에만 활성화 — reachability
      // 계산에서 제외해 미발견 마을이 "도달 가능" 으로 잘못 표시되지 않게 한다.
      const req = findEdgeRequirement(v, id) ?? findEdgeRequirement(id, v);
      if (req?.kind === "visited") continue;
      return "reachable";
    }
    return "locked";
  };

  const isEdgeActive = (fromId: RegionId, toId: RegionId): boolean =>
    visitedSet.has(fromId) && visitedSet.has(toId);

  const selectedRegion = getRegion(selectedId);
  const selectedState = selectedId ? stateOf(selectedId) : null;
  const isAdjacent = !!selectedId && adjacentToCurrent.has(selectedId);
  const selectedReq = selectedId
    ? findEdgeRequirement(progress.currentRegionId, selectedId)
    : undefined;
  const requirementStatus: EdgeRequirementStatus | null = (() => {
    if (!selectedId) return null;
    if (isAdjacent) {
      return evaluateEdgeRequirement(selectedReq, {
        log,
        isTrialCleared,
        hasStoryFlag,
        visitedRegionIds: progress.visitedRegionIds,
        from: progress.currentRegionId,
        to: selectedId,
      });
    }
    // locked 지역 — 진입 경로의 첫 번째 미충족 조건을 힌트로 노출.
    if (selectedState === "locked") {
      const inbound = WORLD_MAP.edges.filter(
        (e) => e.to === selectedId && e.requires?.kind !== "visited",
      );
      for (const edge of inbound) {
        const s = evaluateEdgeRequirement(edge.requires, {
          log,
          isTrialCleared,
          hasStoryFlag,
          visitedRegionIds: progress.visitedRegionIds,
        });
        if (!s.met) return s;
      }
    }
    return null;
  })();
  const isTrialEdge =
    !!selectedId &&
    isAdjacent &&
    selectedReq?.kind === "trial" &&
    !isTrialCleared(selectedReq.enemiesFrom);
  const huntDispatched = autoHunt.isDispatched;
  // 시련 엣지는 met=false 라도 "도전" 액션으로 진입 가능 — canMove 와 별도로 처리.
  // 단, 위탁 원정 중에는 시련(자동 전투) 도전 불가 — 라이브 사냥·보스 도전과 동일 정책.
  const canMove =
    !!selectedId &&
    selectedId !== progress.currentRegionId &&
    isAdjacent &&
    (requirementStatus?.met ?? true);
  const canChallenge = isTrialEdge && !huntDispatched;

  // 빠른 이동 — 한 번이라도 가본(visited) 지역이면 어디서든 한 탭 워프 (무료).
  // 인접 정상 이동(canMove)·시련 도전(canChallenge)이 우선이라 그게 가능하면 노출 안 함.
  // 발견한 지역만 대상이라 진행 순서를 건너뛰지 않는다 — 순수 동선 단축(맵 왔다갔다 완화).
  const canFastTravel =
    !!selectedId &&
    selectedId !== progress.currentRegionId &&
    visitedSet.has(selectedId) &&
    !canMove &&
    !canChallenge;

  const performMove = (toId: RegionId) => {
    const isFirstVisit = !progress.visitedRegionIds.includes(toId);
    onProgressChange({
      ...progress,
      currentRegionId: toId,
      visitedRegionIds: isFirstVisit
        ? [...progress.visitedRegionIds, toId]
        : progress.visitedRegionIds,
    });
    if (isFirstVisit) {
      const region = getRegion(toId);
      if (region) {
        addNotification(
          "info",
          `${region.name}에 처음 도착했다 — ${region.description}`,
        );
      }
    }
  };

  const handleMove = () => {
    if (!selectedId) return;
    if (playerHp <= 0) {
      setLowHpBlocked(true);
      return;
    }
    if (canChallenge && !canMove) {
      // 시련 도전 — 자동 전투 N전 시작.
      onTrialStart(progress.currentRegionId, selectedId);
      return;
    }
    if (canMove) {
      performMove(selectedId);
      return;
    }
    if (canFastTravel) {
      // 빠른 이동 — 가본 지역으로 무료 워프. 일반 이동과 같은 onProgressChange 경로.
      performMove(selectedId);
      const region = getRegion(selectedId);
      if (region) {
        addNotification("info", `${region.name}(으)로 빠르게 이동했다.`);
      }
      return;
    }
  };

  // PC 편의 — Space / Enter 로 "이동" 버튼 발화. 텍스트 입력 / 다른 버튼·링크에 포커스가
  // 있을 때는 그쪽의 기본 동작에 양보(이중 발화 방지). 모바일은 가상 키보드만 있어 영향 없음.
  // canMove / canChallenge / 주문서 셋 중 하나라도 가능할 때만 발화.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (e.repeat) return; // 키 길게 누름으로 인한 반복 발화 차단.
      const ae = document.activeElement as HTMLElement | null;
      if (ae) {
        const tag = ae.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          tag === "BUTTON" ||
          tag === "A" ||
          ae.isContentEditable
        )
          return;
      }
      if (lowHpBlocked) return;
      const canFire = canMove || canChallenge || canFastTravel;
      if (!canFire) return;
      e.preventDefault(); // Space 의 페이지 스크롤 기본 동작 차단.
      handleMove();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleMove 는 매 렌더 새로 만들어지지만 effect 가 매 렌더 재바인딩되는 비용은 작음.
    // 의존성 명시로 closure 가 항상 최신 selectedId / 플래그를 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMove, canChallenge, canFastTravel, lowHpBlocked]);

  const currentRegion = getRegion(progress.currentRegionId);

  // "현재 위치" 리센터 타깃 — 현재 지역이 활성 맵에 있을 때만 그 좌표, 아니면 맵 중앙.
  // (다른 맵을 구경 중일 때 현재 지역의 좌표는 이 맵 좌표계에서 무의미하므로.)
  const focusPoint =
    currentRegion && getMap(currentRegion.id) === activeMap
      ? currentRegion.position
      : {
          x: (gameMap.viewBox.x ?? 0) + gameMap.viewBox.width / 2,
          y: (gameMap.viewBox.y ?? 0) + gameMap.viewBox.height / 2,
        };

  // 지도 안 하단 액션 오버레이의 버튼 라벨/활성 — 이동/시련/빠른이동 우선순위.
  const moveDisabled = !canMove && !canChallenge && !canFastTravel;
  const moveLabel =
    selectedState === "current"
      ? "이미 이곳에 있음"
      : canMove
        ? "이동"
        : canChallenge
          ? "시련 도전"
          : canFastTravel
            ? "빠른 이동"
            : "갈 수 없음";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 px-1 text-sm">
        <span className="text-base leading-none">📍</span>
        <span className="text-zinc-500 dark:text-zinc-400">현재 위치</span>
        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
          {currentRegion?.name ?? "—"}
        </span>
      </div>
      {/* 맵 선택자 — 본토/별빛을 통째로 스왑. 게이트를 넘으면 자동으로도 전환된다. */}
      <TabBar
        tabs={MAPS.map((m) => ({ key: m.id, label: m.label }))}
        active={activeMap}
        onChange={selectMap}
        ariaLabel="맵"
        scrollable
      />
      <Card padding="none" className="relative overflow-hidden">
        <MapCanvas
          key={activeMap}
          world={gameMap.viewBox}
          background={gameMap.background}
          focusX={focusPoint.x}
          focusY={focusPoint.y}
          fitBounds={zoneBounds}
          fitNonce={fitNonce}
        >
          {WORLD_MAP.edges.map((edge) => {
            const from = getRegion(edge.from);
            const to = getRegion(edge.to);
            if (!from || !to) return null;
            // 마을 직통 (fast-travel) 엣지는 지도에 그리지 않는다 — 길게 가로지르는
            // 라인이 다른 엣지/노드 위로 어지럽게 겹친다. 발견된 마을 노드가 "방문함"
            // 상태로 표시되고 클릭하면 이동 버튼이 뜨므로 기능은 유지된다.
            if (edge.requires?.kind === "visited") return null;
            // 활성 맵 안의 엣지만 그린다. 본토↔별빛 cross-map 엣지(게이트)는 양 끝이 다른
            // 좌표계라 선으로 못 그린다 — 게이트 통과 시 활성 맵이 자동 전환되어 기능은 유지.
            if (getMap(edge.from) !== activeMap || getMap(edge.to) !== activeMap)
              return null;
            return (
              <MapEdge
                key={`${edge.from}-${edge.to}`}
                from={from}
                to={to}
                active={isEdgeActive(edge.from, edge.to)}
              />
            );
          })}
          {WORLD_MAP.regions
            .filter((region) => getMap(region.id) === activeMap)
            .map((region) => (
              <MapNode
                key={region.id}
                region={region}
                state={stateOf(region.id)}
                selected={selectedId === region.id}
                onClick={() => setSelectedId(region.id)}
              />
            ))}
        </MapCanvas>
        {/* 지도 안 하단 액션 오버레이 — 모바일에서 노드 선택 후 이동 버튼까지 스크롤 안 해도
            되도록 지도 위에 띄운다. 줌 컨트롤(우상단)과 겹치지 않게 하단 중앙. 바깥은
            pointer-events-none 라 주변 지도 팬은 그대로 동작. */}
        {selectedRegion && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2">
            <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-2 rounded-lg border border-zinc-200/80 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-900/95">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedRegion.name}
                </div>
                {requirementStatus &&
                  !requirementStatus.met &&
                  (requirementStatus.reason || requirementStatus.progress) && (
                    <div className="truncate text-[11px] text-amber-600 dark:text-amber-400">
                      {requirementStatus.progress
                        ? requirementStatus.kind === "trial"
                          ? requirementStatus.reason ??
                            requirementStatus.progress.label
                          : `${requirementStatus.progress.label} ${requirementStatus.progress.current}/${requirementStatus.progress.total}`
                        : requirementStatus.reason}
                    </div>
                  )}
              </div>
              <button
                type="button"
                disabled={moveDisabled}
                onClick={handleMove}
                className="shrink-0 rounded-md border border-emerald-500 bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-[transform,background-color] duration-100 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                {moveLabel}
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="선택 해제"
                className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X size={18} weight="bold" />
              </button>
            </div>
          </div>
        )}
      </Card>
      {isTrialEdge && huntDispatched && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          자동 사냥(원정) 중에는 시련에 도전할 수 없습니다 — 원정을 먼저
          수령하세요.
        </div>
      )}
      <RegionDetail
        region={selectedRegion}
        state={selectedState}
        requirementStatus={requirementStatus}
      />
      {lowHpBlocked && (
        <LowHpBlockModal onConfirm={() => setLowHpBlocked(false)} />
      )}
    </div>
  );
}

function LowHpBlockModal({ onConfirm }: { onConfirm: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="low-hp-block-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
    >
      <div ref={contentRef} className="w-full max-w-sm">
        <Card padding="lg" className="text-center">
        <div
          id="low-hp-block-title"
          className="text-lg font-semibold text-rose-600 dark:text-rose-400"
        >
          움직일 수가 없다
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          체력이 너무 낮아 한 발짝도 떼기 힘들다...
          <br />
          일단 치유소로 가서 회복부터 하자.
        </p>
        <button
          type="button"
          onClick={onConfirm}
          className="mt-4 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          확인
        </button>
      </Card>
      </div>
    </div>
  );
}
