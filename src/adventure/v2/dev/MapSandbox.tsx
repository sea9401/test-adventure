"use client";

// === 지도 샌드박스 프로토타입 (DEV 전용) =============================================
// 새 지도 방향을 "느낌만" 보기 위한 순수 클라이언트 목업. 라이브 데이터·DB·기존
// ContinentMap/OUTPOSTS 와 전혀 연결되지 않는다(의도). 여기서 감을 잡고 라이브 적용
// 여부/방식을 따로 결정한다.
//
// 실현하는 아이디어:
//  - 9×9 타일 보드, 셀 크기 = 아이콘 크기(딱 맞는 격자). 셀 크기는 −/+ 로 즉시 조절.
//  - 리베라를 정중앙으로 한 3×3 = 9개 고정 거점만 둔다(나머지 14개는 없는 셈).
//  - 거점이 없는 빈 땅도 클릭해서 자유 이동(인접 제한 없음).
//  - 빈 땅에 "개척마을" 건설 → 마을 → 도시 → 대도시로 승격(마을 아래 개척마을 티어 신설).
import { useState } from "react";
import {
  ArrowCounterClockwise,
  CastleTurret,
  Crown,
  Flag,
  Hammer,
  House,
  Minus,
  Plus,
  Shield,
  Star,
  Trash,
  User,
  type Icon,
} from "@phosphor-icons/react";

const SIZE = 9; // 9×9 보드
const CENTER = 4; // 정중앙 (0..8)

const keyOf = (c: number, r: number) => `${c},${r}`;

// --- 고정 거점 9개 — 리베라(중앙) + 둘레 8칸(3×3). 이름은 기존 데이터에서 빌려옴. ---
type FixedKind = "hub" | "kingdom" | "freecity";
type Fixed = {
  col: number;
  row: number;
  name: string;
  kind: FixedKind;
};
const FIXED: Fixed[] = [
  { col: 4, row: 4, name: "리베라", kind: "hub" }, // 중앙 자유도시
  { col: 4, row: 3, name: "보레아", kind: "freecity" },
  { col: 5, row: 4, name: "에우로스", kind: "freecity" },
  { col: 4, row: 5, name: "노토스", kind: "freecity" },
  { col: 3, row: 3, name: "에이라", kind: "kingdom" },
  { col: 5, row: 3, name: "로렌", kind: "kingdom" },
  { col: 3, row: 4, name: "코린", kind: "kingdom" },
  { col: 3, row: 5, name: "세라", kind: "kingdom" },
  { col: 5, row: 5, name: "발렌", kind: "kingdom" },
];
const FIXED_BY_KEY = new Map(FIXED.map((f) => [keyOf(f.col, f.row), f]));

const FIXED_STYLE: Record<
  FixedKind,
  { label: string; icon: Icon; fill: string }
> = {
  hub: { label: "자유도시", icon: Star, fill: "#f4c842" },
  kingdom: { label: "왕국", icon: Crown, fill: "#a855f7" },
  freecity: { label: "자유도시", icon: Shield, fill: "#0ea5e9" },
};

// --- 개척마을 티어(마을 아래 신설) → 마을 → 도시 → 대도시 -----------------------------
type Tier = 0 | 1 | 2 | 3;
const TIERS: { label: string; icon: Icon }[] = [
  { label: "개척마을", icon: Flag },
  { label: "마을", icon: House },
  { label: "도시", icon: CastleTurret },
  { label: "대도시", icon: Crown },
];
const FOUNDED_FILL = "#10b981"; // 플레이어가 세운 정착지 = 초록 계열

type Founded = { tier: Tier; name: string };

