"use client";

import { Plant } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  FARM_BREED_MASTER_TITLE_ID,
  FARM_BREEDER_TITLE_ID,
  TITLES,
} from "@/adventure/data/titles";
import { FARM_ITEMS, type FarmCrop, type FarmCropId, type FarmState } from "./farm";
import {
  FARM_BREEDING_BASE_MAX_STAGE,
  FARM_BREEDING_TITLE_TOTAL_STAGE,
  farmBreedingBlockReason,
  farmBreedingCost,
  farmBreedingRareChancePct,
  farmBreedingStage,
  farmBreedingTotalStage,
  type FarmBreedingContext,
} from "./farmBreeding";
import { FarmItemIcon } from "./FarmItemIcon";
import { LIFE_MAJOR_CRAFT_MIN_STAGE } from "./lifeMajorRules";
import { LIFE_MAJOR_PRODUCTS } from "./lifeMajorProducts";

const ENOUGH_CLASS = "text-zinc-600 dark:text-zinc-300";
const SHORT_CLASS = "text-rose-600 dark:text-rose-400";

export function FarmBreedingPanel({
  farm,
  crops,
  info,
  busyCropId,
  onBreed,
}: {
  farm: FarmState;
  crops: readonly FarmCrop[];
  info: FarmBreedingContext;
  busyCropId: FarmCropId | null;
  onBreed: (cropId: FarmCropId) => void;
}) {
  const totalStage = farmBreedingTotalStage(farm);
  const baseMaxCount = crops.filter(
    (crop) => farmBreedingStage(farm, crop.id) >= FARM_BREEDING_BASE_MAX_STAGE,
  ).length;

  return (
    <section
      className={`${SURFACE_CARD} p-3`}
      aria-labelledby="farm-breeding-title"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-300">
          <Plant size={22} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="farm-breeding-title"
            className="font-bold text-zinc-900 dark:text-zinc-100"
          >
            품종 개량
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            작물을 모아 품종을 개량하면 그 작물의 희귀 수확 확률이 오릅니다.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 pt-3 text-xs tabular-nums text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          품종 단계 합계 {totalStage}
        </span>
        <span>
          {TITLES[FARM_BREEDER_TITLE_ID].name}{" "}
          {Math.min(totalStage, FARM_BREEDING_TITLE_TOTAL_STAGE)} /{" "}
          {FARM_BREEDING_TITLE_TOTAL_STAGE}
        </span>
        <span>
          {TITLES[FARM_BREED_MASTER_TITLE_ID].name} {baseMaxCount} / {crops.length}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
        {crops.map((crop) => (
          <FarmBreedingRow
            key={crop.id}
            farm={farm}
            crop={crop}
            info={info}
            busy={busyCropId === crop.id}
            anyBusy={busyCropId !== null}
            onBreed={onBreed}
          />
        ))}
      </ul>
    </section>
  );
}

function FarmBreedingRow({
  farm,
  crop,
  info,
  busy,
  anyBusy,
  onBreed,
}: {
  farm: FarmState;
  crop: FarmCrop;
  info: FarmBreedingContext;
  busy: boolean;
  anyBusy: boolean;
  onBreed: (cropId: FarmCropId) => void;
}) {
  const stage = farmBreedingStage(farm, crop.id);
  const cost = farmBreedingCost(crop.id, stage + 1);
  const blocked = farmBreedingBlockReason(farm, crop.id, info);
  const heldCrops = farm.inventory[crop.itemId] ?? 0;
  const heldRare = farm.inventory[crop.rareItemId] ?? 0;

  return (
    <li
      data-testid={`farm-breeding-${crop.id}`}
      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3"
    >
      <FarmItemIcon itemId={crop.itemId} className="size-10" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
            {crop.name}
          </span>
          <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {stage}단계
          </span>
          <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
            희귀 수확 +{farmBreedingRareChancePct(stage)}%p
          </span>
        </p>
        {cost ? (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
            <CostAmount
              name={FARM_ITEMS[cost.cropItemId].name}
              held={heldCrops}
              need={cost.crops}
            />
            <CostAmount
              name={FARM_ITEMS[cost.rareItemId].name}
              held={heldRare}
              need={cost.rare}
            />
            {cost.masterCrop > 0 ? (
              <CostAmount
                name={LIFE_MAJOR_PRODUCTS.farming.name}
                held={info.masterCropHeld}
                need={cost.masterCrop}
              />
            ) : null}
          </p>
        ) : null}
        {blocked === "breeding_master_locked" ? (
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            농사 주전공 명장 {LIFE_MAJOR_CRAFT_MIN_STAGE}단계부터 올릴 수 있습니다.
          </p>
        ) : null}
      </div>
      {cost ? (
        <Button
          variant="secondary"
          size="sm"
          className="min-h-10"
          aria-label={`${crop.name} 품종 개량`}
          disabled={blocked !== null || anyBusy}
          onClick={() => onBreed(crop.id)}
        >
          {busy ? "개량 중..." : "개량"}
        </Button>
      ) : (
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          최고 단계
        </span>
      )}
    </li>
  );
}

function CostAmount({
  name,
  held,
  need,
}: {
  name: string;
  held: number;
  need: number;
}) {
  return (
    <span className={held >= need ? ENOUGH_CLASS : SHORT_CLASS}>
      {name} {held.toLocaleString("ko-KR")} / {need.toLocaleString("ko-KR")}
    </span>
  );
}
