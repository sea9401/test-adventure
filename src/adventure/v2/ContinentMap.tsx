"use client";

import { useRef, useState } from "react";
import {
  OUTPOSTS,
  MAP_BOUNDS,
  CONTINENT_NAME,
} from "@/adventure/data/v2/outposts";
import type {
  Outpost,
  OutpostType,
  OutpostTier,
} from "@/adventure/data/v2/types";

// 종류별 색 — tier 2+ marker fill.
const TYPE_COLOR: Record<OutpostType, string> = {
  mine: "#8a6a43", // 광산 — 갈색
  tower: "#845fc4", // 마탑 — 보라
  fort: "#5d5d68", // 요새 — 회색파랑
  village: "#bd713b", // 마을 — 주황
};

// tier 별 marker 반지름 (큰 좌표 공간 단위). 화면 fit 시 자동 scaling.
// 깨끗한 biome 배경 위라 너무 크지 않게.
const TIER_RADIUS: Record<OutpostTier, number> = {
  1: 22,
  2: 36,
  3: 55,
  4: 90,
};

// tier 별 라벨 보임 여부.
const TIER_LABEL_VISIBLE: Record<OutpostTier, boolean> = {
  1: false, // hover/select 시만
  2: false,
  3: true,
  4: true,
};

// 5 꼭짓점 별 polygon — 외부반지름 r, 내부반지름 r * 0.4. cx, cy 중심.
function starPoints(cx: number, cy: number, r: number): string {
  const inner = r * 0.4;
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

// tier 4 (왕국) 는 별도 색 (선아출드 등은 type 보단 "왕국" 표식 우선).
const KINGDOM_FILL = "#b04535";

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};

const TIER_LABEL: Record<OutpostTier, string> = {
  1: "마을",
  2: "거점",
  3: "도시",
  4: "왕국",
};

// SVG 의 viewBox 좌표로 변환. getScreenCTM 으로 정확 변환 (letterbox 보정).
function svgCoordsFromEvent(
  e: React.MouseEvent<SVGSVGElement>,
): { x: number; y: number } | null {
  const svg = e.currentTarget;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inv = ctm.inverse();
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const t = pt.matrixTransform(inv);
  return { x: Math.round(t.x), y: Math.round(t.y) };
}

