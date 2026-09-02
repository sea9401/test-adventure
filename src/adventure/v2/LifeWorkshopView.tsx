"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Hammer, Mountains, Sparkle, Tree } from "@phosphor-icons/react";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DraftNumberInput } from "@/components/ui/DraftNumberInput";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import {
  LIFE_PROCESSED_MATERIALS,
  LIFE_SPECIALIZATIONS,
  LIFE_SPECIALIZATION_LEVEL,
  LIFE_TOOL_NAMES,
  lifeGatheringBonusPct,
  lifeProcessingGreatSuccessPct,
  lifeRespecializationCost,
  type LifeProcessedMaterialId,
  type LifeSpecializationId,
  type LifeToolTier,
  type LifeWorkshopActivity,
  type LifeWorkshopState,
} from "./lifeWorkshop";
import {
  LIFE_CRAFTING_RECIPES,
  LIFE_HOUSING_ENABLED,
  lifeBlueprintSourceLabel,
  type LifeCraftingRecipe,
  type LifeFinishedItemId,
} from "./lifeCrafting";
import { LifeRequestBoard } from "./LifeRequestBoard";
import { FarmItemIcon } from "./FarmItemIcon";
import {
  FARM_CROP_ITEM_IDS,
  FARM_ITEMS,
  type FarmCropSelection,
  type FarmItemId,
} from "./farm";

export type WorkshopRecipeView = {
  id: string;
  activity: LifeWorkshopActivity;
  inputId: string;
  inputAmount: number;
  outputId: LifeProcessedMaterialId;
  outputAmount: number;
  requiredLevel: number;
  maxBatches: number;
  greatSuccessPct: number;
};

type WorkshopPayload = {
  ok: true;
  state: LifeWorkshopState;
  levels: Record<LifeWorkshopActivity, number>;
  materials: Record<string, number>;
  failedCookingDishes: number;
  gold: number;
  bankedGold: number;
  liberationDiscountPct?: number;
  personalCraftGoldCost?: {
    baseGoldCost: number;
    goldCost: number;
    liberationDiscountPct: number;
  };
  recipes: WorkshopRecipeView[];
  tools: Array<{
    activity: LifeWorkshopActivity;
    tier: LifeToolTier;
    name: string;
    durationReductionPct: number;
    bonusMaterialPct: number;
    nextUpgrade: {
      tier: 1 | 2 | 3;
      requiredLevel: number;
      materials: Record<string, number>;
    } | null;
  }>;
  craftingRecipes: Array<LifeCraftingRecipe & {
    learned: boolean;
    craftCount: number;
    masteryStage: number;
    batchLimit: number;
    maxCraftable: number;
  }>;
  ranchCraftingRecipe: RanchCraftingRecipeView;
  failedDishFeedRecipe: FailedDishFeedRecipeView;
  result?: {
    action: string;
    produced?: number;
    bonusCount?: number;
    outputId?: LifeProcessedMaterialId;
    grantedTitles?: string[];
    itemId?: LifeFinishedItemId;
    recipeId?: string;
    blueprintRecipeId?: string;
    replaced?: boolean;
    resumed?: boolean;
    baseGoldCost?: number;
    goldCost?: number;
    liberationDiscountPct?: number;
  };
};

export function personalCraftGoldCostText(cost: {
  baseGoldCost: number;
  goldCost: number;
  liberationDiscountPct: number;
}): string {
  return `기본 ${cost.baseGoldCost.toLocaleString()}G → 실제 ${cost.goldCost.toLocaleString()}G · 해방 할인 ${cost.liberationDiscountPct.toLocaleString()}%`;
}

export type WorkshopTab =
  | "requests"
  | "process"
  | "craft"
  | "aids"
  | "tools"
  | "specialization"
  | "codex";

const TAB_LABELS: Array<{ id: WorkshopTab; label: string }> = [
  { id: "requests", label: "생활 의뢰" },
  { id: "process", label: "재료 가공" },
  { id: "craft", label: "생활 제작" },
  { id: "aids", label: "생활 보조품" },
  { id: "tools", label: "생활 도구" },
  { id: "specialization", label: "전문화" },
  { id: "codex", label: "가공 도감" },
];

const ACTIVITY_LABEL: Record<LifeWorkshopActivity, string> = {
  woodcutting: "벌목",
  mining: "채광",
};

// 숙소 가구 제작 데이터와 기존 보유 내역은 유지하되, 기능이 닫힌 동안에는 노출하지 않는다.
const VISIBLE_LIFE_CRAFTING_KINDS: LifeCraftingRecipe["kind"][] =
  LIFE_HOUSING_ENABLED ? ["aid", "furniture"] : ["aid"];

