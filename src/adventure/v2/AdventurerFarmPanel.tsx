"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Clock,
  CookingPot,
  FlowerTulip,
  House,
  Leaf,
  Package,
  PawPrint,
  PottedPlant,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { PageShell } from "@/components/ui/PageShell";
import { FarmItemIcon } from "@/adventure/v2/FarmItemIcon";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  FARM_DAILY_DELIVERY_LIMIT,
  FARM_CROPS,
  FARM_ITEMS,
  FARM_MAX_PLOT_COUNT,
  FARM_RARE_PITY_HARVESTS,
  canPlantFarmCrop,
  farmAvailableReputation,
  farmCropMasteryGain,
  farmingLevelForState,
  farmingLevelXpThreshold,
  nextFarmPlotUpgrade,
  type FarmCrop,
  type FarmCropId,
  type FarmDeliveryRequest,
  type FarmItemInventory,
  type FarmItemId,
  type FarmPlot,
  type FarmSeedInventory,
  type FarmShopItem,
  type FarmSpecialDeliveryRequest,
  type FarmState,
  type FarmWeeklyDeliveryRequest,
} from "./farm";
import { RANCH_ANIMAL_DEFINITIONS, ranchReadySlotCount } from "./ranch";
import {
  farmBatchOutcomeText,
  type FarmBatchAction,
} from "./farmBatchActions";
import { FarmRanchPanel } from "./FarmRanchPanel";
import { FarmEndgameShopPanel } from "./FarmEndgameShopPanel";
import { useFarm } from "./useFarm";
import { ProductionJobAdvanceNotice } from "./ProductionJobAdvanceNotice";
import { LIFE_LEVEL_CAP } from "./lifeLevelProgression";
import { LifeLevelMilestoneNotice } from "./LifeLevelMilestoneNotice";

type FarmSectionKey = "home" | "grow" | "ranch" | "delivery" | "shop";

type FarmToast = {
  id: number;
  tone: "ok" | "warn";
  text: string;
};

const FARM_TOAST_MS = 2800;

// 농장 안에서 다른 화면을 다녀와도 마지막 작업 탭으로 돌아오게 한다.
// 새로고침하면 홈부터 시작하므로 브라우저 저장소와 서버 렌더 간 불일치도 없다.
let lastFarmSection: FarmSectionKey = "home";

const ITEM_LABELS = Object.fromEntries(
  Object.entries(FARM_ITEMS).map(([id, item]) => [id, item.name]),
) as Record<FarmItemId, string>;

export function prioritizeDeliverable<T>(
  items: readonly T[],
  isDeliverable: (item: T) => boolean,
): T[] {
  const deliverable: T[] = [];
  const unavailable: T[] = [];

  for (const item of items) {
    (isDeliverable(item) ? deliverable : unavailable).push(item);
  }

  return [...deliverable, ...unavailable];
}

