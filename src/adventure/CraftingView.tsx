"use client";

import { useMemo, useRef, useState } from "react";
import { Hammer, Sparkle } from "@phosphor-icons/react";
import { ITEMS, type ItemId } from "./data/items";
import { MATERIALS, type MaterialId } from "./data/materials";
import { POTIONS, type PotionId } from "./data/potions";
import {
  RECIPES,
  recipeGoldCost,
  type Recipe,
  type RecipeIngredient,
} from "./data/recipes";
import {
  CRAFT_TIER_NAMES,
  craftTierTextClass,
  craftVarianceSummary,
} from "./data/craftQuality";
import {
  DROP_QUALITY_NAMES,
  dropQualityTextClass,
} from "./data/dropQuality";
import { CRAFT_BATCH_MAX, type EquipPicks } from "./crafting/types";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import {
  EQUIP_TIER_FALLBACK,
  getItemTier,
  groupByTier,
  useTierToggle,
} from "@/adventure/equipment/tier";
import { EquipmentSearchInput } from "@/adventure/equipment/EquipmentSearchInput";
import { TierSectionHeader } from "@/adventure/equipment/TierSectionHeader";

type CraftCategory = "weapon" | "armor" | "accessory" | "potion";

const CATEGORY_TABS: ReadonlyArray<{ key: CraftCategory; label: string }> = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "방어구" },
  { key: "accessory", label: "장신구" },
  { key: "potion", label: "포션" },
];

function recipeCategory(r: Recipe): CraftCategory {
  if (r.result.kind === "potion") return "potion";
  return r.result.slot;
}

function ingredientCount(
  ing: RecipeIngredient,
  materialCounts: Partial<Record<MaterialId, number>>,
  equipmentCounts: Partial<Record<ItemId, number>>,
): { have: number; name: string } {
  if (ing.kind === "material") {
    return {
      have: materialCounts[ing.materialId] ?? 0,
      name: MATERIALS[ing.materialId].name,
    };
  }
  return {
    have: equipmentCounts[ing.itemId] ?? 0,
    name: ITEMS[ing.itemId].name,
  };
}

function ingredientKey(ing: RecipeIngredient): string {
  return ing.kind === "material" ? `m:${ing.materialId}` : `e:${ing.itemId}`;
}

function summarizeResult(r: Recipe): {
  title: string;
  meta: string;
  // 제작 품질 변동 안내 — "공격력 +1~+5" 식. 없으면 null.
  variance: string | null;
} {
  if (r.result.kind === "equipment") {
    const item = ITEMS[r.result.itemId];
    return {
      title: r.name,
      meta: item.stats.map((s) => `${s.label} ${s.value}`).join(" · "),
      variance: craftVarianceSummary(item, r),
    };
  }
  const potion = POTIONS[r.result.potionId];
  const qty = r.result.quantity;
  return {
    title: r.name,
    meta: qty > 1 ? `${potion.name} ×${qty}` : potion.name,
    variance: null,
  };
}

// 한 번 호출로 만들 수 있는 최대 횟수 N — 재료 충분량 ÷ 회당 소비량의 최솟값, 포션 결과면 보유 한도도 함께,
// 절대 상한은 CRAFT_BATCH_MAX. 0 이면 제작 불가.
function maxCraftable(
  r: Recipe,
  materialCounts: Partial<Record<MaterialId, number>>,
  equipmentCounts: Partial<Record<ItemId, number>>,
  potionCounts: Partial<Record<PotionId, number>>,
  potionMax: number,
  gold: number,
): number {
  let cap = CRAFT_BATCH_MAX;
  for (const ing of r.ingredients) {
    const have = ingredientCount(ing, materialCounts, equipmentCounts).have;
    cap = Math.min(cap, Math.floor(have / ing.count));
    if (cap <= 0) return 0;
  }
  if (r.result.kind === "potion") {
    const headroom =
      potionMax - (potionCounts[r.result.potionId] ?? 0);
    cap = Math.min(cap, Math.floor(headroom / r.result.quantity));
  }
  const goldCost = recipeGoldCost(r);
  if (goldCost > 0) cap = Math.min(cap, Math.floor(gold / goldCost));
  return Math.max(0, cap);
}

