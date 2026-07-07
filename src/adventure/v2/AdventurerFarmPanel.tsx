"use client";

import { useMemo, useState } from "react";
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
import type {
  FarmCrop,
  FarmCropId,
  FarmDeliveryRequest,
  FarmItemId,
  FarmPlot,
  FarmSeedInventory,
  FarmState,
} from "./farm";
import { useFarm } from "./useFarm";

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
    error,
    now,
    farm,
    crops,
    deliveries,
    lastResult,
    lastDeliveryResult,
    refresh,
    plant,
    harvest,
    deliver,
  } = useFarm();
  const [selectedCropId, setSelectedCropId] = useState<FarmCropId>("wheat");
  const cropById = useMemo(
    () => new Map(crops.map((crop) => [crop.id, crop])),
    [crops],
  );
  const selectedCrop = cropById.get(selectedCropId) ?? crops[0];

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

      <section className="overflow-hidden rounded-md border border-lime-200 bg-[#f7fbf1] shadow-sm dark:border-emerald-900/70 dark:bg-[#10170f]">
        <div className="border-b border-lime-200 bg-[#eef8dd] px-4 py-3 dark:border-emerald-900/70 dark:bg-[#152314]">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-lime-200 bg-white text-emerald-600 shadow-sm dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <PottedPlant size={24} weight="duotone" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                아침에 심고, 모험 뒤에 거두는 작은 밭
              </h2>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                씨앗을 심고 작물을 수확한 뒤, 납품으로 다음 씨앗과 농장 명성을 확보합니다.
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
            <FarmSummary farm={farm} now={now} />

            <CropSelector
              crops={crops}
              seeds={farm.seeds}
              selectedCropId={selectedCrop?.id ?? selectedCropId}
              onSelect={setSelectedCropId}
            />

            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
                {error}
              </div>
            )}

            {lastResult && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                {lastResult.itemName} {lastResult.quantity}개를 수확했습니다.
                {lastResult.rareItemName
                  ? ` 희귀 수확: ${lastResult.rareItemName} ${lastResult.rareQuantity}개.`
                  : ""}
              </div>
            )}

            {lastDeliveryResult && (
              <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
                {lastDeliveryResult.title} 납품 완료.{" "}
                {formatSeedRewards(lastDeliveryResult.rewardSeeds)}와 농장 명성{" "}
                {lastDeliveryResult.rewardReputation}을 받았습니다.
              </div>
            )}

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

            <DeliveryBoard
              deliveries={deliveries}
              inventory={farm.inventory}
              claimedIds={farm.deliveries.claimedIds}
              busyDeliveryId={busyDeliveryId}
              onDeliver={deliver}
            />

            <InventoryPanel inventory={farm.inventory} />
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            농장을 불러오지 못했습니다.
          </div>
        )}
      </section>
    </PageShell>
  );
}

