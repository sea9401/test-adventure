import { memo } from "react";
import type { Region } from "./data/world";
import { COOP_BOSSES } from "./coop/data";

const NODE_RADIUS = 24;

export type NodeState = "current" | "visited" | "reachable" | "locked";

// 지도 노드 색은 행동 유형으로 분류 — biome (데이터/설명용) 대신 마을 / 사냥터 /
// 솔로 보스 / 협동 보스 / 월드 보스 / 고탑 6종. 우선순위:
// town → tower → world_boss → coop_boss → solo_boss → hunting.
type RegionKind =
  | "town"
  | "tower"
  | "world_boss"
  | "coop_boss"
  | "solo_boss"
  | "hunting";

function regionKind(region: Region): RegionKind {
  if (region.tags?.includes("town")) return "town";
  if (region.tags?.includes("tower")) return "tower";
  const coop = COOP_BOSSES[region.id];
  if (coop?.isWorldBoss) return "world_boss";
  if (coop) return "coop_boss";
  if (region.boss) return "solo_boss";
  return "hunting";
}

const KIND_FILL: Record<RegionKind, string> = {
  town: "fill-amber-200 dark:fill-amber-900/60",
  hunting: "fill-emerald-200 dark:fill-emerald-900/60",
  solo_boss: "fill-violet-200 dark:fill-violet-900/60",
  coop_boss: "fill-rose-200 dark:fill-rose-900/60",
  // 월드 보스 — 협동 보스보다 한 단계 더 위험. 깊은 적색.
  world_boss: "fill-red-300 dark:fill-red-900/70",
  // 고탑 — 천 길 첨탑 / 솔로 무한 도전. 차가운 sky 톤으로 다른 카테고리와 명확히 구분.
  tower: "fill-sky-200 dark:fill-sky-900/60",
};

const KIND_STROKE: Record<RegionKind, string> = {
  town: "stroke-amber-500 dark:stroke-amber-700",
  hunting: "stroke-emerald-500 dark:stroke-emerald-700",
  solo_boss: "stroke-violet-500 dark:stroke-violet-700",
  coop_boss: "stroke-rose-500 dark:stroke-rose-700",
  world_boss: "stroke-red-600 dark:stroke-red-500",
  tower: "stroke-sky-500 dark:stroke-sky-700",
};

export const MapNode = memo(function MapNode({
  region,
  state,
  selected,
  onSelect,
}: {
  region: Region;
  state: NodeState;
  selected: boolean;
  onSelect: (regionId: Region["id"]) => void;
}) {
  const isCurrent = state === "current";
  const isReachable = state === "reachable";
  const isLocked = state === "locked";
  const selectRegion = () => onSelect(region.id);

  const kind = regionKind(region);
  const fillClass = isLocked
    ? "fill-zinc-100 dark:fill-zinc-900"
    : KIND_FILL[kind];

  const strokeClass = selected
    ? "stroke-zinc-900 dark:stroke-zinc-100"
    : isCurrent
      ? "stroke-emerald-600 dark:stroke-emerald-400"
      : isLocked
        ? "stroke-zinc-300 dark:stroke-zinc-700"
        : KIND_STROKE[kind];

  const labelClass = isLocked
    ? "fill-zinc-400 dark:fill-zinc-600"
    : isCurrent
      ? "fill-zinc-900 dark:fill-zinc-100 font-semibold"
      : "fill-zinc-700 dark:fill-zinc-200";

  return (
    <g
      onClick={selectRegion}
      className="cursor-pointer outline-none"
      role="button"
      tabIndex={0}
      aria-label={region.name}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectRegion();
        }
      }}
      opacity={isLocked ? 0.55 : 1}
    >
      <circle
        cx={region.position.x}
        cy={region.position.y}
        r={36}
        fill="transparent"
      />
      {isCurrent && (
        <>
          {/* 펄스가 옅어지는 구간에도 항상 보이는 정적 후광 링 */}
          <circle
            cx={region.position.x}
            cy={region.position.y}
            r={NODE_RADIUS + 7}
            fill="none"
            strokeWidth={3}
            className="stroke-emerald-500 dark:stroke-emerald-400"
          />
          <circle
            cx={region.position.x}
            cy={region.position.y}
            r={NODE_RADIUS + 6}
            className="fill-emerald-500/30"
          >
            <animate
              attributeName="r"
              values={`${NODE_RADIUS + 5};${NODE_RADIUS + 15};${NODE_RADIUS + 5}`}
              dur="2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.75;0.1;0.75"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
        </>
      )}
      {isReachable && (
        <circle
          cx={region.position.x}
          cy={region.position.y}
          r={NODE_RADIUS + 4}
          className="fill-amber-400/30"
        >
          <animate
            attributeName="r"
            values={`${NODE_RADIUS + 2};${NODE_RADIUS + 9};${NODE_RADIUS + 2}`}
            dur="2.6s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.55;0.1;0.55"
            dur="2.6s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      <circle
        cx={region.position.x}
        cy={region.position.y}
        r={NODE_RADIUS}
        strokeWidth={selected || isCurrent ? 3 : 2}
        className={`${fillClass} ${strokeClass}`}
      />
      {isLocked && (
        <text
          x={region.position.x}
          y={region.position.y + 5}
          textAnchor="middle"
          className="fill-zinc-400 dark:fill-zinc-600 text-[16px] select-none"
        >
          🔒
        </text>
      )}
      <text
        x={region.position.x}
        y={region.position.y + NODE_RADIUS + 18}
        textAnchor="middle"
        className={`${labelClass} text-[13px] select-none`}
      >
        {region.name}
      </text>
      {isCurrent && (
        <>
          {/* "여기 있다" 핀 — 같은 초록 계열 사냥터 노드들 사이에서도 한눈에 구분되게 */}
          <text
            x={region.position.x}
            y={region.position.y - NODE_RADIUS - 9}
            textAnchor="middle"
            className="text-[22px] select-none"
          >
            📍
          </text>
          <text
            x={region.position.x}
            y={region.position.y + NODE_RADIUS + 31}
            textAnchor="middle"
            className="fill-emerald-600 dark:fill-emerald-400 text-[10px] font-bold tracking-wide select-none"
          >
            현재 위치
          </text>
        </>
      )}
    </g>
  );
});
