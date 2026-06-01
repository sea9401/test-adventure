"use client";

import { useCallback, useState } from "react";
import {
  DIG_CLUE_LABEL,
  type DigClue,
  type TreasureSitePublic,
} from "./treasureDig";

// 발굴 미니게임 뷰 — 핸들러(open/dig) 주입형. 실게임은 useTreasure(API), dev 는 로컬 mock.
// 설계: docs/treasure-hunt-plan.md §4

export type DugAntique = {
  instanceId: string;
  antiqueId: string;
  name: string;
  tier: string;
  condition: number;
  appraisedValue: number;
};

export type OpenOutcome =
  | { ok: true; resumed: boolean; site: TreasureSitePublic; fragments?: number }
  | { ok: false; reason: "not_enough_fragments" | "error"; fragments?: number };

export type DigOutcome =
  | { outcome: "hit"; clue: DigClue; antique: DugAntique; codexCount: number }
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
  open: () => Promise<OpenOutcome>;
  dig: (siteId: string, cell: number) => Promise<DigOutcome>;
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
  onBack,
  onOpenCollection,
}: TreasureHandlers & {
  onBack?: () => void;
  onOpenCollection?: () => void;
}) {
  const [site, setSite] = useState<TreasureSitePublic | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleOpen = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await open();
      if (!r.ok) {
        setNotice(
          r.reason === "not_enough_fragments"
            ? `지도 조각이 부족합니다 (${r.fragments ?? 0}/5). 낚시·사냥으로 모으세요.`
            : "발굴 지점을 열 수 없습니다.",
        );
      } else {
        setSite(r.site);
        setResult(null);
      }
    } catch {
      setNotice("발굴 지점을 열 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }, [open]);

  const handleDig = useCallback(
    async (cell: number) => {
      if (!site || busy || result) return;
      setBusy(true);
      try {
        const r = await dig(site.siteId, cell);
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
    [site, busy, result, dig],
  );

  const grid = site;
  const clueByCell = new Map<number, DigClue>();
  if (grid) for (const d of grid.digs) clueByCell.set(d.cell, d.clue);
  const treasureCell = result?.treasureCell ?? -1;
  const digsRemaining = grid ? grid.digsAllowed - grid.digsUsed : 0;

  return (
    <main className="mx-auto max-w-[520px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-1 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        {(onBack || onOpenCollection) && (
          <div className="flex items-center justify-between">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                ← 마을로
              </button>
            ) : (
              <span />
            )}
            {onOpenCollection && (
              <button
                type="button"
                onClick={onOpenCollection}
                className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
              >
                발굴 보관함 →
              </button>
            )}
          </div>
        )}
        <h1 className="text-lg font-bold">보물 발굴</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          지도 조각으로 발굴 지점을 열고, 단서(뜨거움/차가움)로 매장지를 좁혀 파내세요. 무엇이
          묻혔는지는 파봐야 압니다.
        </p>
      </header>

      {notice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {notice}
        </div>
      )}

      {/* 격자 — 진행 중이거나 결과 공개 중일 때 */}
      {grid && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">
              남은 발굴{" "}
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
              const clue = clueByCell.get(cell);
              const isTreasure = cell === treasureCell;
              const dug = clue !== undefined;
              const disabled = busy || dug || result !== null;
              return (
                <button
                  key={cell}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDig(cell)}
                  className={`flex aspect-square items-center justify-center rounded-md text-base font-semibold transition ${
                    isTreasure
                      ? "bg-amber-300 text-amber-950 ring-2 ring-amber-500 dark:bg-amber-400"
                      : dug
                        ? CLUE_STYLE[clue]
                        : "bg-zinc-200/70 hover:bg-zinc-300/80 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  } ${disabled && !dug && !isTreasure ? "cursor-not-allowed opacity-60" : ""}`}
                  title={dug ? DIG_CLUE_LABEL[clue] : undefined}
                >
                  {isTreasure ? "💎" : dug ? CLUE_EMOJI[clue] : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 결과 카드 */}
      {result?.kind === "hit" && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-center dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">발굴 성공!</p>
          <p className="mt-1 text-lg font-bold">
            🏺 {result.antique.name}{" "}
            <span className={`text-sm ${TIER_STYLE[result.antique.tier] ?? ""}`}>
              ({TIER_LABEL[result.antique.tier] ?? result.antique.tier})
            </span>
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            보존상태 {result.antique.condition}% · 감정가 {result.antique.appraisedValue}골드
          </p>
        </div>
      )}

      {result?.kind === "exhausted" && (
        <div className="rounded-lg border border-zinc-300 bg-zinc-50 p-4 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
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

      {/* 액션 버튼 */}
      {!grid || result ? (
        <button
          type="button"
          disabled={busy}
          onClick={handleOpen}
          className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-zinc-50 transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {busy ? "여는 중…" : result ? "다시 발굴하기" : "발굴 지점 열기 (지도 조각 5개)"}
        </button>
      ) : null}
    </main>
  );
}