const ERROR_TEXT: Record<string, string> = {
  bad_recipe: "가공법을 확인할 수 없습니다.",
  level_required: "생활 레벨이 부족합니다.",
  not_enough_materials: "필요한 재료가 부족합니다.",
  not_enough_failed_dishes: "실패 음식이 부족합니다.",
  not_enough_gold: "전문화 변경에 필요한 골드가 부족합니다.",
  already_selected: "이미 선택한 전문화입니다.",
  max_tool: "도구를 최고 단계까지 승급했습니다.",
  bad_craft_recipe: "제작법을 확인할 수 없습니다.",
  blueprint_required: "아직 숨겨진 도안을 발견하지 못했습니다.",
  batch_locked: "제작 기록이 부족해 해당 수량을 한 번에 만들 수 없습니다.",
  aid_in_use: "이미 사용 중인 보조품입니다.",
  aid_not_owned: "활성화할 보조품을 보유하고 있지 않습니다.",
  aid_not_active: "활성화된 보조품이 없습니다.",
  ranch_locked: "씨앗 선별을 배우면 배합 사료를 제작할 수 있습니다.",
  not_enough_items: "배합 사료 제작에 필요한 농장 재료가 부족합니다.",
  bad_request: "제작 수량과 작물 선택을 확인해 주세요.",
};

export type RanchCraftingRecipeView = {
  id: "compound_feed";
  name: string;
  outputAmount: number;
  ingredientAmount: number;
  unlocked: boolean;
  craftCount: number;
  masteryStage: number;
  batchLimit: number;
  maxCraftable: number;
  ownedFeed: number;
  availableCropCount: number;
  cropInventory: FarmCropSelection;
};

export type FailedDishFeedRecipeView = {
  id: "failed_dish_feed";
  name: string;
  outputAmount: number;
  failedDishCost: number;
  craftCount: number;
  masteryStage: number;
  batchLimit: number;
  maxCraftable: number;
  ownedFeed: number;
};

type WorkshopErrorPayload = {
  error?: string;
  requiredLevel?: number;
  retryAfterSec?: number;
};

export function lifeWorkshopErrorText(payload: WorkshopErrorPayload | null): string {
  if (payload?.error === "rate_limited") {
    const retryAfterSec = Math.max(1, Math.ceil(Number(payload.retryAfterSec) || 1));
    return `요청이 너무 많습니다. ${retryAfterSec}초 후 다시 시도해 주세요.`;
  }

  const base = ERROR_TEXT[payload?.error ?? ""] ?? "작업을 완료하지 못했습니다.";
  return payload?.error === "level_required" && payload.requiredLevel
    ? `${base} (필요 Lv.${payload.requiredLevel})`
    : base;
}

function materialName(id: string): string {
  return V2_MATERIALS[id]?.name ?? id;
}

export function groupWorkshopRecipesByOutput(
  recipes: readonly WorkshopRecipeView[],
): WorkshopRecipeView[][] {
  const groups = new Map<LifeProcessedMaterialId, WorkshopRecipeView[]>();
  for (const recipe of recipes) {
    const group = groups.get(recipe.outputId);
    if (group) group.push(recipe);
    else groups.set(recipe.outputId, [recipe]);
  }
  return [...groups.values()];
}

function requirementText(
  costs: Record<string, number>,
  materials: Record<string, number>,
  failedDishCost = 0,
  failedCookingDishes = 0,
): string {
  const requirements = Object.entries(costs)
    .map(([id, amount]) => `${materialName(id)} ${materials[id] ?? 0}/${amount}`);
  if (failedDishCost > 0) {
    requirements.push(
      `실패 음식 ${failedDishCost}개 (보유 ${failedCookingDishes}개)`,
    );
  }
  return requirements.join(" · ");
}