export function ContinentMap() {
  const [selected, setSelected] = useState<Outpost | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [clickLog, setClickLog] = useState<
    { x: number; y: number; ts: number }[]
  >([]);
  const svgRef = useRef<SVGSVGElement>(null);

  function pushClick(pos: { x: number; y: number }) {
    setClickLog((prev) =>
      [{ ...pos, ts: Date.now() }, ...prev].slice(0, 8),
    );
    // 클립보드 복사 (가능하면)
    if (navigator?.clipboard) {
      navigator.clipboard
        .writeText(`position: { x: ${pos.x}, y: ${pos.y} },`)
        .catch(() => {});
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-3 p-4">
      <div className="rounded-lg border border-zinc-300 overflow-hidden dark:border-zinc-700">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_BOUNDS.width} ${MAP_BOUNDS.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-auto block"
          onMouseMove={(e) => setMousePos(svgCoordsFromEvent(e))}
          onMouseLeave={() => setMousePos(null)}
          onClick={(e) => {
            // 마커 클릭은 stopPropagation 으로 막힘 — 여기는 빈 영역만.
            const coords = svgCoordsFromEvent(e);
            if (coords) pushClick(coords);
          }}
        >
          {/* 대륙 배경 일러스트 — png 위에 마커 overlay. preserveAspectRatio="none" 으로
              SVG viewBox 에 stretch (이미지 비율과 좌표 비율이 살짝 달라도 fill). */}
          <image
            href="/images/ui/v2-continent.webp"
            x={0}
            y={0}
            width={MAP_BOUNDS.width}
            height={MAP_BOUNDS.height}
            preserveAspectRatio="none"
          />

          {/* 거점 marker — 이미지 위 시각이 이미 있어 작은 outline 만 + hit area.
              hover/select 시 노란 highlight. 좌표가 png 거점과 안 맞아도 클릭 흐름 검증용. */}
          {[1, 2, 3, 4].flatMap((tier) =>
            OUTPOSTS.filter((o) => o.tier === tier).map((o) => {
              const r = TIER_RADIUS[o.tier];
              const isKingdom = o.tier === 4;
              const isNeutral = o.neutral === true;
              const isSelected = selected?.id === o.id;
              const isHover = hover === o.id;
              const fill = isKingdom ? KINGDOM_FILL : TYPE_COLOR[o.type];
              const stroke = isNeutral
                ? "#f4c842"
                : isSelected || isHover
                  ? "#fff1a8"
                  : "#1a1a1a";
              const strokeWidth = isNeutral ? 22 : isSelected ? 26 : 8;
              const showLabel = isSelected || isHover;
              const markerFill = isNeutral ? "#f4c842" : fill;
              const markerStroke = showLabel ? "#fff1a8" : "#0a0a0a";
              return (
                <g
                  key={o.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(o);
                  }}
                  onMouseEnter={() => setHover(o.id)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-pointer"
                >
                  {/* 시각용 marker — tier 4 는 별, 그 외는 원. 항상 채워져 보임. */}
                  {isKingdom ? (
                    <polygon
                      points={starPoints(o.position.x, o.position.y, r)}
                      fill={markerFill}
                      stroke={markerStroke}
                      strokeWidth={showLabel ? 14 : 8}
                      strokeLinejoin="round"
                    />
                  ) : (
                    <circle
                      cx={o.position.x}
                      cy={o.position.y}
                      r={showLabel ? r * 1.2 : r}
                      fill={markerFill}
                      stroke={markerStroke}
                      strokeWidth={showLabel ? 10 : 5}
                    />
                  )}
                  {/* 라벨 — tier 3+ 항상, tier 1~2 hover/select 시 */}
                  {(TIER_LABEL_VISIBLE[o.tier] || showLabel) && (
                    <text
                      x={o.position.x}
                      y={o.position.y - r - 14}
                      textAnchor="middle"
                      fontSize={isKingdom ? 95 : o.tier === 3 ? 65 : 60}
                      fontWeight={700}
                      fill="#fff"
                      paintOrder="stroke"
                      stroke="#000"
                      strokeWidth={12}
                    >
                      {o.name}
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>

      <aside className="rounded-lg border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <header className="space-y-1 border-b border-zinc-200 pb-2 dark:border-zinc-800">
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            대륙
          </div>
          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {CONTINENT_NAME}
          </div>
          <div className="text-xs text-zinc-500">
            거점 {OUTPOSTS.length} (왕국 {OUTPOSTS.filter((o) => o.tier === 4).length}
            · 도시 {OUTPOSTS.filter((o) => o.tier === 3).length} · 거점{" "}
            {OUTPOSTS.filter((o) => o.tier === 2).length} · 마을{" "}
            {OUTPOSTS.filter((o) => o.tier === 1).length})
          </div>
        </header>

        {selected ? (
          <div className="mt-3 space-y-2 text-sm">
            <div className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {selected.name}
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              <span className="rounded bg-zinc-200 px-2 py-0.5 dark:bg-zinc-800">
                {TIER_LABEL[selected.tier]}
              </span>
              <span
                className="rounded px-2 py-0.5 text-white"
                style={{ backgroundColor: TYPE_COLOR[selected.type] }}
              >
                {TYPE_LABEL[selected.type]}
              </span>
              {selected.neutral && (
                <span className="rounded bg-yellow-400 px-2 py-0.5 text-yellow-900">
                  절대 중립
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              좌표 ({selected.position.x}, {selected.position.y})
            </div>
            {selected.description && (
              <div className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                {selected.description}
              </div>
            )}
            <div className="rounded border border-zinc-200 bg-zinc-100 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="font-medium text-zinc-700 dark:text-zinc-300">
                점령 상태
              </div>
              <div className="text-zinc-500">
                {selected.neutral
                  ? "NPC 영구 운영 (점령 불가)"
                  : "비점령 (PR-B3 에서 점령 룰 통합 예정)"}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-xs text-zinc-500">
            지도에서 거점을 클릭하세요.
          </div>
        )}

        {/* 좌표 추출 도우미 — 빈 영역 클릭 시 viewBox 좌표 + 클립보드 복사. */}
        <section className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            좌표 도우미
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            지도 빈 영역을 클릭하면 좌표 복사 (클립보드).
          </div>
          <div className="mt-2 rounded bg-zinc-100 px-2 py-1 text-xs font-mono tabular-nums dark:bg-zinc-900">
            {mousePos
              ? `x: ${mousePos.x}, y: ${mousePos.y}`
              : "마우스를 지도 위로"}
          </div>
          {clickLog.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-xs text-zinc-500">최근 클릭</div>
              {clickLog.map((c) => (
                <div
                  key={c.ts}
                  className="rounded bg-zinc-100 px-2 py-1 text-xs font-mono tabular-nums dark:bg-zinc-900"
                >
                  {`{ x: ${c.x}, y: ${c.y} }`}
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
