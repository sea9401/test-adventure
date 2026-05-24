"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import {
  TERRITORY_MAP_H,
  TERRITORY_MAP_W,
} from "./territoryMap";
import type { BrowseTarget, LiveApi } from "./useFiefdomServer";

// 라이브 모드 별자리 맵 — 서버에서 받은 다른 길드 영지 N개(최대 10) 를 별 노드로 표시.
// 인접 = 플레이어 ↔ 모든 타겟 (MVP — 본격 인접 그래프는 후속).

type Props = {
  api: LiveApi;
  onEnterVillage: () => void;
};

const PLAYER_X = 500;
const PLAYER_Y = 300;

// 10개 슬롯 — 2겹 원(반지름 180/240) 에 5개씩 interlace.
const SLOTS: Array<{ x: number; y: number }> = [
  { x: 680, y: 300 }, // r1 0°
  { x: 555, y: 129 }, // r1 72°
  { x: 354, y: 194 }, // r1 144°
  { x: 354, y: 406 }, // r1 216°
  { x: 555, y: 471 }, // r1 288°
  { x: 694, y: 159 }, // r2 36°
  { x: 426, y: 72 }, // r2 108°
  { x: 260, y: 300 }, // r2 180°
  { x: 426, y: 528 }, // r2 252°
  { x: 694, y: 441 }, // r2 324°
];

export function StarlightLiveMap({ api, onEnterVillage }: Props) {
  const [pending, setPending] = useState<BrowseTarget | null>(null);

  const bgStars = useMemo(() => {
    const rnd = mulberry32(42);
    return Array.from({ length: 80 }, () => ({
      x: rnd() * TERRITORY_MAP_W,
      y: rnd() * TERRITORY_MAP_H,
      r: 0.6 + rnd() * 1.6,
      o: 0.15 + rnd() * 0.45,
    }));
  }, []);

  const positionedTargets = api.targets.slice(0, SLOTS.length).map((t, i) => ({
    target: t,
    pos: SLOTS[i],
  }));

  const playerGuildName = api.load.kind === "ready" ? api.load.guildName : "내 길드";
  const myShieldActive = api.shieldUntil ? api.shieldUntil > new Date() : false;

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
          {bgStars.map((s, i) => (
            <circle key={`bg${i}`} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.o} />
          ))}

          {/* 별자리선 — 플레이어 ↔ 각 타겟 */}
          {positionedTargets.map(({ target, pos }) => (
            <line
              key={`e${target.guildId}`}
              x1={PLAYER_X}
              y1={PLAYER_Y}
              x2={pos.x}
              y2={pos.y}
              stroke="#a5b4fc"
              strokeOpacity={0.45}
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
          ))}

          {/* 플레이어 노드 */}
          <PlayerNode name={playerGuildName} shielded={myShieldActive} onClick={onEnterVillage} />

          {/* 타겟 노드들 */}
          {positionedTargets.map(({ target, pos }) => (
            <TargetNode
              key={target.guildId}
              target={target}
              x={pos.x}
              y={pos.y}
              onClick={() => {
                const shielded =
                  target.shieldUntil && new Date(target.shieldUntil) > new Date();
                if (shielded) return;
                setPending(target);
              }}
            />
          ))}
        </svg>
      </Card>

      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          ✨ 내 별 클릭 → 영지 진입 · 다른 길드 별 클릭 → 공격 · 🛡️ 표시는 보호막 중
        </p>
        <button
          type="button"
          onClick={() => api.refreshTargets()}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          🔄 다른 길드
        </button>
      </div>

      {pending && (
        <AttackDialog
          target={pending}
          api={api}
          onConfirm={async () => {
            await api.attackGuild(pending.guildId);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function PlayerNode({
  name,
  shielded,
  onClick,
}: {
  name: string;
  shielded: boolean;
  onClick: () => void;
}) {
  return (
    <g style={{ cursor: "pointer" }} onClick={onClick}>
      <circle cx={PLAYER_X} cy={PLAYER_Y} r={36} fill="#fbbf24" opacity={0.25} />
      <circle cx={PLAYER_X} cy={PLAYER_Y} r={28} fill="#fbbf24" stroke="#fde68a" strokeWidth={2} />
      <text
        x={PLAYER_X}
        y={PLAYER_Y + 48}
        textAnchor="middle"
        fontSize={14}
        fontWeight="700"
        fill="#fef3c7"
        pointerEvents="none"
      >
        {name}
      </text>
      {shielded && (
        <text x={PLAYER_X} y={PLAYER_Y + 66} textAnchor="middle" fontSize={11} fill="#a5b4fc">
          🛡️ 보호 중
        </text>
      )}
    </g>
  );
}

function TargetNode({
  target,
  x,
  y,
  onClick,
}: {
  target: BrowseTarget;
  x: number;
  y: number;
  onClick: () => void;
}) {
  const shielded = target.shieldUntil && new Date(target.shieldUntil) > new Date();
  const r = 14 + Math.min(20, target.heroLevel * 2);
  const fill = shielded ? "#3f3f46" : "#818cf8";
  const stroke = shielded ? "#52525b" : "#c7d2fe";
  return (
    <g
      style={{ cursor: shielded ? "default" : "pointer" }}
      onClick={shielded ? undefined : onClick}
      opacity={shielded ? 0.55 : 1}
    >
      {!shielded && <circle cx={x} cy={y} r={r + 8} fill={fill} opacity={0.25} />}
      <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={2} />
      <text
        x={x}
        y={y + r + 16}
        textAnchor="middle"
        fontSize={13}
        fontWeight="600"
        fill="#e2e8f0"
        pointerEvents="none"
      >
        {target.guildName}
      </text>
      <text
        x={x}
        y={y + r + 30}
        textAnchor="middle"
        fontSize={10}
        fill={shielded ? "#a1a1aa" : "#a5b4fc"}
        pointerEvents="none"
      >
        {shielded ? "🛡️ 보호 중" : `★${target.lodgeRank} · 영웅 Lv.${target.heroLevel}`}
      </text>
    </g>
  );
}

function AttackDialog({
  target,
  api,
  onConfirm,
  onCancel,
}: {
  target: BrowseTarget;
  api: LiveApi;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
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
            ⚔️ {target.guildName} 공격
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            회관 ★{target.lodgeRank} · 영웅 Lv.{target.heroLevel}
          </p>
        </div>
        <div className="space-y-1 rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">방어 병력:</span> 총 {target.armySize}
            기 (상세는 비공개)
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            성공 시 상대 자원 20% 약탈 · 4시간 보호막 발동
          </div>
        </div>
        <div className="space-y-1 rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">내 부대:</span>{" "}
            ⚔️ {state.units.warrior} 🏹 {state.units.archer}
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">영웅:</span> {state.hero.name} (Lv.
            {state.hero.level})
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
