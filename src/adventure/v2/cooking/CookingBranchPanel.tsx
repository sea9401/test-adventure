"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  COOKING_BRANCH_BY_ID,
  COOKING_BRANCH_CHANGE_COOLDOWN_MS,
  COOKING_BRANCH_MAX_RANK,
  cookingBranchRankForXp,
  cookingBranchesForField,
  type CookingBranch,
} from "./branch";
import { cookingBranchRecipesFor, type CookingBranchRecipe } from "./branchRecipes";
import type { CookingMutation, CookingResponse } from "./clientTypes";
import { cookingEffectText } from "./foodShared";
import { COOKING_METHOD_NAMES, type CookingIngredientId } from "./types";

const COOLDOWN_DAYS = COOKING_BRANCH_CHANGE_COOLDOWN_MS / 86_400_000;
const MAX_QUANTITY = 20;
const ENOUGH_CLASS = "text-zinc-600 dark:text-zinc-300";
const SHORT_CLASS = "text-rose-600 dark:text-rose-400";

function formatChangeDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });
}

function branchMethodText(branch: CookingBranch): string {
  return `${branch.methods.map((method) => COOKING_METHOD_NAMES[method]).join("·")} 요리`;
}

function ingredientName(data: CookingResponse, id: CookingIngredientId): string {
  const [kind, shortId] = id.split(":");
  if (kind === "farm") return data.farmItemDefinitions[shortId]?.name ?? shortId;
  if (kind === "fishing") return data.fishingItemDefinitions[shortId]?.name ?? shortId;
  return (
    data.pantryItems.find((item) => item.id === id)?.name ??
    data.processingRecipes.find((item) => item.outputId === id)?.name ??
    shortId
  );
}

function ingredientHeld(data: CookingResponse, id: CookingIngredientId): number {
  const [kind, shortId] = id.split(":");
  const held =
    kind === "farm"
      ? (data.farmItems as Record<string, number | undefined>)[shortId]
      : kind === "fishing"
        ? (data.fishingItems as Record<string, number | undefined>)[shortId]
        : (data.kitchenItems as Record<string, number | undefined>)[id];
  return Math.max(0, Math.floor(Number(held) || 0));
}