export function AdventurerFarmPanel({
  onBack,
  onOpenKitchen,
  onOpenLifeWorkshop,
}: {
  onBack: () => void;
  onOpenKitchen: () => void;
  onOpenLifeWorkshop: () => void;
}) {
  const {
    loading,
    busyPlotId,
    busyPlotAction,
    busyDeliveryId,
    busySpecialDeliveryId,
    busyWeeklyDeliveryId,
    busyShopItemId,
    busyEndgameShopItemId,
    busyPlotUpgrade,
    busyRanchFeedSlotId,
    busyRanchCollect,
    busyRanchUpgradeSlotId,
    busyRanchRebuildSlotId,
    fertilizerBalance,
    notice,
    now,
    farm,
    learnedSkillIds,
    crops,
    deliveries,
    specialDeliveries,
    weeklyDeliveries,
    shopItems,
    endgameShop,
    clearNotice,
    refresh,
    plant,
    harvest,
    fertilize,
    uproot,
    plantAll,
    harvestAll,
    fertilizeAll,
    deliver,
    deliverSpecial,
    deliverWeekly,
    buyShopItem,
    buyEndgameShopItem,
    buyPlotUpgrade,
    feedRanchSlot,
    collectRanch,
    buyRanchSlot,
    rebuildRanchSlot,
  } = useFarm();
  const [selectedCropId, setSelectedCropId] = useState<FarmCropId>("wheat");
  const [activeSection, setActiveSection] = useState<FarmSectionKey>(
    () => lastFarmSection,
  );
  const cropById = useMemo(
    () => new Map(crops.map((crop) => [crop.id, crop])),
    [crops],
  );
  const selectedCrop = cropById.get(selectedCropId) ?? crops[0];
  const selectedCropLocked = selectedCrop
    ? !canPlantFarmCrop(selectedCrop.id, learnedSkillIds)
    : false;
  const dailyDeliveryCount = farm?.deliveries.claimedIds.length ?? 0;
  const deliveryLimitReached = dailyDeliveryCount >= FARM_DAILY_DELIVERY_LIMIT;
  const readyPlotIds = useMemo(
    () =>
      farm?.plots
        .filter((plot) => plot.cropId && plot.readyAt && plot.readyAt <= now)
        .map((plot) => plot.id) ?? [],
    [farm?.plots, now],
  );
  const plantablePlotIds = useMemo(() => {
    if (!farm || !selectedCrop || selectedCropLocked) return [];
    const seedCount = Math.max(0, farm.seeds[selectedCrop.id] ?? 0);
    return farm.plots
      .filter((plot) => !plot.cropId)
      .slice(0, seedCount)
      .map((plot) => plot.id);
  }, [farm, selectedCrop, selectedCropLocked]);
  const fertilizablePlotIds = useMemo(
    () =>
      farm?.plots
        .filter(
          (plot) =>
            plot.cropId &&
            plot.readyAt &&
            plot.readyAt > now &&
            !plot.fertilized,
        )
        .slice(0, Math.max(0, fertilizerBalance))
        .map((plot) => plot.id) ?? [],
    [farm?.plots, fertilizerBalance, now],
  );
  const readyPlotCount = readyPlotIds.length;
  const readyRanchSlotCount = farm ? ranchReadySlotCount(farm.ranch) : 0;
  const deliverableCount = useMemo(
    () =>
      farm
        ? deliveries.filter((delivery) => {
            const claimed = farm.deliveries.claimedIds.includes(delivery.id);
            const have = farm.inventory[delivery.requiredItemId] ?? 0;
            return (
              !deliveryLimitReached &&
              !claimed &&
              have >= delivery.requiredQuantity
            );
          }).length +
          specialDeliveries.filter((delivery) =>
            hasRequiredItems(farm.inventory, delivery.requiredItems),
          ).length +
          weeklyDeliveries.filter(
            (delivery) =>
              !farm.weekly.claimedIds.includes(delivery.id) &&
              hasRequiredItems(farm.inventory, delivery.requiredItems),
          ).length
        : 0,
    [deliveries, farm, deliveryLimitReached, specialDeliveries, weeklyDeliveries],
  );
  const availableReputation = farm ? farmAvailableReputation(farm) : 0;
  const affordableShopCount = farm
    ? shopItems.filter((item) => availableReputation >= item.costReputation).length
    : 0;
  const farmTabs = useMemo(
    () =>
      [
        {
          key: "home",
          label: "농장 홈",
          icon: <House size={16} weight="duotone" />,
        },
        {
          key: "grow",
          label: "재배",
          icon: <FlowerTulip size={16} weight="duotone" />,
          badge: readyPlotCount > 0 ? readyPlotCount : undefined,
        },
        {
          key: "ranch",
          label: "목장",
          icon: <PawPrint size={16} weight="duotone" />,
          badge: readyRanchSlotCount > 0 ? readyRanchSlotCount : undefined,
        },
        {
          key: "delivery",
          label: "납품",
          icon: <Package size={16} weight="duotone" />,
          badge: deliverableCount > 0 ? deliverableCount : undefined,
        },
        {
          key: "shop",
          label: "상점",
          icon: <Sparkle size={16} weight="duotone" />,
          badge: affordableShopCount > 0 ? affordableShopCount : undefined,
        },
      ] satisfies ReadonlyArray<{
        key: FarmSectionKey;
        label: string;
        icon: ReactNode;
        badge?: number;
      }>,
    [affordableShopCount, deliverableCount, readyPlotCount, readyRanchSlotCount],
  );
  const selectFarmSection = (next: FarmSectionKey) => {
    lastFarmSection = next;
    setActiveSection(next);
  };
  const toast = useMemo<FarmToast | null>(() => {
    if (!notice) return null;
    if (notice.kind === "error") {
      return { id: notice.id, tone: "warn", text: notice.text };
    }
    if (notice.kind === "harvest") {
      const { result } = notice;
      return {
        id: notice.id,
        tone: "ok",
        text: `${result.itemName} ${result.quantity}개를 수확했습니다.${
          result.rareItemName
            ? ` 희귀 수확: ${result.rareItemName} ${result.rareQuantity}개.`
            : ""
        } 농사 XP +${result.farmingXpGained}.`,
      };
    }
    if (notice.kind === "shop") {
      const { result } = notice;
      return {
        id: notice.id,
        tone: "ok",
        text: `${result.title} 구매 완료. 농장 증표 ${result.costReputation}개를 사용했습니다.${
          hasSeedRewards(result.rewardSeeds)
            ? ` 씨앗 보상: ${formatSeedRewards(result.rewardSeeds)}.`
            : ""
        }`,
      };
    }
    if (notice.kind === "endgameShop") {
      const { result } = notice;
      return {
        id: notice.id,
        tone: "ok",
        text: `${result.title} 구매 완료. 농장 증표 ${result.costReputation.toLocaleString("ko-KR")}개를 사용해 ${result.rewardText}를 받았습니다.`,
      };
    }
    if (notice.kind === "plotUpgrade") {
      const { result } = notice;
      return {
        id: notice.id,
        tone: "ok",
        text: `${result.title} 구매 완료. 농장 증표 ${result.costReputation}개를 사용해 밭 ${result.plotCount}칸을 열었습니다.`,
      };
    }
    if (notice.kind === "fertilizer") {
      return { id: notice.id, tone: "ok", text: `유기질 거름을 사용해 수확 시간을 ${Math.max(1, Math.round(notice.reducedMs / 60_000))}분 줄였습니다.` };
    }
    if (notice.kind === "uproot") {
      return { id: notice.id, tone: "ok", text: "작물을 파내고 밭을 비웠습니다." };
    }
    if (notice.kind === "batchPlant") {
      return {
        id: notice.id,
        tone: "ok",
        text: farmBatchOutcomeText(
          "plant",
          notice.count,
          null,
          notice.cropName,
        ),
      };
    }
    if (notice.kind === "batchHarvest") {
      return {
        id: notice.id,
        tone: "ok",
        text: farmBatchOutcomeText(
          "harvest",
          notice.count,
          null,
          undefined,
          notice.farmingXpGained,
        ),
      };
    }
    if (notice.kind === "batchFertilizer") {
      return {
        id: notice.id,
        tone: "ok",
        text: farmBatchOutcomeText("fertilize", notice.count, null),
      };
    }
    if (notice.kind === "ranchFeed") {
      return {
        id: notice.id,
        tone: "ok",
        text: `배합 사료 ${notice.result.amount}개를 넣었습니다. 남은 사료 ${notice.result.feedRemaining}개.`,
      };
    }
    if (notice.kind === "ranchCollect") {
      const rewards = Object.entries(notice.result.items)
        .filter(([, amount]) => (amount ?? 0) > 0)
        .map(([itemId, amount]) => `${ITEM_LABELS[itemId as FarmItemId]} ${amount}개`)
        .join(", ");
      return {
        id: notice.id,
        tone: "ok",
        text: `${rewards}를 수확했습니다. 농사 XP +${notice.result.farmingXpGained}.`,
      };
    }
    if (notice.kind === "ranchUpgrade") {
      const animal = RANCH_ANIMAL_DEFINITIONS[notice.result.animalId];
      return {
        id: notice.id,
        tone: "ok",
        text: `${animal.buildingName}을(를) 건설했습니다. 농장 증표 ${notice.result.costReputation.toLocaleString("ko-KR")}개를 사용했습니다.`,
      };
    }
    if (notice.kind === "ranchRebuild") {
      const animal = RANCH_ANIMAL_DEFINITIONS[notice.result.animalId];
      return {
        id: notice.id,
        tone: "ok",
        text: `${animal.buildingName}으로 재건축했습니다. 농장 증표 ${notice.result.costReputation.toLocaleString("ko-KR")}개를 사용했습니다.`,
      };
    }
    const { result } = notice;
    return {
      id: notice.id,
      tone: "ok",
      text: `${result.title} 납품 완료. 농장 증표 ${result.rewardReputation}개를 받았습니다.${
        hasSeedRewards(result.rewardSeeds)
          ? ` 씨앗 보상: ${formatSeedRewards(result.rewardSeeds)}.`
          : ""
      }`,
    };
  }, [notice]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(clearNotice, FARM_TOAST_MS);
    return () => window.clearTimeout(timeoutId);
  }, [clearNotice, notice]);

  return (
    <PageShell spacing="tight">
      <SubViewHeader
        title="모험가 농장"
        onBack={onBack}
        right={
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            새로고침
          </button>
        }
      />

      <ProductionJobAdvanceNotice
        refreshKey={farm ? farmingLevelForState(farm) : 0}
      />
      {farm ? (
        <LifeLevelMilestoneNotice
          activity="farming"
          level={farmingLevelForState(farm)}
        />
      ) : null}

      <section className={`${SURFACE_CARD} overflow-clip`}>
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            농장 상태를 불러오는 중...
          </div>
        ) : farm ? (
          <div>
            <TabBar
              tabs={farmTabs}
              active={activeSection}
              onChange={selectFarmSection}
              ariaLabel="농장 섹션"
              variant="underline"
              scrollable
              className="sticky top-16 z-20 bg-white px-1 dark:bg-zinc-900"
            />

            <div className="p-4">
              {activeSection === "home" ? (
                <FarmHome
                  farm={farm}
                  busyPlotUpgrade={busyPlotUpgrade}
                  readyPlotCount={readyPlotCount}
                  readyRanchSlotCount={readyRanchSlotCount}
                  deliverableCount={deliverableCount}
                  affordableShopCount={affordableShopCount}
                  onBuyPlotUpgrade={buyPlotUpgrade}
                  onOpenKitchen={onOpenKitchen}
                  onNavigate={selectFarmSection}
                />
              ) : null}

              <div
                className={activeSection === "grow" ? "space-y-4" : "hidden"}
              >
                <CropSelector
                  crops={crops}
                  seeds={farm.seeds}
                  inventory={farm.inventory}
                  learnedSkillIds={learnedSkillIds}
                  selectedCropId={selectedCrop?.id ?? selectedCropId}
                  onSelect={setSelectedCropId}
                />

                <FarmBatchActionPanel
                  cropName={selectedCrop?.name ?? "선택한 작물"}
                  harvestCount={readyPlotIds.length}
                  plantCount={plantablePlotIds.length}
                  fertilizerCount={fertilizablePlotIds.length}
                  busyAction={busyPlotAction}
                  onHarvestAll={() => void harvestAll(readyPlotIds)}
                  onPlantAll={() =>
                    selectedCrop &&
                    void plantAll(plantablePlotIds, selectedCrop.id)
                  }
                  onFertilizeAll={() =>
                    void fertilizeAll(fertilizablePlotIds)
                  }
                />

                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {farm.plots.map((plot) => (
                    <FarmPlotCard
                      key={plot.id}
                      plot={plot}
                      now={now}
                      crop={plot.cropId ? cropById.get(plot.cropId) : null}
                      selectedCrop={selectedCrop}
                      selectedCropLocked={selectedCropLocked}
                      selectedSeedCount={
                        selectedCrop ? (farm.seeds[selectedCrop.id] ?? 0) : 0
                      }
                      busy={
                        busyPlotAction !== null || busyPlotId === plot.id
                      }
                      fertilizerBalance={fertilizerBalance}
                      onPlant={() =>
                        selectedCrop && plant(plot.id, selectedCrop.id)
                      }
                      onHarvest={() => harvest(plot.id)}
                      onFertilize={() => fertilize(plot.id)}
                      onUproot={() => uproot(plot.id)}
                    />
                  ))}
                </div>
              </div>

              <div className={activeSection === "ranch" ? "space-y-4" : "hidden"}>
                <FarmRanchPanel
                  farm={farm}
                  now={now}
                  learnedSkillIds={learnedSkillIds}
                  busyFeedSlotId={busyRanchFeedSlotId}
                  busyCollect={busyRanchCollect}
                  busyUpgradeSlotId={busyRanchUpgradeSlotId}
                  busyRebuildSlotId={busyRanchRebuildSlotId}
                  onFeed={(slotId, amount) => void feedRanchSlot(slotId, amount)}
                  onCollect={() => void collectRanch()}
                  onUpgrade={(slotId, animalId) => void buyRanchSlot(slotId, animalId)}
                  onRebuild={(slotId, animalId) => void rebuildRanchSlot(slotId, animalId)}
                  onOpenLifeWorkshop={onOpenLifeWorkshop}
                />
              </div>

              <div
                className={
                  activeSection === "delivery" ? "space-y-4" : "hidden"
                }
              >
                <DeliveryBoard
                  deliveries={deliveries}
                  inventory={farm.inventory}
                  claimedIds={farm.deliveries.claimedIds}
                  dailyDeliveryCount={dailyDeliveryCount}
                  dailyDeliveryLimit={FARM_DAILY_DELIVERY_LIMIT}
                  busyDeliveryId={busyDeliveryId}
                  onDeliver={deliver}
                />

                <RareDeliveryBoard
                  deliveries={specialDeliveries}
                  inventory={farm.inventory}
                  busyDeliveryId={busySpecialDeliveryId}
                  onDeliver={deliverSpecial}
                />

                <WeeklyDeliveryBoard
                  deliveries={weeklyDeliveries}
                  inventory={farm.inventory}
                  claimedIds={farm.weekly.claimedIds}
                  busyDeliveryId={busyWeeklyDeliveryId}
                  onDeliver={deliverWeekly}
                />

                <InventoryPanel inventory={farm.inventory} />
              </div>

              <div
                className={activeSection === "shop" ? "space-y-4" : "hidden"}
              >
                <FarmShopPanel
                  items={shopItems}
                  availableReputation={availableReputation}
                  learnedSkillIds={learnedSkillIds}
                  busyShopItemId={busyShopItemId}
                  onBuy={buyShopItem}
                />
                {endgameShop ? (
                  <FarmEndgameShopPanel
                    view={endgameShop}
                    availableReputation={availableReputation}
                    busyItemId={busyEndgameShopItemId}
                    onBuy={(itemId) => void buyEndgameShopItem(itemId)}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            농장을 불러오지 못했습니다.
          </div>
        )}
      </section>
      {toast ? <FarmToastMessage toast={toast} onDismiss={clearNotice} /> : null}
    </PageShell>
  );
}

