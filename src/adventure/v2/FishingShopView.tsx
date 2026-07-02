"use client";

import { useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { FishingSubTabs } from "./FishingSubTabs";
import {
  CoinConsumableShopList,
  CoinTitleShopList,
} from "./CoinShopLists";
import { fishingShopEntries, FISHING_SHOP_CONSUMABLES } from "./fishingShop";
import {
  FISHING_LURE_IDS,
  FISHING_LURES,
  FISHING_ROD_IDS,
  FISHING_RODS,
  type FishingGearBonuses,
  type FishingProgressionView,
} from "./fishingProgression";
import type {
  BuyResult,
  FishingGearAction,
  FishingGearKind,
  FishingShopState,
} from "./useFishingShop";

// 낚시 코인 상점 — 칭호 구매. 데이터·구매 핸들러는 주입(useFishingShop 실 API / dev mock).
// 설계: docs/fishing-content-plan.md §6

const ENTRIES = fishingShopEntries();

function bonusLabels(bonuses: Partial<FishingGearBonuses>): string[] {
  const labels: string[] = [];
  if (bonuses.waitReductionPct) labels.push(`대기 -${bonuses.waitReductionPct}%`);
  if (bonuses.sizeBonusPct) labels.push(`크기 +${bonuses.sizeBonusPct}%`);
  if (bonuses.rareSizeBonusPct)
    labels.push(`희귀 이상 크기 +${bonuses.rareSizeBonusPct}%`);
  if (bonuses.bigCatchSizeBonusPct)
    labels.push(`대물급 크기 +${bonuses.bigCatchSizeBonusPct}%`);
  if (bonuses.specialWeightPct)
    labels.push(`특별 손님 +${bonuses.specialWeightPct}%`);
  return labels.length > 0 ? labels : ["기본"];
}

function levelBonusLabels(progression: FishingProgressionView): string[] {
  return [
    `크기 +${progression.levelBonuses.sizeBonusPct}%`,
    `특별 손님 +${progression.levelBonuses.specialWeightPct}%`,
  ];
}

export function FishingShopView({
  state,
  loading,
  error,
  buying,
  onBuy,
  onBuyConsumable,
  onBuyGear,
  onBack,
  onOpenFishing,
  onOpenChallenges,
  onOpenLeaderboard,
  onOpenHallOfFame,
}: {
  state: FishingShopState | null;
  loading: boolean;
  error?: string | null;
  buying: string | null;
  onBuy: (titleId: string) => Promise<BuyResult>;
  // 소비템(스태미나 회복약) 구매 — 미전달(dev 하니스)이면 소비품 섹션 숨김.
  onBuyConsumable?: (itemId: string) => Promise<BuyResult>;
  onBuyGear?: (
    kind: FishingGearKind,
    gearId: string,
    action: FishingGearAction,
  ) => Promise<BuyResult>;
  onBack?: () => void;
  // 낚시터 서브 탭바 — 미전달(dev 하니스)이면 그 탭 숨김.
  onOpenFishing?: () => void;
  onOpenChallenges?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenHallOfFame?: () => void;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const handleBuy = async (titleId: string) => {
    const r = await onBuy(titleId);
    setMessage({ ok: r.ok, text: r.message });
  };

  const handleBuyConsumable = async (itemId: string) => {
    if (!onBuyConsumable) return;
    const r = await onBuyConsumable(itemId);
    setMessage({ ok: r.ok, text: r.message });
  };

  const handleBuyGear = async (
    kind: FishingGearKind,
    gearId: string,
    action: FishingGearAction,
  ) => {
    if (!onBuyGear) return;
    const r = await onBuyGear(kind, gearId, action);
    setMessage({ ok: r.ok, text: r.message });
  };

  const coins = state?.coins ?? 0;
  const staminaPotions = state?.staminaPotions ?? 0;
  const progression = state?.progression ?? null;
  const ownedRods = new Set(progression?.ownedRods ?? []);
  const ownedLures = new Set(progression?.ownedLures ?? []);
  const anyInFlight = buying !== null;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="낚시 코인 상점"
        onBack={onBack}
        right={
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            🪙 {coins.toLocaleString()}
          </span>
        }
      />

      <FishingSubTabs
        active="shop"
        onOpenFishing={onOpenFishing}
        onOpenChallenges={onOpenChallenges}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenHallOfFame={onOpenHallOfFame}
      />

      {message && (
        <p
          className={`text-center text-sm ${
            message.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : (
        <div className="space-y-4">
          {progression && (
            <div className="space-y-1.5">
              <p className="px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                낚시 숙련도
              </p>
              <Card padding="sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold">
                      Lv {progression.level}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {progression.xpIntoLevel}/{progression.xpForNext} XP ·{" "}
                      {progression.catches.toLocaleString()}마리
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-600 dark:text-zinc-300">
                    <div>{FISHING_RODS[progression.equippedRodId].name}</div>
                    <div>{FISHING_LURES[progression.equippedLureId].name}</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {levelBonusLabels(progression).map((label) => (
                    <span
                      key={label}
                      className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/50 dark:text-sky-200"
                    >
                      숙련도 효과 · {label}
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {bonusLabels(progression.bonuses).map((label) => (
                    <span
                      key={label}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      장착 총합 · {label}
                    </span>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {progression && onBuyGear && (
            <div className="space-y-1.5">
              <p className="px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                낚싯대
              </p>
              <Card padding="none" className="overflow-hidden">
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {FISHING_ROD_IDS.map((id) => {
                    const rod = FISHING_RODS[id];
                    const isOwned = ownedRods.has(id);
                    const isEquipped = progression.equippedRodId === id;
                    const affordable = coins >= rod.price;
                    const inFlight = buying === `rod:${id}`;
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between gap-3 px-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-semibold">
                            🎣 {rod.name}
                            {isEquipped ? (
                              <span className="rounded bg-emerald-200/70 px-1 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                                장착
                              </span>
                            ) : isOwned ? (
                              <span className="rounded bg-sky-200/70 px-1 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                                보유
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                            {rod.description}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {bonusLabels(rod.bonuses).map((label) => (
                              <span
                                key={label}
                                className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={
                            isEquipped ||
                            (!isOwned && !affordable) ||
                            anyInFlight
                          }
                          onClick={() =>
                            handleBuyGear("rod", id, isOwned ? "equip" : "buy")
                          }
                          className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
                        >
                          {isEquipped
                            ? "장착 중"
                            : inFlight
                              ? isOwned
                                ? "장착 중…"
                                : "구매 중…"
                              : isOwned
                                ? "장착"
                                : `🪙 ${rod.price.toLocaleString()}`}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          )}

          {progression && onBuyGear && (
            <div className="space-y-1.5">
              <p className="px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                미끼
              </p>
              <Card padding="none" className="overflow-hidden">
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {FISHING_LURE_IDS.map((id) => {
                    const lure = FISHING_LURES[id];
                    const isOwned = ownedLures.has(id);
                    const isEquipped = progression.equippedLureId === id;
                    const affordable = coins >= lure.price;
                    const inFlight = buying === `lure:${id}`;
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between gap-3 px-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-semibold">
                            🪱 {lure.name}
                            {isEquipped ? (
                              <span className="rounded bg-emerald-200/70 px-1 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                                장착
                              </span>
                            ) : isOwned ? (
                              <span className="rounded bg-sky-200/70 px-1 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                                보유
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                            {lure.description}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {bonusLabels(lure.bonuses).map((label) => (
                              <span
                                key={label}
                                className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={
                            isEquipped ||
                            (!isOwned && !affordable) ||
                            anyInFlight
                          }
                          onClick={() =>
                            handleBuyGear("lure", id, isOwned ? "equip" : "buy")
                          }
                          className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
                        >
                          {isEquipped
                            ? "장착 중"
                            : inFlight
                              ? isOwned
                                ? "장착 중…"
                                : "구매 중…"
                              : isOwned
                                ? "장착"
                                : `🪙 ${lure.price.toLocaleString()}`}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              칭호
            </p>
            <CoinTitleShopList
              entries={ENTRIES}
              coins={coins}
              ownedTitleIds={state?.ownedTitleIds ?? []}
              buying={buying}
              onBuy={handleBuy}
              accent="sky"
            />
          </div>
        </div>
      )}

      {!loading && !error && onBuyConsumable && (
        <div className="space-y-1.5">
          <p className="px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            소비품
          </p>
          <CoinConsumableShopList
            consumables={FISHING_SHOP_CONSUMABLES}
            coins={coins}
            staminaPotions={staminaPotions}
            buying={buying}
            onBuyConsumable={handleBuyConsumable}
            accent="sky"
          />
        </div>
      )}
    </main>
  );
}
