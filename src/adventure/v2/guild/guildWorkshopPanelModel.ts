import {
  GUILD_WORKSHOP_MATERIALS,
  type GuildWorkshopMaterialId,
} from "@/adventure/data/v2/guildWorkshopMaterials";
import {
  type ProductionKind,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";
import { TITLES } from "@/adventure/data/titles";
import type {
  GuildWorkshopCraftMode,
  GuildWorkshopRecipeId,
} from "@/adventure/data/v2/guildWorkshop";
import { GUILD_WORKSHOP_MASTERWORK_DELIVERY_BONUS_PCT } from "@/adventure/data/v2/guildWorkshopDelivery";
import {
  GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT,
  GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT,
  GUILD_WORKSHOP_QUALITY_BONUS_PCT,
} from "@/adventure/data/v2/guildWorkshop";
import type {
  V2CraftQualityState,
  V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

export type WorkshopRecipeView = {
  id: GuildWorkshopRecipeId;
  equipmentId: string;
  itemName: string;
  slot: V2EquipSlot;
  tier: number;
  craftOnly?: boolean;
  note: string;
  cost: Partial<Record<ProductionKind, number>>;
  materialCost?: Partial<Record<string, number>>;
  profession: "blacksmith";
  requiredArtisanLevel: number;
  artisanXp: number;
  qualityChancePct: number;
  levelOk: boolean;
  smithyLevelOk: boolean;
  resourceOk: boolean;
  materialOk?: boolean;
  costText: string;
  canCraft: boolean;
  requiredSmithyLevel: number;
  masterwork?: {
    requiredArtisanLevel: number;
    levelOk: boolean;
    resourceOk: boolean;
    materialOk: boolean;
    canCraft: boolean;
    qualityChancePct: number;
    cost?: Partial<Record<ProductionKind, number>>;
    materialCost?: Partial<Record<string, number>>;
    costText: string;
    plus2Unlocked: boolean;
  };
};

export type ArtisanProfessionView = {
  name: string;
  xp: number;
  crafts: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
};

export type WorkshopStatsView = {
  totalCrafts: number;
  qualityCrafts: number;
  craftedByRecipe: Partial<Record<GuildWorkshopRecipeId, number>>;
};

export type WorkshopRecordEntry = {
  crafts: number;
  bestQualityLevel: number;
  masterworkCrafts: number;
  highestTier?: number;
  lastCraftedAt?: string;
};

export type WorkshopRecordsView = {
  totalCrafts: number;
  qualityCrafts: number;
  masterworkCrafts: number;
  craftOnlyCrafts: number;
  highestTier: number;
  bestQualityLevel: number;
  recipes: Partial<Record<GuildWorkshopRecipeId, WorkshopRecordEntry>>;
  slots: Partial<Record<V2EquipSlot, WorkshopRecordEntry>>;
};

export type GuildWorkshopBonusView = {
  totalCrafts: number;
  qualityChanceBonusPct: number;
  tier: number;
  nextTotalCrafts: number | null;
};

export type WorkshopState = {
  hasGuildSmithy: boolean;
  resources: SettlementResources;
  materials: Record<string, number>;
  artisan: { blacksmith: ArtisanProfessionView };
  workshopStats: WorkshopStatsView;
  workshopRecords?: WorkshopRecordsView;
  guildBonus: GuildWorkshopBonusView;
  smithyLevel?: number;
  smithyBonus?: {
    qualityChanceBonusPct: number;
    weeklyProgressBonusPct: number;
    label: string;
  };
  recipes: WorkshopRecipeView[];
};

export type WeeklyQuestView = {
  id: string;
  title: string;
  metric:
    | "crafts"
    | "qualityCrafts"
    | "weaponCrafts"
    | "armorCrafts"
    | "craftOnlyCrafts"
    | "masterworkCrafts"
    | "highTierCrafts";
  goal: number;
  rewardGold: number;
  rewardFame: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  canClaim: boolean;
};

export type WeeklyState = {
  weekKey: string;
  endsAt: string;
  quests: WeeklyQuestView[];
};

export type WorkshopRecommendation = {
  title: string;
  detail: string;
  recipeId?: GuildWorkshopRecipeId;
  craftMode?: GuildWorkshopCraftMode;
  tone: "weekly" | "codex" | "masterwork" | "craft" | "goal";
};

export type DeliveryView = {
  id: string;
  title: string;
  description: string;
  rewardArtisanXp: number;
  rewardGold: number;
  claimed: boolean;
  canClaim: boolean;
  deliverable: {
    iid: string;
    itemId: string;
    itemName: string;
    enhanceLevel: number;
    craftQualityLevel: number;
    craftOnly: boolean;
    masterwork: boolean;
    crafterLevel: number;
    rewardArtisanXp: number;
    rewardGold: number;
    bonusPct: number;
    masterworkBonusPct: number;
  }[];
};

export type DeliveryState = {
  dayKey: string;
  deliveries: DeliveryView[];
};

export type DismantleCandidateView = {
  iid: string;
  itemId: string;
  itemName: string;
  slot: V2EquipSlot;
  tier: number;
  craftOnly: boolean;
  enhanceLevel: number;
  craftQualityLevel: number;
  masterwork: boolean;
  locked: boolean;
  equipped: boolean;
  rewards: Partial<Record<GuildWorkshopMaterialId, number>>;
  artisanXp: number;
  canDismantle: boolean;
  blockedReason?: string;
};

export type DismantleState = {
  materials: Record<string, number>;
  requiredBlacksmithLevel: number;
  candidates: DismantleCandidateView[];
};
export type DismantleResultView = DismantleCandidateView;

export type DismantleScopeFilter =
  | "can"
  | "all"
  | "plain"
  | "quality"
  | "craftOnly"
  | "masterwork";
export type DismantleTierFilter = "all" | "t4" | "t6" | "t8" | "t10";
export type DismantleSortMode = "tier" | "reward" | "name";

export type CraftResultView = {
  iid: string | null;
  itemName: string;
  slot: V2EquipSlot;
  tier: number;
  craftOnly: boolean;
  craftQualityLevel: number;
  craftMode: GuildWorkshopCraftMode;
  masterwork: boolean;
  artisanXpGained: number;
  grantedTitleNames: string[];
};

export const RESOURCE_KINDS: ProductionKind[] = ["crop", "ore"];
export const WORKSHOP_MODE_STORAGE_KEY = "v2-guild-workshop-mode";

export const ERROR_TEXT: Record<string, string> = {
  unauthorized: "로그인이 필요합니다.",
  no_guild: "길드에 가입해야 사용할 수 있습니다.",
  smithy_required: "길드 대장간이 필요합니다.",
  invalid_recipe: "제작할 수 없는 의뢰입니다.",
  insufficient_artisan_level: "대장장이 숙련도가 부족합니다.",
  insufficient_smithy_level: "대장간 레벨이 부족합니다.",
  masterwork_locked: "명장 제작은 대장장이 Lv 8부터 사용할 수 있습니다.",
  insufficient_resources: "제작 재료가 부족합니다.",
  insufficient_materials: "제작 재료가 부족합니다.",
};

export const WEEKLY_ERROR_TEXT: Record<string, string> = {
  unauthorized: "로그인이 필요합니다.",
  no_guild: "길드에 가입해야 사용할 수 있습니다.",
  invalid_quest: "수령할 수 없는 의뢰입니다.",
  already_claimed: "이미 수령한 의뢰입니다.",
  not_complete: "아직 달성하지 못한 의뢰입니다.",
};

export const DISMANTLE_ERROR_TEXT: Record<string, string> = {
  unauthorized: "로그인이 필요합니다.",
  no_guild: "길드에 가입해야 사용할 수 있습니다.",
  smithy_required: "길드 대장간이 필요합니다.",
  insufficient_artisan_level: "대장장이 Lv 6부터 해체술을 사용할 수 있습니다.",
  not_owned: "보유 중인 장비가 아닙니다.",
  equipped: "장착 중인 장비는 해체할 수 없습니다.",
  locked: "잠금 장비는 해체할 수 없습니다.",
  not_crafted:
    "필드/상점 장비는 해체 재료 회수 대상이 아닙니다. 대장장이 제작품이나 제작 전용 장비만 해체할 수 있습니다.",
  low_tier: "T4 미만 장비는 제작 재료를 회수할 수 없습니다.",
  no_material: "회수할 제작 재료가 없습니다.",
};

export function emptyWorkshopStats(): WorkshopStatsView {
  return { totalCrafts: 0, qualityCrafts: 0, craftedByRecipe: {} };
}

export function emptyWorkshopRecords(): WorkshopRecordsView {
  return {
    totalCrafts: 0,
    qualityCrafts: 0,
    masterworkCrafts: 0,
    craftOnlyCrafts: 0,
    highestTier: 0,
    bestQualityLevel: 0,
    recipes: {},
    slots: {},
  };
}

export function emptyGuildBonus(): GuildWorkshopBonusView {
  return {
    totalCrafts: 0,
    qualityChanceBonusPct: 0,
    tier: 0,
    nextTotalCrafts: 10,
  };
}

export function weeklyMetricLabel(metric: WeeklyQuestView["metric"]): string {
  if (metric === "crafts") return "전체 제작";
  if (metric === "qualityCrafts") return "★ 품질";
  if (metric === "weaponCrafts") return "무기";
  if (metric === "armorCrafts") return "방어구";
  if (metric === "craftOnlyCrafts") return "제작 전용";
  if (metric === "masterworkCrafts") return "명장";
  return "T8+";
}

export function workshopRecordQualityText(levelRaw: number): string {
  const level = Math.max(0, Math.floor(Number(levelRaw) || 0));
  if (level >= 2) return "★★";
  if (level >= 1) return "★";
  return "기본";
}

export function nextWorkshopGoal(state: WorkshopState | null): string {
  if (!state) return "제작 정보를 불러오는 중입니다.";
  if (state.workshopStats.totalCrafts <= 0) {
    return "첫 제작 의뢰를 완료하세요.";
  }
  if (state.artisan.blacksmith.level < 2) {
    const remain = Math.max(
      0,
      state.artisan.blacksmith.xpForNext -
        state.artisan.blacksmith.xpIntoLevel,
    );
    return `대장장이 Lv 2까지 숙련도 ${remain.toLocaleString()} 남음`;
  }
  if (state.workshopStats.qualityCrafts <= 0) {
    return "★ 품질 장비 제작에 도전하세요.";
  }
  const locked = state.recipes.find((recipe) => !recipe.levelOk);
  if (locked) {
    return `${locked.itemName} 해금까지 대장장이 Lv ${locked.requiredArtisanLevel}`;
  }
  return "장인의 길 기본 목표를 모두 달성했습니다.";
}

export function titleGoalLine(state: WorkshopState): string {
  if (state.artisan.blacksmith.level < 2) {
    return `${TITLES.artisan_blacksmith_apprentice.name}: 대장장이 Lv 2`;
  }
  if (state.workshopStats.totalCrafts < 30) {
    return `${TITLES.artisan_guild_crafter.name}: 제작 ${state.workshopStats.totalCrafts.toLocaleString()}/30회`;
  }
  if (state.workshopStats.qualityCrafts < 5) {
    return `${TITLES.artisan_masterwork.name}: 품질 제작 ${state.workshopStats.qualityCrafts.toLocaleString()}/5회`;
  }
  return "장인 칭호 목표를 모두 달성했습니다.";
}

export function weeklyQuestMatchesRecipe(
  quest: WeeklyQuestView,
  recipe: WorkshopRecipeView,
): boolean {
  if (quest.metric === "crafts") return true;
  if (quest.metric === "qualityCrafts") return true;
  if (quest.metric === "weaponCrafts") return recipe.slot === "weapon";
  if (quest.metric === "armorCrafts") {
    return (
      recipe.slot === "armor" ||
      recipe.slot === "gloves" ||
      recipe.slot === "boots"
    );
  }
  if (quest.metric === "craftOnlyCrafts") return recipe.craftOnly === true;
  if (quest.metric === "masterworkCrafts") return recipe.masterwork != null;
  return recipe.tier >= 8;
}

export function recipePriority(a: WorkshopRecipeView, b: WorkshopRecipeView): number {
  return (
    Number(b.craftOnly === true) - Number(a.craftOnly === true) ||
    b.tier - a.tier ||
    b.artisanXp - a.artisanXp ||
    a.requiredArtisanLevel - b.requiredArtisanLevel ||
    a.itemName.localeCompare(b.itemName, "ko")
  );
}

export function bestCraftableRecipe(
  recipes: readonly WorkshopRecipeView[],
  predicate: (recipe: WorkshopRecipeView) => boolean,
): WorkshopRecipeView | undefined {
  return recipes
    .filter((recipe) => recipe.canCraft && predicate(recipe))
    .sort(recipePriority)[0];
}

export function bestCraftableMasterworkRecipe(
  recipes: readonly WorkshopRecipeView[],
  predicate: (recipe: WorkshopRecipeView) => boolean,
): WorkshopRecipeView | undefined {
  return recipes
    .filter((recipe) => recipe.masterwork?.canCraft && predicate(recipe))
    .sort(recipePriority)[0];
}

export function buildWorkshopRecommendation(
  state: WorkshopState | null,
  weekly: WeeklyState | null,
  registeredEquipmentIds: ReadonlySet<string>,
  equipmentCodexReady: boolean,
): WorkshopRecommendation {
  const claimable = weekly?.quests.find((quest) => quest.canClaim);
  if (claimable) {
    return {
      title: `${claimable.title} 보상 수령`,
      detail: `길드 자금 ${claimable.rewardGold.toLocaleString()} G · 명성 ${claimable.rewardFame.toLocaleString()}`,
      tone: "weekly",
    };
  }
  if (!state) {
    return {
      title: "대장간 정보 로딩",
      detail: "제작 정보를 불러오는 중입니다.",
      tone: "goal",
    };
  }
  const weeklyTarget = weekly?.quests
    .filter((quest) => !quest.claimed && !quest.complete)
    .sort(
      (a, b) =>
        b.progress / Math.max(1, b.goal) - a.progress / Math.max(1, a.goal),
    )[0];
  if (weeklyTarget) {
    const preferMasterwork =
      weeklyTarget.metric === "masterworkCrafts" ||
      weeklyTarget.metric === "qualityCrafts";
    const masterworkRecipe = preferMasterwork
      ? bestCraftableMasterworkRecipe(state.recipes, (recipe) =>
          weeklyQuestMatchesRecipe(weeklyTarget, recipe),
        )
      : undefined;
    const normalRecipe =
      masterworkRecipe ??
      bestCraftableRecipe(state.recipes, (recipe) =>
        weeklyQuestMatchesRecipe(weeklyTarget, recipe),
      );
    if (normalRecipe) {
      const progress = `${Math.min(
        weeklyTarget.progress,
        weeklyTarget.goal,
      ).toLocaleString()}/${weeklyTarget.goal.toLocaleString()}`;
      return {
        title: `${normalRecipe.itemName} ${
          masterworkRecipe ? "명장 제작" : "제작"
        }`,
        detail: `${weeklyTarget.title} ${progress} · ${weeklyMetricLabel(
          weeklyTarget.metric,
        )} 목표에 반영`,
        recipeId: normalRecipe.id,
        craftMode: masterworkRecipe ? "masterwork" : "normal",
        tone: "weekly",
      };
    }
  }
  const craftOnlyCodexRecipe = equipmentCodexReady
    ? bestCraftableRecipe(
        state.recipes,
        (recipe) =>
          recipe.craftOnly === true &&
          !registeredEquipmentIds.has(recipe.equipmentId),
      )
    : undefined;
  if (craftOnlyCodexRecipe) {
    return {
      title: `${craftOnlyCodexRecipe.itemName} 제작`,
      detail: "제작 전용 장비 도감 미등록 · 장인표 수집 보상 진행",
      recipeId: craftOnlyCodexRecipe.id,
      craftMode: "normal",
      tone: "codex",
    };
  }
  const craftableMasterwork = bestCraftableMasterworkRecipe(
    state.recipes,
    () => true,
  );
  if (craftableMasterwork) {
    return {
      title: `${craftableMasterwork.itemName} 명장 제작`,
      detail: `품질 상한 ${GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT}% · 납품 가치 강화`,
      recipeId: craftableMasterwork.id,
      craftMode: "masterwork",
      tone: "masterwork",
    };
  }
  const craftable = bestCraftableRecipe(state.recipes, () => true);
  if (craftable) {
    return {
      title: `${craftable.itemName} 제작`,
      detail: `바로 제작 가능 · 숙련도 +${craftable.artisanXp.toLocaleString()}`,
      recipeId: craftable.id,
      craftMode: "normal",
      tone: "craft",
    };
  }
  return {
    title: "다음 성장 목표",
    detail: nextWorkshopGoal(state),
    tone: "goal",
  };
}

export function weeklyRecipeHints(
  recipe: WorkshopRecipeView,
  weekly: WeeklyState | null,
): string[] {
  const active = (weekly?.quests ?? []).filter(
    (quest) => !quest.claimed && !quest.complete,
  );
  const hints: string[] = [];
  for (const quest of active) {
    if (quest.metric === "weaponCrafts" && recipe.slot === "weapon") {
      hints.push("주간 무기");
    } else if (
      quest.metric === "armorCrafts" &&
      (recipe.slot === "armor" ||
        recipe.slot === "gloves" ||
        recipe.slot === "boots")
    ) {
      hints.push("주간 방어구");
    } else if (quest.metric === "craftOnlyCrafts" && recipe.craftOnly) {
      hints.push("주간 전용");
    } else if (quest.metric === "masterworkCrafts" && recipe.masterwork) {
      hints.push("주간 명장");
    } else if (quest.metric === "highTierCrafts" && recipe.tier >= 8) {
      hints.push("주간 T8+");
    } else if (quest.metric === "qualityCrafts") {
      hints.push("품질 목표");
    } else if (quest.metric === "crafts") {
      hints.push("제작 목표");
    }
    if (hints.length >= 3) break;
  }
  return hints;
}

export function craftQualityFromLevel(levelRaw: number): V2CraftQualityState | undefined {
  const level = levelRaw >= 2 ? 2 : levelRaw >= 1 ? 1 : 0;
  if (level === 0) return undefined;
  return { level, bonusPct: GUILD_WORKSHOP_QUALITY_BONUS_PCT[level] };
}

export function craftResultHeadline(result: CraftResultView): string {
  if (result.craftQualityLevel >= 2) {
    return result.masterwork ? "명장 ★★ 제작 성공" : "★★ 품질 제작 성공";
  }
  if (result.craftQualityLevel >= 1) {
    return result.masterwork ? "명장 ★ 제작 성공" : "★ 품질 제작 성공";
  }
  return result.masterwork ? "명장 제작 완료" : "제작 완료";
}

export function craftResultMessage(result: CraftResultView): string {
  if (result.craftQualityLevel >= 2) {
    return result.masterwork
      ? "최상급 품질과 명장 각인이 함께 붙어 장비 위력이 10% 증가합니다."
      : "최상급 품질이 붙어 장비 위력이 10% 증가합니다.";
  }
  if (result.craftQualityLevel >= 1) {
    return result.masterwork
      ? "고품질 단조와 명장 각인이 함께 적용되어 장비 위력이 5% 증가합니다."
      : "고품질 단조가 성공해 장비 위력이 5% 증가합니다.";
  }
  if (result.masterwork) {
    return "품질은 기본이지만 명장 각인은 남고, 명장 전용 납품/거래 가치는 유지됩니다.";
  }
  return "기본 품질로 완성됐습니다. 제작자 각인과 숙련도는 정상 적용됩니다.";
}

export function craftResultMasterworkSummary(result: CraftResultView): string | null {
  if (!result.masterwork) return null;
  const qualityText =
    result.craftQualityLevel >= 2
      ? "★★ 품질 성공"
      : result.craftQualityLevel >= 1
        ? "★ 품질 성공"
        : "기본 품질";
  return `명장 각인 적용 · 품질 상한 ${GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT}% · ${qualityText} · 납품 보너스 +${GUILD_WORKSHOP_MASTERWORK_DELIVERY_BONUS_PCT}%`;
}

export function craftResultTone(result: CraftResultView): {
  frame: string;
  header: string;
  title: string;
} {
  if (result.craftQualityLevel >= 2) {
    return {
      frame:
        "border-rose-300 bg-white dark:border-rose-800 dark:bg-zinc-950",
      header:
        "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40",
      title: "text-rose-950 dark:text-rose-100",
    };
  }
  if (result.craftQualityLevel >= 1 || result.masterwork) {
    return {
      frame:
        "border-amber-300 bg-white dark:border-amber-800 dark:bg-zinc-950",
      header:
        "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
      title: "text-amber-950 dark:text-amber-100",
    };
  }
  return {
    frame: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
    header: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900",
    title: "text-zinc-950 dark:text-zinc-100",
  };
}

export function workshopMaterialRewardText(
  rewards: Partial<Record<GuildWorkshopMaterialId, number>>,
): string {
  const parts = Object.entries(rewards)
    .filter(([, amount]) => Math.max(0, Math.floor(Number(amount) || 0)) > 0)
    .map(([id, amount]) => {
      const mat = GUILD_WORKSHOP_MATERIALS[id as GuildWorkshopMaterialId];
      return `${mat?.name ?? id} ${Math.max(0, Math.floor(Number(amount) || 0)).toLocaleString()}`;
    });
  return parts.length > 0 ? parts.join(" · ") : "회수 재료 없음";
}

export function recipeInfoPillClass(ok: boolean | null = null): string {
  if (ok === true) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (ok === false) {
    return "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";
}

export function recipeCanPayText(recipe: WorkshopRecipeView): string {
  if (!recipe.resourceOk && recipe.materialOk === false) return "재료 부족";
  if (!recipe.resourceOk) return "통나무/철광석 부족";
  if (recipe.materialOk === false) return "재료 부족";
  return "비용 충족";
}

export function masterworkCanPayText(recipe: WorkshopRecipeView): string {
  const masterwork = recipe.masterwork;
  if (!masterwork) return "명장 정보 없음";
  if (!masterwork.resourceOk && !masterwork.materialOk) return "재료 부족";
  if (!masterwork.resourceOk) return "통나무/철광석 부족";
  if (!masterwork.materialOk) return "재료 부족";
  return "비용 충족";
}

export function masterworkBlockedText(recipe: WorkshopRecipeView): string | null {
  const masterwork = recipe.masterwork;
  if (!masterwork) return "명장 정보 없음";
  if (!recipe.levelOk) return `레시피 Lv ${recipe.requiredArtisanLevel} 필요`;
  if (!masterwork.levelOk) {
    return `대장장이 Lv ${masterwork.requiredArtisanLevel}에 명장 제작 해금`;
  }
  if (!recipe.smithyLevelOk) return `대장간 Lv ${recipe.requiredSmithyLevel} 필요`;
  if (!masterwork.resourceOk || !masterwork.materialOk) {
    return masterworkCanPayText(recipe);
  }
  return null;
}

export function masterworkButtonText(recipe: WorkshopRecipeView): string {
  const blocked = masterworkBlockedText(recipe);
  if (blocked == null) return "명장 제작";
  const masterwork = recipe.masterwork;
  if (!masterwork) return "명장 정보 없음";
  if (!recipe.levelOk) return `Lv ${recipe.requiredArtisanLevel}`;
  if (!masterwork.levelOk) return `명장 Lv ${masterwork.requiredArtisanLevel}`;
  if (!recipe.smithyLevelOk) return `대장간 Lv ${recipe.requiredSmithyLevel}`;
  return blocked;
}

export function masterworkStatusText(recipe: WorkshopRecipeView): string {
  const blocked = masterworkBlockedText(recipe);
  if (blocked != null) return `잠금/준비: ${blocked}`;
  const masterwork = recipe.masterwork;
  const plus2Text = masterwork?.plus2Unlocked
    ? `★★ ${GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT}%`
    : "★★ Lv9 해금";
  return `사용 가능: 품질 상한 ${GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT}% · 명장 각인 · ${plus2Text}`;
}

export function dismantleBlockedText(reason?: string): string {
  switch (reason) {
    case "locked_level":
      return "Lv 부족";
    case "low_tier":
      return "T4 미만";
    case "equipped":
      return "장착 중";
    case "locked":
      return "잠금";
    case "not_crafted":
      return "필드 장비";
    default:
      return "불가";
  }
}

export function dismantleRewardTotal(item: DismantleCandidateView): number {
  return Object.values(item.rewards).reduce(
    (sum, amount) => sum + Math.max(0, Math.floor(Number(amount) || 0)),
    0,
  );
}

export function matchesDismantleTierFilter(
  item: DismantleCandidateView,
  filter: DismantleTierFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "t4") return item.tier >= 4 && item.tier <= 5;
  if (filter === "t6") return item.tier >= 6 && item.tier <= 7;
  if (filter === "t8") return item.tier >= 8 && item.tier <= 9;
  return item.tier >= 10;
}

export function matchesDismantleScopeFilter(
  item: DismantleCandidateView,
  filter: DismantleScopeFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "can") return item.canDismantle;
  if (filter === "plain") {
    return (
      item.canDismantle &&
      item.craftQualityLevel <= 0 &&
      !item.craftOnly &&
      !item.masterwork
    );
  }
  if (filter === "quality") return item.canDismantle && item.craftQualityLevel > 0;
  if (filter === "craftOnly") return item.canDismantle && item.craftOnly;
  return item.canDismantle && item.masterwork;
}