// 한 itemId 의 등급별 보유 — 모달이 등급 슬롯을 그릴 때 본다.
export type GradedCount = Partial<Record<string, number>>;

export function CraftingView({
  knownIds,
  craftedIds,
  materialCounts,
  equipmentCounts,
  baseEquipmentCounts,
  craftedEquipmentCounts,
  droppedEquipmentCounts,
  potionCounts,
  potionMax,
  gold,
  onCraft,
}: {
  knownIds: string[];
  /** 한 번이라도 제작한 적 있는 레시피 ID. 카드에 "첫 제작 보호" 라벨 표시 여부 판단. */
  craftedIds: string[];
  materialCounts: Partial<Record<MaterialId, number>>;
  /** 등급 합산 — "have/need" 표시용. */
  equipmentCounts: Partial<Record<ItemId, number>>;
  /** 기본(0 등급) 카운트. */
  baseEquipmentCounts: Partial<Record<ItemId, number>>;
  /** 제작산 등급별 인스턴스 — 모달 슬롯용. */
  craftedEquipmentCounts: Partial<Record<ItemId, GradedCount>>;
  /** 드랍산 등급별 인스턴스 — 모달 슬롯용. */
  droppedEquipmentCounts: Partial<Record<ItemId, GradedCount>>;
  potionCounts: Partial<Record<PotionId, number>>;
  potionMax: number;
  /** 보유 골드 — 제작 골드 비용 표시·affordability(maxCraftable 상한). */
  gold: number;
  onCraft: (recipe: Recipe, quantity?: number, equipPicks?: EquipPicks) => void;
}) {
  const knownRecipes = RECIPES.filter((r) => knownIds.includes(r.id));
  const [tab, setTab] = useState<CraftCategory>("weapon");
  const [query, setQuery] = useState("");
  // 카테고리 + 이름 부분 일치 필터.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return knownRecipes.filter((r) => {
      if (recipeCategory(r) !== tab) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q);
    });
  }, [knownRecipes, tab, query]);
  // 장비 카테고리는 진행 티어로 그룹, 포션은 평면 — getItemTier 가 비장비 결과엔 fallback 반환.
  const grouped = useMemo(() => {
    if (tab === "potion") return null;
    return groupByTier(filtered, (r) =>
      r.result.kind === "equipment"
        ? getItemTier(r.result.itemId)
        : EQUIP_TIER_FALLBACK,
    );
  }, [filtered, tab]);
  // 티어 접기/펴기 — 기본 접힘. 검색 활성 시 강제 펼침.
  const { isExpanded, toggle } = useTierToggle();
  const searching = query.trim().length > 0;
  const tabLabel = CATEGORY_TABS.find((t) => t.key === tab)?.label ?? "";

  if (knownRecipes.length === 0) {
    return (
      <EmptyState
        icon={<Hammer size={40} weight="duotone" />}
        title="아직 등록된 제작서가 없습니다"
        message="제작서를 손에 넣으면 여기에 자동으로 등록됩니다."
      />
    );
  }

  return (
    <div className="space-y-3">
      <TabBar
        tabs={CATEGORY_TABS}
        active={tab}
        onChange={(k) => {
          setTab(k);
          setQuery("");
        }}
        ariaLabel="대장간 카테고리"
      />
      <EquipmentSearchInput value={query} onChange={setQuery} />
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Hammer size={40} weight="duotone" />}
          title={
            query
              ? `“${query}” — 일치하는 ${tabLabel} 제작서가 없습니다`
              : `${tabLabel} 제작서가 없습니다`
          }
          message={
            query
              ? "다른 키워드로 검색해 보세요."
              : "제작서를 손에 넣으면 여기에 자동으로 등록됩니다."
          }
        />
      ) : grouped ? (
        // 장비 — 티어별 카드 묶음.
        grouped.map(({ tier, meta, entries }) => {
          const open = searching || isExpanded(tier);
          return (
            <Card key={tier} as="section" padding="md">
              <div className="space-y-2">
                <TierSectionHeader
                  meta={meta}
                  count={entries.length}
                  expanded={open}
                  onToggle={() => toggle(tier)}
                />
                {open &&
                  entries.map((r) => (
                    <RecipeRow
                      key={r.id}
                      recipe={r}
                      firstCraft={!craftedIds.includes(r.id)}
                      materialCounts={materialCounts}
                      equipmentCounts={equipmentCounts}
                      baseEquipmentCounts={baseEquipmentCounts}
                      craftedEquipmentCounts={craftedEquipmentCounts}
                      droppedEquipmentCounts={droppedEquipmentCounts}
                      potionCounts={potionCounts}
                      potionMax={potionMax}
                      gold={gold}
                      onCraft={onCraft}
                    />
                  ))}
              </div>
            </Card>
          );
        })
      ) : (
        // 포션 — 평면 리스트.
        <Card as="section" padding="md">
          <div className="space-y-2">
            {filtered.map((r) => (
              <RecipeRow
                key={r.id}
                recipe={r}
                firstCraft={!craftedIds.includes(r.id)}
                materialCounts={materialCounts}
                equipmentCounts={equipmentCounts}
                baseEquipmentCounts={baseEquipmentCounts}
                craftedEquipmentCounts={craftedEquipmentCounts}
                droppedEquipmentCounts={droppedEquipmentCounts}
                potionCounts={potionCounts}
                potionMax={potionMax}
                gold={gold}
                onCraft={onCraft}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// 한 레시피 카드 — 수량 입력 + "최대" 버튼 + "제작 ×N" 버튼.
// 수량 state 는 행마다 독립이라 페이지/탭이 바뀌어도 보이는 행은 1 로 새로 시작한다.
function RecipeRow({
  recipe,
  firstCraft,
  materialCounts,
  equipmentCounts,
  baseEquipmentCounts,
  craftedEquipmentCounts,
  droppedEquipmentCounts,
  potionCounts,
  potionMax,
  gold,
  onCraft,
}: {
  recipe: Recipe;
  /** 이 레시피로 한 번도 만든 적이 없으면 true — "첫 제작 보호" 라벨을 띄운다. */
  firstCraft: boolean;
  materialCounts: Partial<Record<MaterialId, number>>;
  equipmentCounts: Partial<Record<ItemId, number>>;
  baseEquipmentCounts: Partial<Record<ItemId, number>>;
  craftedEquipmentCounts: Partial<Record<ItemId, GradedCount>>;
  droppedEquipmentCounts: Partial<Record<ItemId, GradedCount>>;
  potionCounts: Partial<Record<PotionId, number>>;
  potionMax: number;
  gold: number;
  onCraft: (recipe: Recipe, quantity?: number, equipPicks?: EquipPicks) => void;
}) {
  const { title, meta, variance } = summarizeResult(recipe);
  const goldCost = recipeGoldCost(recipe);
  const max = useMemo(
    () =>
      maxCraftable(
        recipe,
        materialCounts,
        equipmentCounts,
        potionCounts,
        potionMax,
        gold,
      ),
    [recipe, materialCounts, equipmentCounts, potionCounts, potionMax, gold],
  );

  // 수량 입력 상태 — 사용자 의도를 그대로 들고 있다가, "제작" 누를 때 1..max 로 clamp.
  // max 가 0 이 되거나 줄어들면 버튼은 disabled 로, 입력 자체는 비우지 않는다(타이핑 중 끊기지 않게).
  const [qty, setQty] = useState(1);
  const effectiveQty = Math.min(Math.max(1, qty), Math.max(1, max));
  const canCraft = max > 0;
  // 고급 재료 모달 open. 장비 재료가 있는 레시피에만 노출.
  const [pickerOpen, setPickerOpen] = useState(false);
  const equipIngs = recipe.ingredients.filter(
    (i): i is Extract<RecipeIngredient, { kind: "equip" }> => i.kind === "equip",
  );
  const showPicker = equipIngs.length > 0;
  // 포션 결과 한도 자체에 닿아서 max=0 인 케이스는 별도 안내(과거 동작 유지).
  const potionFull =
    recipe.result.kind === "potion" &&
    (potionCounts[recipe.result.potionId] ?? 0) >= potionMax;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </span>
        <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
          {meta}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        {recipe.description}
      </p>
      {variance && (
        <p className="mt-1 text-xs text-sky-600 dark:text-sky-400">
          품질에 따라 변동 — {variance}
        </p>
      )}
      {variance && firstCraft && (
        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
          첫 제작 보호 — 최소 ⟨일반⟩ 등급 보장
        </p>
      )}
      {recipe.ingredients.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">재료:</span>
          {recipe.ingredients.map((ing) => {
            const { have, name } = ingredientCount(
              ing,
              materialCounts,
              equipmentCounts,
            );
            const enough = have >= ing.count;
            return (
              <span
                key={ingredientKey(ing)}
                className={
                  enough
                    ? "text-zinc-700 dark:text-zinc-300"
                    : "text-rose-600 dark:text-rose-400"
                }
              >
                {name} {have}/{ing.count}
              </span>
            );
          })}
        </div>
      )}
      {goldCost > 0 && (
        <div className="mt-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">제작 비용: </span>
          <span
            className={
              gold >= goldCost
                ? "text-amber-600 dark:text-amber-400"
                : "text-rose-600 dark:text-rose-400"
            }
          >
            {goldCost.toLocaleString()} G
            {effectiveQty > 1
              ? ` × ${effectiveQty} = ${(goldCost * effectiveQty).toLocaleString()} G`
              : ""}
          </span>
        </div>
      )}
      {potionFull && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          포션 보유 한도에 도달해 더 만들 수 없습니다.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          수량
          <input
            type="number"
            min={1}
            max={Math.max(1, max)}
            step={1}
            inputMode="numeric"
            value={qty}
            disabled={!canCraft}
            onChange={(e) => {
              // 빈 문자열 → 1, NaN/소수 → 정수화. 상한은 제작 시점에 clamp 하므로 여기선 약하게만.
              const next = Number.parseInt(e.target.value, 10);
              if (Number.isNaN(next)) setQty(1);
              else setQty(Math.max(1, Math.min(CRAFT_BATCH_MAX, next)));
            }}
            className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm tabular-nums text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <button
          type="button"
          onClick={() => setQty(max)}
          disabled={!canCraft}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          최대 ({max})
        </button>
        <button
          type="button"
          onClick={() => onCraft(recipe, effectiveQty)}
          disabled={!canCraft}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Hammer size={16} weight="duotone" className="text-amber-600" />
          제작{effectiveQty > 1 ? ` ×${effectiveQty}` : ""}
        </button>
        {showPicker && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={!canCraft}
            title="등급 있는 장비를 재료로 태워 결과 등급 확률을 올린다"
            className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300 dark:hover:bg-violet-900"
          >
            <Sparkle size={14} weight="duotone" /> 고급 재료 사용
          </button>
        )}
      </div>
      {pickerOpen && showPicker && (
        <MaterialPickerModal
          recipe={recipe}
          equipIngs={equipIngs}
          quantity={effectiveQty}
          baseEquipmentCounts={baseEquipmentCounts}
          craftedEquipmentCounts={craftedEquipmentCounts}
          droppedEquipmentCounts={droppedEquipmentCounts}
          onClose={() => setPickerOpen(false)}
          onConfirm={(picks) => {
            setPickerOpen(false);
            onCraft(recipe, effectiveQty, picks);
          }}
        />
      )}
    </div>
  );
}

// 슬롯 정의 — 모달이 그리는 등급 행 순서(강한 등급부터, 기본 가운데, 음수 끝).
// "kind"는 인벤 buckets 가운데 어디에서 가져오는지: equipment / craftedEquipment / droppedEquipment.
type PickerSlot = {
  key: string; // 입력 state 키 — itemId 안에서 unique
  kind: "base" | "crafted" | "dropped";
  /** kind 가 crafted/dropped 일 때 등급 키("-2"|"-1"|"1"|"2" / "1"|"2"). base 면 사용 안 함. */
  gradeKey?: string;
  label: string;
  bias: number; // 1.0 / 2.0 / 3.0
  textClass: string;
};

function buildSlots(): PickerSlot[] {
  return [
    {
      key: "c2",
      kind: "crafted",
      gradeKey: "2",
      label: `⟨${CRAFT_TIER_NAMES[2]}⟩`,
      bias: 3,
      textClass: craftTierTextClass(2),
    },
    {
      key: "d2",
      kind: "dropped",
      gradeKey: "2",
      label: DROP_QUALITY_NAMES[2],
      bias: 3,
      textClass: dropQualityTextClass(2),
    },
    {
      key: "c1",
      kind: "crafted",
      gradeKey: "1",
      label: `⟨${CRAFT_TIER_NAMES[1]}⟩`,
      bias: 2,
      textClass: craftTierTextClass(1),
    },
    {
      key: "d1",
      kind: "dropped",
      gradeKey: "1",
      label: DROP_QUALITY_NAMES[1],
      bias: 2,
      textClass: dropQualityTextClass(1),
    },
    {
      key: "base",
      kind: "base",
      label: "기본",
      bias: 1,
      textClass: "text-zinc-600 dark:text-zinc-300",
    },
    {
      key: "c-1",
      kind: "crafted",
      gradeKey: "-1",
      label: `⟨${CRAFT_TIER_NAMES[-1]}⟩`,
      bias: 1,
      textClass: craftTierTextClass(-1),
    },
    {
      key: "c-2",
      kind: "crafted",
      gradeKey: "-2",
      label: `⟨${CRAFT_TIER_NAMES[-2]}⟩`,
      bias: 1,
      textClass: craftTierTextClass(-2),
    },
  ];
}

// 한 itemId 의 슬롯별 보유량을 인벤에서 읽어 반환.
function slotHave(
  slot: PickerSlot,
  itemId: ItemId,
  base: Partial<Record<ItemId, number>>,
  crafted: Partial<Record<ItemId, GradedCount>>,
  dropped: Partial<Record<ItemId, GradedCount>>,
): number {
  if (slot.kind === "base") return base[itemId] ?? 0;
  const map = slot.kind === "crafted" ? crafted[itemId] : dropped[itemId];
  return (map?.[slot.gradeKey ?? ""] ?? 0) as number;
}

function MaterialPickerModal({
  recipe,
  equipIngs,
  quantity,
  baseEquipmentCounts,
  craftedEquipmentCounts,
  droppedEquipmentCounts,
  onClose,
  onConfirm,
}: {
  recipe: Recipe;
  equipIngs: Array<Extract<RecipeIngredient, { kind: "equip" }>>;
  quantity: number;
  baseEquipmentCounts: Partial<Record<ItemId, number>>;
  craftedEquipmentCounts: Partial<Record<ItemId, GradedCount>>;
  droppedEquipmentCounts: Partial<Record<ItemId, GradedCount>>;
  onClose: () => void;
  onConfirm: (picks: EquipPicks) => void;
}) {
  useEscapeKey(onClose);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  const slots = useMemo(() => buildSlots(), []);

  // picks state — itemId 별 슬롯 키 → 갯수. 초기값 0.
  const [picks, setPicks] = useState<
    Partial<Record<ItemId, Record<string, number>>>
  >(() => {
    const init: Partial<Record<ItemId, Record<string, number>>> = {};
    for (const ing of equipIngs) {
      const row: Record<string, number> = {};
      for (const s of slots) row[s.key] = 0;
      init[ing.itemId] = row;
    }
    return init;
  });

  const setPick = (itemId: ItemId, slotKey: string, value: number) => {
    setPicks((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? {}), [slotKey]: Math.max(0, value) },
    }));
  };

  // ingredient 별 합 / 목표.
  const summaries = equipIngs.map((ing) => {
    const need = ing.count * quantity;
    const sum = Object.values(picks[ing.itemId] ?? {}).reduce(
      (a, b) => a + (b ?? 0),
      0,
    );
    return { ing, need, sum };
  });
  const allMatched = summaries.every((s) => s.sum === s.need);
  // 빼어난/걸작(bias=3) 슬롯이 하나라도 0 보다 크면 confirm 강제.
  const hasMasterTier = equipIngs.some((ing) => {
    const p = picks[ing.itemId] ?? {};
    return (p["c2"] ?? 0) > 0 || (p["d2"] ?? 0) > 0;
  });

  const submit = () => {
    if (!allMatched) return;
    if (hasMasterTier) {
      const ok = window.confirm(
        "걸작/빼어난 등급 장비를 재료로 소모합니다. 진행할까요?",
      );
      if (!ok) return;
    }
    // picks state → EquipPicks payload 로 변환. 0 슬롯은 제외.
    const payload: EquipPicks = {};
    for (const ing of equipIngs) {
      const p = picks[ing.itemId] ?? {};
      const out: EquipPicks[string] = {};
      for (const slot of slots) {
        const n = p[slot.key] ?? 0;
        if (n <= 0) continue;
        if (slot.kind === "base") out.base = n;
        else if (slot.kind === "crafted") {
          out.crafted = { ...(out.crafted ?? {}), [slot.gradeKey!]: n };
        } else {
          out.dropped = { ...(out.dropped ?? {}), [slot.gradeKey!]: n };
        }
      }
      if (out.base != null || out.crafted != null || out.dropped != null) {
        payload[ing.itemId] = out;
      }
    }
    onConfirm(payload);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="craft-picker-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2
          id="craft-picker-title"
          className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
        >
          고급 재료 사용 — {recipe.name}
        </h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          비-기본 등급 재료를 태우면 결과 등급 확률이 회마다 보정됩니다 ·
          정교한/고급 ×2.0 · 빼어난/걸작 ×3.0 · 회마다 가장 강한 1개만 적용.
        </p>

        <div className="mt-3 space-y-4">
          {summaries.map(({ ing, need, sum }) => (
            <div
              key={ing.itemId}
              className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {ITEMS[ing.itemId].name}
                </span>
                <span
                  className={
                    sum === need
                      ? "text-xs text-emerald-600 dark:text-emerald-400"
                      : "text-xs text-rose-600 dark:text-rose-400"
                  }
                >
                  합계 {sum} / {need}
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                {slots.map((slot) => {
                  const have = slotHave(
                    slot,
                    ing.itemId,
                    baseEquipmentCounts,
                    craftedEquipmentCounts,
                    droppedEquipmentCounts,
                  );
                  const value = picks[ing.itemId]?.[slot.key] ?? 0;
                  const disabled = have <= 0;
                  return (
                    <div
                      key={slot.key}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className={`${slot.textClass} min-w-16`}>
                        {slot.label}
                      </span>
                      <span className="flex-1 text-zinc-500 dark:text-zinc-400">
                        보유 {have}
                        {slot.bias > 1 && (
                          <span className="ml-2 text-violet-600 dark:text-violet-400">
                            보정 ×{slot.bias.toFixed(1)}
                          </span>
                        )}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={have}
                        step={1}
                        inputMode="numeric"
                        value={value}
                        disabled={disabled}
                        onChange={(e) => {
                          const next = Number.parseInt(e.target.value, 10);
                          setPick(
                            ing.itemId,
                            slot.key,
                            Number.isNaN(next) ? 0 : Math.min(next, have),
                          );
                        }}
                        className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm tabular-nums text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!allMatched}
            className="inline-flex items-center gap-1.5 rounded-md border border-violet-400 bg-violet-100 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-600 dark:bg-violet-900 dark:text-violet-100 dark:hover:bg-violet-800"
          >
            <Hammer size={16} weight="duotone" /> 제작
            {quantity > 1 ? ` ×${quantity}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
