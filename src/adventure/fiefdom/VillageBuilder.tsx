"use client";

import { useEffect, useState } from "react";

// 매 N ms 마다 now 를 갱신해 렌더에 안전하게 사용. 영웅 회복 카운트다운/훈련 큐 잔여 시간 등.
function useNow(intervalMs: number): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
import { Card } from "@/components/ui/Card";
import {
  BUILDINGS,
  GRID_H,
  GRID_W,
  TILE_PX,
  UNITS,
  costText,
  heroAtk,
  heroAvailable,
  heroMaxHp,
  xpForNext,
} from "./builderData";
import type { BuilderApi } from "./useBuilderState";
import type { BuildingType, ResourceBag, UnitType } from "./types";

// 영지 빌더 — newgametest 프로토타입을 React/SVG 로 이식.
// Canvas → SVG: hover/click DOM 이벤트가 셀 좌표로 직결, hit-test 수동 계산 불필요.
// 상태는 FiefdomView 가 소유, 맵 뷰와 공유 — 여기는 prop 으로 받음.
export function VillageBuilder({ api }: { api: BuilderApi }) {
  const { state, selectedBuild, setSelectedBuild } = api;
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // 배치 모드 해제 — Escape / 우클릭.
  useEffect(() => {
    if (!selectedBuild) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedBuild(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedBuild, setSelectedBuild]);

  const handleCellClick = (x: number, y: number) => {
    if (!selectedBuild) return;
    api.placeBuilding(selectedBuild, x, y);
  };

  const handleSvgContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (selectedBuild) setSelectedBuild(null);
  };

  const handleSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!selectedBuild) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_W);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_H);
    setHover({ x, y });
  };

  const handleSvgLeave = () => setHover(null);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr,1fr]">
      <Card padding="none" className="overflow-hidden bg-amber-50/60 dark:bg-zinc-900/60">
        <svg
          viewBox={`0 0 ${GRID_W * TILE_PX} ${GRID_H * TILE_PX}`}
          className="block h-auto w-full select-none"
          style={{ cursor: selectedBuild ? "crosshair" : "default" }}
          onMouseMove={handleSvgMove}
          onMouseLeave={handleSvgLeave}
          onContextMenu={handleSvgContextMenu}
        >
          {/* 격자선 — 본토 양피지 톤에 맞춰 옅게. */}
          {Array.from({ length: GRID_W + 1 }, (_, x) => (
            <line
              key={`vx${x}`}
              x1={x * TILE_PX}
              y1={0}
              x2={x * TILE_PX}
              y2={GRID_H * TILE_PX}
              strokeWidth={1}
              className="stroke-amber-200/60 dark:stroke-zinc-700/60"
            />
          ))}
          {Array.from({ length: GRID_H + 1 }, (_, y) => (
            <line
              key={`hy${y}`}
              x1={0}
              y1={y * TILE_PX}
              x2={GRID_W * TILE_PX}
              y2={y * TILE_PX}
              strokeWidth={1}
              className="stroke-amber-200/60 dark:stroke-zinc-700/60"
            />
          ))}

          {/* 클릭 영역 — 셀별 투명 rect (selectedBuild 일 때만) */}
          {selectedBuild &&
            Array.from({ length: GRID_W }).map((_, x) =>
              Array.from({ length: GRID_H }).map((__, y) => (
                <rect
                  key={`cell${x}-${y}`}
                  x={x * TILE_PX}
                  y={y * TILE_PX}
                  width={TILE_PX}
                  height={TILE_PX}
                  fill="transparent"
                  onClick={() => handleCellClick(x, y)}
                />
              )),
            )}

          {/* 건물 — MapNode 와 동일 톤(파스텔 fill + 진한 stroke + 둥근 모서리). */}
          {state.buildings.map((b, i) => {
            const def = BUILDINGS[b.type];
            const s = def.size;
            return (
              <g key={`b${i}`}>
                <rect
                  x={b.x * TILE_PX + 3}
                  y={b.y * TILE_PX + 3}
                  width={s * TILE_PX - 6}
                  height={s * TILE_PX - 6}
                  rx={4}
                  ry={4}
                  strokeWidth={2}
                  className={`${def.fillClass} ${def.strokeClass}`}
                />
                <text
                  x={b.x * TILE_PX + (s * TILE_PX) / 2}
                  y={b.y * TILE_PX + (s * TILE_PX) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={s === 1 ? 9 : 12}
                  fontWeight="600"
                  pointerEvents="none"
                  className="fill-zinc-800 dark:fill-zinc-100"
                >
                  {def.name}
                </text>
              </g>
            );
          })}

          {/* 배치 hover preview */}
          {selectedBuild && hover && (() => {
            const def = BUILDINGS[selectedBuild];
            const ok =
              api.canPlaceAt(selectedBuild, hover.x, hover.y) &&
              api.canAffordBuild(selectedBuild);
            return (
              <rect
                x={hover.x * TILE_PX}
                y={hover.y * TILE_PX}
                width={def.size * TILE_PX}
                height={def.size * TILE_PX}
                rx={4}
                ry={4}
                pointerEvents="none"
                className={
                  ok
                    ? "fill-emerald-400/30 stroke-emerald-500 dark:fill-emerald-500/30"
                    : "fill-red-400/30 stroke-red-500 dark:fill-red-500/30"
                }
                strokeWidth={2}
              />
            );
          })()}
        </svg>
      </Card>

      <Sidebar api={api} />
    </div>
  );
}

