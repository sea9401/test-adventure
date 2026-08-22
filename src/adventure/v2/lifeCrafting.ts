import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { LIFE_PROCESSED_MATERIAL_ID } from "./lifeWorkshopMaterials";
import { RANCH_FEED_RECIPE } from "./ranch";

export type LifeAidActivity = "woodcutting" | "mining" | "fishing";
export type LifeBlueprintSource =
  | "woodcutting"
  | "mining"
  | "fishing"
  | "farming"
  | "cooking"
  | "processing";

export type LifeFinishedItemId =
  | "logging_wedge_basic"
  | "logging_wedge_advanced"
  | "logging_wedge_master"
  | "mining_probe_basic"
  | "mining_probe_advanced"
  | "mining_probe_master"
  | "organic_fertilizer"
  | "cooking_prep_set"
  | "tidy_bait_box"
  | "pine_work_shelf"
  | "iron_work_lamp"
  | "life_work_desk"
  | "herb_display_planter"
  | "fishing_trophy_wall"
  | "cookware_display"
  | "master_bed"
  | "arcane_alloy_display";

export type LifeCraftingRecipe = {
  id: string;
  name: string;
  description: string;
  image?: string;
  kind: "aid" | "furniture";
  outputId: LifeFinishedItemId;
  outputAmount: number;
  costs: Record<string, number>;
  failedDishCost?: number;
  requiredLevel: number;
  hidden?: boolean;
  blueprintSource?: LifeBlueprintSource;
  blueprintRarity?: "normal" | "top";
};

// 숙소 기능을 다시 공개할 때까지 가구 데이터와 기존 보유 기록만 보존한다.
// 신규 제작과 숨겨진 가구 도안 획득은 이 플래그를 기준으로 함께 차단한다.
export const LIFE_HOUSING_ENABLED = false;

export function isLifeHousingEnabled(): boolean {
  return LIFE_HOUSING_ENABLED;
}

export function isLifeCraftingRecipeAvailable(
  recipe: LifeCraftingRecipe,
): boolean {
  return isLifeHousingEnabled() || recipe.kind !== "furniture";
}

const P = LIFE_PROCESSED_MATERIAL_ID;
const M = MINING_MATERIAL_ID;

const LIFE_BLUEPRINT_SOURCE_LABELS: Record<LifeBlueprintSource, string> = {
  woodcutting: "벌목",
  mining: "채광",
  fishing: "낚시",
  farming: "농사",
  cooking: "요리",
  processing: "가공",
};

export function lifeBlueprintSourceLabel(source?: LifeBlueprintSource): string {
  return source ? LIFE_BLUEPRINT_SOURCE_LABELS[source] : "생활";
}

