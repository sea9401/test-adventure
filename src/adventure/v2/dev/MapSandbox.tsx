"use client";

// === 지도 샌드박스 프로토타입 (DEV 전용) =============================================
// 새 지도 방향을 "느낌만" 보기 위한 순수 클라이언트 목업. 라이브 데이터·DB·기존
// ContinentMap/OUTPOSTS 와 전혀 연결되지 않는다(의도). 여기서 감을 잡고 라이브 적용
// 여부/방식을 따로 결정한다.
//
// 실현하는 아이디어:
//  - 9×9 타일 보드, 셀 크기 = 아이콘 크기(딱 맞는 격자). 셀 크기는 −/+ 로 즉시 조절.
//  - 오르넬(임의 이름)을 정중앙으로 한 3×3 = 9개 고정 거점만 둔다(나머지는 없는 셈).
//  - 거점이 없는 빈 땅도 클릭해서 자유 이동(인접 제한 없음, 어디든).
//  - 빈 땅 어디든 "개척마을" 건설. 단 개척마을은 마을과 달리 땅(영지)을 보유하지 않는다.
//    마을로 승격할 때 비로소 영지(3×3 점선 경계)를 얻고, 그 승격 비용이 가장 비싸다.
//  - 개척마을 → 마을 → 도시 → 대도시 (마을 아래 개척마을 티어 신설).
//  - 영지 = 점선 경계(참고 이미지의 분쟁/권역 점선과 같은 표현).
import { useState } from "react";
import {
  ArrowCounterClockwise,
  CastleTurret,
  Coins,
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
const GAP = 1; // 셀 사이 격자선(px)

const keyOf = (c: number, r: number) => `${c},${r}`;

// --- 고정 거점 9개 — 오르넬(중앙) + 둘레 8칸(3×3). 이름은 임의(가공). ---
type FixedKind = "hub" | "kingdom" | "freecity";
type Fixed = { col: number; row: number; name: string; kind: FixedKind };
const FIXED: Fixed[] = [
  { col: 4, row: 4, name: "오르넬", kind: "hub" }, // 중앙 자유도시(임의 이름)
  { col: 4, row: 3, name: "베이라", kind: "freecity" },
  { col: 5, row: 4, name: "셀린느", kind: "freecity" },
  { col: 4, row: 5, name: "노바라", kind: "freecity" },
  { col: 3, row: 3, name: "아렌딜", kind: "kingdom" },
  { col: 5, row: 3, name: "투마르", kind: "kingdom" },
  { col: 3, row: 4, name: "코르반", kind: "kingdom" },
  { col: 3, row: 5, name: "드렌가", kind: "kingdom" },
  { col: 5, row: 5, name: "발로스", kind: "kingdom" },
];
const FIXED_BY_KEY = new Map(FIXED.map((f) => [keyOf(f.col, f.row), f]));

const FIXED_STYLE: Record<
  FixedKind,
  { label: string; icon: Icon; fill: string }
> = {
  hub: { label: "중앙 자유도시", icon: Star, fill: "#f4c842" },
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

// 비용(목업 골드). 개척마을 건설은 싸지만, 영지를 얻는 개척마을→마을 승격이 가장 비싸다.
const FOUND_COST = 100;
const PROMOTE_COST: Record<Tier, number> = { 0: 1000, 1: 1500, 2: 3000, 3: 0 };
const START_GOLD = 6000;

// 개척마을(tier 0)은 땅 미보유. 마을(1)+ 와 고정 거점은 3×3 영지를 보유.
const ownsLand = (tier: Tier) => tier >= 1;

const NAME_POOL = [
  "가람",
  "나루",
  "다온",
  "라온",
  "마루",
  "바롬",
  "사하",
  "아라",
  "자운",
  "해온",
];

type Founded = { tier: Tier; name: string };

export function MapSandbox() {
  const [founded, setFounded] = useState<Record<string, Founded>>({});
  const [player, setPlayer] = useState<{ col: number; row: number }>({
    col: CENTER,
    row: CENTER,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [cellPx, setCellPx] = useState(52); // 셀 크기(=아이콘 크기) 기본값
  const [gold, setGold] = useState(START_GOLD);
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
    if (gold < FOUND_COST) return;
    const name = NAME_POOL[(counter - 1) % NAME_POOL.length];
    setFounded((f) => ({ ...f, [k]: { tier: 0, name } }));
    setGold((g) => g - FOUND_COST);
    setCounter((n) => n + 1);
  };
  const promote = (k: string) =>
    setFounded((f) => {
      const cur = f[k];
      if (!cur || cur.tier >= 3) return f;
      const cost = PROMOTE_COST[cur.tier];
      if (gold < cost) return f;
      setGold((g) => g - cost);
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
    setGold(START_GOLD);
    setCounter(1);
  };

  const iconPx = Math.round(cellPx * 0.5);
  const foundedCount = Object.keys(founded).length;
  const boardPx = SIZE * cellPx + (SIZE - 1) * GAP;

  // 영지(점선 경계) 보유 정착지 — 고정 거점 전부 + 개척 정착지 중 마을(1)+.
  const landOwners: { key: string; col: number; row: number; fill: string }[] =
    [
      ...FIXED.map((f) => ({
        key: keyOf(f.col, f.row),
        col: f.col,
        row: f.row,
        fill: FIXED_STYLE[f.kind].fill,
      })),
      ...Object.entries(founded)
        .filter(([, v]) => ownsLand(v.tier))
        .map(([k]) => {
          const [c, r] = k.split(",").map(Number);
          return { key: k, col: c, row: r, fill: FOUNDED_FILL };
        }),
    ];
  // 3×3 영지(보드 밖은 잘림)를 px 사각형으로.
  const at = (i: number) => i * (cellPx + GAP);
  const regionRect = (col: number, row: number) => {
    const c0 = Math.max(0, col - 1);
    const c1 = Math.min(SIZE - 1, col + 1);
    const r0 = Math.max(0, row - 1);
    const r1 = Math.min(SIZE - 1, row + 1);
    return {
      left: at(c0) - 2,
      top: at(r0) - 2,
      width: (c1 - c0 + 1) * cellPx + (c1 - c0) * GAP + 4,
      height: (r1 - r0 + 1) * cellPx + (r1 - r0) * GAP + 4,
    };
  };

  const canAfford = (cost: number) => gold >= cost;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 text-zinc-200">
      <div>
        <h1 className="text-lg font-bold text-zinc-100">
          지도 샌드박스 — 프로토타입
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          9×9 보드 · 셀=아이콘 크기. 오르넬 중심 3×3 = 고정 거점 9개. 빈 땅은
          어디든 클릭해 이동하고, 어디든 <strong>개척마을</strong>을 세울 수
          있습니다. 개척마을은 마을과 달리{" "}
          <strong className="text-emerald-400">땅(영지)을 보유하지 않고</strong>{" "}
          시작하며, 영지를 얻는 마을 승격 비용이 가장 비쌉니다.{" "}
          <span className="text-amber-400">라이브와 무관한 목업입니다.</span>
        </p>
      </div>

      {/* 컨트롤 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-400">셀 크기</span>
        <div className="inline-flex overflow-hidden rounded-md border border-zinc-700">
          <button
            type="button"
            onClick={() => setCellPx((v) => Math.max(36, v - 4))}
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
            onClick={() => setCellPx((v) => Math.min(96, v + 4))}
            className="bg-zinc-900 px-2 py-1 hover:bg-zinc-800"
            aria-label="셀 크게"
          >
            <Plus size={14} weight="bold" />
          </button>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-amber-300">
          <Coins size={14} weight="fill" />
          <span className="tabular-nums">{gold.toLocaleString()}</span>
        </span>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowCounterClockwise size={14} weight="bold" />
          초기화
        </button>
        <span className="ml-auto text-zinc-500">
          개척 정착지{" "}
          <span className="tabular-nums text-zinc-300">{foundedCount}</span>
        </span>
      </div>

      {/* 보드 — 가로 넘치면 스크롤 */}
      <div className="overflow-x-auto">
        <div
          className="relative ring-1 ring-zinc-800"
          style={{ width: boardPx, height: boardPx }}
        >
          {/* 격자 + 타일 */}
          <div
            className="grid bg-zinc-800/70"
            style={{
              gridTemplateColumns: `repeat(${SIZE}, ${cellPx}px)`,
              gap: GAP,
            }}
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
                  className={`relative z-10 flex items-center justify-center transition ${
                    fill ? "" : "bg-zinc-900/60 hover:bg-zinc-800"
                  } ${isSel ? "outline outline-2 outline-indigo-400" : ""}`}
                  style={{
                    width: cellPx,
                    height: cellPx,
                    background: fill ? `${fill}22` : undefined,
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
                  {isPlayer && (
                    <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-emerald-400">
                      <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 p-0.5 text-zinc-950">
                        <User size={Math.max(8, iconPx * 0.4)} weight="fill" />
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 영지 점선 경계 — 고정 거점 + 마을(1)+. 개척마을(0)은 땅 미보유라 없음. */}
          {landOwners.map((s) => {
            const r = regionRect(s.col, s.row);
            return (
              <div
                key={`terr-${s.key}`}
                className="pointer-events-none absolute z-20 rounded-lg border-2 border-dashed"
                style={{
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                  borderColor: `${s.fill}88`,
                }}
              />
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
                  {FIXED_STYLE[selFixed.kind].label} · 고정 거점 · 영지 3×3 보유
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
                  {TIERS[selFounded.tier].label} ·{" "}
                  {ownsLand(selFounded.tier)
                    ? "영지 3×3 보유"
                    : "땅 미보유 (개척 거점)"}
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
                    disabled={!canAfford(PROMOTE_COST[selFounded.tier])}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-40"
                  >
                    {selFounded.tier === 0 ? "마을로 승격(영지 획득)" : "승격"} →{" "}
                    {TIERS[selFounded.tier + 1].label} (
                    {PROMOTE_COST[selFounded.tier].toLocaleString()}G)
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
                빈 땅 ({selCol}, {selRow}) — 어디로든 이동하거나 개척마을(땅
                미보유)을 세울 수 있습니다.
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
                  disabled={!canAfford(FOUND_COST)}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  <Hammer size={14} weight="fill" />
                  개척마을 건설 ({FOUND_COST.toLocaleString()}G)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 범례 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Star size={13} weight="fill" className="text-amber-400" />{" "}
          오르넬(중앙)
        </span>
        <span className="inline-flex items-center gap-1">
          <Crown size={13} weight="fill" className="text-purple-400" /> 왕국
        </span>
        <span className="inline-flex items-center gap-1">
          <Shield size={13} weight="fill" className="text-sky-400" /> 자유도시
        </span>
        <span className="inline-flex items-center gap-1">
          <Flag size={13} weight="fill" className="text-emerald-400" />{" "}
          개척마을(땅 없음) →
          <House size={13} weight="fill" className="text-emerald-400" />→
          <CastleTurret size={13} weight="fill" className="text-emerald-400" />→
          <Crown size={13} weight="fill" className="text-emerald-400" />
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-4 rounded-sm border-2 border-dashed border-zinc-500" />{" "}
          영지(점선)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-emerald-400" />{" "}
          내 위치
        </span>
      </div>
    </div>
  );
}