function Sidebar({ api }: { api: BuilderApi }) {
  const { state, lastLog } = api;
  return (
    <div className="space-y-3 text-sm">
      <ResourcePanel resources={state.resources} />
      <HeroPanel api={api} />
      <BuildMenu api={api} />
      <TrainMenu api={api} />
      <ConquestPanel api={api} />
      <Card padding="sm">
        <button
          type="button"
          onClick={api.reset}
          className="w-full rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950"
        >
          새 게임
        </button>
      </Card>
      <LogPanel lines={lastLog} />
    </div>
  );
}

function ResourcePanel({ resources }: { resources: ResourceBag }) {
  return (
    <Card padding="sm">
      <div className="flex justify-between gap-2 font-mono text-base">
        <span>🪙 {Math.floor(resources.gold)}</span>
        <span>🪵 {Math.floor(resources.wood)}</span>
        <span>🌾 {Math.floor(resources.food)}</span>
      </div>
    </Card>
  );
}

function HeroPanel({ api }: { api: BuilderApi }) {
  const { state, renameHero } = api;
  const h = state.hero;
  const now = useNow(500);
  const max = heroMaxHp(h);
  const atk = heroAtk(h);
  const xpNeed = xpForNext(h.level);
  const recovering = !heroAvailable(h, now);
  const recoverSec = recovering ? Math.max(0, Math.ceil((h.recoveringUntil - now) / 1000)) : 0;
  const hpPct = Math.max(0, Math.min(100, (h.currentHp / max) * 100));
  const xpPct = Math.max(0, Math.min(100, (h.xp / xpNeed) * 100));

  return (
    <Card padding="sm" className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-sm font-semibold underline decoration-dotted hover:text-indigo-600 dark:hover:text-indigo-400"
          onClick={() => {
            const name = window.prompt("영웅 이름을 입력하세요:", h.name);
            if (name) renameHero(name);
          }}
          title="클릭해서 이름 변경"
        >
          {h.name}
        </button>
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Lv.{h.level}</span>
      </div>
      <Bar pct={hpPct} color="bg-rose-500">
        HP {h.currentHp} / {max}
      </Bar>
      <Bar pct={xpPct} color="bg-indigo-500">
        XP {h.xp} / {xpNeed}
      </Bar>
      <div className="text-xs text-zinc-600 dark:text-zinc-400">
        ⚔️ 공격력 <b>{atk}</b>
        {recovering && (
          <span className="ml-2 text-amber-600 dark:text-amber-400">💤 회복 중 {recoverSec}초</span>
        )}
      </div>
    </Card>
  );
}

function Bar({ pct, color, children }: { pct: number; color: string; children: React.ReactNode }) {
  return (
    <div className="relative h-5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-white drop-shadow">
        {children}
      </span>
    </div>
  );
}

function BuildMenu({ api }: { api: BuilderApi }) {
  const { selectedBuild, setSelectedBuild, canAffordBuild } = api;
  const types: BuildingType[] = ["goldmine", "lumbermill", "farm", "barracks"];
  return (
    <Card padding="sm" className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        건설
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {types.map((t) => {
          const def = BUILDINGS[t];
          const afford = canAffordBuild(t);
          const selected = selectedBuild === t;
          return (
            <button
              type="button"
              key={t}
              disabled={!afford}
              onClick={() => setSelectedBuild(selected ? null : t)}
              className={`rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                selected
                  ? "border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100"
                  : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <div className="font-medium">{def.name}</div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                {costText(def.cost) || "무료"}
              </div>
            </button>
          );
        })}
      </div>
      {selectedBuild && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          격자 위에서 클릭해 배치 · Esc/우클릭 취소
        </p>
      )}
    </Card>
  );
}

function TrainMenu({ api }: { api: BuilderApi }) {
  const { state, hasBarracks, canAffordUnit, trainUnit } = api;
  const types: UnitType[] = ["warrior", "archer"];
  const now = useNow(500);
  return (
    <Card padding="sm" className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          훈련
        </div>
        <div className="font-mono text-xs">
          ⚔️ {state.units.warrior} 🏹 {state.units.archer}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {types.map((t) => {
          const def = UNITS[t];
          const afford = canAffordUnit(t);
          return (
            <button
              type="button"
              key={t}
              disabled={!afford || !hasBarracks}
              onClick={() => trainUnit(t)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-left text-xs transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              title={!hasBarracks ? "병영을 먼저 지으세요" : undefined}
            >
              <span className="font-medium">
                {def.icon} {def.name}
              </span>{" "}
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                {costText(def.cost)} · {def.trainTime / 1000}초
              </span>
            </button>
          );
        })}
      </div>
      {state.trainQueue.length > 0 && (
        <div className="space-y-1 rounded-md bg-zinc-100 p-2 dark:bg-zinc-900">
          {state.trainQueue.map((q, i) => {
            const sec = Math.max(0, Math.ceil((q.finishAt - now) / 1000));
            return (
              <div key={i} className="flex justify-between text-[11px]">
                <span>
                  {UNITS[q.type].icon} {UNITS[q.type].name}
                </span>
                <span>{sec}초</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ConquestPanel({ api }: { api: BuilderApi }) {
  const { state } = api;
  const conquered = state.defeatedTerritories.length;
  const total = 5;
  return (
    <Card padding="sm" className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        정복 현황
      </div>
      <div className="font-mono text-sm">
        ✨ {conquered} / {total} 영지
      </div>
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
        별자리 맵에서 인접 영지를 공격하세요.
      </div>
    </Card>
  );
}

function LogPanel({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <Card padding="sm">
      <div className="max-h-48 space-y-0.5 overflow-y-auto text-[11px] font-mono leading-tight text-zinc-700 dark:text-zinc-300">
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </Card>
  );
}