/** 통합 교환소에서 농장 전체 화면을 불러오지 않고 상점만 노출한다. */
export function FarmExchangeShopPanel() {
  const {
    loading,
    error,
    notice,
    farm,
    learnedSkillIds,
    shopItems,
    endgameShop,
    busyShopItemId,
    busyEndgameShopItemId,
    clearNotice,
    refresh,
    buyShopItem,
    buyEndgameShopItem,
  } = useFarm();
  const availableReputation = farm ? farmAvailableReputation(farm) : 0;
  const shopNotice =
    notice?.kind === "shop"
      ? `${notice.result.title} 구매 완료. 농장 증표 ${notice.result.costReputation}개를 사용했습니다.`
      : notice?.kind === "endgameShop"
        ? `${notice.result.title} 구매 완료. 농장 증표 ${notice.result.costReputation.toLocaleString("ko-KR")}개를 사용해 ${notice.result.rewardText}를 받았습니다.`
      : notice?.kind === "error"
        ? notice.text
        : null;

  useEffect(() => {
    if (!shopNotice) return;
    const timeoutId = window.setTimeout(clearNotice, FARM_TOAST_MS);
    return () => window.clearTimeout(timeoutId);
  }, [clearNotice, shopNotice]);

  return (
    <section className="space-y-3 text-zinc-900 dark:text-zinc-100">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          납품으로 모은 농장 증표를 씨앗과 농장 물품으로 교환합니다.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          새로고침
        </button>
      </div>

      {shopNotice ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            notice?.kind === "error"
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          {shopNotice}
        </p>
      ) : null}

      {loading && !farm ? (
        <div className={`${SURFACE_CARD} px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400`}>
          농장 상점을 불러오는 중...
        </div>
      ) : farm ? (
        <div className="space-y-3">
          <FarmShopPanel
            items={shopItems}
            availableReputation={availableReputation}
            learnedSkillIds={learnedSkillIds}
            busyShopItemId={busyShopItemId}
            onBuy={(itemId) => void buyShopItem(itemId)}
          />
          {endgameShop ? (
            <FarmEndgameShopPanel
              view={endgameShop}
              availableReputation={availableReputation}
              busyItemId={busyEndgameShopItemId}
              onBuy={(itemId) => void buyEndgameShopItem(itemId)}
            />
          ) : null}
        </div>
      ) : (
        <div className={`${SURFACE_CARD} space-y-3 px-4 py-6 text-center text-sm`}>
          <p className="text-rose-600 dark:text-rose-300">
            {error ?? "농장 상점을 불러오지 못했습니다."}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 font-semibold dark:border-zinc-700"
          >
            다시 시도
          </button>
        </div>
      )}
    </section>
  );
}

