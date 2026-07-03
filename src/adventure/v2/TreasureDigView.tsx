"use client";

import {
  TREASURE_SELL_GOLD_MULT,
  formatCondition,
} from "@/adventure/data/v2/antique";

import { useCallback, useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TreasureSubTabs } from "./TreasureSubTabs";
import {
  DIG_CLUE_LABEL,
  GRID_SIZE,
  TREASURE_DIG_TOOLS,
  TREASURE_SITE_OPTIONS,
  type DigClue,
  type DigRecord,
  type TreasureDigToolId,
  type TreasureSitePublic,
  type TreasureSiteOptionId,
} from "./treasureDig";
import { FRAGMENTS_PER_MAP } from "./treasureFragments";

// 발굴 미니게임 뷰 — 핸들러(open/dig) 주입형. 실게임은 useTreasure(API), dev 는 로컬 mock.
// 설계: docs/treasure-hunt-plan.md §4

export type DugAntique = {
  instanceId: string;
  antiqueId: string;
  name: string;
  tier: string;
  condition: number;
  conditionBonus?: number;
  appraisedValue: number;
};

export type OpenOutcome =
  | {
      ok: true;
      resumed: boolean;
      site: TreasureSitePublic;
      fragments?: number;
      needed?: number;
      baseNeeded?: number;
      mapWorkshopLevel?: number;
      discountPct?: number;
    }
  | {
      ok: false;
      reason: "not_enough_fragments" | "error";
      fragments?: number;
      needed?: number;
      baseNeeded?: number;
      mapWorkshopLevel?: number;
      discountPct?: number;
    };

export type TreasureFragmentStatus = {
  fragments: number;
  needed: number;
  baseNeeded: number;
  mapWorkshopLevel: number;
  discountPct: number;
};

export type DigOutcome =
  | { outcome: "hit"; clue: DigClue; antique: DugAntique; codexCount: number }
  | { outcome: "probe"; clue: DigClue; site: TreasureSitePublic }
  | { outcome: "miss"; clue: DigClue; site: TreasureSitePublic }
  | {
      outcome: "exhausted";
      clue: DigClue;
      treasureCell: number;
      missed: { antiqueId: string; name: string; tier: string };
    }
  | { outcome: "invalid"; site: TreasureSitePublic }
  | { outcome: "error" };

export type TreasureHandlers = {
  open: (siteOptionId: TreasureSiteOptionId) => Promise<OpenOutcome>;
  dig: (
    siteId: string,
    cell: number,
    tool: TreasureDigToolId,
  ) => Promise<DigOutcome>;
  /** 보유 지도 조각 수 조회(표시용). 없으면 조각 수를 숨긴다. */
  loadFragments?: () => Promise<TreasureFragmentStatus | null>;
  /** 진행 중 발굴 세션 복원(읽기 전용). 마운트 시 격자를 이어 그린다. 없으면 복원 안 함. */
  loadSession?: () => Promise<TreasureSitePublic | null>;
};

const TIER_LABEL: Record<string, string> = {
  common: "흔함",
  uncommon: "보통",
  rare: "희귀",
  epic: "영웅",
  legendary: "전설",
};

const TIER_STYLE: Record<string, string> = {
  common: "text-zinc-600 dark:text-zinc-300",
  uncommon: "text-emerald-700 dark:text-emerald-300",
  rare: "text-sky-700 dark:text-sky-300",
  epic: "text-violet-700 dark:text-violet-300",
  legendary: "text-amber-600 dark:text-amber-300",
};

const CLUE_STYLE: Record<DigClue, string> = {
  hot: "bg-red-500/85 text-white",
  warm: "bg-amber-400/85 text-amber-950",
  lukewarm: "bg-sky-400/70 text-sky-950 dark:text-sky-100",
  cold: "bg-blue-300/60 text-blue-950 dark:bg-blue-900/50 dark:text-blue-100",
};

const CLUE_EMOJI: Record<DigClue, string> = {
  hot: "🔥",
  warm: "🌤",
  lukewarm: "💧",
  cold: "❄️",
};

type Result =
  | { kind: "hit"; antique: DugAntique; treasureCell: number }
  | {
      kind: "exhausted";
      treasureCell: number;
      missed: { antiqueId: string; name: string; tier: string };
    }
  | null;

