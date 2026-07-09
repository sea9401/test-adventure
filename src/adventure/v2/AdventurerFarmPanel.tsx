"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Clock,
  FlowerTulip,
  Leaf,
  Package,
  PottedPlant,
  Sparkle,
} from "@phosphor-icons/react";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import {
  FARM_DAILY_DELIVERY_LIMIT,
  FARM_MAX_PLOT_COUNT,
  farmAvailableReputation,
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
import { useFarm } from "./useFarm";

type FarmSectionKey = "grow" | "delivery" | "shop";

type FarmToast = {
  id: number;
  tone: "ok" | "warn";
  text: string;
};

const FARM_TOAST_MS = 2800;

const FARM_ITEM_IMAGE_SRC: Record<FarmItemId, string> = {
  wheat: "/images/items/farm/wheat.webp",
  golden_wheat: "/images/items/farm/golden_wheat.webp",
  herb: "/images/items/farm/herb.webp",
  silverleaf: "/images/items/farm/silverleaf.webp",
  corn: "/images/items/farm/corn.webp",
  sweet_corn: "/images/items/farm/sweet_corn.webp",
};

const ITEM_LABELS: Record<FarmItemId, string> = {
  wheat: "밀",
  golden_wheat: "황금 밀",
  herb: "허브",
  silverleaf: "은빛잎",
  corn: "옥수수",
  sweet_corn: "달콤 옥수수",
};

const SEED_LABELS: Record<FarmCropId, string> = {
  wheat: "밀 씨앗",
  herb: "허브 씨앗",
  corn: "옥수수 씨앗",
};

export function AdventurerFarmPanel({ onBack }: { onBack: () => void }) {
  const {
    loading,
    busyPlotId,
    busyDeliveryId,
    busySpecialDeliveryId,
    busyWeeklyDeliveryId,
    busyShopItemId,
    busyPlotUpgrade,
    notice,
    now,
    farm,
    crops,
    deliveries,
    specialDeliveries,
    weeklyDeliveries,
    shopItems,
    clearNotice,
    refresh,
    plant,
    harvest,
    deliver,
    deliverSpecial,
    deliverWeekly,
    buyShopItem,
    buyPlotUpgrade,
  } = useFarm();
  const [selectedCropId, setSelectedCropId] = useState<FarmCropId>("wheat");
  const [activeSection, setActiveSection] = useState<FarmSectionKey>("grow");
  const cropById = useMemo(
    () => new Map(crops.map((crop) => [crop.id, crop])),
    [crops],
  );
  const selectedCrop = cropById.get(selectedCropId) ?? crops[0];
  const dailyDeliveryCount = farm?.deliveries.claimedIds.length ?? 0;
  const deliveryLimitReached = dailyDeliveryCount >= FARM_DAILY_DELIVERY_LIMIT;
  const readyPlotCount = useMemo(
    () =>
      farm?.plots.filter((plot) => plot.cropId && plot.readyAt && plot.readyAt <= now)
        .length ?? 0,
    [farm?.plots, now],
  );
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
          key: "grow",
          label: "재배",
          icon: <FlowerTulip size={16} weight="duotone" />,
          badge: readyPlotCount > 0 ? readyPlotCount : undefined,
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
    [affordableShopCount, deliverableCount, readyPlotCount],
  );
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
        }`,
      };
    }
    if (notice.kind === "shop") {
      const { result } = notice;
      return {
        id: notice.id,
        tone: "ok",
        text: `${result.title} 구매 완료. 농장 명성 ${result.costReputation}을 사용했습니다.${
          hasSeedRewards(result.rewardSeeds)
            ? ` 씨앗 보상: ${formatSeedRewards(result.rewardSeeds)}.`
            : ""
        }`,
      };
    }
    if (notice.kind === "plotUpgrade") {
      const { result } = notice;
      return {
        id: notice.id,
        tone: "ok",
        text: `${result.title} 구매 완료. 농장 명성 ${result.costReputation}을 사용해 밭 ${result.plotCount}칸을 열었습니다.`,
      };
    }
    const { result } = notice;
    return {
      id: notice.id,
      tone: "ok",
      text: `${result.title} 납품 완료. 농장 명성 ${result.rewardReputation}을 받았습니다.${
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

      <section className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="relative border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
          <Image
            src="/images/ui/farm.webp"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 720px"
            className="object-cover opacity-20 dark:opacity-25"
            priority={false}
          />
          <div className="absolute inset-0 bg-white/75 dark:bg-zinc-950/75" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <PottedPlant size={24} weight="duotone" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                아침에 심고, 모험 뒤에 거두는 작은 밭
              </h2>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                씨앗을 심고 작물을 수확한 뒤, 납품으로 농장 명성을 확보합니다.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            농장 상태를 불러오는 중...
          </div>
        ) : farm ? (
          <div className="space-y-4 p-4">
            <FarmSummary
              farm={farm}
              now={now}
              dailyDeliveryCount={dailyDeliveryCount}
            />
            <FarmGrowthPanel
              farm={farm}
              busy={busyPlotUpgrade}
              onBuy={buyPlotUpgrade}
            />

            <TabBar
              tabs={farmTabs}
              active={activeSection}
              onChange={setActiveSection}
              ariaLabel="농장 섹션"
              variant="underline"
              className="border-zinc-200 dark:border-zinc-700"
            />

            <div
              className={activeSection === "grow" ? "space-y-4" : "hidden"}
            >
              <CropSelector
                crops={crops}
                seeds={farm.seeds}
                selectedCropId={selectedCrop?.id ?? selectedCropId}
                onSelect={setSelectedCropId}
              />

              <div className="grid gap-3 sm:grid-cols-3">
                {farm.plots.map((plot) => (
                  <PlotCard
                    key={plot.id}
                    plot={plot}
                    now={now}
                    crop={plot.cropId ? cropById.get(plot.cropId) : null}
                    selectedCrop={selectedCrop}
                    selectedSeedCount={
                      selectedCrop ? (farm.seeds[selectedCrop.id] ?? 0) : 0
                    }
                    busy={busyPlotId === plot.id}
                    onPlant={() => selectedCrop && plant(plot.id, selectedCrop.id)}
                    onHarvest={() => harvest(plot.id)}
                  />
                ))}
              </div>
            </div>

            <div
              className={activeSection === "delivery" ? "space-y-4" : "hidden"}
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

            <div className={activeSection === "shop" ? "space-y-4" : "hidden"}>
              <FarmShopPanel
                items={shopItems}
                availableReputation={availableReputation}
                busyShopItemId={busyShopItemId}
                onBuy={buyShopItem}
              />
            </div>
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            농장을 불러오지 못했습니다.
          </div>
        )}
      </section>
      {toast ? <FarmToastMessage toast={toast} /> : null}
    </PageShell>
  );
}