function FarmHome({
  farm,
  busyPlotUpgrade,
  readyPlotCount,
  readyRanchSlotCount,
  deliverableCount,
  affordableShopCount,
  onBuyPlotUpgrade,
  onOpenKitchen,
  onNavigate,
}: {
  farm: FarmState;
  busyPlotUpgrade: boolean;
  readyPlotCount: number;
  readyRanchSlotCount: number;
  deliverableCount: number;
  affordableShopCount: number;
  onBuyPlotUpgrade: () => void;
  onOpenKitchen: () => void;
  onNavigate: (section: FarmSectionKey) => void;
}) {
  return (
    <div className="space-y-4">
      <div className={`${SURFACE_INSET} flex flex-wrap items-center gap-3 p-3`}>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          <PottedPlant size={24} weight="duotone" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            아침에 심고, 모험 뒤에 거두는 작은 밭
          </h2>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            씨앗을 심고 작물을 수확한 뒤, 납품으로 농장 증표를 확보합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenKitchen}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-50 dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-amber-950"
        >
          <CookingPot size={18} weight="duotone" aria-hidden />
          주방으로 이동
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="농장 바로가기">
        <FarmHomeShortcut
          icon={<FlowerTulip size={18} weight="duotone" />}
          label="재배"
          status={readyPlotCount > 0 ? `${readyPlotCount}칸 수확` : "밭 확인"}
          onClick={() => onNavigate("grow")}
        />
        <FarmHomeShortcut
          icon={<PawPrint size={18} weight="duotone" />}
          label="목장"
          status={readyRanchSlotCount > 0 ? `${readyRanchSlotCount}칸 수확` : "축사 확인"}
          onClick={() => onNavigate("ranch")}
        />
        <FarmHomeShortcut
          icon={<Package size={18} weight="duotone" />}
          label="납품"
          status={deliverableCount > 0 ? `${deliverableCount}건 가능` : "의뢰 확인"}
          onClick={() => onNavigate("delivery")}
        />
        <FarmHomeShortcut
          icon={<Sparkle size={18} weight="duotone" />}
          label="상점"
          status={
            affordableShopCount > 0
              ? `${affordableShopCount}개 구매`
              : "상품 확인"
          }
          onClick={() => onNavigate("shop")}
        />
      </div>

      <FarmSummary farm={farm} />
      <FarmGrowthPanel
        farm={farm}
        busy={busyPlotUpgrade}
        onBuy={onBuyPlotUpgrade}
      />
    </div>
  );
}

function FarmHomeShortcut({
  icon,
  label,
  status,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  status: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${SURFACE_INSET} min-w-0 px-2 py-2.5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-800 dark:hover:bg-emerald-950`}
    >
      <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
        {icon}
        {label}
      </span>
      <span className="mt-1 block truncate text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
        {status}
      </span>
    </button>
  );
}

function FarmToastMessage({
  toast,
  onDismiss,
}: {
  toast: FarmToast;
  onDismiss: () => void;
}) {
  const ok = toast.tone === "ok";
  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 z-50 flex max-w-[min(24rem,calc(100vw-2rem))] items-start gap-2 rounded-md border px-4 py-3 text-base font-semibold leading-relaxed shadow-xl sm:left-6 ${
        ok
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
          : "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100"
      }`}
    >
      <span className="min-w-0 flex-1">{toast.text}</span>
      <button
        type="button"
        aria-label="알림 닫기"
        onClick={onDismiss}
        className="-mr-2 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md opacity-60 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 dark:hover:bg-white/10"
      >
        <X size={17} weight="bold" aria-hidden />
      </button>
    </div>
  );
}