export const LIFE_CRAFTING_RECIPES: readonly LifeCraftingRecipe[] = [
  { id: "logging_wedge_basic", name: "초급 벌목 쐐기", description: "1~2등급 벌목 600회 동안 추가 원목 획득률을 10%p 높입니다.", image: "/images/items/life-aids/logging_wedge_basic.webp", kind: "aid", outputId: "logging_wedge_basic", outputAmount: 1, costs: { [P.softwood]: 4, [P.basicIngot]: 1 }, requiredLevel: 1 },
  { id: "logging_wedge_advanced", name: "중급 벌목 쐐기", description: "3~4등급 벌목 800회 동안 추가 원목 획득률을 8%p 높입니다.", image: "/images/items/life-aids/logging_wedge_advanced.webp", kind: "aid", outputId: "logging_wedge_advanced", outputAmount: 1, costs: { [P.hardwood]: 4, [P.preciousIngot]: 1 }, requiredLevel: 20 },
  { id: "logging_wedge_master", name: "명인의 벌목 쐐기", description: "5~6등급 벌목 1,000회 동안 추가 원목 획득률을 6%p 높입니다.", image: "/images/items/life-aids/logging_wedge_master.webp", kind: "aid", outputId: "logging_wedge_master", outputAmount: 1, costs: { [P.masterwood]: 4, [P.arcaneAlloy]: 1, [M.roughGem]: 1 }, requiredLevel: 40, hidden: true, blueprintSource: "woodcutting", blueprintRarity: "top" },
  { id: "mining_probe_basic", name: "초급 광맥 탐침", description: "1~2등급 채광 600회 동안 추가 광물 +10%p, 부산물 확률 +25%를 적용합니다.", image: "/images/items/life-aids/mining_probe_basic.webp", kind: "aid", outputId: "mining_probe_basic", outputAmount: 1, costs: { [P.basicIngot]: 4, [P.softwood]: 1 }, requiredLevel: 1 },
  { id: "mining_probe_advanced", name: "중급 광맥 탐침", description: "3~4등급 채광 800회 동안 추가 광물 +8%p, 부산물 확률 +25%를 적용합니다.", image: "/images/items/life-aids/mining_probe_advanced.webp", kind: "aid", outputId: "mining_probe_advanced", outputAmount: 1, costs: { [P.preciousIngot]: 4, [P.hardwood]: 1 }, requiredLevel: 20 },
  { id: "mining_probe_master", name: "명인의 광맥 탐침", description: "5~6등급 채광 1,000회 동안 추가 광물 +6%p, 부산물 확률 +25%를 적용합니다.", image: "/images/items/life-aids/mining_probe_master.webp", kind: "aid", outputId: "mining_probe_master", outputAmount: 1, costs: { [P.arcaneAlloy]: 4, [P.masterwood]: 1, [M.roughGem]: 1 }, requiredLevel: 40, hidden: true, blueprintSource: "mining", blueprintRarity: "top" },
  { id: "organic_fertilizer", name: "유기질 거름", description: "자라는 중인 밭에 사용해 남은 재배 시간을 20%(최대 2시간) 줄입니다. 파종당 1회만 사용합니다.", image: "/images/items/life-aids/organic_fertilizer.webp", kind: "aid", outputId: "organic_fertilizer", outputAmount: 3, costs: { [P.softwood]: 3, [M.coal]: 3 }, requiredLevel: 1 },
  { id: "failed_dish_compost", name: "실패 음식 퇴비", description: "실패한 요리를 발효해 유기질 거름으로 되살립니다.", image: "/images/items/life-aids/organic_fertilizer.webp", kind: "aid", outputId: "organic_fertilizer", outputAmount: 1, costs: {}, failedDishCost: 3, requiredLevel: 1 },
  { id: "cooking_prep_set", name: "요리 준비 세트", description: "선택한 조리 수량만큼 사용해 걸작 확률을 8%p 높입니다. 기본값은 사용 안 함입니다.", image: "/images/items/life-aids/cooking_prep_set.webp", kind: "aid", outputId: "cooking_prep_set", outputAmount: 5, costs: { [P.softwood]: 3, [P.basicIngot]: 3 }, requiredLevel: 1 },
  { id: "tidy_bait_box", name: "정갈한 미끼 상자", description: "켜 둔 동안 성공한 낚시에만 1회가 소모되며 희귀 어종 가중치를 조금 높입니다. 800회분입니다.", image: "/images/items/life-aids/tidy_bait_box.webp", kind: "aid", outputId: "tidy_bait_box", outputAmount: 1, costs: { [P.hardwood]: 8, [P.preciousIngot]: 4 }, requiredLevel: 20 },
  { id: "pine_work_shelf", name: "소나무 작업 선반", description: "다듬은 목재로 만든 실용적인 생활 가구입니다.", kind: "furniture", outputId: "pine_work_shelf", outputAmount: 1, costs: { [P.softwood]: 4, [P.basicIngot]: 1 }, requiredLevel: 1 },
  { id: "iron_work_lamp", name: "철제 작업등", description: "작업대 주변을 밝히는 단단한 조명입니다.", kind: "furniture", outputId: "iron_work_lamp", outputAmount: 1, costs: { [P.basicIngot]: 4, [P.softwood]: 1 }, requiredLevel: 1 },
  { id: "life_work_desk", name: "생활 장인의 작업대", description: "목공과 제련의 흔적이 함께 남은 넓은 작업대입니다.", kind: "furniture", outputId: "life_work_desk", outputAmount: 1, costs: { [P.hardwood]: 4, [P.preciousIngot]: 2 }, requiredLevel: 20 },
  { id: "herb_display_planter", name: "약초 전시 화분", description: "희귀 약초를 보기 좋게 정리한 전시용 화분입니다.", kind: "furniture", outputId: "herb_display_planter", outputAmount: 1, costs: { [P.hardwood]: 3, [P.preciousIngot]: 1 }, requiredLevel: 20, hidden: true, blueprintSource: "farming", blueprintRarity: "normal" },
  { id: "fishing_trophy_wall", name: "낚시 기념 벽장식", description: "기억에 남는 조과를 벽에 남기는 장식입니다.", kind: "furniture", outputId: "fishing_trophy_wall", outputAmount: 1, costs: { [P.hardwood]: 3, [P.preciousIngot]: 2 }, requiredLevel: 20, hidden: true, blueprintSource: "fishing", blueprintRarity: "normal" },
  { id: "cookware_display", name: "조리도구 전시대", description: "오래 쓴 조리도구를 단정하게 전시합니다.", kind: "furniture", outputId: "cookware_display", outputAmount: 1, costs: { [P.preciousIngot]: 3, [P.hardwood]: 2 }, requiredLevel: 20, hidden: true, blueprintSource: "cooking", blueprintRarity: "normal" },
  { id: "master_bed", name: "명인의 휴식 침대", description: "명인 목재로 정성껏 완성한 넓은 침대입니다.", kind: "furniture", outputId: "master_bed", outputAmount: 1, costs: { [P.masterwood]: 5, [P.arcaneAlloy]: 2 }, requiredLevel: 40 },
  { id: "arcane_alloy_display", name: "마력 합금 전시대", description: "가공 과정에서만 드러나는 합금의 빛을 보존한 전시대입니다.", kind: "furniture", outputId: "arcane_alloy_display", outputAmount: 1, costs: { [P.arcaneAlloy]: 5, [P.masterwood]: 3, [M.roughGem]: 2 }, requiredLevel: 40, hidden: true, blueprintSource: "processing", blueprintRarity: "top" },
] as const;