function FarmToastMessage({ toast }: { toast: FarmToast }) {
  const ok = toast.tone === "ok";
  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 z-50 max-w-[min(24rem,calc(100vw-2rem))] rounded-md border px-4 py-3 text-base font-semibold leading-relaxed shadow-xl sm:left-6 ${
        ok
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
          : "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100"
      }`}
    >
      {toast.text}
    </div>
  );
}

function FarmSummary({
  farm,
  now,
  dailyDeliveryCount,
}: {
  farm: FarmState;
  now: number;
  dailyDeliveryCount: number;
}) {
  const seedCount = Object.values(farm.seeds).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const readyPlots = farm.plots.filter(
    (plot) => plot.cropId && plot.readyAt && plot.readyAt <= now,
  ).length;
  const growingPlots = farm.plots.filter((plot) => plot.cropId).length;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <SummaryTile
        icon={<Leaf size={17} weight="duotone" />}
        label="씨앗"
        value={`${seedCount.toLocaleString("ko-KR")}개`}
      />
      <SummaryTile
        icon={<FlowerTulip size={17} weight="duotone" />}
        label="밭 상태"
        value={
          readyPlots > 0
            ? `${farm.plots.length}칸 · 수확 ${readyPlots}`
            : `${farm.plots.length}칸 · 재배 ${growingPlots}`
        }
      />
      <SummaryTile
        icon={<Sparkle size={17} weight="duotone" />}
        label="사용 명성"
        value={`${farmAvailableReputation(farm).toLocaleString("ko-KR")}/${farm.stats.reputation.toLocaleString("ko-KR")}`}
      />
      <SummaryTile
        icon={<Package size={17} weight="duotone" />}
        label="오늘 납품"
        value={`${dailyDeliveryCount}/${FARM_DAILY_DELIVERY_LIMIT}`}
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
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
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
            명성 {next.costReputation} · 보유 {availableReputation}
          </p>
          <button
            type="button"
            onClick={onBuy}
            disabled={!affordable || busy}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
          >
            {busy ? "확장 중..." : affordable ? "밭 확장" : "명성 부족"}
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
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-black">{value}</div>
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
  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${className}`}
    >
      <Image
        src={FARM_ITEM_IMAGE_SRC[itemId]}
        alt={alt}
        fill
        sizes="64px"
        unoptimized
        className="object-cover"
      />
    </span>
  );
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
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <Sparkle size={17} weight="duotone" className="text-emerald-500" />
        희귀 수확 납품
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        {deliveries.map((delivery) => {
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
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <Package size={17} weight="duotone" className="text-emerald-500" />
        주간 농장 납품
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        {deliveries.map((delivery) => {
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
              )}
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
  busyShopItemId,
  onBuy,
}: {
  items: FarmShopItem[];
  availableReputation: number;
  busyShopItemId: string | null;
  onBuy: (itemId: string) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <Sparkle size={17} weight="duotone" className="text-emerald-500" />
          농장 평판 상점
        </div>
        <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          사용 가능 {availableReputation.toLocaleString("ko-KR")}
        </span>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        {items.map((item) => {
          const affordable = availableReputation >= item.costReputation;
          const busy = busyShopItemId === item.id;
          const previewCropId = firstSeedCropId(item.rewardSeeds);
          const previewItemId = previewCropId
            ? FARM_CROP_ITEM_ID[previewCropId]
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
                    명성 {item.costReputation}
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
                disabled={!affordable || busy}
                className="mt-auto rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
              >
                {busy ? "구매 중..." : affordable ? "구매하기" : "명성 부족"}
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
  selectedCropId,
  onSelect,
}: {
  crops: FarmCrop[];
  seeds: FarmSeedInventory;
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
          return (
            <button
              key={crop.id}
              type="button"
              onClick={() => onSelect(crop.id)}
              className={`flex min-h-[6.25rem] items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
                active
                  ? "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-emerald-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-700 dark:hover:bg-zinc-900"
              }`}
            >
              <FarmItemImage itemId={crop.itemId} alt={crop.itemName} />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{crop.seedName}</span>
                <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDuration(crop.growMs)} · {crop.yieldMin}-{crop.yieldMax}
                  개
                </span>
                <span className="mt-1 inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-zinc-900 dark:text-emerald-300">
                  보유 {seeds[crop.id] ?? 0}개
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlotCard({
  plot,
  now,
  crop,
  selectedCrop,
  selectedSeedCount,
  busy,
  onPlant,
  onHarvest,
}: {
  plot: FarmPlot;
  now: number;
  crop: FarmCrop | null | undefined;
  selectedCrop: FarmCrop | undefined;
  selectedSeedCount: number;
  busy: boolean;
  onPlant: () => void;
  onHarvest: () => void;
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
    <div className="flex min-h-[13rem] flex-col rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
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
          <p className="mt-3 min-h-[2.5rem] text-xs leading-relaxed text-stone-600 dark:text-stone-300">
            {crop.note}
          </p>
          <button
            type="button"
            onClick={onHarvest}
            disabled={!ready || busy}
            className="mt-auto rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
          >
            {busy ? "처리 중..." : ready ? "수확하기" : "재배 중"}
          </button>
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
          <button
            type="button"
            onClick={onPlant}
            disabled={!selectedCrop || selectedSeedCount <= 0 || busy}
            className="mt-auto rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
          >
            {busy
              ? "심는 중..."
              : selectedSeedCount <= 0
                ? "씨앗 부족"
                : `${selectedCrop?.name ?? "작물"} 심기`}
          </button>
        </>
      )}
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
        {deliveries.map((delivery) => {
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
                    명성 {delivery.rewardReputation}
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

const FARM_CROP_ITEM_ID: Record<FarmCropId, FarmItemId> = {
  wheat: "wheat",
  herb: "herb",
  corn: "corn",
};

function formatSeedRewards(seeds: FarmSeedInventory): string {
  const entries = Object.entries(seeds).filter(([, count]) => (count ?? 0) > 0) as [
    FarmCropId,
    number,
  ][];
  if (entries.length === 0) return "씨앗 없음";
  return entries
    .map(([cropId, count]) => `${SEED_LABELS[cropId]} ${count}개`)
    .join(", ");
}

function formatFarmDeliveryReward(
  reputation: number,
  seeds: FarmSeedInventory,
): string {
  const seedText = hasSeedRewards(seeds) ? formatSeedRewards(seeds) : "";
  return seedText ? `명성 ${reputation} · ${seedText}` : `명성 ${reputation}`;
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
  return minutes >= 60 ? `${Math.round(minutes / 60)}시간` : `${minutes}분`;
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
