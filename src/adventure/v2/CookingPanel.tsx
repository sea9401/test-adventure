"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Star } from "@phosphor-icons/react";
import { SURFACE_ACCENT, SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { FARM_CROP_LIST, FARM_ITEMS, type FarmItemInventory } from "./farm";
import {
  COOKING_SURPLUS_BATCH_SIZE,
  COOKING_SURPLUS_DAILY_LIMIT,
  cookingIngredientRequirement,
  type CookingOrder,
  type CookingRecipe,
  type CookingState,
} from "./cooking";
import type { EquippedCookingBonuses } from "@/adventure/data/v2/v2Skills";
import {
  FISHING_CATCH_ITEMS,
  type FishingCatchItemId,
} from "./fishingStock";

type CookingResponse = {
  ok: boolean;
  now: number;
  cooking: CookingState;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  recipes: CookingRecipe[];
  orders: CookingOrder[];
  farmItems: FarmItemInventory;
  farmReputation: number;
  fishingItems: Partial<Record<FishingCatchItemId, number>>;
  cookingJobId: string | null;
  cookingJobName: string | null;
  cookingJobTier: number;
  cookingSkillBonuses: EquippedCookingBonuses;
  result?: {
    recipeName: string;
    action: "cook" | "order";
    quantity: number;
    quality: string;
    earnedXp: number;
    savedRareIngredients: number;
  };
};

type RecipeFilter = "all" | "available" | "favorite";

const ERROR_TEXT: Record<string, string> = {
  recipe_locked: "아직 요리 레벨이 부족합니다.",
  not_enough_farm_items: "농장 재료가 부족합니다.",
  not_enough_fishing_items: "낚시 보관함의 어획물이 부족합니다.",
  order_unavailable: "오늘 받을 수 없는 주문입니다.",
  daily_limit: "오늘의 떨이 교환 횟수를 모두 사용했습니다.",
  not_enough_items: "교환할 작물이 부족합니다.",
};

async function fetchCookingData(): Promise<CookingResponse> {
  const response = await fetch("/api/v2/cooking", { cache: "no-store" });
  const json = await response.json() as CookingResponse & { error?: string };
  if (!response.ok || !json.ok) throw new Error(json.error ?? "load_failed");
  return json;
}

export function CookingPanel({ onFarmChanged }: { onFarmChanged?: () => void }) {
  const [data, setData] = useState<CookingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<RecipeFilter>("all");
  const [useRareByRecipe, setUseRareByRecipe] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    try {
      setData(await fetchCookingData());
    } catch {
      setNotice("주방 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCookingData()
      .then(setData)
      .catch(() => setNotice("주방 상태를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  const cook = useCallback(async (
    recipe: CookingRecipe,
    action: "cook" | "order",
    quantity = 1,
  ) => {
    setBusy(`${action}:${recipe.id}`);
    setNotice(null);
    try {
      const response = await fetch("/api/v2/cooking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipeId: recipe.id,
          action,
          quantity,
          useRare: action === "cook" && useRareByRecipe[recipe.id] === true,
        }),
      });
      const json = await response.json() as CookingResponse & { error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error ?? "cooking_failed");
      setData(json);
      const result = json.result;
      setNotice(
        result
          ? result.action === "order"
            ? `${result.recipeName} 주문 납품 완료 · 요리 XP +${result.earnedXp}`
            : `${result.recipeName} ${result.quantity}개 완성 · ${qualityName(result.quality)} · 인벤토리에 보관 · 요리 XP +${result.earnedXp}${result.savedRareIngredients > 0 ? ` · 희귀 재료 ${result.savedRareIngredients}개 보존` : ""}`
          : "요리를 완성했습니다.",
      );
      onFarmChanged?.();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setNotice(ERROR_TEXT[code] ?? "요리를 완성하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }, [onFarmChanged, useRareByRecipe]);

  const toggleFavorite = useCallback(async (recipeId: string) => {
    setBusy(`favorite:${recipeId}`);
    try {
      const response = await fetch("/api/v2/cooking", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      if (!response.ok) throw new Error();
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const exchange = useCallback(async (itemId: string, batches: number) => {
    setBusy(`surplus:${itemId}`);
    setNotice(null);
    try {
      const response = await fetch("/api/v2/cooking/surplus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, batches }),
      });
      const json = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error ?? "exchange_failed");
      setNotice(`${FARM_ITEMS[itemId as keyof typeof FARM_ITEMS]?.name ?? itemId} ${batches * COOKING_SURPLUS_BATCH_SIZE}개를 농장 증표 ${batches}개로 교환했습니다.`);
      await refresh();
      onFarmChanged?.();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setNotice(ERROR_TEXT[code] ?? "떨이 교환에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }, [onFarmChanged, refresh]);

  const recipes = useMemo(() => {
    if (!data) return [];
    return data.recipes
      .filter((recipe) => {
        if (filter === "favorite") return data.cooking.favoriteRecipeIds.includes(recipe.id);
        if (filter === "available") return maxCookable(recipe, data, useRareByRecipe[recipe.id] === true) > 0;
        return true;
      })
      .sort((a, b) => {
        const af = data.cooking.favoriteRecipeIds.includes(a.id) ? 1 : 0;
        const bf = data.cooking.favoriteRecipeIds.includes(b.id) ? 1 : 0;
        return bf - af || a.requiredLevel - b.requiredLevel;
      });
  }, [data, filter, useRareByRecipe]);

  if (loading && !data) {
    return <div className={`${SURFACE_CARD} p-6 text-center text-sm text-zinc-500`}>주방을 정리하는 중...</div>;
  }
  if (!data) {
    return <div className={`${SURFACE_CARD} p-6 text-center text-sm text-zinc-500`}>주방을 불러오지 못했습니다.</div>;
  }

  const levelProgress = data.nextLevelXp == null
    ? 100
    : Math.max(0, Math.min(100, ((data.cooking.xp - data.currentLevelXp) / (data.nextLevelXp - data.currentLevelXp)) * 100));

  return (
    <div className="space-y-4">
      {notice ? (
        <div role="status" className={`${SURFACE_ACCENT} px-3 py-2 text-sm font-semibold text-amber-950 dark:text-amber-100`}>
          {notice}
        </div>
      ) : null}

      <section className={`${SURFACE_CARD} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">🍳 개인 주방 · 요리 Lv {data.level}</h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              농작물과 어획물을 거래 가능한 음식으로 조리합니다. 완성된 음식은 인벤토리 소모품에서 사용합니다.
            </p>
          </div>
          <div className="text-right text-xs text-zinc-600 dark:text-zinc-300">
            <div>{data.cookingJobName ?? "요리 직업 미전직"}</div>
            {data.cookingJobTier > 0 ? <div>{chefBenefitText(data.cookingJobTier)}</div> : null}
            {cookingSkillBenefitText(data.cookingSkillBonuses) ? (
              <div className="mt-1 text-emerald-700 dark:text-emerald-300">
                장착 스킬: {cookingSkillBenefitText(data.cookingSkillBonuses)}
              </div>
            ) : null}
            <div>농장 증표 {data.farmReputation}</div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div className="h-full bg-amber-500" style={{ width: `${levelProgress}%` }} />
        </div>
        <div className="mt-1 text-right text-[11px] text-zinc-500">
          {data.nextLevelXp == null ? "최고 레벨" : `${data.cooking.xp} / ${data.nextLevelXp} XP`}
        </div>
      </section>

      <OrderBoard data={data} busy={busy} onCook={cook} />

      <section className={`${SURFACE_CARD} p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">요리책</h3>
            <p className="text-xs text-zinc-500">완성 도감 {data.cooking.discoveredRecipeIds.length} / {data.recipes.length}</p>
          </div>
          <div className="flex gap-1">
            {(["all", "available", "favorite"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${filter === key ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"}`}
              >
                {key === "all" ? "전체" : key === "available" ? "조리 가능" : "즐겨찾기"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {recipes.map((recipe) => {
            const unlocked = data.level >= recipe.requiredLevel;
            const useRare = useRareByRecipe[recipe.id] === true;
            const max = maxCookable(recipe, data, useRare);
            const favorite = data.cooking.favoriteRecipeIds.includes(recipe.id);
            return (
              <article key={recipe.id} className={`${SURFACE_INSET} flex flex-col p-3`}>
                <div className="flex items-start gap-2">
                  <Image
                    src={recipe.imageSrc}
                    alt=""
                    width={72}
                    height={72}
                    unoptimized
                    className="h-[72px] w-[72px] shrink-0 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-zinc-900 dark:text-zinc-100">{recipe.name}</h4>
                      <button
                        type="button"
                        aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                        onClick={() => void toggleFavorite(recipe.id)}
                        className="text-amber-500"
                      >
                        <Star size={19} weight={favorite ? "fill" : "regular"} />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500">요리 Lv {recipe.requiredLevel} · {recipe.description}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      {data.cooking.discoveredRecipeIds.includes(recipe.id) ? "도감 등록 완료" : "첫 완성 시 도감 등록"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {ingredientText(recipe, data)}
                </div>
                <div className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  효과: {statText(recipe.baseStatPct)}
                </div>
                {recipe.optionalRareItemId ? (
                  <label className="mt-2 flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={useRare}
                      onChange={(event) => setUseRareByRecipe((current) => ({ ...current, [recipe.id]: event.target.checked }))}
                    />
                    희귀 재료 사용: {FARM_ITEMS[recipe.optionalRareItemId].name} ({data.farmItems[recipe.optionalRareItemId] ?? 0}개)
                  </label>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                  {[1, 5, Math.min(20, max)].filter((value, index, values) => value > 0 && values.indexOf(value) === index).map((quantity) => (
                    <button
                      key={quantity}
                      type="button"
                      disabled={!unlocked || max < quantity || busy != null}
                      onClick={() => void cook(recipe, "cook", quantity)}
                      className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                    >
                      {busy === `cook:${recipe.id}` ? "조리 중..." : quantity === Math.min(20, max) && quantity !== 1 && quantity !== 5 ? `최대 ${quantity}개 조리` : `${quantity}개 조리`}
                    </button>
                  ))}
                  {!unlocked ? <span className="self-center text-xs text-rose-600">레벨 부족</span> : max === 0 ? <span className="self-center text-xs text-rose-600">재료 부족</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <SurplusExchange data={data} busy={busy} onExchange={exchange} />
    </div>
  );
}

function OrderBoard({
  data,
  busy,
  onCook,
}: {
  data: CookingResponse;
  busy: string | null;
  onCook: (recipe: CookingRecipe, action: "order", quantity?: number) => void;
}) {
  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <h3 className="font-bold text-zinc-900 dark:text-zinc-100">오늘의 선술집 주문</h3>
      <p className="mt-1 text-xs text-zinc-500">매일 3건이 바뀌며 골드, 농장 증표, 추가 요리 XP를 줍니다.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {data.orders.map((order) => {
          const recipe = data.recipes.find((entry) => entry.id === order.recipeId);
          if (!recipe) return null;
          const done = data.cooking.daily.completedOrderIds.includes(order.id);
          const possible = maxCookable(recipe, data, false) > 0;
          return (
            <div key={order.id} className={`${SURFACE_INSET} p-3 text-sm`}>
              <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
                <Image
                  src={recipe.imageSrc}
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 shrink-0 object-contain"
                />
                <span>{recipe.name}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">{order.rewardGold.toLocaleString()} 골드 · 증표 {order.rewardReputation} · XP +{order.bonusXp}</div>
              <button
                type="button"
                disabled={done || !possible || busy != null}
                onClick={() => onCook(recipe, "order")}
                className="mt-2 w-full rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white disabled:bg-zinc-400"
              >
                {done ? "납품 완료" : busy === `order:${recipe.id}` ? "조리 중..." : possible ? "조리해 납품" : "재료 부족"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SurplusExchange({
  data,
  busy,
  onExchange,
}: {
  data: CookingResponse;
  busy: string | null;
  onExchange: (itemId: string, batches: number) => void;
}) {
  const remaining = COOKING_SURPLUS_DAILY_LIMIT - data.cooking.daily.surplusTrades;
  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <h3 className="font-bold text-zinc-900 dark:text-zinc-100">일반 작물 떨이 교환</h3>
      <p className="mt-1 text-xs text-zinc-500">일반 작물 20개를 농장 증표 1개로 교환합니다. 오늘 남은 횟수 {remaining}회.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {FARM_CROP_LIST.map((crop) => {
          const owned = data.farmItems[crop.itemId] ?? 0;
          const possible = Math.min(remaining, Math.floor(owned / COOKING_SURPLUS_BATCH_SIZE));
          return (
            <div key={crop.itemId} className={`${SURFACE_INSET} flex items-center justify-between gap-2 p-2.5 text-sm`}>
              <span>{FARM_ITEMS[crop.itemId].icon} {crop.itemName} <strong>{owned}</strong>개</span>
              <button
                type="button"
                disabled={possible < 1 || busy != null}
                onClick={() => onExchange(crop.itemId, possible)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold dark:border-zinc-600 dark:bg-zinc-800 disabled:opacity-50"
              >
                {possible > 1 ? `${possible}회 교환` : "1회 교환"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function maxCookable(recipe: CookingRecipe, data: CookingResponse, useRare: boolean): number {
  for (let quantity = 20; quantity >= 1; quantity -= 1) {
    const hasFarmIngredients = Object.entries(recipe.farmIngredients).every(
      ([itemId, rawCount]) =>
        (data.farmItems[itemId as keyof FarmItemInventory] ?? 0) >=
        cookingIngredientRequirement({
          countPerDish: rawCount ?? 0,
          quantity,
          cookingJobTier: data.cookingJobTier,
          materialReductionPct:
            data.cookingSkillBonuses.materialReductionPct,
        }),
    );
    const hasFishingIngredients = Object.entries(
      recipe.fishingIngredients ?? {},
    ).every(
      ([itemId, rawCount]) =>
        (data.fishingItems[itemId as FishingCatchItemId] ?? 0) >=
        cookingIngredientRequirement({
          countPerDish: rawCount ?? 0,
          quantity,
          materialReductionPct:
            data.cookingSkillBonuses.materialReductionPct,
        }),
    );
    const hasRareIngredient =
      !useRare ||
      !recipe.optionalRareItemId ||
      (data.farmItems[recipe.optionalRareItemId] ?? 0) >= quantity;
    if (hasFarmIngredients && hasFishingIngredients && hasRareIngredient) {
      return quantity;
    }
  }
  return 0;
}

function ingredientText(recipe: CookingRecipe, data: CookingResponse): string {
  const parts: string[] = [];
  for (const [itemId, rawCount] of Object.entries(recipe.farmIngredients)) {
    const count = cookingIngredientRequirement({
      countPerDish: rawCount ?? 0,
      quantity: 1,
      cookingJobTier: data.cookingJobTier,
      materialReductionPct: data.cookingSkillBonuses.materialReductionPct,
    });
    parts.push(`${FARM_ITEMS[itemId as keyof typeof FARM_ITEMS]?.name ?? itemId} ${count} (${data.farmItems[itemId as keyof FarmItemInventory] ?? 0})`);
  }
  for (const [itemId, rawCount] of Object.entries(recipe.fishingIngredients ?? {})) {
    const fishId = itemId as FishingCatchItemId;
    const count = cookingIngredientRequirement({
      countPerDish: rawCount ?? 0,
      quantity: 1,
      materialReductionPct: data.cookingSkillBonuses.materialReductionPct,
    });
    parts.push(`${FISHING_CATCH_ITEMS[fishId].name} ${count} (${data.fishingItems[fishId] ?? 0})`);
  }
  return `재료: ${parts.join(" · ")}`;
}

function statText(stats: Partial<Record<string, number>>): string {
  return Object.entries(stats).map(([key, value]) => `${key.toUpperCase()} +${value}%`).join(" · ");
}

function qualityName(quality: string): string {
  return quality === "masterpiece" ? "걸작" : quality === "careful" ? "정성작" : "일반";
}

function chefBenefitText(tier: number): string {
  if (tier >= 6) return "XP +10% · 재료 10% 절약 · 지속 +25% · 희귀 재료 걸작 확정";
  if (tier >= 5) return "XP +10% · 재료 10% 절약 · 지속 +25%";
  if (tier >= 4) return "XP +10% · 품질 보정 · 재료 10% 절약";
  if (tier >= 3) return "XP +10% · 품질 보정";
  return "요리 XP +10%";
}

function cookingSkillBenefitText(bonuses: EquippedCookingBonuses): string {
  const parts: string[] = [];
  if (bonuses.xpBonusPct > 0) parts.push(`XP +${bonuses.xpBonusPct}%`);
  if (bonuses.carefulChancePct > 0)
    parts.push(`정성작 +${bonuses.carefulChancePct}%`);
  if (bonuses.materialReductionPct > 0)
    parts.push(`일반 재료 -${bonuses.materialReductionPct}%`);
  if (bonuses.masterpieceChancePct > 0)
    parts.push(`걸작 +${bonuses.masterpieceChancePct}%`);
  if (bonuses.rareIngredientSaveChancePct > 0)
    parts.push(`희귀 재료 보존 ${bonuses.rareIngredientSaveChancePct}%`);
  return parts.join(" · ");
}