function LifeAidArtwork({
  recipe,
  hidden = false,
  size = "md",
}: {
  recipe?: LifeCraftingRecipe | null;
  hidden?: boolean;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "size-14" : "size-20";

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-amber-200 bg-white dark:border-amber-900 dark:bg-zinc-950`}
    >
      {hidden || !recipe?.image ? (
        <BookOpen
          size={size === "sm" ? 27 : 36}
          weight="duotone"
          className="text-amber-600 dark:text-amber-300"
          aria-hidden
        />
      ) : (
        <Image
          src={recipe.image}
          width={256}
          height={256}
          sizes={size === "sm" ? "56px" : "80px"}
          alt=""
          className="size-full object-contain p-1.5"
        />
      )}
    </div>
  );
}

export function LifeWorkshopMaxConfirmDialog({
  quantity,
  unit,
  actionLabel,
  onConfirm,
  onClose,
}: {
  quantity: number;
  unit: "개" | "회";
  actionLabel: "제작" | "가공";
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(panelRef);

  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="life-workshop-max-confirm-title"
        aria-describedby="life-workshop-max-confirm-description"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-sm p-5 shadow-2xl`}
      >
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          최대 수량 {actionLabel}
        </p>
        <h2
          id="life-workshop-max-confirm-title"
          className="mt-1 text-lg font-bold"
        >
          최대 {quantity.toLocaleString()}{unit}를 {actionLabel}할까요?
        </h2>
        <p
          id="life-workshop-max-confirm-description"
          className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300"
        >
          현재 보유 재료로 가능한 최대 수량을 한 번에 사용합니다. 실행 전에
          수량을 다시 확인해 주세요.
        </p>
        <div className={`${SURFACE_INSET} mt-4 flex items-center justify-between gap-3 p-3 text-sm`}>
          <span className="text-zinc-500 dark:text-zinc-400">실행 수량</span>
          <strong className="tabular-nums text-amber-700 dark:text-amber-300">
            {quantity.toLocaleString()}{unit}
          </strong>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" onClick={onClose}>
            취소
          </Button>
          <Button size="md" variant="warning" onClick={onConfirm}>
            최대 {quantity.toLocaleString()}{unit} {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LifeWorkshopQuantityControls({
  maxQuantity,
  unit,
  actionLabel,
  inputLabel,
  busy,
  onSubmit,
}: {
  maxQuantity: number;
  unit: "개" | "회";
  actionLabel: "제작" | "가공";
  inputLabel: string;
  busy: boolean;
  onSubmit: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [maxConfirmOpen, setMaxConfirmOpen] = useState(false);
  const max = Math.max(0, Math.floor(maxQuantity));
  const selectedQuantity = max > 0 ? Math.min(max, quantity) : 1;
  const disabled = busy || max < 1;

  return (
    <div className="shrink-0 space-y-1.5">
      <div className="flex flex-wrap gap-1" aria-label={`${actionLabel} 빠른 수량`}>
        <Button
          size="xs"
          variant="secondary"
          disabled={disabled}
          onClick={() => onSubmit(1)}
        >
          1{unit}
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={busy || max < 10}
          onClick={() => onSubmit(10)}
        >
          10{unit}
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={disabled}
          aria-haspopup={max > 1 ? "dialog" : undefined}
          onClick={() => {
            if (max > 1) setMaxConfirmOpen(true);
            else onSubmit(max);
          }}
        >
          최대 {max.toLocaleString()}{unit}
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <DraftNumberInput
          min={1}
          max={Math.max(1, max)}
          value={selectedQuantity}
          onValueChange={setQuantity}
          disabled={disabled}
          aria-label={inputLabel}
          className="h-8 w-20 rounded-md border border-zinc-300 bg-white px-2 text-center text-xs tabular-nums disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <Button
          size="xs"
          variant="warning"
          disabled={disabled}
          onClick={() => onSubmit(selectedQuantity)}
        >
          {selectedQuantity.toLocaleString()}{unit} {actionLabel}
        </Button>
      </div>
      {maxConfirmOpen ? (
        <LifeWorkshopMaxConfirmDialog
          quantity={max}
          unit={unit}
          actionLabel={actionLabel}
          onClose={() => setMaxConfirmOpen(false)}
          onConfirm={() => {
            setMaxConfirmOpen(false);
            onSubmit(max);
          }}
        />
      ) : null}
    </div>
  );
}

export function LifeWorkshopProcessingRecipeCard({
  recipes,
  level,
  materials,
  busy,
  onProcess,
}: {
  recipes: readonly WorkshopRecipeView[];
  level: number;
  materials: Record<string, number>;
  busy: boolean;
  onProcess: (recipeId: string, batches: number) => void;
}) {
  const [selectedRecipeId, setSelectedRecipeId] = useState(
    recipes[0]?.id ?? "",
  );
  const recipe =
    recipes.find((entry) => entry.id === selectedRecipeId) ?? recipes[0];

  if (!recipe) return null;

  const outputName = materialName(recipe.outputId);
  const unlocked = level >= recipe.requiredLevel;

  return (
    <div className={`${SURFACE_INSET} flex flex-col gap-3 p-3 sm:flex-row sm:items-center`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">
          {outputName} {recipe.outputAmount}개
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
          <span className="shrink-0">재료</span>
          <select
            aria-label={`${outputName} 재료 선택`}
            value={recipe.id}
            onChange={(event) => setSelectedRecipeId(event.currentTarget.value)}
            className="min-h-9 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            {recipes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {materialName(entry.inputId)} {entry.inputAmount}개
              </option>
            ))}
          </select>
        </label>
        <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          필요 Lv.{recipe.requiredLevel} · 보유 {materials[recipe.inputId] ?? 0}개
        </div>
      </div>
      <LifeWorkshopQuantityControls
        maxQuantity={unlocked ? recipe.maxBatches : 0}
        unit="회"
        actionLabel="가공"
        inputLabel={`${outputName} 가공 수량`}
        busy={busy}
        onSubmit={(batches) => onProcess(recipe.id, batches)}
      />
    </div>
  );
}

export function RanchFeedRecipeCard({
  recipe,
  busy,
  onCraft,
}: {
  recipe: RanchCraftingRecipeView;
  busy: boolean;
  onCraft: (quantity: number, cropSelection: FarmCropSelection) => void;
}) {
  const [cropSelection, setCropSelection] = useState<FarmCropSelection>({});
  const availableCropIds = FARM_CROP_ITEM_IDS.filter(
    (itemId) =>
      (recipe.cropInventory[itemId] ?? 0) > 0 ||
      (cropSelection[itemId] ?? 0) > 0,
  );
  const selectedCropCount = Object.values(cropSelection).reduce(
    (total, amount) => total + (amount ?? 0),
    0,
  );
  const selectionMaxCraftable =
    selectedCropCount === recipe.ingredientAmount
      ? Math.min(
          recipe.batchLimit,
          ...Object.entries(cropSelection).map(([itemId, amount]) =>
            Math.floor(
              (recipe.cropInventory[itemId as FarmItemId] ?? 0) /
                Math.max(1, amount ?? 0),
            ),
          ),
        )
      : 0;

  const changeCropSelection = (itemId: FarmItemId, delta: -1 | 1) => {
    setCropSelection((current) => {
      const currentAmount = current[itemId] ?? 0;
      const currentTotal = Object.values(current).reduce(
        (total, amount) => total + (amount ?? 0),
        0,
      );
      const nextAmount = currentAmount + delta;
      if (
        nextAmount < 0 ||
        (delta > 0 &&
          (currentTotal >= recipe.ingredientAmount ||
            nextAmount > (recipe.cropInventory[itemId] ?? 0)))
      ) {
        return current;
      }
      const next = { ...current };
      if (nextAmount === 0) delete next[itemId];
      else next[itemId] = nextAmount;
      return next;
    });
  };

  return (
    <Card padding="md">
      <h2 className="text-sm font-bold">목장 용품</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        농장에서 수확한 작물을 공용 사료로 배합합니다.
      </p>
      <div className={`${SURFACE_INSET} mt-3 p-3`}>
        <div className="flex items-start gap-3">
          <FarmItemIcon itemId="compound_feed" className="size-16" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <strong>{recipe.name}</strong>
              <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                보유 {recipe.ownedFeed.toLocaleString("ko-KR")}개
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              닭과 소가 함께 먹는 공용 사료입니다. 1회 제작 시 {recipe.outputAmount}개 완성.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <strong>작물 {recipe.ingredientAmount}개를 선택해 주세요</strong>
          <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
            선택 {selectedCropCount}/{recipe.ingredientAmount} · 보유 {recipe.availableCropCount.toLocaleString("ko-KR")}개
          </span>
        </div>
        {availableCropIds.length > 0 ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {availableCropIds.map((itemId) => {
              const item = FARM_ITEMS[itemId];
              const held = recipe.cropInventory[itemId] ?? 0;
              const selected = cropSelection[itemId] ?? 0;
              return (
                <div
                  key={itemId}
                  className={`${SURFACE_CARD} flex items-center gap-2 p-2`}
                >
                  <FarmItemIcon itemId={itemId} className="size-9" />
                  <div className="min-w-0 flex-1 text-xs">
                    <strong className="block truncate">{item.name}</strong>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      보유 {held.toLocaleString("ko-KR")}개
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="xs"
                      variant="secondary"
                      className="min-h-8 px-2"
                      aria-label={`${item.name} 1개 빼기`}
                      disabled={busy || selected === 0}
                      onClick={() => changeCropSelection(itemId, -1)}
                    >
                      −
                    </Button>
                    <span className="w-5 text-center text-xs font-bold tabular-nums">
                      {selected}
                    </span>
                    <Button
                      size="xs"
                      variant="secondary"
                      className="min-h-8 px-2"
                      aria-label={`${item.name} 1개 추가`}
                      disabled={
                        busy ||
                        selectedCropCount >= recipe.ingredientAmount ||
                        selected >= held
                      }
                      onClick={() => changeCropSelection(itemId, 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">
            보유한 농장 작물이 없습니다.
          </p>
        )}
        <div className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">
          제작 기록 {recipe.craftCount}회 · 단계 {recipe.masteryStage}/5 · 일괄 한도 {recipe.batchLimit}
        </div>
        {recipe.unlocked ? (
          <div className="mt-2">
            <LifeWorkshopQuantityControls
              maxQuantity={selectionMaxCraftable}
              unit="회"
              actionLabel="제작"
              inputLabel="배합 사료 제작 수량"
              busy={busy}
              onSubmit={(quantity) => onCraft(quantity, cropSelection)}
            />
            {selectedCropCount < recipe.ingredientAmount ? (
              <span className="text-[11px] text-rose-600 dark:text-rose-300">
                작물을 {recipe.ingredientAmount - selectedCropCount}개 더 선택해 주세요.
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-300">
            씨앗 선별을 배우면 제작할 수 있습니다.
          </p>
        )}
      </div>
    </Card>
  );
}

export function FailedDishFeedRecipeCard({
  recipe,
  failedCookingDishes,
  busy,
  onCraft,
}: {
  recipe: FailedDishFeedRecipeView;
  failedCookingDishes: number;
  busy: boolean;
  onCraft: (quantity: number) => void;
}) {
  return (
    <Card padding="md">
      <h2 className="text-sm font-bold">실패 음식 재활용</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        실패한 요리를 가공해 목장에서 사용하는 사료로 재활용합니다.
      </p>
      <div className={`${SURFACE_INSET} mt-3 p-3`}>
        <div className="flex items-start gap-3">
          <FarmItemIcon itemId="compound_feed" className="size-16" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <strong>{recipe.name}</strong>
              <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                보유 {recipe.ownedFeed.toLocaleString("ko-KR")}개
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              실패 음식의 별도 소모처입니다. 1회 제작 시 {recipe.outputAmount}개 완성.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-zinc-700 dark:text-zinc-200">
          <span className={`${SURFACE_CARD} px-2 py-1`}>
            실패 음식 {recipe.failedDishCost}개
            <span className="ml-1 text-zinc-500 dark:text-zinc-400">
              (보유 {failedCookingDishes.toLocaleString("ko-KR")}개)
            </span>
          </span>
        </div>
        <div className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">
          제작 기록 {recipe.craftCount}회 · 단계 {recipe.masteryStage}/5 · 일괄 한도 {recipe.batchLimit}
        </div>
        <div className="mt-2">
          <LifeWorkshopQuantityControls
            maxQuantity={recipe.maxCraftable}
            unit="회"
            actionLabel="제작"
            inputLabel="재활용 배합 사료 제작 수량"
            busy={busy}
            onSubmit={onCraft}
          />
          {recipe.maxCraftable === 0 ? (
            <span className="text-[11px] text-rose-600">실패 음식이 부족합니다.</span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function LifeWorkshopView({
  onBack,
  initialTab = "requests",
}: {
  onBack: () => void;
  initialTab?: WorkshopTab;
}) {
  const [data, setData] = useState<WorkshopPayload | null>(null);
  const [tab, setTab] = useState<WorkshopTab>(() => initialTab);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/v2/life-workshop");
      const json = (await response.json().catch(() => null)) as WorkshopPayload | null;
      if (response.ok && json?.ok) setData(json);
      else if (showLoading) setData(null);
    } catch {
      if (showLoading) setData(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 서버 상태를 불러온 뒤 렌더링한다.
    void refresh(true);
  }, [refresh]);

  const mutate = useCallback(
    async (key: string, body: Record<string, unknown>) => {
      if (busy) return;
      setBusy(key);
      setNotice(null);
      try {
        const response = await fetch("/api/v2/life-workshop", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await response.json().catch(() => null)) as
          | (WorkshopPayload & WorkshopErrorPayload)
          | null;
        if (!response.ok || !json?.ok) {
          setNotice(lifeWorkshopErrorText(json));
          return;
        }
        setData(json);
        if (json.result?.action === "process" && json.result.outputId) {
          const bonus = json.result.bonusCount ?? 0;
          setNotice(
            `${materialName(json.result.outputId)} ${json.result.produced ?? 0}개 완성` +
              (bonus > 0 ? ` · 대성공 +${bonus}` : ""),
          );
          if (json.result.blueprintRecipeId) setNotice((current) => `${current ?? ""} · 숨겨진 도안을 발견했습니다!`);
        } else if (json.result?.action === "craft") {
          const recipe = LIFE_CRAFTING_RECIPES.find((entry) => entry.id === json.result?.recipeId);
          setNotice(`${recipe?.name ?? "생활 제작품"} ${json.result.produced ?? 0}개를 완성했습니다.`);
        } else if (json.result?.action === "activate_aid") {
          setNotice(
            json.result.replaced
              ? "보조품을 변경했습니다. 이전 보조품의 남은 횟수는 보관됩니다."
              : json.result.resumed
                ? "보관한 보조품을 다시 활성화했습니다."
                : "보조품을 활성화했습니다. 성공한 관련 행동에만 횟수가 소모됩니다.",
          );
        } else if (json.result?.action === "toggle_aid") {
          setNotice("보조품 사용 설정을 변경했습니다.");
        } else if (json.result?.action === "upgrade_tool") {
          setNotice("생활 도구를 승급했습니다.");
        } else {
          setNotice("전문화를 적용했습니다.");
        }
      } catch {
        setNotice("네트워크 오류가 발생했습니다.");
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );

  const craftRanchFeed = useCallback(
    async (
      quantity: number,
      recipeId?: string,
      cropSelection?: FarmCropSelection,
    ) => {
      if (busy) return;
      setBusy(`ranch-feed:${recipeId ?? "compound_feed"}:${quantity}`);
      setNotice(null);
      try {
        const response = await fetch("/api/v2/farm/feed-craft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            recipeId
              ? { quantity, recipeId }
              : { quantity, cropSelection },
          ),
        });
        const json = (await response.json().catch(() => null)) as
          | ({
              ok: true;
              feedCraftResult: { produced: number };
            } & WorkshopErrorPayload)
          | ({ ok: false } & WorkshopErrorPayload)
          | null;
        if (!response.ok || !json?.ok) {
          setNotice(lifeWorkshopErrorText(json));
          return;
        }
        await refresh();
        setNotice(
          `배합 사료 ${json.feedCraftResult.produced.toLocaleString("ko-KR")}개를 완성했습니다.`,
        );
      } catch {
        setNotice("네트워크 오류가 발생했습니다.");
      } finally {
        setBusy(null);
      }
    },
    [busy, refresh],
  );

  const recipeGroupsByActivity = useMemo(() => {
    if (!data) return { woodcutting: [], mining: [] };
    return {
      woodcutting: groupWorkshopRecipesByOutput(
        data.recipes.filter((recipe) => recipe.activity === "woodcutting"),
      ),
      mining: groupWorkshopRecipesByOutput(
        data.recipes.filter((recipe) => recipe.activity === "mining"),
      ),
    };
  }, [data]);

  return (
    <PageShell spacing="normal">
      <SubViewHeader title="생활 조합 작업장" onBack={onBack} />

      {tab !== "requests" ? (
        <Card padding="md">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200">
              <Hammer size={25} weight="duotone" aria-hidden />
            </span>
            <div>
              <h2 className="font-bold text-zinc-900 dark:text-zinc-100">
                채집한 재료를 생활 성장으로 연결합니다
              </h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                원목과 광석을 가공해 도구를 승급하고, 생활 레벨 15부터 원하는 전문화를 선택할 수 있습니다.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="life-workshop-touch-tabs grid grid-cols-4 gap-1 rounded-xl bg-zinc-100 p-1 sm:grid-cols-7 dark:bg-zinc-900">
        {TAB_LABELS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`min-h-10 rounded-lg px-1 py-2 text-[11px] font-semibold transition sm:text-xs ${
              tab === entry.id
                ? "bg-white text-amber-700 shadow-sm dark:bg-zinc-800 dark:text-amber-300"
                : "text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab !== "requests" ? (
        <div
          className="h-12"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {notice ? (
            <div className="flex h-full items-center overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {notice}
            </div>
          ) : (
            <div
              className={`${SURFACE_INSET} flex h-full items-center px-3 text-xs text-zinc-500 dark:text-zinc-400`}
              aria-hidden="true"
            >
              작업 결과가 이곳에 표시됩니다.
            </div>
          )}
        </div>
      ) : null}

      {loading ? (
        <Card padding="md"><Skeleton rows={5} /></Card>
      ) : !data ? (
        <LoadErrorBanner onRetry={() => void refresh(true)} />
      ) : tab === "requests" ? (
        <LifeRequestBoard
          onChanged={() => void refresh()}
          onOpenWorkshopTab={(destination) => setTab(destination)}
        />
      ) : tab === "process" ? (
        <div className="space-y-3">
          {(["woodcutting", "mining"] as const).map((activity) => (
            <Card key={activity} padding="md">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  {activity === "woodcutting" ? <Tree size={19} weight="duotone" /> : <Mountains size={19} weight="duotone" />}
                  {ACTIVITY_LABEL[activity]} 가공 · Lv.{data.levels[activity]}
                </h2>
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  대성공 {lifeProcessingGreatSuccessPct(activity, data.state, data.levels[activity])}%
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {recipeGroupsByActivity[activity].map((recipes) => (
                  <LifeWorkshopProcessingRecipeCard
                    key={recipes[0].outputId}
                    recipes={recipes}
                    level={data.levels[activity]}
                    materials={data.materials}
                    busy={busy !== null}
                    onProcess={(recipeId, batches) =>
                      void mutate(`process:${recipeId}:${batches}`, {
                        action: "process",
                        recipeId,
                        batches,
                      })
                    }
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : tab === "craft" ? (
        <div className="space-y-3">
          <RanchFeedRecipeCard
            recipe={data.ranchCraftingRecipe}
            busy={busy !== null}
            onCraft={(quantity, cropSelection) =>
              void craftRanchFeed(quantity, undefined, cropSelection)
            }
          />
          <FailedDishFeedRecipeCard
            recipe={data.failedDishFeedRecipe}
            failedCookingDishes={data.failedCookingDishes}
            busy={busy !== null}
            onCraft={(quantity) =>
              void craftRanchFeed(quantity, data.failedDishFeedRecipe.id)
            }
          />
          {VISIBLE_LIFE_CRAFTING_KINDS.map((kind) => (
            <Card key={kind} padding="md">
              <h2 className="text-sm font-bold">{kind === "aid" ? "생활 보조품" : "숙소 가구"}</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {kind === "aid" ? "보조품은 필요한 때 직접 켜서 사용하며, 실패하거나 대상 등급이 맞지 않으면 소모되지 않습니다." : "제작한 가구는 숙소 꾸미기에서 배치할 수 있으며 전투 능력치는 제공하지 않습니다."}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.craftingRecipes.filter((recipe) => recipe.kind === kind).map((recipe) => {
                  const hiddenUnknown = recipe.hidden && !recipe.learned;
                  const owned = data.state.crafting.balances[recipe.outputId] ?? 0;
                  return (
                    <div key={recipe.id} className={`${SURFACE_INSET} p-3`}>
                      <div className="flex items-start gap-3">
                        <LifeAidArtwork recipe={recipe} hidden={hiddenUnknown} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-bold">{hiddenUnknown ? "숨겨진 도안" : recipe.name}</div>
                            <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-300">보유 {owned}</span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                            {hiddenUnknown
                              ? `${lifeBlueprintSourceLabel(recipe.blueprintSource)} 활동 중 아주 낮은 확률로 발견됩니다.`
                              : recipe.description}
                          </p>
                        </div>
                      </div>
                      {!hiddenUnknown ? (
                        <>
                          <div className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300">{requirementText(recipe.costs, data.materials, recipe.failedDishCost, data.failedCookingDishes)}</div>
                          <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                            {personalCraftGoldCostText({
                              baseGoldCost:
                                data.personalCraftGoldCost?.baseGoldCost ?? 0,
                              goldCost:
                                data.personalCraftGoldCost?.goldCost ?? 0,
                              liberationDiscountPct:
                                data.personalCraftGoldCost
                                  ?.liberationDiscountPct ??
                                data.liberationDiscountPct ??
                                0,
                            })}
                          </div>
                          <div className="mt-1 text-[10px] text-zinc-500">제작 기록 {recipe.craftCount}회 · 단계 {recipe.masteryStage}/5 · 일괄 한도 {recipe.batchLimit}</div>
                          <div className="mt-2">
                            <LifeWorkshopQuantityControls
                              maxQuantity={recipe.maxCraftable}
                              unit="개"
                              actionLabel="제작"
                              inputLabel={`${recipe.name} 제작 수량`}
                              busy={busy !== null}
                              onSubmit={(quantity) =>
                                void mutate(`craft:${recipe.id}:${quantity}`, {
                                  action: "craft",
                                  recipeId: recipe.id,
                                  quantity,
                                })
                              }
                            />
                            {recipe.maxCraftable === 0 ? <span className="self-center text-[11px] text-rose-600">{recipe.failedDishCost ? "실패 음식 또는 레벨 부족" : "재료 또는 레벨 부족"}</span> : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      ) : tab === "aids" ? (
        <Card padding="md">
          <h2 className="text-sm font-bold">사용 중인 생활 보조품</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            제작한 보조품을 활동별로 하나씩 활성화합니다. 효과가 적용되는 등급에서
            성공한 행동에만 남은 횟수가 줄며, 사용을 끄면 소모되지 않습니다. 다른
            등급으로 변경해도 기존 보조품의 남은 횟수는 보관됩니다.
          </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(["woodcutting", "mining", "fishing"] as const).map((activity) => {
                const active = data.state.crafting.activeAids[activity];
                const activeRecipe = active
                  ? LIFE_CRAFTING_RECIPES.find(
                      (recipe) => recipe.outputId === active.itemId,
                    )
                  : null;
                const candidates = LIFE_CRAFTING_RECIPES.filter((recipe) => recipe.kind === "aid" && ((activity === "woodcutting" && recipe.outputId.startsWith("logging_wedge_")) || (activity === "mining" && recipe.outputId.startsWith("mining_probe_")) || (activity === "fishing" && recipe.outputId === "tidy_bait_box")));
                const availableCandidates = candidates.filter(
                  (recipe) =>
                    recipe.outputId !== active?.itemId &&
                    ((data.state.crafting.balances[recipe.outputId] ?? 0) > 0 ||
                      (data.state.crafting.reserveAidUses[recipe.outputId] ?? 0) > 0),
                );
                const previewRecipe = candidates.find((recipe) => !recipe.hidden) ?? candidates[0];
                return (
                  <div key={activity} className={`${SURFACE_INSET} p-3`}>
                    <div className="font-bold">{lifeBlueprintSourceLabel(activity)}</div>
                    {active ? (
                      <>
                        <div className="mt-2 flex items-start gap-2.5">
                          <LifeAidArtwork recipe={activeRecipe} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold">
                              {activeRecipe?.name ?? active.itemId}
                            </div>
                            <div className="mt-0.5 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                              {activeRecipe?.description}
                            </div>
                            <div className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                              남은 성공 {active.remainingUses.toLocaleString()}회 ·{" "}
                              {active.enabled ? "사용 중" : "일시 정지"}
                            </div>
                          </div>
                        </div>
                        <Button className="mt-2 w-full" size="xs" variant="secondary" disabled={busy !== null} onClick={() => void mutate(`toggle:${activity}`, { action: "toggle_aid", activity })}>{active.enabled ? "사용 끄기" : "사용 켜기"}</Button>
                        {availableCandidates.length > 0 ? (
                          <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                            <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                              다른 보조품으로 변경
                            </div>
                            {availableCandidates.map((recipe) => {
                              const reservedUses = data.state.crafting.reserveAidUses[recipe.outputId] ?? 0;
                              const owned = data.state.crafting.balances[recipe.outputId] ?? 0;
                              return (
                                <div key={recipe.id} className="space-y-1.5">
                                  <div className="flex items-start gap-2.5">
                                    <LifeAidArtwork recipe={recipe} size="sm" />
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-semibold">{recipe.name}</div>
                                      <div className="mt-0.5 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                                        {reservedUses > 0
                                          ? `보관 중 · 남은 성공 ${reservedUses.toLocaleString()}회`
                                          : `보유 ${owned.toLocaleString()}개`}
                                      </div>
                                    </div>
                                  </div>
                                  <Button className="w-full" size="xs" disabled={busy !== null} onClick={() => void mutate(`aid:${recipe.outputId}`, { action: "activate_aid", itemId: recipe.outputId })}>이 보조품으로 변경</Button>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {availableCandidates.map((recipe) => {
                          const reservedUses = data.state.crafting.reserveAidUses[recipe.outputId] ?? 0;
                          return (
                            <div key={recipe.id} className="space-y-1.5 border-t border-zinc-200 pt-2 first:border-t-0 first:pt-0 dark:border-zinc-800">
                              <div className="flex items-start gap-2.5">
                                <LifeAidArtwork recipe={recipe} size="sm" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold">{recipe.name}</div>
                                  <div className="mt-0.5 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                                    {reservedUses > 0
                                      ? `보관 중 · 남은 성공 ${reservedUses.toLocaleString()}회`
                                      : recipe.description}
                                  </div>
                                </div>
                              </div>
                              <Button className="w-full" size="xs" disabled={busy !== null} onClick={() => void mutate(`aid:${recipe.outputId}`, { action: "activate_aid", itemId: recipe.outputId })}>{reservedUses > 0 ? "다시 사용" : "활성화"}</Button>
                            </div>
                          );
                        })}
                        {availableCandidates.length === 0 ? (
                          <div className="flex items-center gap-2.5">
                            <LifeAidArtwork recipe={previewRecipe} size="sm" />
                            <div className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                              활성화 가능한 보조품이 없습니다.
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
        </Card>
      ) : tab === "tools" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.tools.map((tool) => {
            const upgrade = tool.nextUpgrade;
            const enough = upgrade
              ? Object.entries(upgrade.materials).every(([id, amount]) => (data.materials[id] ?? 0) >= amount)
              : false;
            return (
              <Card key={tool.activity} padding="md">
                <h2 className="text-sm font-bold">{ACTIVITY_LABEL[tool.activity]} 도구</h2>
                <div className="mt-2 text-base font-extrabold text-amber-700 dark:text-amber-300">
                  {tool.name} · {tool.tier}단계
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  작업 시간 -{tool.durationReductionPct}% · 추가 재료 +{tool.bonusMaterialPct}%
                </p>
                {upgrade ? (
                  <div className={`${SURFACE_INSET} mt-3 p-3`}>
                    <div className="text-xs font-semibold">
                      다음: {LIFE_TOOL_NAMES[tool.activity][upgrade.tier]} · 필요 Lv.{upgrade.requiredLevel}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {requirementText(upgrade.materials, data.materials)}
                    </div>
                    <Button
                      className="mt-2 w-full"
                      size="sm"
                      disabled={!enough || data.levels[tool.activity] < upgrade.requiredLevel || busy !== null}
                      onClick={() => void mutate(`tool:${tool.activity}`, { action: "upgrade_tool", activity: tool.activity })}
                    >
                      도구 승급
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                    최고 단계 도구입니다.
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : tab === "specialization" ? (
        <div className="space-y-3">
          {(["woodcutting", "mining"] as const).map((activity) => {
            const current = data.state.specializations[activity];
            const level = data.levels[activity];
            const changeCost = lifeRespecializationCost(data.state, activity);
            return (
              <Card key={activity} padding="md">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-bold">{ACTIVITY_LABEL[activity]} 전문화</h2>
                  <span className="text-xs text-zinc-500">Lv.{level} / 필요 Lv.{LIFE_SPECIALIZATION_LEVEL}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {LIFE_SPECIALIZATIONS.filter((entry) => entry.activity === activity).map((entry) => {
                    const selected = current === entry.id;
                    const gatheringBonus = lifeGatheringBonusPct(activity, { ...data.state, specializations: { ...data.state.specializations, [activity]: entry.id } }, level);
                    const processingBonus = lifeProcessingGreatSuccessPct(activity, { ...data.state, specializations: { ...data.state.specializations, [activity]: entry.id } }, level);
                    return (
                      <div key={entry.id} className={`${SURFACE_INSET} p-3 ${selected ? "ring-2 ring-amber-400" : ""}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{entry.name}</span>
                          {selected ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-200">선택 중</span> : null}
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{entry.description}</p>
                        <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                          {entry.role === "gathering" ? `추가 재료 +${gatheringBonus}%` : `가공 대성공 ${processingBonus}%`}
                        </p>
                        <Button
                          className="mt-2 w-full"
                          size="xs"
                          variant={selected ? "secondary" : "primary"}
                          disabled={selected || level < LIFE_SPECIALIZATION_LEVEL || busy !== null}
                          onClick={async () => {
                            if (
                              changeCost > 0 &&
                              !(await confirmGameAction(
                                `${changeCost.toLocaleString()}골드를 사용해 전문화를 변경할까요?`,
                              ))
                            ) return;
                            void mutate(`spec:${entry.id}`, { action: "specialize", activity, specializationId: entry.id satisfies LifeSpecializationId });
                          }}
                        >
                          {selected ? "적용 중" : changeCost > 0 ? `${changeCost.toLocaleString()}골드로 변경` : "무료 선택"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card padding="md">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold"><BookOpen size={19} weight="duotone" />가공 도감</h2>
            <span className="text-xs font-semibold text-zinc-500">
              {data.state.processing.discoveredMaterialIds.length}/{Object.keys(LIFE_PROCESSED_MATERIALS).length}종
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(LIFE_PROCESSED_MATERIALS) as LifeProcessedMaterialId[]).map((id) => {
              const found = data.state.processing.discoveredMaterialIds.includes(id);
              return (
                <div key={id} className={`${SURFACE_INSET} p-3`}>
                  <Sparkle size={20} weight={found ? "fill" : "duotone"} className={found ? "text-amber-500" : "text-zinc-400"} />
                  <div className={`mt-1 text-xs font-bold ${found ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"}`}>
                    {found ? LIFE_PROCESSED_MATERIALS[id].name : "???"}
                  </div>
                  <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                    {found ? "도감 등록" : "미등록"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            누적 가공 {data.state.processing.batches.toLocaleString()}회 · 대성공 {data.state.processing.greatSuccesses.toLocaleString()}회 · 생활 제작 {data.state.crafting.totalCrafts.toLocaleString()}회 · 숨겨진 도안 {data.state.crafting.learnedHiddenRecipeIds.length}종
          </div>
        </Card>
      )}
    </PageShell>
  );
}
