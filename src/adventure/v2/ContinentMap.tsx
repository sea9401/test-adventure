"use client";

import { useState } from "react";
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
const TIER_RADIUS: Record<OutpostTier, number> = {
  1: 28,
  2: 50,
  3: 80,
  4: 130,
};

// tier 별 라벨 보임 여부.
const TIER_LABEL_VISIBLE: Record<OutpostTier, boolean> = {
  1: false, // hover/select 시만
  2: false,
  3: true,
  4: true,
};

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

export function ContinentMap() {
  const [selected, setSelected] = useState<Outpost | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-3 p-4">
      <div className="rounded-lg border border-zinc-300 overflow-hidden dark:border-zinc-700">
        <svg
          viewBox={`0 0 ${MAP_BOUNDS.width} ${MAP_BOUNDS.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-auto block"
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
              return (
                <g
                  key={o.id}
                  onClick={() => setSelected(o)}
                  onMouseEnter={() => setHover(o.id)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-pointer"
                >
                  {/* 큰 투명 hit area (작은 outline 만 시각). */}
                  <circle
                    cx={o.position.x}
                    cy={o.position.y}
                    r={r}
                    fill="transparent"
                  />
                  <circle
                    cx={o.position.x}
                    cy={o.position.y}
                    r={Math.max(15, r * 0.35)}
                    fill={showLabel ? fill : "transparent"}
                    fillOpacity={showLabel ? 0.4 : 0}
                    stroke={
                      isNeutral
                        ? "#f4c842"
                        : showLabel
                          ? "#fff1a8"
                          : isKingdom
                            ? "#ffd98a"
                            : "#ffffff"
                    }
                    strokeWidth={isKingdom ? 12 : isNeutral ? 10 : 6}
                    strokeOpacity={showLabel ? 1 : 0.55}
                  />
                  {showLabel && (
                    <text
                      x={o.position.x}
                      y={o.position.y - r - 8}
                      textAnchor="middle"
                      fontSize={isKingdom ? 110 : 80}
                      fontWeight={700}
                      fill="#fff"
                      paintOrder="stroke"
                      stroke="#000"
                      strokeWidth={14}
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
      </aside>
    </div>
  );
}
