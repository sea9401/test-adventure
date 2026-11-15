"use client";

import { Button } from "@/components/ui/Button";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { FARM_ITEMS, type FarmItemInventory } from "./farm";
import { LIFE_MAJOR_PRODUCTS } from "./lifeMajorProducts";
import { LIFE_MAJOR_CRAFT_MIN_STAGE } from "./lifeMajorRules";
import type { RanchAnimalId } from "./ranch";
import { ranchBreedCost, type RanchBreedContext, type RanchBreedResult } from "./ranchLineage";
import {
  RANCH_LINEAGE_BASE_MAX_GRADE,
  RANCH_LINEAGE_GRADE_NAMES,
  RANCH_RARE_ITEM_ID,
  ranchLineageBreedChancePct,
  ranchLineageRareChancePct,
  type RanchLineage,
} from "./ranchLineageRules";

const ENOUGH_CLASS = "text-zinc-600 dark:text-zinc-300";
const SHORT_CLASS = "text-rose-600 dark:text-rose-400";

function pct(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

/** 교배 결과 알림 문장. */
export function ranchBreedNoticeText(result: RanchBreedResult): string {
  if (!result.success) {
    return `${result.animalName} 교배 실패: 혈통은 그대로이고 다음 성공률이 ${pct(
      ranchLineageBreedChancePct({ grade: result.grade, fails: result.fails }),
    )}%로 올랐습니다.`;
  }
  return `${result.animalName} 교배 성공: 혈통 ${RANCH_LINEAGE_GRADE_NAMES[result.grade]}. ${
    FARM_ITEMS[RANCH_RARE_ITEM_ID[result.animalId]].name
  } 확률 ${pct(ranchLineageRareChancePct(result.grade))}%.`;
}

// 목장 부지 카드 안의 혈통 줄 — 지금 혈통과 희귀 산물 확률, 다음 교배의 성공률·비용·버튼.
export function RanchLineageRow({
  slotLabel,
  animalId,
  lineage,
  inventory,
  context,
  busy,
  anyBusy,
  onBreed,
}: {
  slotLabel: string;
  animalId: RanchAnimalId;
  lineage: RanchLineage;
  inventory: FarmItemInventory;
  context: RanchBreedContext;
  busy: boolean;
  anyBusy: boolean;
  onBreed: () => void;
}) {
  const cost = ranchBreedCost(animalId, lineage.grade);
  const masterLocked = lineage.grade >= RANCH_LINEAGE_BASE_MAX_GRADE && !context.masterUnlocked;
  const heldProducts = cost ? inventory[cost.productItemId] ?? 0 : 0;
  const heldFeed = inventory.compound_feed ?? 0;
  const short =
    cost !== null &&
    (heldProducts < cost.products || heldFeed < cost.feed || context.masterCropHeld < cost.masterCrop);

  return (
    <div className={`${SURFACE_CARD} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2`}>
      <div className="min-w-0 text-xs tabular-nums">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            혈통 {RANCH_LINEAGE_GRADE_NAMES[lineage.grade]}
          </span>
          <span className="text-zinc-600 dark:text-zinc-300">
            {FARM_ITEMS[RANCH_RARE_ITEM_ID[animalId]].name} 확률 {pct(ranchLineageRareChancePct(lineage.grade))}%
          </span>
        </p>
        {cost ? (
          <>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                교배 성공률 {pct(ranchLineageBreedChancePct(lineage))}%
              </span>
              <CostAmount name={FARM_ITEMS[cost.productItemId].name} held={heldProducts} need={cost.products} />
              <CostAmount name={FARM_ITEMS.compound_feed.name} held={heldFeed} need={cost.feed} />
              {cost.masterCrop > 0 && !masterLocked ? (
                <CostAmount
                  name={LIFE_MAJOR_PRODUCTS.farming.name}
                  held={context.masterCropHeld}
                  need={cost.masterCrop}
                />
              ) : null}
            </p>
            {masterLocked ? (
              <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                농사 주전공 명장 {LIFE_MAJOR_CRAFT_MIN_STAGE}단계부터 명장 혈통으로 교배할 수 있습니다.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      {cost ? (
        <Button
          variant="secondary"
          size="sm"
          className="min-h-10"
          aria-label={`${slotLabel} 교배`}
          disabled={masterLocked || short || anyBusy}
          onClick={onBreed}
        >
          {busy ? "교배 중..." : "교배"}
        </Button>
      ) : (
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">최고 혈통</span>
      )}
    </div>
  );
}

function CostAmount({ name, held, need }: { name: string; held: number; need: number }) {
  return (
    <span className={held >= need ? ENOUGH_CLASS : SHORT_CLASS}>
      {name} {held.toLocaleString("ko-KR")} / {need.toLocaleString("ko-KR")}
    </span>
  );
}
