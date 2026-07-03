import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SpinnerGap } from "@phosphor-icons/react";
import {
  GUILD_WORKSHOP_MATERIALS,
  GUILD_WORKSHOP_MATERIAL_IDS,
  GUILD_WORKSHOP_MATERIAL_DROP_PCT,
  GUILD_WORKSHOP_MATERIAL_SOURCES,
} from "@/adventure/data/v2/guildWorkshopMaterials";
import { TITLES } from "@/adventure/data/titles";
import type {
  GuildWorkshopCraftMode,
  GuildWorkshopRecipeId,
} from "@/adventure/data/v2/guildWorkshop";
import {
  GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT,
  GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT,
} from "@/adventure/data/v2/guildWorkshop";
import {
  V2_EQUIP_TAG_SETS,
  V2_SLOT_LABEL,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  CraftOnlyBadge,
  CraftQualityBadge,
  MasterworkBadge,
} from "../V2ItemCard";
import {
  ERROR_TEXT,
  craftQualityFromLevel,
  craftResultHeadline,
  craftResultMasterworkSummary,
  craftResultMessage,
  craftResultTone,
  masterworkButtonText,
  weeklyRecipeHints,
  type CraftResultView,
  type WeeklyState,
  type WorkshopState,
} from "./guildWorkshopPanelModel";

// 제작(craft) 모드 패널 — GuildWorkshopPanel 의 제작 클러스터(결과 카드 + 필터/참고 +
// 레시피 목록 + craft mutation)를 분리(2026-07, dismantle/growth 와 같은 분해 레시피).
// 서버 응답의 워크숍 상태 반영(자원/재료/숙련도/레시피 재계산)은 부모 소유 상태라
// onServerSync(성공/실패 공용)로 위임하고, 여기는 fetch·결과 표시·목록만 담당한다.

/** 제작 응답 중 부모 워크숍 상태에 반영할 조각 — 부모 콜백(applyCraftServerState)의 입력. */
export type CraftServerSync = {
  ok: boolean;
  resources?: WorkshopState["resources"];
  materials?: WorkshopState["materials"];
  artisan?: WorkshopState["artisan"];
  workshopStats?: WorkshopState["workshopStats"];
  workshopRecords?: WorkshopState["workshopRecords"];
  guildBonus?: WorkshopState["guildBonus"];
  recipes?: WorkshopState["recipes"];
};