export function CookingBranchPanel({
  data,
  busy,
  mutate,
}: {
  data: CookingResponse;
  busy: boolean;
  mutate: CookingMutation;
}) {
  const [changing, setChanging] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const view = data.branch;
  const specialtyField = data.cooking.specialty?.field ?? null;
  const current = view.current ? COOKING_BRANCH_BY_ID.get(view.current) ?? null : null;
  const options = specialtyField
    ? cookingBranchesForField(specialtyField).filter((branch) => branch.id !== current?.id)
    : [];
  const showOptions = view.eligible && (current === null || changing);

  const choose = async (branch: CookingBranch) => {
    const confirmed = await confirmGameAction(
      current
        ? {
            title: "특화 변경",
            message: `${branch.name} 특화로 바꾸면 ${COOLDOWN_DAYS}일 동안 다시 바꿀 수 없습니다. 쌓은 특화 숙련은 특화마다 그대로 남습니다.`,
            confirmLabel: "변경",
          }
        : {
            title: "특화 선택",
            message: `${branch.name} 특화를 고릅니다. 나중에 바꿀 수 있지만, 바꾼 뒤에는 ${COOLDOWN_DAYS}일 동안 다시 바꿀 수 없습니다.`,
            confirmLabel: "선택",
          },
    );
    if (!confirmed) return;
    setChanging(false);
    await mutate({ action: "choose_branch", branchId: branch.id });
  };

  return (
    <section className={`${SURFACE_CARD} p-4`} aria-labelledby="cooking-branch-title">
      <h3 id="cooking-branch-title" className="font-bold text-zinc-900 dark:text-zinc-100">
        특화
      </h3>

      {!view.eligible ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          전문 분야 랭크 5가 되면 전문 분야 안에서 특화를 고를 수 있습니다.
        </p>
      ) : current ? (
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
              {current.name} 특화 · 랭크 {view.rank}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
              <span>
                {view.nextRankXp === null
                  ? `특화 숙련 ${view.xp.toLocaleString("ko-KR")} · 최고 랭크`
                  : `특화 숙련 ${view.xp.toLocaleString("ko-KR")} / ${view.nextRankXp.toLocaleString("ko-KR")}`}
              </span>
              <span>걸작 확률 +{view.masterpieceBonusPct}%p</span>
            </p>
            {view.nextChangeAt !== null ? (
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                {formatChangeDate(view.nextChangeAt)}부터 변경할 수 있습니다.
              </p>
            ) : null}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-10 shrink-0"
            aria-label="특화 변경"
            aria-expanded={changing}
            disabled={busy || view.nextChangeAt !== null || options.length === 0}
            onClick={() => setChanging((open) => !open)}
          >
            {changing ? "변경 취소" : "변경"}
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          특화를 하나 고르면 그 계열 음식의 걸작 확률이 오르고 전용 요리를 만들 수 있습니다.
        </p>
      )}

      {showOptions ? (
        <ul className="mt-3 divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
          {options.map((branch) => (
            <BranchOption
              key={branch.id}
              branch={branch}
              savedXp={view.xpByBranch[branch.id] ?? 0}
              busy={busy}
              onChoose={() => void choose(branch)}
            />
          ))}
        </ul>
      ) : null}

      {current ? (
        <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              전용 요리
            </h4>
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              제작 수량
              <input
                type="number"
                min={1}
                max={MAX_QUANTITY}
                value={quantity}
                aria-label="제작 수량"
                onChange={(event) =>
                  setQuantity(
                    Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(event.target.value) || 1))),
                  )
                }
                className="h-10 w-16 rounded-md border border-zinc-300 bg-white px-2 text-right text-sm tabular-nums text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          </div>
          <ul className={`${SURFACE_INSET} mt-2 divide-y divide-zinc-200 px-3 dark:divide-zinc-700`}>
            {cookingBranchRecipesFor(current.id).map((dish) => (
              <BranchDishRow
                key={dish.id}
                data={data}
                dish={dish}
                rank={view.rank}
                quantity={quantity}
                busy={busy}
                onCraft={() =>
                  void mutate({ action: "craft", recipeId: dish.id, quantity })
                }
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function BranchOption({
  branch,
  savedXp,
  busy,
  onChoose,
}: {
  branch: CookingBranch;
  savedXp: number;
  busy: boolean;
  onChoose: () => void;
}) {
  return (
    <li
      data-testid={`cooking-branch-option-${branch.id}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-3"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {branch.name}
          </span>
          <span className="text-xs text-zinc-600 dark:text-zinc-300">
            {branchMethodText(branch)}
          </span>
        </p>
        <ul className="mt-1 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-300">
          {cookingBranchRecipesFor(branch.id).map((dish) => (
            <li key={dish.id}>
              {`랭크 ${dish.requiredRank} · ${dish.name} · ${cookingEffectText(dish.effect)}`}
            </li>
          ))}
        </ul>
        {savedXp > 0 ? (
          <p className="mt-1 text-xs tabular-nums text-emerald-700 dark:text-emerald-300">
            {`쌓아 둔 숙련 ${savedXp.toLocaleString("ko-KR")} · 랭크 ${cookingBranchRankForXp(savedXp)}`}
          </p>
        ) : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="min-h-10"
        aria-label={`${branch.name} 특화 선택`}
        disabled={busy}
        onClick={onChoose}
      >
        선택
      </Button>
    </li>
  );
}

function BranchDishRow({
  data,
  dish,
  rank,
  quantity,
  busy,
  onCraft,
}: {
  data: CookingResponse;
  dish: CookingBranchRecipe;
  rank: number;
  quantity: number;
  busy: boolean;
  onCraft: () => void;
}) {
  const rankLocked = rank < dish.requiredRank;
  const levelLocked = data.level < dish.requiredLevel;
  const costs = dish.ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredientName(data, ingredient.id),
    held: ingredientHeld(data, ingredient.id),
    need: ingredient.count * quantity,
  }));
  const short = costs.some((cost) => cost.held < cost.need);

  return (
    <li
      data-testid={`cooking-branch-dish-${dish.id}`}
      className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-3 py-3"
    >
      <Image
        src={dish.imageSrc}
        alt=""
        width={48}
        height={48}
        unoptimized
        className="size-12 shrink-0 object-contain"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {dish.name}
        </p>
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          {cookingEffectText(dish.effect)}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
          {costs.map((cost) => (
            <span key={cost.id} className={cost.held >= cost.need ? ENOUGH_CLASS : SHORT_CLASS}>
              {`${cost.name} ${cost.held.toLocaleString("ko-KR")} / ${cost.need.toLocaleString("ko-KR")}`}
            </span>
          ))}
        </p>
        {rankLocked ? (
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {`특화 랭크 ${Math.min(dish.requiredRank, COOKING_BRANCH_MAX_RANK)}에서 열립니다.`}
          </p>
        ) : levelLocked ? (
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {`요리 Lv ${dish.requiredLevel}부터 만들 수 있습니다.`}
          </p>
        ) : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="min-h-10"
        aria-label={`${dish.name} 제작`}
        disabled={busy || rankLocked || levelLocked || short}
        onClick={onCraft}
      >
        제작
      </Button>
    </li>
  );
}
