"use client";

import { BackButton } from "@/components/ui/BackButton";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import {
  ANTIQUES,
  ANTIQUE_THEME_LABEL,
  ANTIQUE_TIERS,
  appraiseValue,
  sellGoldValue,
  formatCondition,
  isAntiqueId,
} from "@/adventure/data/v2/antique";

// 발굴 보관함 뷰 — 발굴한 골동품 인스턴스 목록(감정가 내림차순). 표시값은 카탈로그로 enrich.
// 데이터·핸들러는 TreasureCollectionPanel 이 주입(실 API / dev mock). 각 점은 감정사에게
// 분해(발굴 코인) 또는 감정사 판매(골드 — 감정가×TREASURE_SELL_GOLD_MULT)로 소비한다.

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
  selling,
  onBack,
  onDismantle,
  onSell,
  onOpenShop,
}: {
  instances: CollectionInstance[];
  fragments: number;
  coins: number;
  loading: boolean;
  dismantling: string | null;
  selling: string | null;
  onBack: () => void;
  onDismantle: (instanceId: string) => void;
  // 감정사 판매 — 골드 실현(분해와 택일).
  onSell: (instanceId: string) => void;
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
        sellGold: sellGoldValue(key, i.condition),
        dismantleCoins: ANTIQUE_TIERS[a.tier].dismantleCoins,
      };
    })
    .sort((x, y) => y.appraisedValue - x.appraisedValue);

  const totalSellGold = enriched.reduce((s, e) => s + e.sellGold, 0);

  return (
    <main className="mx-auto max-w-[520px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel className="space-y-2">
        <BackButton onClick={onBack} />
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold">발굴 보관함</h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              골동품 {enriched.length}점 · 판매가 합계 {totalSellGold.toLocaleString()}골드 · 지도 조각{" "}
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
      </HeaderPanel>

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
            const sellInFlight = selling === e.instanceId;
            const anyBusy = dismantling !== null || selling !== null;
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
                    판매가 {e.sellGold.toLocaleString()}골드
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => onSell(e.instanceId)}
                    className="rounded-lg border border-yellow-600 bg-yellow-500/90 px-2.5 py-1 text-[11px] font-medium text-yellow-950 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
                    title="감정사에게 골드로 판매"
                  >
                    {sellInFlight
                      ? "판매 중…"
                      : `판매 ${e.sellGold.toLocaleString()}G`}
                  </button>
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => onDismantle(e.instanceId)}
                    className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    title="감정사에게 분해해 발굴 코인으로"
                  >
                    {inFlight ? "분해 중…" : `분해 🪙${e.dismantleCoins}`}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
