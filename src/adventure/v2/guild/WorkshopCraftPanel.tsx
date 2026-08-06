import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SpinnerGap } from "@phosphor-icons/react";
import { SURFACE_ACCENT } from "@/components/ui/surfaces";
import {
  GUILD_WORKSHOP_MATERIALS,
  GUILD_WORKSHOP_MATERIAL_IDS,
  GUILD_WORKSHOP_MATERIAL_DROP_PCT,
  GUILD_WORKSHOP_MATERIAL_SOURCES,
  GUILD_WORKSHOP_MATERIAL_SUBSTITUTE,
} from "@/adventure/data/v2/guildWorkshopMaterials";
import {
  MONSTER_CRAFT_MATERIAL_DROP_RULES,
  MONSTER_CRAFT_MATERIALS,
} from "@/adventure/data/v2/monsterCraftMaterials";
import {
  COOP_BOSS_MATERIAL,
  COOP_BOSS_MATERIAL_ID,
} from "@/adventure/data/v2/coopRewards";
import { TITLES } from "@/adventure/data/titles";
import type {
  GuildWorkshopCraftMode,
  GuildWorkshopRecipeId,
} from "@/adventure/data/v2/guildWorkshop";
import {
  GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT,
  GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT,
} from "@/adventure/data/v2/guildWorkshop";
import {
  CRAFTED_EQUIP_TAG_SET_IDS,
  V2_EQUIPMENT,
  V2_EQUIP_TAG_SETS,
  V2_SLOT_LABEL,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  CraftOnlyBadge,
  CraftQualityBadge,
  MasterworkBadge,
  V2ItemCard,
  anchorOf,
  type ItemCardAnchor,
} from "../V2ItemCard";
import {
  ERROR_TEXT,
  craftQualityFromLevel,
  craftResultHeadline,
  craftResultMasterworkSummary,
  craftResultMessage,
  craftResultTone,
  masterworkButtonText,
  workshopEquipmentCodexStatus,
  workshopEquipmentTierLabel,
  weeklyRecipeHints,
  type CraftResultView,
  type WeeklyState,
  type WorkshopEquipmentCodexLoadStatus,
  type WorkshopEquipmentCodexStatus,
  type WorkshopRecipeView,
  type WorkshopState,
} from "./guildWorkshopPanelModel";

// 제작(craft) 모드 패널 — GuildWorkshopPanel 의 제작 클러스터(결과 카드 + 필터/참고 +
// 레시피 목록 + craft mutation)를 분리(2026-07, dismantle/growth 와 같은 분해 레시피).
// 서버 응답의 워크숍 상태 반영(자원/재료/숙련도/레시피 재계산)은 부모 소유 상태라
// onServerSync(성공/실패 공용)로 위임하고, 여기는 fetch·결과 표시·목록만 담당한다.

const CRAFTED_TAG_SET_ID_SET: ReadonlySet<string> = new Set(
  CRAFTED_EQUIP_TAG_SET_IDS,
);

type MaterialSubstitutionView = NonNullable<
  WorkshopRecipeView["materialSubstitution"]
>;