export function MapSandbox() {
  const [founded, setFounded] = useState<Record<string, Founded>>({});
  const [player, setPlayer] = useState<{ col: number; row: number }>({
    col: CENTER,
    row: CENTER,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [cellPx, setCellPx] = useState(58); // 셀 크기(=아이콘 크기) 다이얼
  const [counter, setCounter] = useState(1);

  const cells = Array.from({ length: SIZE * SIZE }, (_, i) => ({
    col: i % SIZE,
    row: Math.floor(i / SIZE),
  }));

  const selFixed = selected ? FIXED_BY_KEY.get(selected) : undefined;
  const selFounded = selected ? founded[selected] : undefined;
  const selIsEmpty = !!selected && !selFixed && !selFounded;
  const [selCol, selRow] = selected
    ? selected.split(",").map(Number)
    : [-1, -1];
  const selIsPlayer = selCol === player.col && selRow === player.row;

  const moveTo = (c: number, r: number) => setPlayer({ col: c, row: r });
  const found = (k: string) => {
    setFounded((f) => ({ ...f, [k]: { tier: 0, name: `새 정착지 ${counter}` } }));
    setCounter((n) => n + 1);
  };
  const promote = (k: string) =>
    setFounded((f) => {
      const cur = f[k];
      if (!cur || cur.tier >= 3) return f;
      return { ...f, [k]: { ...cur, tier: (cur.tier + 1) as Tier } };
    });
  const demolish = (k: string) =>
    setFounded((f) => {
      const next = { ...f };
      delete next[k];
      return next;
    });
  const reset = () => {
    setFounded({});
    setPlayer({ col: CENTER, row: CENTER });
    setSelected(null);
    setCounter(1);
  };

  const iconPx = Math.round(cellPx * 0.5);
  const foundedCount = Object.keys(founded).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 text-zinc-200">
      <div>
        <h1 className="text-lg font-bold text-zinc-100">
          지도 샌드박스 — 프로토타입
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          9×9 보드 · 셀=아이콘 크기. 리베라 중심 3×3 = 고정 거점 9개. 빈 땅을
          클릭하면 그 칸으로 이동하고, 빈 땅에는 <strong>개척마을</strong>을 세워
          마을→도시→대도시로 키울 수 있습니다.{" "}
          <span className="text-amber-400">
            라이브 데이터와 무관한 목업입니다.
          </span>
        </p>
      </div>

      {/* 컨트롤 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-400">셀 크기</span>
        <div className="inline-flex overflow-hidden rounded-md border border-zinc-700">
          <button
            type="button"
            onClick={() => setCellPx((v) => Math.max(36, v - 6))}
            className="bg-zinc-900 px-2 py-1 hover:bg-zinc-800"
            aria-label="셀 작게"
          >
            <Minus size={14} weight="bold" />
          </button>
          <span className="min-w-[3.5rem] bg-zinc-950 px-2 py-1 text-center tabular-nums text-zinc-300">
            {cellPx}px
          </span>
          <button
            type="button"
            onClick={() => setCellPx((v) => Math.min(96, v + 6))}
            className="bg-zinc-900 px-2 py-1 hover:bg-zinc-800"
            aria-label="셀 크게"
          >
            <Plus size={14} weight="bold" />
          </button>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowCounterClockwise size={14} weight="bold" />
          초기화
        </button>
        <span className="ml-auto text-zinc-500">
          개척 정착지 <span className="tabular-nums text-zinc-300">{foundedCount}</span>
        </span>
      </div>

      {/* 보드 — 가로 넘치면 스크롤 */}
      <div className="overflow-x-auto">
        <div
          className="grid w-max gap-px rounded-lg bg-zinc-800/60 p-px"
          style={{ gridTemplateColumns: `repeat(${SIZE}, ${cellPx}px)` }}
        >
          {cells.map(({ col, row }) => {
            const k = keyOf(col, row);
            const fx = FIXED_BY_KEY.get(k);
            const fd = founded[k];
            const isPlayer = col === player.col && row === player.row;
            const isSel = selected === k;
            const fill = fx
              ? FIXED_STYLE[fx.kind].fill
              : fd
                ? FOUNDED_FILL
                : null;
            const Glyph = fx
              ? FIXED_STYLE[fx.kind].icon
              : fd
                ? TIERS[fd.tier].icon
                : null;
            const label = fx?.name ?? fd?.name ?? "";
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelected(k)}
                title={label || "빈 땅"}
                className={`relative flex items-center justify-center transition ${
                  fill ? "" : "bg-zinc-900/70 hover:bg-zinc-800"
                } ${isSel ? "outline outline-2 outline-indigo-400" : ""}`}
                style={{
                  width: cellPx,
                  height: cellPx,
                  background: fill
                    ? `${fill}22`
                    : undefined,
                }}
              >
                {Glyph && fill && (
                  <span
                    className="flex items-center justify-center rounded-md"
                    style={{
                      width: cellPx - 10,
                      height: cellPx - 10,
                      background: fill,
                    }}
                  >
                    <Glyph size={iconPx} weight="fill" color="#0b1020" />
                  </span>
                )}
                {/* 플레이어 위치 — 초록 링 + 사람 마커 */}
                {isPlayer && (
                  <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-emerald-400">
                    <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 p-0.5 text-[8px] text-zinc-950">
                      <User size={Math.max(8, iconPx * 0.4)} weight="fill" />
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택 칸 패널 */}
      {selected && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
          {selFixed ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-100">
                  {selFixed.name}
                </div>
                <div className="text-xs text-zinc-400">
                  {FIXED_STYLE[selFixed.kind].label} · 고정 거점
                </div>
              </div>
              {!selIsPlayer && (
                <button
                  type="button"
                  onClick={() => moveTo(selCol, selRow)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  여기로 이동
                </button>
              )}
            </div>
          ) : selFounded ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-100">
                  {selFounded.name}
                </div>
                <div className="text-xs text-emerald-400">
                  {TIERS[selFounded.tier].label} · 개척 정착지
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!selIsPlayer && (
                  <button
                    type="button"
                    onClick={() => moveTo(selCol, selRow)}
                    className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                  >
                    여기로 이동
                  </button>
                )}
                {selFounded.tier < 3 && (
                  <button
                    type="button"
                    onClick={() => promote(selected)}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                  >
                    승격 → {TIERS[selFounded.tier + 1].label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => demolish(selected)}
                  aria-label="철거"
                  className="rounded-md border border-zinc-600 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-rose-400"
                >
                  <Trash size={14} weight="bold" />
                </button>
              </div>
            </div>
          ) : (
            // 빈 땅
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-zinc-400">
                빈 땅 ({selCol}, {selRow}) — 이동하거나 개척마을을 세울 수 있습니다.
              </div>
              <div className="flex items-center gap-2">
                {!selIsPlayer && (
                  <button
                    type="button"
                    onClick={() => moveTo(selCol, selRow)}
                    className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                  >
                    여기로 이동
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (selIsEmpty) found(selected);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Hammer size={14} weight="fill" />
                  개척마을 건설
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 범례 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Star size={13} weight="fill" className="text-amber-400" /> 리베라(중앙)
        </span>
        <span className="inline-flex items-center gap-1">
          <Crown size={13} weight="fill" className="text-purple-400" /> 왕국
        </span>
        <span className="inline-flex items-center gap-1">
          <Shield size={13} weight="fill" className="text-sky-400" /> 자유도시
        </span>
        <span className="inline-flex items-center gap-1">
          <Flag size={13} weight="fill" className="text-emerald-400" /> 개척마을→
          <House size={13} weight="fill" className="text-emerald-400" />→
          <CastleTurret size={13} weight="fill" className="text-emerald-400" />→
          <Crown size={13} weight="fill" className="text-emerald-400" />
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-emerald-400" />{" "}
          내 위치
        </span>
      </div>
    </div>
  );
}