export const LIFE_CRAFTING_RECIPE_BY_ID = new Map(LIFE_CRAFTING_RECIPES.map((recipe) => [recipe.id, recipe]));

export type ActiveLifeAid = { itemId: LifeFinishedItemId; remainingUses: number; enabled: boolean };
export type LifeCraftingState = {
  balances: Partial<Record<LifeFinishedItemId, number>>;
  craftCounts: Record<string, number>;
  discoveredRecipeIds: string[];
  learnedHiddenRecipeIds: string[];
  activeAids: Partial<Record<LifeAidActivity, ActiveLifeAid>>;
  reserveAidUses: Partial<Record<LifeFinishedItemId, number>>;
  blueprintMisses: Partial<Record<LifeBlueprintSource, number>>;
  totalCrafts: number;
  aidsUsed: number;
  furnitureCrafted: number;
};

export function emptyLifeCraftingState(): LifeCraftingState {
  return { balances: {}, craftCounts: {}, discoveredRecipeIds: [], learnedHiddenRecipeIds: [], activeAids: {}, reserveAidUses: {}, blueprintMisses: {}, totalCrafts: 0, aidsUsed: 0, furnitureCrafted: 0 };
}

const FINISHED_IDS = new Set(LIFE_CRAFTING_RECIPES.map((recipe) => recipe.outputId));
const RECIPE_IDS = new Set([
  ...LIFE_CRAFTING_RECIPES.map((recipe) => recipe.id),
  RANCH_FEED_RECIPE.id,
]);
const HIDDEN_IDS = new Set(LIFE_CRAFTING_RECIPES.filter((recipe) => recipe.hidden).map((recipe) => recipe.id));
const AID_IDS = new Set(LIFE_CRAFTING_RECIPES.filter((recipe) => recipe.kind === "aid").map((recipe) => recipe.outputId));

function safeInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export function parseLifeCraftingState(raw: unknown): LifeCraftingState {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const balancesRaw = source.balances && typeof source.balances === "object" ? source.balances as Record<string, unknown> : {};
  const countsRaw = source.craftCounts && typeof source.craftCounts === "object" ? source.craftCounts as Record<string, unknown> : {};
  const aidsRaw = source.activeAids && typeof source.activeAids === "object" ? source.activeAids as Record<string, unknown> : {};
  const reserveAidUsesRaw = source.reserveAidUses && typeof source.reserveAidUses === "object" ? source.reserveAidUses as Record<string, unknown> : {};
  const missesRaw = source.blueprintMisses && typeof source.blueprintMisses === "object" ? source.blueprintMisses as Record<string, unknown> : {};
  const balances: LifeCraftingState["balances"] = {};
  for (const [id, amount] of Object.entries(balancesRaw)) if (FINISHED_IDS.has(id as LifeFinishedItemId) && safeInt(amount) > 0) balances[id as LifeFinishedItemId] = safeInt(amount);
  const craftCounts: Record<string, number> = {};
  for (const [id, count] of Object.entries(countsRaw)) if (RECIPE_IDS.has(id) && safeInt(count) > 0) craftCounts[id] = safeInt(count);
  const activeAids: LifeCraftingState["activeAids"] = {};
  for (const activity of ["woodcutting", "mining", "fishing"] as const) {
    const value = aidsRaw[activity] && typeof aidsRaw[activity] === "object" ? aidsRaw[activity] as Record<string, unknown> : null;
    if (value && typeof value.itemId === "string" && AID_IDS.has(value.itemId as LifeFinishedItemId) && lifeAidSpec(value.itemId as LifeFinishedItemId)?.activity === activity && safeInt(value.remainingUses) > 0) activeAids[activity] = { itemId: value.itemId as LifeFinishedItemId, remainingUses: safeInt(value.remainingUses), enabled: value.enabled === true };
  }
  const reserveAidUses: LifeCraftingState["reserveAidUses"] = {};
  for (const [id, remainingUses] of Object.entries(reserveAidUsesRaw)) {
    const itemId = id as LifeFinishedItemId;
    if (AID_IDS.has(itemId) && lifeAidSpec(itemId) && safeInt(remainingUses) > 0) reserveAidUses[itemId] = safeInt(remainingUses);
  }
  for (const active of Object.values(activeAids)) delete reserveAidUses[active.itemId];
  const blueprintMisses: LifeCraftingState["blueprintMisses"] = {};
  for (const sourceId of ["woodcutting", "mining", "fishing", "farming", "cooking", "processing"] as const) blueprintMisses[sourceId] = safeInt(missesRaw[sourceId]);
  return {
    balances,
    craftCounts,
    discoveredRecipeIds: Array.isArray(source.discoveredRecipeIds) ? [...new Set(source.discoveredRecipeIds.filter((id): id is string => typeof id === "string" && RECIPE_IDS.has(id)))] : [],
    learnedHiddenRecipeIds: Array.isArray(source.learnedHiddenRecipeIds) ? [...new Set(source.learnedHiddenRecipeIds.filter((id): id is string => typeof id === "string" && HIDDEN_IDS.has(id)))] : [],
    activeAids,
    reserveAidUses,
    blueprintMisses,
    totalCrafts: safeInt(source.totalCrafts),
    aidsUsed: safeInt(source.aidsUsed),
    furnitureCrafted: safeInt(source.furnitureCrafted),
  };
}

export function lifeAidSpec(itemId: LifeFinishedItemId): { activity: LifeAidActivity; gradeMin: number; gradeMax: number; uses: number; bonusPct: number; byproductMultiplier?: number } | null {
  if (itemId === "tidy_bait_box") return { activity: "fishing", gradeMin: 1, gradeMax: 6, uses: 800, bonusPct: 5 };
  const logging = itemId.startsWith("logging_wedge_");
  const mining = itemId.startsWith("mining_probe_");
  if (!logging && !mining) return null;
  const tier = itemId.endsWith("basic") ? 0 : itemId.endsWith("advanced") ? 1 : 2;
  return { activity: logging ? "woodcutting" : "mining", gradeMin: tier * 2 + 1, gradeMax: tier * 2 + 2, uses: [600, 800, 1_000][tier], bonusPct: [10, 8, 6][tier], ...(mining ? { byproductMultiplier: 1.25 } : {}) };
}

export function consumeFinishedItem(state: LifeCraftingState, itemId: LifeFinishedItemId, amount: number): LifeCraftingState | null {
  const count = Math.max(1, Math.floor(amount));
  if ((state.balances[itemId] ?? 0) < count) return null;
  const balances = { ...state.balances, [itemId]: (state.balances[itemId] ?? 0) - count };
  if (!balances[itemId]) delete balances[itemId];
  return { ...state, balances };
}

export function activateLifeAid(
  state: LifeCraftingState,
  itemId: LifeFinishedItemId,
): { state: LifeCraftingState; replaced: boolean; resumed: boolean } | null {
  const spec = lifeAidSpec(itemId);
  if (!spec) return null;
  const current = state.activeAids[spec.activity];
  if (current?.itemId === itemId) return null;

  const reservedUses = state.reserveAidUses[itemId] ?? 0;
  const resumed = reservedUses > 0;
  let next = state;
  if (resumed) {
    const reserveAidUses = { ...state.reserveAidUses };
    delete reserveAidUses[itemId];
    next = { ...state, reserveAidUses };
  } else {
    const consumed = consumeFinishedItem(state, itemId, 1);
    if (!consumed) return null;
    next = consumed;
  }

  const reserveAidUses = { ...next.reserveAidUses };
  if (current?.remainingUses) reserveAidUses[current.itemId] = current.remainingUses;
  return {
    state: {
      ...next,
      reserveAidUses,
      activeAids: {
        ...next.activeAids,
        [spec.activity]: {
          itemId,
          remainingUses: resumed ? reservedUses : spec.uses,
          enabled: true,
        },
      },
    },
    replaced: current != null,
    resumed,
  };
}