function MaterialSubstitutionOption({
  substitution,
  busy,
  crafting,
  onCraft,
}: {
  substitution: MaterialSubstitutionView;
  busy: boolean;
  crafting: boolean;
  onCraft: () => void;
}) {
  return (
    <div
      className={`${SURFACE_ACCENT} mt-2 px-2 py-1.5 text-amber-950 dark:text-amber-100`}
    >
      <div className="space-y-0.5">
        {substitution.replacements.map((replacement) => (
          <div key={replacement.requiredMaterialId}>
            {replacement.requiredMaterialName} 부족분 {replacement.count}개 →{" "}
            <strong>{replacement.substituteMaterialName} {replacement.count}개</strong>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[10px] text-amber-800 dark:text-amber-300">
        1:1 대체 · 추가 {substitution.extraGoldCost.toLocaleString()} G · 총{" "}
        {substitution.totalGoldCost.toLocaleString()} G
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!substitution.canCraft || busy || crafting}
          onClick={onCraft}
          className="inline-flex h-7 items-center justify-center rounded border border-amber-700 bg-amber-700 px-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-amber-500 dark:bg-amber-600 dark:text-zinc-950 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
        >
          {busy ? (
            <SpinnerGap size={14} className="animate-spin" aria-hidden />
          ) : !substitution.goldOk ? (
            "골드 부족"
          ) : substitution.canCraft ? (
            "상위 재료로 대체 제작"
          ) : (
            "제작 조건 부족"
          )}
        </button>
        <Link
          href="/plaza/market"
          className="font-medium text-amber-800 underline underline-offset-2 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100"
        >
          거래소에서 재료 찾기
        </Link>
      </div>
    </div>
  );
}

const EQUIPMENT_CODEX_STATUS_VIEW: Record<
  WorkshopEquipmentCodexStatus,
  { label: string; className: string }
> = {
  registered: {
    label: "도감 등록",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  unregistered: {
    label: "도감 미등록",
    className:
      "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
  loading: {
    label: "도감 확인 중",
    className:
      "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  },
  error: {
    label: "도감 확인 실패",
    className:
      "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  },
};

/** 제작 응답 중 부모 워크숍 상태에 반영할 조각 — 부모 콜백(applyCraftServerState)의 입력. */
export type CraftServerSync = {
  ok: boolean;
  gold?: number;
  bankedGold?: number;
  spendableGold?: number;
  resources?: WorkshopState["resources"];
  materials?: WorkshopState["materials"];
  artisan?: WorkshopState["artisan"];
  workshopStats?: WorkshopState["workshopStats"];
  workshopRecords?: WorkshopState["workshopRecords"];
  guildBonus?: WorkshopState["guildBonus"];
  recipes?: WorkshopState["recipes"];
};

export function matchesWorkshopCodexFilter(
  equipmentId: string,
  registeredEquipmentIds: ReadonlySet<string>,
  equipmentCodexStatus: WorkshopEquipmentCodexLoadStatus,
  unregisteredOnly: boolean,
): boolean {
  if (!unregisteredOnly || equipmentCodexStatus !== "ready") return true;
  return !registeredEquipmentIds.has(equipmentId);
}

export function WorkshopCraftPanel({
  state,
  weekly,
  recommendedRecipeId,
  registeredEquipmentIds,
  equipmentCodexStatus,
  loading,
  onMessage,
  onServerSync,
  onAfterCraft,
  autoCraft,
  onAutoCraftConsumed,
  outpostId,
}: {
  state: WorkshopState | null;
  /** 주간 제작 의뢰 — 레시피 행의 의뢰 힌트 배지용. */
  weekly: WeeklyState | null;
  /** 추천 행동의 레시피 id — 목록 상단 고정 + "추천" 배지. */
  recommendedRecipeId: string | null;
  /** 현재 캐릭터의 장비 도감 등록 ID — 제작 결과물 등록 여부 배지용. */
  registeredEquipmentIds: ReadonlySet<string>;
  equipmentCodexStatus: WorkshopEquipmentCodexLoadStatus;
  loading: boolean;
  /** 전 모드 공용 메시지 배너(부모 소유) — 제작 실패 문구 표시. */
  onMessage: (text: string | null) => void;
  /** 제작 응답의 워크숍 상태 반영(자원/재료/숙련도/레시피 재계산) — 부모 setState 위임. */
  onServerSync: (sync: CraftServerSync) => void;
  /** 제작 성공 후속 재조회(주간 의뢰·일일 납품·기여도) — 부모 로더 위임. */
  onAfterCraft: () => void;
  /** 추천 카드(메인 모드) 원클릭 제작 요청 — 마운트 시 1회 실행 후 소비 통지. */
  autoCraft: {
    recipeId: GuildWorkshopRecipeId;
    craftMode: GuildWorkshopCraftMode;
  } | null;
  onAutoCraftConsumed: () => void;
  outpostId?: string;
}) {
  const [craftingId, setCraftingId] = useState<GuildWorkshopRecipeId | null>(
    null,
  );
  const [craftResult, setCraftResult] = useState<CraftResultView | null>(null);
  const [previewCard, setPreviewCard] = useState<{
    item: V2Equipment;
    anchor: ItemCardAnchor;
  } | null>(null);
  const [recipeSlotFilter, setRecipeSlotFilter] = useState<"all" | V2EquipSlot>(
    "all",
  );
  const [recipeScopeFilter, setRecipeScopeFilter] = useState<
    "all" | "craftable"
  >("all");
  const [unregisteredCodexOnly, setUnregisteredCodexOnly] = useState(false);
  const [recipeSort, setRecipeSort] = useState<"level" | "tier" | "chance">(
    "level",
  );

  const materials = useMemo(() => state?.materials ?? {}, [state?.materials]);
  const {
    craftedRecipes,
    trainingRecipes,
    totalCraftedRecipes,
    totalTrainingRecipes,
  } = useMemo(() => {
    const allRecipes = state?.recipes ?? [];
    const matchesSharedFilter = (recipe: WorkshopRecipeView) => {
      if (recipeSlotFilter !== "all" && recipe.slot !== recipeSlotFilter) {
        return false;
      }
      if (
        recipeScopeFilter === "craftable" &&
        !recipe.canCraft &&
        !recipe.materialSubstitution?.canCraft &&
        !recipe.masterwork?.canCraft &&
        !recipe.masterwork?.materialSubstitution?.canCraft
      ) {
        return false;
      }
      if (
        !matchesWorkshopCodexFilter(
          recipe.equipmentId,
          registeredEquipmentIds,
          equipmentCodexStatus,
          unregisteredCodexOnly,
        )
      ) {
        return false;
      }
      return true;
    };
    const sortRecipes = (recipes: WorkshopRecipeView[]) =>
      recipes.sort((a, b) => {
        if (recommendedRecipeId) {
          const ar = a.id === recommendedRecipeId ? 1 : 0;
          const br = b.id === recommendedRecipeId ? 1 : 0;
          if (ar !== br) return br - ar;
        }
        if (recipeSort === "tier") {
          return b.tier - a.tier || a.requiredArtisanLevel - b.requiredArtisanLevel;
        }
        if (recipeSort === "chance") {
          return (
            b.qualityChancePct - a.qualityChancePct ||
            a.requiredArtisanLevel - b.requiredArtisanLevel
          );
        }
        return (
          a.requiredArtisanLevel - b.requiredArtisanLevel ||
          a.tier - b.tier ||
          a.itemName.localeCompare(b.itemName, "ko")
        );
      });
    const allCraftedRecipes = allRecipes.filter(
      (recipe) => recipe.craftOnly || recipe.baseEquipment,
    );
    const allTrainingRecipes = allRecipes.filter(
      (recipe) => !recipe.craftOnly && !recipe.baseEquipment,
    );
    return {
      craftedRecipes: sortRecipes(
        allCraftedRecipes.filter(matchesSharedFilter),
      ),
      trainingRecipes: sortRecipes(
        allTrainingRecipes.filter(matchesSharedFilter),
      ),
      totalCraftedRecipes: allCraftedRecipes.length,
      totalTrainingRecipes: allTrainingRecipes.length,
    };
  }, [
    recipeScopeFilter,
    recipeSlotFilter,
    recipeSort,
    unregisteredCodexOnly,
    equipmentCodexStatus,
    registeredEquipmentIds,
    state?.recipes,
    recommendedRecipeId,
  ]);
  const craftedTagSets = V2_EQUIP_TAG_SETS.filter((set) =>
    CRAFTED_TAG_SET_ID_SET.has(set.id),
  );
  const craftResultQuality = craftResult
    ? craftQualityFromLevel(craftResult.craftQualityLevel)
    : undefined;
  const craftResultVisual = craftResult ? craftResultTone(craftResult) : null;
  const craftResultMasterworkLine = craftResult
    ? craftResultMasterworkSummary(craftResult)
    : null;

  function renderRecipeRow(recipe: WorkshopRecipeView) {
    const busy = craftingId === recipe.id;
    const masterwork = recipe.masterwork;
    const weeklyHints = weeklyRecipeHints(recipe, weekly);
    const recommended = recommendedRecipeId === recipe.id;
    const equipment = V2_EQUIPMENT[recipe.equipmentId as V2EquipmentId];
    const codexStatus = workshopEquipmentCodexStatus(
      recipe.equipmentId,
      registeredEquipmentIds,
      equipmentCodexStatus,
    );
    const codexStatusView = EQUIPMENT_CODEX_STATUS_VIEW[codexStatus];
    return (
      <div
        key={recipe.id}
        className={`ui-recipe-row grid gap-3 px-3 py-2.5 ${
          recommended ? "bg-emerald-50/70 dark:bg-emerald-950/20" : ""
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {equipment ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`${recipe.itemName} 옵션 미리보기`}
                  onClick={(event) =>
                    setPreviewCard({
                      item: equipment,
                      anchor: anchorOf(event.currentTarget),
                    })
                  }
                  className="group inline-flex items-center gap-1.5 text-left"
                >
                  <strong className="text-sm text-zinc-950 underline decoration-dotted underline-offset-4 group-hover:text-emerald-700 dark:text-zinc-50 dark:group-hover:text-emerald-300">
                    {recipe.itemName}
                  </strong>
                  <span className="text-[10px] font-medium text-emerald-700 group-hover:underline dark:text-emerald-300">
                    옵션 보기
                  </span>
                </button>
              ) : (
                <strong className="text-sm text-zinc-950 dark:text-zinc-50">
                  {recipe.itemName}
                </strong>
              )}
              {recommended ? (
                <span className="rounded bg-emerald-700 px-1.5 py-px text-[10px] font-semibold text-white dark:bg-emerald-500 dark:text-emerald-950">
                  추천
                </span>
              ) : null}
              <span className="rounded bg-zinc-100 px-1.5 py-px text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {workshopEquipmentTierLabel(recipe.tier)} ·{" "}
                {V2_SLOT_LABEL[recipe.slot]}
              </span>
              {recipe.craftOnly ? <CraftOnlyBadge /> : null}
              <span
                className={`rounded px-1.5 py-px text-[10px] font-semibold ${codexStatusView.className}`}
              >
                {codexStatusView.label}
              </span>
              {recipe.baseEquipment ? (
                <span className="rounded bg-violet-100 px-1.5 py-px text-[10px] font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                  장비 개량
                </span>
              ) : null}
              {weeklyHints.slice(0, 2).map((hint) => (
                <span
                  key={hint}
                  className="rounded bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                >
                  {hint}
                </span>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              대장장이 Lv {recipe.requiredArtisanLevel} · 제작소 Lv{" "}
              {recipe.requiredSmithyLevel} · 숙련도 +{recipe.artisanXp}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {recipe.note}
            </div>
          </div>
        </div>

        {recipe.baseEquipment ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <span className="font-semibold">
              개량 재료: {recipe.baseEquipment.itemName} {recipe.baseEquipment.requiredCount}개
            </span>{" "}
            · 사용 가능 {recipe.baseEquipment.eligibleCount}개
            {recipe.baseEquipment.resetOnCraft ? (
              <div className="mt-0.5">
                장착·잠금 장비는 제외되며, 소모한 장비의 강화·품질·개체 옵션은 결과물에 이전되지 않습니다.
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                일반 제작
              </span>
              <button
                type="button"
                disabled={!recipe.canCraft || busy || craftingId != null}
                onClick={() => void craft(recipe.id)}
                className="inline-flex h-7 min-w-16 items-center justify-center rounded border border-emerald-700 bg-emerald-700 px-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-emerald-500 dark:bg-emerald-600 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                {busy ? (
                  <SpinnerGap size={14} className="animate-spin" aria-hidden />
                ) : !recipe.levelOk ? (
                  `Lv ${recipe.requiredArtisanLevel}`
                ) : !recipe.smithyLevelOk ? (
                  `제작소 Lv ${recipe.requiredSmithyLevel}`
                ) : !recipe.goldOk ? (
                  "골드 부족"
                ) : recipe.canCraft ? (
                  "제작"
                ) : (
                  "부족"
                )}
              </button>
            </div>
            <div className="mt-1 text-zinc-600 dark:text-zinc-400">
              개인 재료: {recipe.costText}
            </div>
            <div
              className={`mt-0.5 ${
                recipe.goldOk
                  ? "text-zinc-500 dark:text-zinc-500"
                  : "font-semibold text-rose-600 dark:text-rose-400"
              }`}
            >
              제작 수수료: {recipe.goldCost.toLocaleString()} G
            </div>
            <div className="mt-0.5 text-zinc-500 dark:text-zinc-500">
              ★ {recipe.qualityChancePct}% · 상한{" "}
              {GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT}%
            </div>
            {recipe.materialSubstitution ? (
              <MaterialSubstitutionOption
                substitution={recipe.materialSubstitution}
                busy={busy}
                crafting={craftingId != null}
                onCraft={() => void craft(recipe.id, "normal", true)}
              />
            ) : null}
          </div>

          <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                명장 제작
              </span>
              <button
                type="button"
                disabled={!masterwork?.canCraft || busy || craftingId != null}
                onClick={() => void craft(recipe.id, "masterwork")}
                className="inline-flex h-7 min-w-20 items-center justify-center rounded border border-rose-700 bg-rose-700 px-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-rose-500 dark:bg-rose-600 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                {busy ? (
                  <SpinnerGap size={14} className="animate-spin" aria-hidden />
                ) : (
                  masterworkButtonText(recipe)
                )}
              </button>
            </div>
            <div className="mt-1 text-zinc-600 dark:text-zinc-400">
              {masterwork
                ? `개인 재료: ${masterwork.costText}`
                : "대장장이 Lv 8 필요"}
            </div>
            {masterwork ? (
              <div
                className={`mt-0.5 ${
                  masterwork.goldOk
                    ? "text-zinc-500 dark:text-zinc-500"
                    : "font-semibold text-rose-600 dark:text-rose-400"
                }`}
              >
                제작 수수료: {masterwork.goldCost.toLocaleString()} G
              </div>
            ) : null}
            <div className="mt-0.5 text-zinc-500 dark:text-zinc-500">
              {masterwork
                ? masterwork.plus2Unlocked
                  ? `★ 확정 · ★★ ${GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT}%`
                  : "★ 확정 · ★★ Lv9 해금"
                : "명장 각인/★ 확정"}
            </div>
            {masterwork?.materialSubstitution ? (
              <MaterialSubstitutionOption
                substitution={masterwork.materialSubstitution}
                busy={busy}
                crafting={craftingId != null}
                onCraft={() => void craft(recipe.id, "masterwork", true)}
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  async function craft(
    recipeId: GuildWorkshopRecipeId,
    craftMode: GuildWorkshopCraftMode = "normal",
    useMaterialSubstitution = false,
  ) {
    setCraftingId(recipeId);
    onMessage(null);
    setCraftResult(null);
    try {
      const res = await fetch("/api/v2/guild/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId,
          mode: craftMode,
          outpostId,
          useMaterialSubstitution,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        onMessage(ERROR_TEXT[json.error ?? ""] ?? "제작에 실패했습니다.");
        setCraftResult(null);
        onServerSync({ ok: false, ...json });
        return;
      }
      const crafted = state?.recipes.find((recipe) => recipe.id === recipeId);
      const selectedSubstitution =
        craftMode === "masterwork"
          ? crafted?.masterwork?.materialSubstitution
          : crafted?.materialSubstitution;
      onServerSync({ ok: true, ...json });
      const grantedTitleNames = Array.isArray(json.grantedTitles)
        ? json.grantedTitles
            .map((id: unknown) =>
              typeof id === "string" ? TITLES[id]?.name : undefined,
            )
            .filter((name: unknown): name is string => typeof name === "string")
        : [];
      setCraftResult({
        iid: typeof json.iid === "string" ? json.iid : null,
        itemName: crafted?.itemName ?? "장비",
        slot: crafted?.slot ?? "weapon",
        tier: crafted?.tier ?? 1,
        craftOnly: crafted?.craftOnly === true,
        craftQualityLevel: Math.max(
          0,
          Math.floor(Number(json.craftQuality?.level ?? 0)),
        ),
        craftMode:
          json.craftMode === "masterwork" || craftMode === "masterwork"
            ? "masterwork"
            : "normal",
        masterwork: json.craftMode === "masterwork" || craftMode === "masterwork",
        artisanXpGained: Math.max(
          0,
          Math.floor(Number(json.artisanXpGained ?? crafted?.artisanXp ?? 0)),
        ),
        grantedTitleNames,
        materialSubstitutionText:
          useMaterialSubstitution && selectedSubstitution
            ? selectedSubstitution.replacements
                .map(
                  (replacement) =>
                    `${replacement.requiredMaterialName} → ${replacement.substituteMaterialName} ${replacement.count}개`,
                )
                .join(" · ")
            : null,
        substitutionGoldCost: Math.max(
          0,
          Math.floor(Number(json.substitutionGoldCost) || 0),
        ),
      });
      onAfterCraft();
    } catch {
      onMessage("제작 요청을 처리하지 못했습니다.");
      setCraftResult(null);
    } finally {
      setCraftingId(null);
    }
  }

  // 추천 카드의 원클릭 제작 — 모드 전환 직후 마운트에서 1회 실행(옛 인라인 craft 호출과 동일).
  useEffect(() => {
    if (!autoCraft || craftingId != null) return;
    onAutoCraftConsumed();
    queueMicrotask(() => void craft(autoCraft.recipeId, autoCraft.craftMode));
    // craft 는 렌더마다 새 함수 — 요청(autoCraft) 소비 시점에만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCraft]);

  return (
    <>
      {craftResult ? (
        <div
          className={`ui-treasure-result overflow-hidden rounded border text-xs shadow-sm ${craftResultVisual?.frame ?? ""}`}
        >
          <div
            className={`border-b px-3 py-2 ${craftResultVisual?.header ?? ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-semibold ${craftResultVisual?.title ?? ""}`}>
                {craftResultHeadline(craftResult)}
              </span>
              {craftResult.masterwork ? <MasterworkBadge /> : null}
              {craftResult.craftOnly ? <CraftOnlyBadge /> : null}
              <CraftQualityBadge craftQuality={craftResultQuality} />
            </div>
            <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
              {craftResultMessage(craftResult)}
            </div>
            {craftResult.materialSubstitutionText ? (
              <div
                className={`${SURFACE_ACCENT} mt-1 px-2 py-1 text-[11px] font-medium text-amber-900 dark:text-amber-200`}
              >
                상위 재료 대체: {craftResult.materialSubstitutionText} · 추가{" "}
                {craftResult.substitutionGoldCost.toLocaleString()} G
              </div>
            ) : null}
            {craftResultMasterworkLine ? (
              <div className="mt-1 rounded border border-rose-200 bg-white/70 px-2 py-1 text-[11px] font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100">
                {craftResultMasterworkLine}
              </div>
            ) : null}
          </div>
          <div className="grid gap-2 px-3 py-2 text-zinc-700 dark:text-zinc-200 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {craftResult.itemName}
              </div>
              <div className="mt-1 text-zinc-500 dark:text-zinc-400">
                {V2_SLOT_LABEL[craftResult.slot]} ·{" "}
                {workshopEquipmentTierLabel(craftResult.tier)} ·
                대장장이 숙련도 +{craftResult.artisanXpGained.toLocaleString()}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 sm:justify-end">
              <Link
                href={`/character/inventory?tab=${craftResult.slot}${
                  craftResult.iid ? `&item=${craftResult.iid}` : ""
                }`}
                className="rounded border border-zinc-300 bg-white px-2 py-px font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                장비 보기
              </Link>
              {craftResult.craftOnly ? (
                <span className="rounded bg-emerald-100 px-1.5 py-px font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  도감 등록 대상
                </span>
              ) : null}
              {craftResult.craftOnly ? (
                <Link
                  href="/character/codex?tab=equipment"
                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-px font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                >
                  도감 등록
                </Link>
              ) : null}
              {craftResult.grantedTitleNames.map((name) => (
                <span
                  key={name}
                  className="rounded bg-sky-100 px-1.5 py-px font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                >
                  칭호 {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
              제작 세트
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {craftedRecipes.length.toLocaleString()} /{" "}
              {totalCraftedRecipes.toLocaleString()}종 표시 · 수호/격노/질풍/룬
              각인 장비 중심
            </div>
          </div>
          <details className="group">
            <summary className="cursor-pointer rounded border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
              제작 참고
            </summary>
            <div className="mt-2 w-full space-y-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900 sm:min-w-[420px]">
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  재료 수급처
                </div>
                <div
                  className={`${SURFACE_ACCENT} mt-1 px-2 py-1 text-[11px] text-amber-900 dark:text-amber-200`}
                >
                  부족한 제작소 전용 재료는 바로 윗단계 재료로만 1:1 대체할 수
                  있습니다. 대체 재료는 별도 버튼을 눌렀을 때만 소모됩니다. ·{" "}
                  <Link
                    href="/plaza/market"
                    className="font-semibold underline underline-offset-2"
                  >
                    거래소 보기
                  </Link>
                </div>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {GUILD_WORKSHOP_MATERIAL_IDS.map((id) => {
                    const mat = GUILD_WORKSHOP_MATERIALS[id];
                    const source = GUILD_WORKSHOP_MATERIAL_SOURCES[id];
                    const amount = Math.max(
                      0,
                      Math.floor(Number(materials[id]) || 0),
                    );
                    const substituteId = GUILD_WORKSHOP_MATERIAL_SUBSTITUTE[id];
                    return (
                      <div
                        key={id}
                        className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {mat.name}
                          </span>
                          <span className="font-mono text-[11px] text-sky-700 dark:text-sky-300">
                            {amount.toLocaleString()}개
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                          {source.source} · {source.depthText} · 드랍{" "}
                          {(GUILD_WORKSHOP_MATERIAL_DROP_PCT[id] * 100).toFixed(
                            1,
                          )}
                          %
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                          {substituteId ? (
                            <span>
                              부족 시 {GUILD_WORKSHOP_MATERIALS[substituteId].name}
                              으로 1:1 대체
                            </span>
                          ) : (
                            <span>상위 대체 재료 없음</span>
                          )}
                          <span aria-hidden>·</span>
                          <Link
                            href="/plaza/market"
                            className="font-medium text-sky-700 underline underline-offset-2 dark:text-sky-300"
                          >
                            거래소
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                  {MONSTER_CRAFT_MATERIAL_DROP_RULES.map((rule) => {
                    const mat = MONSTER_CRAFT_MATERIALS[rule.materialId];
                    const amount = Math.max(
                      0,
                      Math.floor(Number(materials[rule.materialId]) || 0),
                    );
                    return (
                      <div
                        key={rule.materialId}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 dark:border-emerald-900 dark:bg-emerald-950/20"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {mat.name}
                          </span>
                          <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                            {amount.toLocaleString()}개
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                          {rule.sourceArea} · {rule.monsterKey} · 드랍{" "}
                          {(rule.chance * 100).toFixed(1)}%
                        </div>
                      </div>
                    );
                  })}
                  {(() => {
                    const id = COOP_BOSS_MATERIAL_ID.canyon_predator;
                    const mat = COOP_BOSS_MATERIAL.canyon_predator;
                    const amount = Math.max(
                      0,
                      Math.floor(Number(materials[id]) || 0),
                    );
                    return (
                      <div
                        key={id}
                        className="rounded border border-violet-200 bg-violet-50 px-2 py-1 dark:border-violet-900 dark:bg-violet-950/20"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {mat.name}
                          </span>
                          <span className="font-mono text-[11px] text-violet-700 dark:text-violet-300">
                            {amount.toLocaleString()}개
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                          협동 보스 · 스콜피온 킹 기여 보상
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  제작 세트 목표
                </div>
                <div className="mt-1 grid gap-1">
                  {craftedTagSets.map((set) => (
                    <div key={set.id} className="flex flex-wrap items-center gap-1">
                      <span className="font-medium text-zinc-700 dark:text-zinc-200">
                        {set.name}
                      </span>
                      {set.thresholds.map((threshold) => (
                        <span
                          key={threshold.count}
                          className="rounded bg-zinc-100 px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {threshold.count}세트
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  해체는 대장장이 Lv 6부터 가능하며, 제작자 각인 장비와 제작
                  전용 장비에서 일부 재료를 회수합니다.
                </div>
              </div>
            </div>
          </details>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "전체"],
              ["weapon", V2_SLOT_LABEL.weapon],
              ["armor", V2_SLOT_LABEL.armor],
              ["gloves", V2_SLOT_LABEL.gloves],
              ["boots", V2_SLOT_LABEL.boots],
              ["ring", V2_SLOT_LABEL.ring],
              ["necklace", V2_SLOT_LABEL.necklace],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRecipeSlotFilter(value)}
              className={`rounded-full px-2.5 py-1 font-medium transition ${
                recipeSlotFilter === value
                  ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950"
                  : "bg-white text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_auto]">
          <select
            value={recipeScopeFilter}
            onChange={(e) =>
              setRecipeScopeFilter(e.target.value as "all" | "craftable")
            }
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="all">제작 세트 전체</option>
            <option value="craftable">제작 가능</option>
          </select>
          <select
            value={recipeSort}
            onChange={(e) =>
              setRecipeSort(e.target.value as "level" | "tier" | "chance")
            }
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="level">해금 레벨순</option>
            <option value="tier">티어 높은순</option>
            <option value="chance">품질 확률순</option>
          </select>
          <button
            type="button"
            aria-pressed={unregisteredCodexOnly}
            disabled={equipmentCodexStatus !== "ready"}
            onClick={() => setUnregisteredCodexOnly((current) => !current)}
            className={`rounded border px-2.5 py-1 font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              unregisteredCodexOnly
                ? "border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
            title={
              equipmentCodexStatus === "loading"
                ? "장비 도감 정보를 불러오는 중입니다."
                : equipmentCodexStatus === "error"
                  ? "장비 도감 정보를 불러오지 못해 필터를 사용할 수 없습니다."
                  : "장비 도감에 아직 등록하지 않은 제작품만 표시합니다."
            }
          >
            {equipmentCodexStatus === "loading"
              ? "도감 확인 중"
              : equipmentCodexStatus === "error"
                ? "도감 필터 사용 불가"
                : "도감 미등록만"}
          </button>
        </div>
      </div>

      <div className="divide-y divide-zinc-200 overflow-hidden rounded border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
        {craftedRecipes.map((recipe) => renderRecipeRow(recipe))}
        {!loading && craftedRecipes.length === 0 ? (
          <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            조건에 맞는 제작 세트 의뢰가 없습니다.
          </div>
        ) : null}
      </div>

      {totalTrainingRecipes > 0 ? (
        <details className="rounded border border-zinc-200 bg-white text-xs dark:border-zinc-700 dark:bg-zinc-900">
          <summary className="cursor-pointer px-3 py-2 font-semibold text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900">
            수련 제작 {trainingRecipes.length.toLocaleString()} /{" "}
            {totalTrainingRecipes.toLocaleString()}종
          </summary>
          <div className="border-t border-zinc-200 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            드랍 장비와 같은 기본 레시피입니다. 초반 숙련도 보강용으로만
            분리해 두었습니다.
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {trainingRecipes.map((recipe) => renderRecipeRow(recipe))}
            {!loading && trainingRecipes.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                조건에 맞는 수련 제작 의뢰가 없습니다.
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {previewCard ? (
        <V2ItemCard
          item={previewCard.item}
          anchor={previewCard.anchor}
          onClose={() => setPreviewCard(null)}
        />
      ) : null}
    </>
  );
}
