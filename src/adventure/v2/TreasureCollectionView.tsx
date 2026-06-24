"use client";

import { useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TreasureSubTabs } from "./TreasureSubTabs";
import {
  ANTIQUES,
  ANTIQUE_THEME_LABEL,
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
  selling,
  bulkSelling,
  onBack,
  onSell,
  onBulkSell,
  onOpenShop,
  onOpenDig,
  onOpenLeaderboard,
}: {
  instances: CollectionInstance[];
  fragments: number;
  coins: number;
  loading: boolean;
  selling: string | null;
  bulkSelling: boolean;
  onBack: () => void;
  // 감정사 판매 — 골드 실현. (분해→코인은 폐지 — 코인은 주간 정산 전용, 2026-06-13)
  onSell: (instanceId: string) => void;
  // 등급 일괄 판매 — 흔함·보통까지만(희귀↑ 제외, 서버도 강제). 고가품 실수 판매 방지.
  onBulkSell: (maxTier: "common" | "uncommon") => void;
  onOpenShop: () => void;
  // 발굴 서브 탭바(발굴/주간 순위) — 미전달(dev 하니스)이면 그 탭 숨김.
  onOpenDig?: () => void;
  onOpenLeaderboard?: () => void;
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
      };
    })
    .sort((x, y) => y.appraisedValue - x.appraisedValue);

  const totalSellGold = enriched.reduce((s, e) => s + e.sellGold, 0);

  // 등급 일괄 판매 그룹 — 흔함만 / 흔함·보통(희귀↑ 제외). 미리보기 수치는 클라에서 계산(서버 권위 정산).
  const commonGroup = enriched.filter((e) => e.tier === "common");
  const junkGroup = enriched.filter(
    (e) => e.tier === "common" || e.tier === "uncommon",
  );
  const groupGold = (g: typeof enriched) => g.reduce((s, e) => s + e.sellGold, 0);
  const [confirm, setConfirm] = useState<{
    maxTier: "common" | "uncommon";
    label: string;
    count: number;
    gold: number;
  } | null>(null);

  return (
    <main className="mx-auto max-w-[520px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="발굴 보관함"
        onBack={onBack}
        right={
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            🪙 발굴 코인 {coins.toLocaleString()}
          </span>
        }
      />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        골동품 {enriched.length}점 · 판매가 합계 {totalSellGold.toLocaleString()}골드 · 지도 조각{" "}
        {fragments}개
      </p>

      <TreasureSubTabs
        active="collection"
        onOpenDig={onOpenDig}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenShop={onOpenShop}
      />

      {!loading && junkGroup.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/40">
          {confirm ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                <b>{confirm.label}</b> 유물 {confirm.count}점을{" "}
                <b className="text-yellow-700 dark:text-yellow-400">
                  {confirm.gold.toLocaleString()}골드
                </b>
                에 판매할까요?
              </span>
              <span className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={bulkSelling}
                  onClick={() => {
                    onBulkSell(confirm.maxTier);
                    setConfirm(null);
                  }}
                  className="rounded-lg border border-yellow-600 bg-yellow-500/90 px-2.5 py-1 text-[11px] font-semibold text-yellow-950 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkSelling ? "판매 중…" : "판매"}
                </button>
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                일괄 판매
              </span>
              <button
                type="button"
                disabled={commonGroup.length === 0 || bulkSelling}
                onClick={() =>
                  setConfirm({
                    maxTier: "common",
                    label: "흔함",
                    count: commonGroup.length,
                    gold: groupGold(commonGroup),
                  })
                }
                className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                흔함 {commonGroup.length}점 · {groupGold(commonGroup).toLocaleString()}G
              </button>
              <button
                type="button"
                disabled={junkGroup.length === 0 || bulkSelling}
                onClick={() =>
                  setConfirm({
                    maxTier: "uncommon",
                    label: "흔함·보통",
                    count: junkGroup.length,
                    gold: groupGold(junkGroup),
                  })
                }
                className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                흔함·보통 {junkGroup.length}점 · {groupGold(junkGroup).toLocaleString()}G
              </button>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                희귀 이상은 개별 판매
              </span>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-zinc-400">불러오는 중…</p>
      ) : enriched.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          아직 발굴한 골동품이 없습니다. 지도 조각을 모아 발굴 감정소에서 파보세요.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {enriched.map((e) => {
            const sellInFlight = selling === e.instanceId;
            const anyBusy = selling !== null || bulkSelling;
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
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