export function consumeLifeAidUses(
  state: LifeCraftingState,
  activity: LifeAidActivity,
  itemIdRaw: unknown,
  requestedUses: number,
): { state: LifeCraftingState; consumed: number } {
  if (typeof itemIdRaw !== "string") return { state, consumed: 0 };
  const itemId = itemIdRaw as LifeFinishedItemId;
  const spec = lifeAidSpec(itemId);
  if (spec?.activity !== activity) return { state, consumed: 0 };
  const requested = Math.max(0, Math.floor(requestedUses));
  if (requested < 1) return { state, consumed: 0 };

  const active = state.activeAids[activity];
  if (active?.itemId === itemId) {
    const owned = state.balances[itemId] ?? 0;
    const availableUses =
      active.remainingUses + (active.enabled ? owned * spec.uses : 0);
    const consumed = Math.min(requested, availableUses);
    let opened = active.enabled
      ? Math.ceil(Math.max(0, consumed - active.remainingUses) / spec.uses)
      : 0;
    let remainingUses = active.remainingUses + opened * spec.uses - consumed;
    if (
      active.enabled &&
      consumed === requested &&
      remainingUses === 0 &&
      opened < owned
    ) {
      opened += 1;
      remainingUses = spec.uses;
    }
    const activeAids = { ...state.activeAids };
    if (remainingUses < 1) delete activeAids[activity];
    else activeAids[activity] = { ...active, remainingUses };
    const balances = { ...state.balances };
    if (opened > 0) {
      const remainingOwned = owned - opened;
      if (remainingOwned > 0) balances[itemId] = remainingOwned;
      else delete balances[itemId];
    }
    return {
      state: {
        ...state,
        balances,
        activeAids,
        aidsUsed: state.aidsUsed + consumed,
      },
      consumed,
    };
  }

  const reservedUses = state.reserveAidUses[itemId] ?? 0;
  const consumed = Math.min(requested, reservedUses);
  if (consumed < 1) return { state, consumed: 0 };
  const reserveAidUses = { ...state.reserveAidUses };
  if (consumed >= reservedUses) delete reserveAidUses[itemId];
  else reserveAidUses[itemId] = reservedUses - consumed;
  return { state: { ...state, reserveAidUses, aidsUsed: state.aidsUsed + consumed }, consumed };
}

export function recipeMasteryStage(count: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (count >= 100) return 5;
  if (count >= 40) return 4;
  if (count >= 15) return 3;
  if (count >= 5) return 2;
  if (count >= 1) return 1;
  return 0;
}

export function rollHiddenBlueprint(state: LifeCraftingState, source: LifeBlueprintSource, successes = 1, rng: () => number = Math.random, bonusChancePct = 0): { state: LifeCraftingState; recipe: LifeCraftingRecipe | null } {
  const eligible = LIFE_CRAFTING_RECIPES.filter(
    (recipe) =>
      isLifeCraftingRecipeAvailable(recipe) &&
      recipe.hidden &&
      recipe.blueprintSource === source &&
      !state.learnedHiddenRecipeIds.includes(recipe.id),
  );
  if (eligible.length === 0 || successes < 1) return { state, recipe: null };
  let misses = state.blueprintMisses[source] ?? 0;
  for (let index = 0; index < Math.floor(successes); index += 1) {
    const recipe = eligible[Math.floor(rng() * eligible.length)] ?? eligible[0];
    const expected = recipe.blueprintRarity === "top" ? 100_000 : 20_000;
    const softPity = misses >= expected * 4 ? 2 : misses >= expected * 3 ? 1.5 : 1;
    const bonusChance = Math.min(
      1,
      Math.max(0, Number(bonusChancePct) || 0) / 100,
    );
    if (rng() < Math.min(1, softPity / expected + bonusChance)) {
      return { state: { ...state, learnedHiddenRecipeIds: [...state.learnedHiddenRecipeIds, recipe.id], blueprintMisses: { ...state.blueprintMisses, [source]: 0 } }, recipe };
    }
    misses += 1;
  }
  return { state: { ...state, blueprintMisses: { ...state.blueprintMisses, [source]: misses } }, recipe: null };
}