function FarmSummary({ farm }: { farm: FarmState }) {
  const farmingLevel = farmingLevelForState(farm);
  const maxLevel = farmingLevel >= LIFE_LEVEL_CAP;
  const levelStartXp = farmingLevelXpThreshold(farmingLevel);
  const nextLevelXp = farmingLevelXpThreshold(farmingLevel + 1);
  const farmingLevelProgress = maxLevel
    ? 1
    : Math.max(0, farm.stats.farmingXp - levelStartXp);
  const farmingLevelRequired = Math.max(1, nextLevelXp - levelStartXp);
  const farmingLevelProgressText = maxLevel
    ? "최종 숙련 달성 · MAX"
    : `${farmingLevelProgress.toLocaleString("ko-KR")} / ${farmingLevelRequired.toLocaleString("ko-KR")}`;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <SummaryTile
        icon={<Sparkle size={17} weight="duotone" />}
        label="농사 레벨"
        value={`Lv ${farmingLevel.toLocaleString("ko-KR")} / ${LIFE_LEVEL_CAP}`}
      />
      <SummaryTile
        icon={<Leaf size={17} weight="duotone" />}
        label="레벨 EXP"
        value={farmingLevelProgressText}
        progress={{
          value: farmingLevelProgress,
          max: farmingLevelRequired,
        }}
      />
      <SummaryTile
        icon={<Sparkle size={17} weight="duotone" />}
        label="농장 증표"
        value={`${farmAvailableReputation(farm).toLocaleString("ko-KR")}개`}
      />
      <SummaryTile
        icon={<Sparkle size={17} weight="duotone" />}
        label="희귀 수확 보정"
        value={`${farm.stats.rareMissStreak} / ${FARM_RARE_PITY_HARVESTS - 1}`}
        progress={{
          value: farm.stats.rareMissStreak,
          max: FARM_RARE_PITY_HARVESTS - 1,
        }}
      />
    </div>
  );
}