export function TreasureDigView({
  open,
  dig,
  loadFragments,
  loadSession,
  onBack,
  onOpenCollection,
  onOpenLeaderboard,
  onOpenShop,
}: TreasureHandlers & {
  onBack?: () => void;
  onOpenCollection?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenShop?: () => void;
}) {
  const [site, setSite] = useState<TreasureSitePublic | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 보유 지도 조각 — 마운트 시 조회, open 응답(소비 후 잔량/부족 시 현재량)으로 갱신.
  const [fragments, setFragments] = useState<number | null>(null);
  const [fragmentCost, setFragmentCost] = useState(FRAGMENTS_PER_MAP);
  const [baseFragmentCost, setBaseFragmentCost] = useState(FRAGMENTS_PER_MAP);
  const [mapWorkshopLevel, setMapWorkshopLevel] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [selectedSiteOptionId, setSelectedSiteOptionId] =
    useState<TreasureSiteOptionId>(TREASURE_SITE_OPTIONS[0].id);
  const [selectedToolId, setSelectedToolId] =
    useState<TreasureDigToolId>(TREASURE_DIG_TOOLS[0].id);
  // 세션 복원 진행 중 — loadSession 결과 전까지 시작 화면이 깜빡이지 않게 가린다.
  const [restoring, setRestoring] = useState(Boolean(loadSession));

  useEffect(() => {
    if (!loadFragments) return;
    let alive = true;
    void loadFragments().then((status) => {
      if (alive && status) {
        setFragments(status.fragments);
        setFragmentCost(status.needed);
        setBaseFragmentCost(status.baseNeeded);
        setMapWorkshopLevel(status.mapWorkshopLevel);
        setDiscountPct(status.discountPct);
      }
    });
    return () => {
      alive = false;
    };
  }, [loadFragments]);

  // 진행 중 발굴 복원 — 다른 화면을 다녀와 언마운트되면 로컬 격자가 사라지는데, 서버 세션은
  //   살아 있다(조각은 이미 소비됨). 마운트 시 세션을 읽어 격자를 이어 그려 "조각만 증발"을 막는다.
  //   읽기 전용(조각 재소비 없음) · 진행 중 세션 없으면 null → 그대로 시작 화면.
  useEffect(() => {
    if (!loadSession) return;
    let alive = true;
    void loadSession()
      .then((s) => {
        if (alive && s) {
          setSite(s);
          setSelectedSiteOptionId(s.siteOption.id);
          setResult(null);
        }
      })
      .finally(() => {
        if (alive) setRestoring(false);
      });
    return () => {
      alive = false;
    };
  }, [loadSession]);

  const handleOpen = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await open(selectedSiteOptionId);
      if (typeof r.fragments === "number") setFragments(r.fragments);
      if (typeof r.needed === "number") setFragmentCost(r.needed);
      if (typeof r.baseNeeded === "number") setBaseFragmentCost(r.baseNeeded);
      if (typeof r.mapWorkshopLevel === "number") setMapWorkshopLevel(r.mapWorkshopLevel);
      if (typeof r.discountPct === "number") setDiscountPct(r.discountPct);
      if (!r.ok) {
        const needed = r.needed ?? fragmentCost;
        setNotice(
          r.reason === "not_enough_fragments"
            ? `지도 조각이 부족합니다 (${r.fragments ?? 0}/${needed}). 낚시·사냥으로 모으세요.`
            : "발굴 지점을 열 수 없습니다.",
        );
      } else {
        setSite(r.site);
        setSelectedSiteOptionId(r.site.siteOption.id);
        setResult(null);
      }
    } catch {
      setNotice("발굴 지점을 열 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }, [fragmentCost, open, selectedSiteOptionId]);

  const handleDig = useCallback(
    async (cell: number) => {
      if (!site || busy || result) return;
      setBusy(true);
      try {
        const r = await dig(site.siteId, cell, selectedToolId);
        switch (r.outcome) {
          case "hit":
            setResult({ kind: "hit", antique: r.antique, treasureCell: cell });
            break;
          case "exhausted":
            setResult({
              kind: "exhausted",
              treasureCell: r.treasureCell,
              missed: r.missed,
            });
            break;
          case "miss":
          case "probe":
          case "invalid":
            setSite(r.site);
            break;
          case "error":
            setNotice("발굴 중 오류가 발생했습니다.");
            break;
        }
      } catch {
        setNotice("발굴 중 오류가 발생했습니다.");
      } finally {
        setBusy(false);
      }
    },
    [site, busy, result, dig, selectedToolId],
  );

  const grid = site;
  const digByCell = new Map<number, DigRecord>();
  if (grid) for (const d of grid.digs) digByCell.set(d.cell, d);
  const treasureCell = result?.treasureCell ?? -1;
  const digsRemaining = grid ? grid.digsAllowed - grid.digsUsed : 0;
  const hasWorkshopDiscount =
    mapWorkshopLevel > 0 && discountPct > 0 && fragmentCost < baseFragmentCost;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="보물 발굴"
        onBack={onBack}
        right={
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            🗺 지도 조각 {fragments ?? "…"}개
          </span>
        }
      />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        지도 조각으로 발굴 지점을 열고, 단서로 매장지를 좁혀 파내세요. 무엇이
        묻혔는지는 파봐야 압니다.
      </p>

      {/* 서브 nav — 옛 우상단 텍스트 링크(주간 순위/보관함)가 눈에 안 띄어 탭바로 승격(#726). */}
      <TreasureSubTabs
        active="dig"
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenCollection={onOpenCollection}
        onOpenShop={onOpenShop}
      />

      {notice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {notice}
        </div>
      )}

      {/* 발굴 방법 — 아직 발굴 지점을 연 적 없는 첫 화면에서 안내(복원 중엔 깜빡임 방지로 숨김) */}
      {!grid && !restoring && (
        <div className="ui-treasure-guide space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-xs leading-relaxed text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <p className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            탐사지 선택
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            {TREASURE_SITE_OPTIONS.map((option) => {
              const selected = selectedSiteOptionId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedSiteOptionId(option.id)}
                  className={`rounded-md border px-3 py-2 text-left transition ${
                    selected
                      ? "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {option.name}
                  </span>
                  <span className="mt-1 block text-[11px] opacity-80">
                    {option.summary}
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    {option.effectLabel}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            발굴 방법
          </p>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              지도 조각 {fragmentCost}개로 발굴 지점을 엽니다. (조각은 낚시·사냥에서 모여요)
            </li>
            <li>
              {GRID_SIZE}×{GRID_SIZE} 격자에서 칸을 골라 탐사지별 제한 횟수 안에 파볼 수 있어요.
            </li>
            <li>
              삽은 한 칸을 직접 파내고, 탐침은 행동 1회를 써서 선택 칸과 상하좌우 단서를 확인합니다.
            </li>
            <li>
              파낸 칸이 매장지에서 얼마나 가까운지 알려줍니다 —{" "}
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                뜨거울수록 가깝습니다.
              </span>
            </li>
          </ol>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>🔥 뜨거움 (바로 옆)</span>
            <span>🌤 따뜻함</span>
            <span>💧 미지근</span>
            <span>❄️ 차가움 (멈)</span>
          </p>
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            단서로 매장지를 정확히 파내면 골동품 발굴 성공! 무엇이 묻혔는지(희귀도·보존상태)는
            운이라 파봐야 압니다. 빨리 찾아낼수록 보존상태가 조금 더 좋아집니다.
          </p>
          {hasWorkshopDiscount && (
            <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
              지도 제작소 Lv {mapWorkshopLevel} 효과: 기본 {baseFragmentCost}개 →{" "}
              {fragmentCost}개 (-{discountPct}%)
            </p>
          )}
        </div>
      )}

      {/* 격자 — 진행 중이거나 결과 공개 중일 때 */}
      {grid && (
        <div className="space-y-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="font-semibold">{grid.siteOption.name}</span>
            <span className="mx-1 text-amber-700/70 dark:text-amber-200/70">
              ·
            </span>
            <span>{grid.siteOption.effectLabel}</span>
          </div>
          <div className="rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="grid grid-cols-2 gap-2">
              {TREASURE_DIG_TOOLS.map((tool) => {
                const selected = selectedToolId === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setSelectedToolId(tool.id)}
                    className={`rounded-md border px-3 py-2 text-left text-xs transition ${
                      selected
                        ? "border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {tool.name}
                    </span>
                    <span className="mt-1 block text-[11px] opacity-80">
                      {tool.summary}
                    </span>
                    <span className="mt-1 block text-[11px] font-medium">
                      {tool.effectLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">
              남은 행동{" "}
              <span className="font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                {digsRemaining}
              </span>
              /{grid.digsAllowed}
            </span>
            <span className="flex gap-2 text-[11px] text-zinc-400">
              <span>🔥 뜨거움</span>
              <span>🌤 따뜻함</span>
              <span>💧 미지근</span>
              <span>❄️ 차가움</span>
            </span>
          </div>

          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${grid.gridSize}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: grid.gridSize * grid.gridSize }, (_, cell) => {
              const digRecord = digByCell.get(cell);
              const clue = digRecord?.clue;
              const isTreasure = cell === treasureCell;
              const shovelDug = digRecord?.tool === "shovel";
              const probed = digRecord?.tool === "probe";
              const disabled =
                busy ||
                result !== null ||
                (selectedToolId === "shovel" && shovelDug) ||
                (selectedToolId === "probe" && digsRemaining <= 0);
              return (
                <button
                  key={cell}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDig(cell)}
                  className={`ui-treasure-cell flex aspect-square items-center justify-center rounded-md text-base font-semibold transition ${
                    isTreasure
                      ? "is-treasure bg-amber-300 text-amber-950 ring-2 ring-amber-500 dark:bg-amber-400"
                      : clue
                        ? `${CLUE_STYLE[clue]} ${
                            probed
                              ? "border-2 border-dashed border-white/70 opacity-80 dark:border-zinc-100/50"
                              : ""
                          }`
                        : "bg-zinc-200/70 hover:bg-zinc-300/80 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  } ${disabled && !clue && !isTreasure ? "cursor-not-allowed opacity-60" : ""}`}
                  title={clue ? DIG_CLUE_LABEL[clue] : undefined}
                >
                  {isTreasure ? "💎" : clue ? CLUE_EMOJI[clue] : ""}
                  {probed && !isTreasure ? (
                    <span className="sr-only">탐침 확인</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 결과 카드 */}
      {result?.kind === "hit" && (
        <div className="ui-treasure-result rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-center dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            발굴 성공 · 감정 완료
          </p>
          <p className="mt-1 text-lg font-bold">
            🏺 {result.antique.name}{" "}
            <span className={`text-sm ${TIER_STYLE[result.antique.tier] ?? ""}`}>
              ({TIER_LABEL[result.antique.tier] ?? result.antique.tier})
            </span>
          </p>
          <p className="mt-1 text-xs font-medium text-zinc-700 dark:text-zinc-200">
            보존상태 {formatCondition(result.antique.condition)}
            {result.antique.conditionBonus ? (
              <span className="text-emerald-700 dark:text-emerald-300">
                {" "}
                (+{result.antique.conditionBonus})
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            감정가 {result.antique.appraisedValue.toLocaleString()} · 판매가{" "}
            {(
              result.antique.appraisedValue * TREASURE_SELL_GOLD_MULT
            ).toLocaleString()}
            골드
          </p>
        </div>
      )}

      {result?.kind === "exhausted" && (
        <div className="ui-treasure-result rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">발굴 실패</p>
          <p className="mt-1 text-sm">
            💎 자리에{" "}
            <span className="font-bold">
              {result.missed.name}{" "}
              <span className={TIER_STYLE[result.missed.tier] ?? ""}>
                ({TIER_LABEL[result.missed.tier] ?? result.missed.tier})
              </span>
            </span>
            이(가) 묻혀 있었습니다.
          </p>
        </div>
      )}

      {/* 액션 버튼 — 복원 중엔 숨겨 시작 화면 깜빡임/오클릭 방지 */}
      {(!grid || result) && !restoring ? (
        <button
          type="button"
          disabled={busy || (fragments !== null && fragments < fragmentCost)}
          onClick={handleOpen}
          className="ui-lift-card w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-zinc-50 transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {busy
            ? "여는 중…"
            : fragments !== null && fragments < fragmentCost
              ? `지도 조각 부족 (${fragments}/${fragmentCost})`
              : `${result ? "다시 발굴하기" : "탐사지 열기"} (지도 조각 ${fragmentCost}개)`}
        </button>
      ) : null}
    </main>
  );
}
