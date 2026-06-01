"use client";

import {
  ANTIQUES,
  ANTIQUE_THEME_LABEL,
  ANTIQUE_TIERS,
  appraiseValue,
  formatCondition,
  isAntiqueId,
} from "@/adventure/data/v2/antique";

// 발굴 보관함 뷰 — 발굴한 골동품 인스턴스 목록(감정가 내림차순). 표시값은 카탈로그로 enrich.
// 데이터·핸들러는 TreasureCollectionPanel 이 주입(실 API / dev mock). 각 점은 감정사에게
// 분해해 발굴 코인으로 바꿀 수 있다(거래소 PR-5 전까지 골동품의 유일한 소비처).

export type CollectionInstance = {
  instanceId: string;
  antiqueId: string;
  condition: number;
  foundAt: number;
};

const TIER_STYLE: Record<string, string> = {
  common: "text-zinc-600 dark:text-zinc-300",
  uncommon: "text-emerald-700 dark:text-emerald-300",
  rare: "text-sky-700 dark:text-sky-300",
  epic: "text-violet-700 dark:text-violet-300",
  legendary: "text-amber-600 dark:text-amber-300",
};

const TIER_LABEL: Record<string, string> = {
  common: "흔함",
  uncommon: "보통",
  rare: "희귀",
  epic: "영웅",
  legendary: "전설",
};

export function TreasureCollectionView({
  instances,
  fragments,
  coins,
  loading,
  dismantling,
  onBack,
  onDismantle,
  onOpenShop,
}: {
  instances: CollectionInstance[];
  fragments: number;
  coins: number;
  loading: boolean;
  dismantling: string | null;
  onBack: () => void;
  onDismantle: (instanceId: string) => void;
  onOpenShop: () => void;
}) {
  const enriched = instances
    .filter((i) => isAntiqueId(i.antiqueId))
    .map((i) => {
      const key = i.antiqueId as keyof typeof ANTIQUES;
      const a = ANTIQUES[key];
      return {
        ...i,
        name: a.name,
        tier: a.tier as string,
        theme: a.theme,
        appraisedValue: appraiseValue(key, i.condition),
        dismantleCoins: ANTIQUE_TIERS[a.tier].dismantleCoins,
      };
    })
    .sort((x, y) => y.appraisedValue - x.appraisedValue);

  const totalValue = enriched.reduce((s, e) => s + e.appraisedValue, 0);

  return (
    <main className="mx-auto max-w-[520px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 발굴로
        </button>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold">발굴 보관함</h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              골동품 {enriched.length}점 · 감정가 합계 {totalValue}골드 · 지도 조각{" "}
              {fragments}개
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenShop}
            className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/60"
          >
            🪙 {coins.toLocaleString()} · 상점
          </button>
        </div>
      </header>

      {loading ? (
        <p className="py-10 text-center text-sm text-zinc-400">불러오는 중…</p>
      ) : enriched.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          아직 발굴한 골동품이 없습니다. 지도 조각을 모아 발굴 감정소에서 파보세요.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {enriched.map((e) => {
            const inFlight = dismantling === e.instanceId;
            return (
              <li
                key={e.instanceId}
                className="flex items-center justify-between gap-2 px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    🏺 {e.name}
                    <span className={`text-[11px] ${TIER_STYLE[e.tier] ?? ""}`}>
                      {TIER_LABEL[e.tier] ?? e.tier}
                    </span>
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {ANTIQUE_THEME_LABEL[e.theme]} · 보존 {formatCondition(e.condition)} ·
                    감정가 {e.appraisedValue}골드
                  </span>
                </span>
                <button
                  type="button"
                  disabled={dismantling !== null}
                  onClick={() => onDismantle(e.instanceId)}
                  className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  title="감정사에게 분해해 발굴 코인으로"
                >
                  {inFlight ? "분해 중…" : `분해 🪙${e.dismantleCoins}`}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