export function WorkshopCraftPanel({
  state,
  weekly,
  recommendedRecipeId,
  loading,
  onMessage,
  onServerSync,
  onAfterCraft,
  autoCraft,
  onAutoCraftConsumed,
}: {
  state: WorkshopState | null;
  /** 주간 제작 의뢰 — 레시피 행의 의뢰 힌트 배지용. */
  weekly: WeeklyState | null;
  /** 추천 행동의 레시피 id — 목록 상단 고정 + "추천" 배지. */
  recommendedRecipeId: string | null;
  loading: boolean;
  /** 전 모드 공용 메시지 배너(부모 소유) — 제작 실패 문구 표시. */
  onMessage: (text: string | null) => void;
  /** 제작 응답의 워크숍 상태 반영(자원/재료/숙련도/레시피 재계산) — 부모 setState 위임. */
  onServerSync: (sync: CraftServerSync) => void;
  /** 제작 성공 후속 재조회(주간 의뢰 진행·기여도) — 부모 로더 위임. */
  onAfterCraft: () => void;
  /** 추천 카드(메인 모드) 원클릭 제작 요청 — 마운트 시 1회 실행 후 소비 통지. */
  autoCraft: {
    recipeId: GuildWorkshopRecipeId;
    craftMode: GuildWorkshopCraftMode;
  } | null;
  onAutoCraftConsumed: () => void;
}) {
  const [craftingId, setCraftingId] = useState<GuildWorkshopRecipeId | null>(
    null,
  );
  const [craftResult, setCraftResult] = useState<CraftResultView | null>(null);
  const [recipeSlotFilter, setRecipeSlotFilter] = useState<"all" | V2EquipSlot>(
    "all",
  );
  const [recipeScopeFilter, setRecipeScopeFilter] = useState<
    "all" | "craftOnly" | "craftable"
  >("all");
  const [recipeSort, setRecipeSort] = useState<"level" | "tier" | "chance">(
    "level",
  );

  const materials = useMemo(() => state?.materials ?? {}, [state?.materials]);
  const filteredRecipes = useMemo(() => {
    const recipes = [...(state?.recipes ?? [])].filter((recipe) => {
      if (recipeSlotFilter !== "all" && recipe.slot !== recipeSlotFilter) {
        return false;
      }
      if (recipeScopeFilter === "craftOnly" && !recipe.craftOnly) return false;
      if (recipeScopeFilter === "craftable" && !recipe.canCraft) return false;
      return true;
    });
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
    return recipes;
  }, [
    recipeScopeFilter,
    recipeSlotFilter,
    recipeSort,
    state?.recipes,
    recommendedRecipeId,
  ]);
  const artisanCraftedSet = V2_EQUIP_TAG_SETS.find(
    (set) => set.id === "artisan_crafted",
  );
  const craftResultQuality = craftResult
    ? craftQualityFromLevel(craftResult.craftQualityLevel)
    : undefined;
  const craftResultVisual = craftResult ? craftResultTone(craftResult) : null;
  const craftResultMasterworkLine = craftResult
    ? craftResultMasterworkSummary(craftResult)
    : null;

  async function craft(
    recipeId: GuildWorkshopRecipeId,
    craftMode: GuildWorkshopCraftMode = "normal",
  ) {
    setCraftingId(recipeId);
    onMessage(null);
    setCraftResult(null);
    try {
      const res = await fetch("/api/v2/guild/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, mode: craftMode }),
      });
      const json = await res.json();
      if (!json.ok) {
        onMessage(ERROR_TEXT[json.error ?? ""] ?? "제작에 실패했습니다.");
        setCraftResult(null);
        onServerSync({ ok: false, ...json });
        return;
      }
      const crafted = state?.recipes.find((recipe) => recipe.id === recipeId);
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
                {V2_SLOT_LABEL[craftResult.slot]} · T{craftResult.tier} ·
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

      <div className="space-y-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
              제작 목록
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {filteredRecipes.length.toLocaleString()} /{" "}
              {(state?.recipes.length ?? 0).toLocaleString()}종 표시 · 비용은
              개인 보유 재료에서 차감
            </div>
          </div>
          <details className="group">
            <summary className="cursor-pointer rounded border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800">
              제작 참고
            </summary>
            <div className="mt-2 w-full space-y-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950 sm:min-w-[420px]">
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  재료 수급처
                </div>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {GUILD_WORKSHOP_MATERIAL_IDS.map((id) => {
                    const mat = GUILD_WORKSHOP_MATERIALS[id];
                    const source = GUILD_WORKSHOP_MATERIAL_SOURCES[id];
                    const amount = Math.max(
                      0,
                      Math.floor(Number(materials[id]) || 0),
                    );
                    return (
                      <div
                        key={id}
                        className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900"
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
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  장인표 세트 목표
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {artisanCraftedSet?.thresholds.map((threshold) => (
                    <span
                      key={threshold.count}
                      className="rounded bg-zinc-100 px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {threshold.count}세트 보너스
                    </span>
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
                  : "bg-white text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <select
            value={recipeScopeFilter}
            onChange={(e) =>
              setRecipeScopeFilter(
                e.target.value as "all" | "craftOnly" | "craftable",
              )
            }
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="all">모든 레시피</option>
            <option value="craftable">제작 가능</option>
            <option value="craftOnly">제작 전용</option>
          </select>
          <select
            value={recipeSort}
            onChange={(e) =>
              setRecipeSort(e.target.value as "level" | "tier" | "chance")
            }
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="level">해금 레벨순</option>
            <option value="tier">티어 높은순</option>
            <option value="chance">품질 확률순</option>
          </select>
        </div>
      </div>

      <div className="divide-y divide-zinc-200 overflow-hidden rounded border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
        {filteredRecipes.map((recipe) => {
          const busy = craftingId === recipe.id;
          const masterwork = recipe.masterwork;
          const weeklyHints = weeklyRecipeHints(recipe, weekly);
          const recommended = recommendedRecipeId === recipe.id;
          return (
            <div
              key={recipe.id}
              className={`ui-recipe-row grid gap-3 px-3 py-2.5 ${
                recommended
                  ? "bg-emerald-50/70 dark:bg-emerald-950/20"
                  : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="text-sm text-zinc-950 dark:text-zinc-50">
                      {recipe.itemName}
                    </strong>
                    {recommended ? (
                      <span className="rounded bg-emerald-700 px-1.5 py-px text-[10px] font-semibold text-white dark:bg-emerald-500 dark:text-emerald-950">
                        추천
                      </span>
                    ) : null}
                    <span className="rounded bg-zinc-100 px-1.5 py-px text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      T{recipe.tier} · {V2_SLOT_LABEL[recipe.slot]}
                    </span>
                    {recipe.craftOnly ? <CraftOnlyBadge /> : null}
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
                    대장장이 Lv {recipe.requiredArtisanLevel} · 대장간 Lv{" "}
                    {recipe.requiredSmithyLevel} · 숙련도 +{recipe.artisanXp}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] dark:border-zinc-800 dark:bg-zinc-900">
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
                        <SpinnerGap
                          size={14}
                          className="animate-spin"
                          aria-hidden
                        />
                      ) : !recipe.levelOk ? (
                        `Lv ${recipe.requiredArtisanLevel}`
                      ) : !recipe.smithyLevelOk ? (
                        `대장간 Lv ${recipe.requiredSmithyLevel}`
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
                  <div className="mt-0.5 text-zinc-500 dark:text-zinc-500">
                    ★ {recipe.qualityChancePct}% · 상한{" "}
                    {GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT}%
                  </div>
                </div>

                <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                      명장 제작
                    </span>
                  <button
                    type="button"
                    disabled={
                      !masterwork?.canCraft || busy || craftingId != null
                    }
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
                  <div className="mt-0.5 text-zinc-500 dark:text-zinc-500">
                    {masterwork
                      ? `★ ${masterwork.qualityChancePct}% · 상한 ${GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT}%`
                      : "명장 각인/상한 확장"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!loading && filteredRecipes.length === 0 ? (
          <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            조건에 맞는 제작 의뢰가 없습니다.
          </div>
        ) : null}
      </div>
    </>
  );
}