function FarmSummary({ farm, now }: { farm: FarmState; now: number }) {
  const seedCount = Object.values(farm.seeds).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const readyPlots = farm.plots.filter(
    (plot) => plot.cropId && plot.readyAt && plot.readyAt <= now,
  ).length;
  const growingPlots = farm.plots.filter((plot) => plot.cropId).length;

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <SummaryTile
        icon={<Leaf size={17} weight="duotone" />}
        label="씨앗"
        value={`${seedCount.toLocaleString("ko-KR")}개`}
        tone="seed"
      />
      <SummaryTile
        icon={<FlowerTulip size={17} weight="duotone" />}
        label="밭 상태"
        value={
          readyPlots > 0
            ? `수확 가능 ${readyPlots}칸`
            : `재배 중 ${growingPlots}칸`
        }
        tone="field"
      />
      <SummaryTile
        icon={<Sparkle size={17} weight="duotone" />}
        label="농장 명성"
        value={farm.stats.reputation.toLocaleString("ko-KR")}
        tone="reputation"
      />
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "seed" | "field" | "reputation";
}) {
  const styles = {
    seed:
      "border-lime-200 bg-lime-50 text-lime-800 dark:border-lime-900 dark:bg-lime-950/40 dark:text-lime-200",
    field:
      "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
    reputation:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  }[tone];
  return (
    <div className={`rounded-md border px-3 py-2 ${styles}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-base font-black">{value}</div>
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
    <div className="rounded-md border border-lime-200 bg-white/80 p-3 shadow-sm dark:border-emerald-900/70 dark:bg-zinc-950/70">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
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
              className={`rounded-md border px-3 py-2 text-left transition ${
                active
                  ? "border-emerald-500 bg-emerald-100 text-emerald-950 shadow-sm dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100"
                  : "border-lime-200 bg-[#fffdf4] text-zinc-700 hover:border-emerald-300 hover:bg-lime-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
              }`}
            >
              <span className="block text-sm font-bold">{crop.seedName}</span>
              <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                {formatDuration(crop.growMs)} · {crop.yieldMin}-{crop.yieldMax}개
              </span>
              <span className="mt-1 inline-flex rounded bg-white/70 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-zinc-950/50 dark:text-emerald-300">
                보유 {seeds[crop.id] ?? 0}개
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
    <div className="flex min-h-[13rem] flex-col rounded-md border border-lime-200 bg-[#fffaf0] p-3 shadow-sm dark:border-zinc-800 dark:bg-[#17130d]">
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
          <div className="mt-4">
            <div className="text-lg font-black text-stone-900 dark:text-stone-100">
              {crop.name}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <Clock size={13} weight="bold" />
              {ready ? "수확 가능" : `${formatRemaining((plot.readyAt ?? now) - now)} 남음`}
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-amber-100 dark:bg-stone-900">
            <div
              className="h-full rounded-full bg-lime-500 transition-all"
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
          <div className="mt-4 rounded-md border border-dashed border-amber-300 bg-[#f7ead6] px-3 py-5 text-center dark:border-stone-700 dark:bg-stone-950">
            <div className="text-sm font-bold text-stone-700 dark:text-stone-200">
              빈 밭
            </div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              선택한 씨앗을 1개 소비해 심습니다.
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
  busyDeliveryId,
  onDeliver,
}: {
  deliveries: FarmDeliveryRequest[];
  inventory: Partial<Record<FarmItemId, number>>;
  claimedIds: string[];
  busyDeliveryId: string | null;
  onDeliver: (requestId: string) => void;
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-[#fff8e7] p-3 shadow-sm dark:border-amber-900/70 dark:bg-[#18130b]">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
        <Package size={17} weight="duotone" className="text-amber-500" />
        납품 게시판
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
              className="flex min-h-[12rem] flex-col rounded-md border border-amber-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="font-bold text-zinc-900 dark:text-zinc-100">
                {delivery.title}
              </div>
              <p className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {delivery.note}
              </p>
              <div className="mt-3 rounded-md bg-amber-50 px-2.5 py-2 text-xs dark:bg-zinc-950">
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
                    {formatSeedRewards(delivery.rewardSeeds)} · 명성{" "}
                    {delivery.rewardReputation}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDeliver(delivery.id)}
                disabled={claimed || !enough || busy}
                className="mt-auto rounded-md bg-sky-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-zinc-800"
              >
                {busy
                  ? "납품 중..."
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
    <div className="rounded-md border border-sky-200 bg-sky-50 p-3 shadow-sm dark:border-sky-900/70 dark:bg-sky-950/30">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
        <Sparkle size={17} weight="duotone" className="text-amber-500" />
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
              className="flex items-center justify-between rounded-md border border-sky-100 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="font-medium text-zinc-800 dark:text-zinc-100">
                {ITEM_LABELS[itemId] ?? itemId}
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
    .map(([cropId, count]) => `${SEED_LABELS[cropId]} ${count}개`)
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
