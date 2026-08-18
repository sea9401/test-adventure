"use client";

import Image from "next/image";
import { useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { FISH_TIERS, FISH_TIER_ORDER } from "@/adventure/data/v2/fish";
import { FishingSubTabs } from "./FishingSubTabs";
import {
  CoinConsumableShopList,
  CoinTitleShopList,
} from "./CoinShopLists";
import {
  FISHING_SEED_POUCH_ITEM_ID,
  FISHING_SHOP_CONSUMABLES,
  FISHING_STAMINA_POTION_ITEM_ID,
  fishingShopEntries,
} from "./fishingShop";
import {
  FISHING_LURE_IDS,
  FISHING_LURES,
  FISHING_ROD_IDS,
  FISHING_RODS,
  fishingSizeBonusLabels,
  type FishingGearBonuses,
  type FishingProgressionView,
} from "./fishingProgression";
import type {
  BuyResult,
  FishingGearAction,
  FishingGearKind,
  FishingShopState,
} from "./useFishingShop";
import { useSystemToast } from "./RewardToastProvider";
import { CoinAmount } from "./CoinAmount";
import {
  DangerousFishingShopSection,
  type DangerousFishingShopAction,
} from "./DangerousFishingShopSection";
import type { DangerousFishingViewModel } from "./useDangerousFishing";

// 낚시 코인 상점 — 칭호 구매. 데이터·구매 핸들러는 주입(useFishingShop 실 API / dev mock).
// 설계: docs/fishing-content-plan.md §6

const ENTRIES = fishingShopEntries();

function bonusLabels(bonuses: Partial<FishingGearBonuses>): string[] {
  const labels: string[] = [];
  if (bonuses.waitReductionPct) labels.push(`대기 -${bonuses.waitReductionPct}%`);
  labels.push(...fishingSizeBonusLabels(bonuses));
  if (bonuses.specialWeightPct)
    labels.push(`특별 손님 +${bonuses.specialWeightPct}%`);
  if (bonuses.tierWeightPct) {
    for (const tier of FISH_TIER_ORDER) {
      const bonus = bonuses.tierWeightPct[tier] ?? 0;
      if (bonus === 0) continue;
      labels.push(`${FISH_TIERS[tier].label} ${bonus > 0 ? "+" : ""}${bonus}%`);
    }
  }
  return labels.length > 0 ? labels : ["기본"];
}

function levelBonusLabels(progression: FishingProgressionView): string[] {
  const bonuses = progression.levelBonuses;
  const labels = fishingSizeBonusLabels(bonuses);
  labels.push(`특별 손님 +${bonuses.specialWeightPct}%`);
  return labels;
}

export function FishingShopView({
  state,
  loading,
  error,
  buying,
  onBuy,
  onBuyConsumable,
  onBuyGear,
  dangerousShop,
  onBack,
  onOpenFishing,
  onOpenDangerous,
  onOpenChallenges,
  onOpenLeaderboard,
  onOpenHallOfFame,
  initialTab = "regular",
  embedded = false,
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
  dangerousShop?: {
    model: DangerousFishingViewModel | null;
    loading: boolean;
    error?: string | null;
    buying: string | null;
    onShop: DangerousFishingShopAction;
  };
  onBack?: () => void;
  // 낚시터 서브 탭바 — 미전달(dev 하니스)이면 그 탭 숨김.
  onOpenFishing?: () => void;
  onOpenDangerous?: () => void;
  onOpenChallenges?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenHallOfFame?: () => void;
  initialTab?: "regular" | "dangerous";
  embedded?: boolean;
}) {
  const [shopTab, setShopTab] = useState<"regular" | "dangerous">(
    initialTab === "dangerous" && dangerousShop ? "dangerous" : "regular",
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const { notifySystem } = useSystemToast();

  const showMessage = (r: BuyResult) => {
    setMessage({ ok: r.ok, text: r.message });
    notifySystem(r.message, r.ok ? "success" : "error");
  };

  const handleBuy = async (titleId: string) => {
    const r = await onBuy(titleId);
    showMessage(r);
  };

  const handleBuyConsumable = async (itemId: string) => {
    if (!onBuyConsumable) return;
    const r = await onBuyConsumable(itemId);
    showMessage(r);
  };

  const handleBuyGear = async (
    kind: FishingGearKind,
    gearId: string,
    action: FishingGearAction,
  ) => {
    if (!onBuyGear) return;
    const r = await onBuyGear(kind, gearId, action);
    showMessage(r);
  };

  const handleDangerousShop: DangerousFishingShopAction = async (...args) => {
    if (!dangerousShop) return { ok: false, message: "위험 해역 상점을 불러오지 못했다." };
    const result = await dangerousShop.onShop(...args);
    showMessage(result);
    return result;
  };

  const coins = state?.coins ?? 0;
  const displayedCoins =
    shopTab === "dangerous"
      ? state?.coins ?? dangerousShop?.model?.fishingCoins ?? 0
      : coins;
  const staminaPotions = state?.staminaPotions ?? 0;
  const progression = state?.progression ?? null;
  const seedPouch = state?.seedPouch ?? null;
  const staminaPotionLimit = state?.staminaPotionLimit ?? null;
  const consumables = FISHING_SHOP_CONSUMABLES.map((item) => {
    if (
      item.itemId === FISHING_STAMINA_POTION_ITEM_ID &&
      staminaPotionLimit
    ) {
      return {
        ...item,
        badge: `오늘 ${staminaPotionLimit.boughtToday}/${staminaPotionLimit.dailyLimit}`,
        disabled: staminaPotionLimit.remainingToday <= 0,
        buttonLabel:
          staminaPotionLimit.remainingToday <= 0 ? "오늘 한도" : undefined,
      };
    }
    if (item.itemId !== FISHING_SEED_POUCH_ITEM_ID || !seedPouch) return item;
    const nextPrice = seedPouch.nextPrice;
    return {
      ...item,
      price: nextPrice ?? item.price,
      badge: `오늘 ${seedPouch.boughtToday}/${seedPouch.dailyLimit}`,
      disabled: nextPrice === null,
      buttonLabel:
        nextPrice === null ? "오늘 한도" : undefined,
    };
  });
  const ownedRods = new Set(progression?.ownedRods ?? []);
  const ownedLures = new Set(progression?.ownedLures ?? []);
  const anyInFlight = buying !== null;

  const Root = embedded ? "section" : "main";

  return (
    <Root
      className={
        embedded
          ? "space-y-4 text-zinc-900 dark:text-zinc-100"
          : "mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100"
      }
    >
      {!embedded && (
        <>
          <SubViewHeader
            title="낚시 코인 상점"
            onBack={onBack}
            right={
              <CoinAmount
                amount={displayedCoins}
                className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              />
            }
          />

          <FishingSubTabs
            active="shop"
            onOpenFishing={onOpenFishing}
            onOpenDangerous={onOpenDangerous}
            onOpenChallenges={onOpenChallenges}
            onOpenLeaderboard={onOpenLeaderboard}
            onOpenHallOfFame={onOpenHallOfFame}
          />
        </>
      )}

      {embedded && (
        <div className="flex justify-end">
          <CoinAmount
            amount={displayedCoins}
            className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"
          />
        </div>
      )}

      {dangerousShop ? (
        <TabBar
          tabs={[
            { key: "regular", label: "일반 낚시" },
            { key: "dangerous", label: "위험 해역" },
          ]}
          active={shopTab}
          onChange={setShopTab}
          ariaLabel="낚시 상점 종류"
          size="md"
        />
      ) : null}

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

      {shopTab === "dangerous" && dangerousShop ? (
        dangerousShop.loading ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</p>
        ) : dangerousShop.error ? (
          <p className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">{dangerousShop.error}</p>
        ) : dangerousShop.model ? (
          <DangerousFishingShopSection
            model={dangerousShop.model}
            coins={state?.coins ?? dangerousShop.model.fishingCoins}
            buying={dangerousShop.buying}
            onShop={handleDangerousShop}
          />
        ) : (
          <p className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">위험 해역 상점을 불러오지 못했다.</p>
        )
      ) : (
        <>
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
            <Card padding="sm">
              <h3 className="text-sm font-bold">크기 효과 적용 범위</h3>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                <li>
                  <strong className="text-zinc-800 dark:text-zinc-100">모든 어종 크기</strong>
                  {" "}— 흔함부터 전설까지 잡히는 모든 물고기에 적용됩니다.
                </li>
                <li>
                  <strong className="text-zinc-800 dark:text-zinc-100">희귀 이상 추가 크기</strong>
                  {" "}— 희귀·영웅·전설 어종에만 추가로 중첩됩니다.
                </li>
                <li>
                  <strong className="text-zinc-800 dark:text-zinc-100">상위 20% 굴림 추가 크기</strong>
                  {" "}— 앞선 보정 후 해당 어종의 크기 범위 상위 20%에 들었을 때 추가로 중첩됩니다.
                </li>
              </ul>
              <p className="mt-2 border-t border-zinc-200 pt-2 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                +N%는 최종 길이를 N% 곱하는 효과가 아니라, 해당 어종의 최대 크기까지 남은 폭을 N%만큼 줄이는 보정입니다. 상위 20% 보정 구간은 전광판의 ‘대물’ 판정 구간인 상위 10%보다 넓습니다.
              </p>
            </Card>
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
                        <div className="flex min-w-0 items-start gap-2">
                          <Image
                            src={rod.imageSrc}
                            alt=""
                            width={48}
                            height={48}
                            unoptimized
                            className="h-12 w-12 shrink-0 object-contain"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                              {rod.name}
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
                                : <CoinAmount amount={rod.price} />}
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
                        <div className="flex min-w-0 items-start gap-2">
                          <Image
                            src={lure.imageSrc}
                            alt=""
                            width={48}
                            height={48}
                            unoptimized
                            className="h-12 w-12 shrink-0 object-contain"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                              {lure.name}
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
                                : <CoinAmount amount={lure.price} />}
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
            consumables={consumables}
            coins={coins}
            staminaPotions={staminaPotions}
            buying={buying}
            onBuyConsumable={handleBuyConsumable}
            accent="sky"
          />
        </div>
      )}
        </>
      )}
    </Root>
  );
}