function FarmGrowthPanel({
  farm,
  busy,
  onBuy,
}: {
  farm: FarmState;
  busy: boolean;
  onBuy: () => void;
}) {
  const next = nextFarmPlotUpgrade(farm);
  const unlocked = farm.plots.length;
  const availableReputation = farmAvailableReputation(farm);
  const affordable = next ? availableReputation >= next.costReputation : false;
  return (
    <div className={`${SURFACE_INSET} px-3 py-2 text-sm shadow-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
          <PottedPlant size={17} weight="duotone" className="text-emerald-500" />
          농장 성장
        </div>
        <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-zinc-900 dark:text-emerald-300">
          밭 {unlocked}/{FARM_MAX_PLOT_COUNT}칸
        </span>
      </div>
      {next ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {next.title} 구매 시 밭 {next.plotCount}칸을 사용할 수 있습니다. 비용
            증표 {next.costReputation}개 · 보유 {availableReputation}개
          </p>
          <button
            type="button"
            onClick={onBuy}
            disabled={!affordable || busy}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
          >
            {busy ? "확장 중..." : affordable ? "밭 확장" : "증표 부족"}
          </button>
        </div>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          현재 준비된 모든 밭을 사용할 수 있습니다.
        </p>
      )}
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  progress,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  progress?: { value: number; max: number };
}) {
  const progressPct = progress
    ? Math.max(0, Math.min(100, (progress.value / Math.max(1, progress.max)) * 100))
    : 0;

  return (
    <div className={`${SURFACE_INSET} px-3 py-2 text-zinc-900 shadow-sm dark:text-zinc-100`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-black tabular-nums">{value}</div>
      {progress ? (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={progress.max}
          aria-valuenow={progress.value}
          aria-valuetext={value}
          className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function FarmItemImage({
  itemId,
  alt,
  className = "h-12 w-12",
}: {
  itemId: FarmItemId;
  alt: string;
  className?: string;
}) {
  return <FarmItemIcon itemId={itemId} label={alt} className={className} />;
}

function RareDeliveryBoard({
  deliveries,
  inventory,
  busyDeliveryId,
  onDeliver,
}: {
  deliveries: FarmSpecialDeliveryRequest[];
  inventory: FarmItemInventory;
  busyDeliveryId: string | null;
  onDeliver: (requestId: string) => void;
}) {
  const orderedDeliveries = prioritizeDeliverable(deliveries, (delivery) =>
    hasRequiredItems(inventory, delivery.requiredItems),
  );

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <Sparkle size={17} weight="duotone" className="text-emerald-500" />
        희귀 수확 납품
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        {orderedDeliveries.map((delivery) => {
          const enough = hasRequiredItems(inventory, delivery.requiredItems);
          const busy = busyDeliveryId === delivery.id;
          const previewItemId = firstItemId(delivery.requiredItems);
          return (
            <DeliveryRequestCard
              key={delivery.id}
              imageItemId={previewItemId}
              title={delivery.title}
              note={delivery.note}
              requirementText={formatItemRequirements(
                delivery.requiredItems,
                inventory,
              )}
              rewardText={formatFarmDeliveryReward(
                delivery.rewardReputation,
                delivery.rewardSeeds,
              )}
              buttonText={
                busy ? "납품 중..." : enough ? "희귀 납품" : "재료 부족"
              }
              disabled={!enough || busy}
              onClick={() => onDeliver(delivery.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function WeeklyDeliveryBoard({
  deliveries,
  inventory,
  claimedIds,
  busyDeliveryId,
  onDeliver,
}: {
  deliveries: FarmWeeklyDeliveryRequest[];
  inventory: FarmItemInventory;
  claimedIds: string[];
  busyDeliveryId: string | null;
  onDeliver: (requestId: string) => void;
}) {
  const orderedDeliveries = prioritizeDeliverable(
    deliveries,
    (delivery) =>
      !claimedIds.includes(delivery.id) &&
      hasRequiredItems(inventory, delivery.requiredItems),
  );

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <Package size={17} weight="duotone" className="text-emerald-500" />
        주간 농장 납품
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        {orderedDeliveries.map((delivery) => {
          const claimed = claimedIds.includes(delivery.id);
          const enough = hasRequiredItems(inventory, delivery.requiredItems);
          const busy = busyDeliveryId === delivery.id;
          const previewItemId = firstItemId(delivery.requiredItems);
          return (
            <DeliveryRequestCard
              key={delivery.id}
              imageItemId={previewItemId}
              title={delivery.title}
              note={delivery.note}
              requirementText={formatItemRequirements(
                delivery.requiredItems,
                inventory,
              )}
              rewardText={formatFarmDeliveryReward(
                delivery.rewardReputation,
                delivery.rewardSeeds,
              ) + (delivery.optionalRareItemId
                ? ` · 선택 보너스: ${delivery.optionalRareItemName ?? ITEM_LABELS[delivery.optionalRareItemId]} 1개 보유 시 자동 사용, 증표 +${delivery.optionalRareBonusReputation ?? 0}`
                : "")}
              buttonText={
                busy
                  ? "납품 중..."
                  : claimed
                    ? "이번 주 완료"
                    : enough
                      ? "주간 납품"
                      : "재료 부족"
              }
              disabled={claimed || !enough || busy}
              onClick={() => onDeliver(delivery.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function DeliveryRequestCard({
  imageItemId,
  title,
  note,
  requirementText,
  rewardText,
  buttonText,
  disabled,
  onClick,
}: {
  imageItemId: FarmItemId | null;
  title: string;
  note: string;
  requirementText: string;
  rewardText: string;
  buttonText: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex min-h-[12rem] flex-col rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        {imageItemId ? (
          <FarmItemImage
            itemId={imageItemId}
            alt={ITEM_LABELS[imageItemId] ?? title}
            className="h-11 w-11"
          />
        ) : null}
        <div className="min-w-0 font-bold text-zinc-900 dark:text-zinc-100">
          {title}
        </div>
      </div>
      <p className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        {note}
      </p>
      <div className="mt-3 rounded-md bg-zinc-50 px-2.5 py-2 text-xs dark:bg-zinc-900">
        <div className="flex justify-between gap-2">
          <span className="text-zinc-500 dark:text-zinc-400">필요</span>
          <span className="text-right font-semibold text-zinc-800 dark:text-zinc-100">
            {requirementText}
          </span>
        </div>
        <div className="mt-1 flex justify-between gap-2">
          <span className="text-zinc-500 dark:text-zinc-400">보상</span>
          <span className="text-right font-semibold text-emerald-700 dark:text-emerald-300">
            {rewardText}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-auto rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
      >
        {buttonText}
      </button>
    </div>
  );
}

function FarmShopPanel({
  items,
  availableReputation,
  learnedSkillIds,
  busyShopItemId,
  onBuy,
}: {
  items: FarmShopItem[];
  availableReputation: number;
  learnedSkillIds: readonly string[];
  busyShopItemId: string | null;
  onBuy: (itemId: string) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <Sparkle size={17} weight="duotone" className="text-emerald-500" />
          농장 증표 상점
        </div>
        <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          사용 가능 {availableReputation.toLocaleString("ko-KR")}
        </span>
      </div>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        할인된 씨앗 묶음 또는 필요한 씨앗 1개 단품을 선택합니다.
      </p>
      <div className="grid gap-2 lg:grid-cols-3">
        {items.map((item) => {
          const affordable = availableReputation >= item.costReputation;
          const locked = Boolean(
            item.requiredSkillId &&
              !learnedSkillIds.includes(item.requiredSkillId),
          );
          const busy = busyShopItemId === item.id;
          const previewCropId = firstSeedCropId(item.rewardSeeds);
          const previewItemId = previewCropId
            ? FARM_CROPS[previewCropId].itemId
            : null;
          return (
            <div
              key={item.id}
              className="flex min-h-[11rem] flex-col rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start gap-3">
                {previewItemId ? (
                  <FarmItemImage
                    itemId={previewItemId}
                    alt={ITEM_LABELS[previewItemId]}
                    className="h-11 w-11"
                  />
                ) : null}
                <div className="min-w-0 font-bold text-zinc-900 dark:text-zinc-100">
                  {item.title}
                </div>
              </div>
              <p className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {item.note}
              </p>
              <div className="mt-3 rounded-md bg-zinc-50 px-2.5 py-2 text-xs dark:bg-zinc-900">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-500 dark:text-zinc-400">비용</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                    증표 {item.costReputation}개
                  </span>
                </div>
                <div className="mt-1 flex justify-between gap-2">
                  <span className="text-zinc-500 dark:text-zinc-400">획득</span>
                  <span className="text-right font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatSeedRewards(item.rewardSeeds)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onBuy(item.id)}
                disabled={locked || !affordable || busy}
                className="mt-auto rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
              >
                {busy
                  ? "구매 중..."
                  : locked
                    ? `${item.requiredSkillName ?? "농부 기술"} 필요`
                    : affordable
                      ? "구매하기"
                      : "증표 부족"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CropSelector({
  crops,
  seeds,
  inventory,
  learnedSkillIds,
  selectedCropId,
  onSelect,
}: {
  crops: FarmCrop[];
  seeds: FarmSeedInventory;
  inventory: FarmItemInventory;
  learnedSkillIds: readonly string[];
  selectedCropId: FarmCropId;
  onSelect: (id: FarmCropId) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <Leaf size={17} weight="duotone" className="text-emerald-500" />
        씨앗 선택
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {crops.map((crop) => {
          const active = crop.id === selectedCropId;
          const locked = !canPlantFarmCrop(crop.id, learnedSkillIds);
          return (
            <button
              key={crop.id}
              type="button"
              onClick={() => {
                if (!locked) onSelect(crop.id);
              }}
              disabled={locked}
              className={`flex min-h-[6.25rem] items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
                active
                  ? "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-sm dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100"
                  : locked
                    ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-500"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-700 dark:hover:bg-zinc-900"
              }`}
            >
              <FarmItemImage itemId={crop.itemId} alt={crop.itemName} />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{crop.seedName}</span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDuration(crop.growMs)} · {crop.yieldMin}-{crop.yieldMax}개 · 농사 XP {farmCropMasteryGain(crop.id).toLocaleString("ko-KR")}
                </span>
                {locked ? (
                  <span className="mt-0.5 block text-xs font-semibold text-rose-600 dark:text-rose-300">
                    {crop.requiredSkillName ?? "농부 패시브"} 필요
                  </span>
                ) : null}
                <span
                  className={`mt-1 inline-flex max-w-full flex-wrap rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold dark:bg-zinc-900 ${
                    locked
                      ? "text-zinc-500 dark:text-zinc-400"
                      : "text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  씨앗 {(seeds[crop.id] ?? 0).toLocaleString("ko-KR")}개 · 작물{" "}
                  {(inventory[crop.itemId] ?? 0).toLocaleString("ko-KR")}개
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FarmBatchActionPanel({
  cropName,
  harvestCount,
  plantCount,
  fertilizerCount,
  busyAction,
  onHarvestAll,
  onPlantAll,
  onFertilizeAll,
}: {
  cropName: string;
  harvestCount: number;
  plantCount: number;
  fertilizerCount: number;
  busyAction: FarmBatchAction | null;
  onHarvestAll: () => void;
  onPlantAll: () => void;
  onFertilizeAll: () => void;
}) {
  const busy = busyAction !== null;
  const buttonClass =
    "h-10 rounded-md border border-emerald-300 bg-white px-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-900 dark:disabled:text-zinc-500";

  return (
    <div
      role="group"
      aria-label="농장 일괄 작업"
      aria-busy={busy}
      className={`${SURFACE_INSET} grid gap-2 p-3 sm:grid-cols-3`}
    >
      <button
        type="button"
        disabled={busy || harvestCount < 1}
        onClick={onHarvestAll}
        className={buttonClass}
      >
        {busyAction === "harvest"
          ? "모두 수확 중..."
          : `모두 수확 · ${harvestCount}칸`}
      </button>
      <button
        type="button"
        disabled={busy || plantCount < 1}
        onClick={onPlantAll}
        className={buttonClass}
      >
        {busyAction === "plant"
          ? `${cropName} 모두 심는 중...`
          : `${cropName} 모두 심기 · ${plantCount}칸`}
      </button>
      <button
        type="button"
        disabled={busy || fertilizerCount < 1}
        onClick={onFertilizeAll}
        className={buttonClass}
      >
        {busyAction === "fertilize"
          ? "모두 비료 뿌리는 중..."
          : `모두 비료 뿌리기 · ${fertilizerCount}칸`}
      </button>
    </div>
  );
}

export function FarmPlotCard({
  plot,
  now,
  crop,
  selectedCrop,
  selectedCropLocked,
  selectedSeedCount,
  busy,
  fertilizerBalance,
  onPlant,
  onHarvest,
  onFertilize,
  onUproot,
}: {
  plot: FarmPlot;
  now: number;
  crop: FarmCrop | null | undefined;
  selectedCrop: FarmCrop | undefined;
  selectedCropLocked: boolean;
  selectedSeedCount: number;
  busy: boolean;
  fertilizerBalance: number;
  onPlant: () => void;
  onHarvest: () => void;
  onFertilize: () => void;
  onUproot: () => void;
}) {
  const ready = !!crop && !!plot.readyAt && plot.readyAt <= now;
  const progress =
    crop && plot.plantedAt && plot.readyAt
      ? Math.max(
          0,
          Math.min(100, ((now - plot.plantedAt) / (plot.readyAt - plot.plantedAt)) * 100),
        )
      : 0;

  return (
    <div className={`${SURFACE_CARD} flex min-h-[18rem] flex-col p-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
          {plotLabel(plot.id)}
        </div>
        <FlowerTulip
          size={18}
          weight="duotone"
          className={crop ? "text-emerald-500" : "text-zinc-400"}
        />
      </div>

      {crop ? (
        <>
          <div className="mt-4 flex items-start gap-3">
            <FarmItemImage itemId={crop.itemId} alt={crop.itemName} />
            <div className="min-w-0">
              <div className="text-lg font-black text-stone-900 dark:text-stone-100">
                {crop.name}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <Clock size={13} weight="bold" />
                {ready
                  ? "수확 가능"
                  : `${formatRemaining((plot.readyAt ?? now) - now)} 남음`}
              </div>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${ready ? 100 : progress}%` }}
            />
          </div>
          <p className="mt-3 line-clamp-2 h-10 overflow-hidden text-xs leading-relaxed text-stone-600 dark:text-stone-300">
            {crop.note}
          </p>
        </>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 dark:border-zinc-700 dark:bg-zinc-900">
            {selectedCrop ? (
              <FarmItemImage
                itemId={selectedCrop.itemId}
                alt={selectedCrop.itemName}
                className="h-11 w-11 opacity-60"
              />
            ) : null}
            <div className="min-w-0">
              <div className="text-sm font-bold text-stone-700 dark:text-stone-200">
                빈 밭
              </div>
              <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                선택한 씨앗을 1개 소비해 심습니다.
              </div>
            </div>
          </div>
        </>
      )}

      <div
        role="group"
        aria-label={`${plotLabel(plot.id)} 작업`}
        className="mt-auto grid min-h-[4.75rem] grid-rows-[2.25rem_2rem] gap-2"
      >
        {crop ? (
          <button
            type="button"
            onClick={onHarvest}
            disabled={!ready || busy}
            className="h-9 rounded-md bg-emerald-600 px-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
          >
            {busy ? "처리 중..." : ready ? "수확하기" : "재배 중"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onPlant}
            disabled={
              !selectedCrop || selectedCropLocked || selectedSeedCount <= 0 || busy
            }
            className="h-9 rounded-md bg-emerald-600 px-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
          >
            {busy
              ? "심는 중..."
              : selectedCropLocked
                ? `${selectedCrop?.requiredSkillName ?? "농부 패시브"} 필요`
                : selectedSeedCount <= 0
                  ? "씨앗 부족"
                  : `${selectedCrop?.name ?? "작물"} 심기`}
          </button>
        )}

        {crop && !ready ? (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onFertilize}
              disabled={busy || plot.fertilized || fertilizerBalance < 1}
              className="h-8 rounded-md border border-emerald-300 bg-white px-2 text-[0.6875rem] font-bold text-emerald-700 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400 dark:bg-zinc-900"
            >
              {plot.fertilized
                ? "거름 사용 완료"
                : `유기질 거름 사용 · ${fertilizerBalance}`}
            </button>
            <button
              type="button"
              title="씨앗·수확물·비료는 반환되지 않습니다"
              onClick={() => {
                if (
                  window.confirm(
                    `${crop.name}을(를) 파내시겠습니까?\n씨앗·수확물·비료는 반환되지 않습니다.`,
                  )
                ) {
                  onUproot();
                }
              }}
              disabled={busy}
              className="h-8 rounded-md border border-rose-300 bg-white px-2 text-[0.6875rem] font-bold text-rose-700 disabled:cursor-not-allowed disabled:text-zinc-400 dark:bg-zinc-900 dark:text-rose-300"
            >
              작물 파내기
            </button>
          </div>
        ) : (
          <span aria-hidden="true" className="h-8" />
        )}
      </div>
    </div>
  );
}

