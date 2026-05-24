"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { makeEnemy } from "./builderData";
import {
  TERRITORIES,
  TERRITORY_MAP_H,
  TERRITORY_MAP_W,
  getTerritory,
  isAdjacent,
  listAdjacencyEdges,
  type Territory,
  type TerritoryId,
} from "./territoryMap";
import type { BuilderApi } from "./useBuilderState";

// 별빛 권역 오버뷰 — 별자리 메타포로 영지 배치.
// 본토 MapView 와 동일한 SVG 패턴(노드 + 엣지) 이지만 톤은 딥 인디고/별 글로우.

type Props = {
  api: BuilderApi;
  onEnterVillage: () => void;
};

export function StarlightTerritoryMap({ api, onEnterVillage }: Props) {
  const { state, attackTerritory } = api;
  const [pending, setPending] = useState<TerritoryId | null>(null);

  // 배경 별 스캐터 — 한 번만 생성(매 렌더 흔들림 방지).
  const bgStars = useMemo(() => {
    const seed = 42;
    const rnd = mulberry32(seed);
    return Array.from({ length: 80 }, () => ({
      x: rnd() * TERRITORY_MAP_W,
      y: rnd() * TERRITORY_MAP_H,
      r: 0.6 + rnd() * 1.6,
      o: 0.15 + rnd() * 0.45,
    }));
  }, []);

  const edges = useMemo(() => listAdjacencyEdges(), []);

  const handleNodeClick = (id: TerritoryId) => {
    const t = getTerritory(id);
    if (t.owner === "player") {
      onEnterVillage();
      return;
    }
    if (state.defeatedTerritories.includes(id)) return;
    if (!isAdjacent("player", id)) return;
    setPending(id);
  };

  const confirmAttack = () => {
    if (!pending) return;
    attackTerritory(pending);
    setPending(null);
  };

  return (
    <div className="space-y-2">
      <Card
        padding="none"
        className="overflow-hidden bg-gradient-to-br from-indigo-950 to-violet-950 dark:from-zinc-950 dark:to-violet-950"
      >
        <svg
          viewBox={`0 0 ${TERRITORY_MAP_W} ${TERRITORY_MAP_H}`}
          className="block h-auto w-full select-none"
        >
          {/* 배경 별 스캐터 */}
          {bgStars.map((s, i) => (
            <circle
              key={`bg${i}`}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill="white"
              opacity={s.o}
            />
          ))}

          {/* 별자리선 — 인접 영지 연결 */}
          {edges.map(({ a, b }, i) => {
            const ta = getTerritory(a);
            const tb = getTerritory(b);
            const touchesPlayer = a === "player" || b === "player";
            return (
              <line
                key={`e${i}`}
                x1={ta.x}
                y1={ta.y}
                x2={tb.x}
                y2={tb.y}
                stroke={touchesPlayer ? "#a5b4fc" : "#64748b"}
                strokeOpacity={touchesPlayer ? 0.55 : 0.3}
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
            );
          })}

          {/* 영지 노드 */}
          {TERRITORIES.map((t) => {
            const defeated = state.defeatedTerritories.includes(t.id);
            const isPlayer = t.owner === "player";
            const reachable = isPlayer || (!defeated && isAdjacent("player", t.id));
            return (
              <TerritoryNode
                key={t.id}
                t={t}
                defeated={defeated}
                isPlayer={isPlayer}
                reachable={reachable}
                onClick={() => handleNodeClick(t.id)}
              />
            );
          })}
        </svg>
      </Card>

      <p className="px-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        ✨ 내 별을 클릭하면 영지로 진입 · 인접한 적 별을 클릭하면 공격 · 끊긴 별은 잠금 상태
      </p>

      {pending && <AttackDialog targetId={pending} api={api} onConfirm={confirmAttack} onCancel={() => setPending(null)} />}
    </div>
  );
}

function TerritoryNode({
  t,
  defeated,
  isPlayer,
  reachable,
  onClick,
}: {
  t: Territory;
  defeated: boolean;
  isPlayer: boolean;
  reachable: boolean;
  onClick: () => void;
}) {
  // 별 크기: 플레이어 28, AI 14 + level*2.
  const r = isPlayer ? 28 : 14 + t.level * 2;
  const interactive = isPlayer || reachable;

  let fill = "#1e293b"; // 잠긴 영지
  let stroke = "#475569";
  let glow = false;
  if (isPlayer) {
    fill = "#fbbf24"; // amber-400
    stroke = "#fde68a";
    glow = true;
  } else if (defeated) {
    fill = "#3f3f46"; // zinc-700
    stroke = "#52525b";
  } else if (reachable) {
    fill = "#818cf8"; // indigo-400
    stroke = "#c7d2fe";
    glow = true;
  }

  return (
    <g
      style={{ cursor: interactive && !defeated ? "pointer" : "default" }}
      onClick={interactive && !defeated ? onClick : undefined}
      opacity={defeated ? 0.55 : 1}
    >
      {/* glow halo — 도달 가능 노드만 */}
      {glow && (
        <circle
          cx={t.x}
          cy={t.y}
          r={r + 8}
          fill={fill}
          opacity={0.25}
        />
      )}
      <circle cx={t.x} cy={t.y} r={r} fill={fill} stroke={stroke} strokeWidth={2} />
      <text
        x={t.x}
        y={t.y + r + 16}
        textAnchor="middle"
        fontSize={13}
        fontWeight="600"
        fill="#e2e8f0"
        pointerEvents="none"
      >
        {t.name}
      </text>
      {!isPlayer && (
        <text
          x={t.x}
          y={t.y + r + 30}
          textAnchor="middle"
          fontSize={10}
          fill={defeated ? "#a1a1aa" : "#a5b4fc"}
          pointerEvents="none"
        >
          {defeated ? "정복됨" : `Lv.${t.level}`}
        </text>
      )}
    </g>
  );
}

function AttackDialog({
  targetId,
  api,
  onConfirm,
  onCancel,
}: {
  targetId: TerritoryId;
  api: BuilderApi;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = getTerritory(targetId);
  const enemy = makeEnemy(t.level);
  const { state } = api;
  const hasArmy = state.units.warrior + state.units.archer > 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <Card
        padding="md"
        className="w-full max-w-sm space-y-3"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            ⚔️ {t.name} 공격
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Lv.{t.level} · 별빛 권역</p>
        </div>
        <div className="space-y-1 rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">방어군:</span>{" "}
            ⚔️ {enemy.army.warrior} 🏹 {enemy.army.archer}
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">예상 약탈:</span>{" "}
            🪙 {enemy.loot.gold} 🪵 {enemy.loot.wood} 🌾 {enemy.loot.food}
          </div>
        </div>
        <div className="space-y-1 rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">내 부대:</span>{" "}
            ⚔️ {state.units.warrior} 🏹 {state.units.archer}
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">영웅:</span>{" "}
            {state.hero.name} (Lv.{state.hero.level})
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!hasArmy}
            className="flex-1 rounded-md border border-amber-500 bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ⚔️ 공격
          </button>
        </div>
      </Card>
    </div>
  );
}

// 결정론적 PRNG — 매 렌더에서 같은 별 배치 보장.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