function DeliveryBoard({
  deliveries,
  inventory,
  claimedIds,
  dailyDeliveryCount,
  dailyDeliveryLimit,
  busyDeliveryId,
  onDeliver,
}: {
  deliveries: FarmDeliveryRequest[];
  inventory: Partial<Record<FarmItemId, number>>;
  claimedIds: string[];
  dailyDeliveryCount: number;
  dailyDeliveryLimit: number;
  busyDeliveryId: string | null;
  onDeliver: (requestId: string) => void;
}) {
  const dailyLimitReached = dailyDeliveryCount >= dailyDeliveryLimit;
  const orderedDeliveries = prioritizeDeliverable(
    deliveries,
    (delivery) =>
      !dailyLimitReached &&
      !claimedIds.includes(delivery.id) &&
      (inventory[delivery.requiredItemId] ?? 0) >= delivery.requiredQuantity,
  );

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <Package size={17} weight="duotone" className="text-emerald-500" />
          납품 게시판
        </div>
        <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          오늘 {dailyDeliveryCount}/{dailyDeliveryLimit}
        </span>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        {orderedDeliveries.map((delivery) => {
          const have = inventory[delivery.requiredItemId] ?? 0;
          const claimed = claimedIds.includes(delivery.id);
          const enough = have >= delivery.requiredQuantity;
          const busy = busyDeliveryId === delivery.id;
          return (
            <div
              key={delivery.id}
              className="flex min-h-[12rem] flex-col rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start gap-3">
                <FarmItemImage
                  itemId={delivery.requiredItemId}
                  alt={delivery.requiredItemName}
                  className="h-11 w-11"
                />
                <div className="min-w-0 font-bold text-zinc-900 dark:text-zinc-100">
                  {delivery.title}
                </div>
              </div>
              <p className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {delivery.note}
              </p>
              <div className="mt-3 rounded-md bg-zinc-50 px-2.5 py-2 text-xs dark:bg-zinc-900">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-500 dark:text-zinc-400">필요</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                    {delivery.requiredItemName} {have}/
                    {delivery.requiredQuantity}
                  </span>
                </div>
                <div className="mt-1 flex justify-between gap-2">
                  <span className="text-zinc-500 dark:text-zinc-400">보상</span>
                  <span className="text-right font-semibold text-emerald-700 dark:text-emerald-300">
                    증표 {delivery.rewardReputation}개
                    {hasSeedRewards(delivery.rewardSeeds)
                      ? ` · ${formatSeedRewards(delivery.rewardSeeds)}`
                      : ""}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDeliver(delivery.id)}
                disabled={dailyLimitReached || claimed || !enough || busy}
                className="mt-auto rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
              >
                {busy
                  ? "납품 중..."
                  : dailyLimitReached && !claimed
                    ? "오늘 마감"
                    : claimed
                    ? "오늘 완료"
                    : enough
                      ? "납품하기"
                      : "재료 부족"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InventoryPanel({
  inventory,
}: {
  inventory: Partial<Record<FarmItemId, number>>;
}) {
  const entries = Object.entries(inventory).filter(([, count]) => (count ?? 0) > 0) as [
    FarmItemId,
    number,
  ][];
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <Sparkle size={17} weight="duotone" className="text-emerald-500" />
        농장 보관함
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          아직 수확한 작물이 없습니다.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {entries.map(([itemId, count]) => (
            <div
              key={itemId}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <FarmItemImage
                  itemId={itemId}
                  alt={ITEM_LABELS[itemId] ?? itemId}
                  className="h-9 w-9"
                />
                <span className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                  {ITEM_LABELS[itemId] ?? itemId}
                </span>
              </span>
              <span className="font-bold text-emerald-700 dark:text-emerald-300">
                {count.toLocaleString("ko-KR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatSeedRewards(seeds: FarmSeedInventory): string {
  const entries = Object.entries(seeds).filter(([, count]) => (count ?? 0) > 0) as [
    FarmCropId,
    number,
  ][];
  if (entries.length === 0) return "씨앗 없음";
  return entries
    .map(([cropId, count]) => `${FARM_CROPS[cropId].seedName} ${count}개`)
    .join(", ");
}

function formatFarmDeliveryReward(
  reputation: number,
  seeds: FarmSeedInventory,
): string {
  const seedText = hasSeedRewards(seeds) ? formatSeedRewards(seeds) : "";
  return seedText
    ? `농장 증표 ${reputation}개 · ${seedText}`
    : `농장 증표 ${reputation}개`;
}

function firstSeedCropId(seeds: FarmSeedInventory): FarmCropId | null {
  return (
    (Object.entries(seeds).find(([, count]) => (count ?? 0) > 0)?.[0] as
      | FarmCropId
      | undefined) ?? null
  );
}

function firstItemId(items: FarmItemInventory): FarmItemId | null {
  return (
    (Object.entries(items).find(([, count]) => (count ?? 0) > 0)?.[0] as
      | FarmItemId
      | undefined) ?? null
  );
}

function hasSeedRewards(seeds: FarmSeedInventory): boolean {
  return Object.values(seeds).some((count) => (count ?? 0) > 0);
}

function hasRequiredItems(
  inventory: FarmItemInventory,
  requirements: FarmItemInventory,
): boolean {
  return Object.entries(requirements).every(([itemId, count]) => {
    const required = Math.max(0, Math.floor(Number(count) || 0));
    return (inventory[itemId as FarmItemId] ?? 0) >= required;
  });
}

function formatItemRequirements(
  requirements: FarmItemInventory,
  inventory: FarmItemInventory,
): string {
  const entries = Object.entries(requirements).filter(
    ([, count]) => (count ?? 0) > 0,
  ) as [FarmItemId, number][];
  if (entries.length === 0) return "없음";
  return entries
    .map(([itemId, count]) => {
      const have = inventory[itemId] ?? 0;
      return `${ITEM_LABELS[itemId] ?? itemId} ${have}/${count}`;
    })
    .join(", ");
}

function plotLabel(id: string): string {
  const n = id.replace("plot-", "");
  return `밭 ${n}`;
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분 ${seconds}초`;
  return `${seconds}초`;
}
