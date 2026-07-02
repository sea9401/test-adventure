import { useMemo } from "react";
import {
  BLACKSMITH_ARTISAN_JOBS,
  BLACKSMITH_ARTISAN_SKILLS,
  BLACKSMITH_MASTERWORK_LEVEL,
  BLACKSMITH_PLUS2_QUALITY_LEVEL,
  BLACKSMITH_REWARD_MILESTONES,
  blacksmithJobForLevel,
  nextArtisanMilestone,
} from "@/adventure/data/v2/artisan";
import {
  GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT,
  GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT,
  GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT,
} from "@/adventure/data/v2/guildWorkshop";
import { CRAFT_QUALITY_BONUS_PCT } from "@/adventure/data/v2/v2Equipment";
import {
  emptyWorkshopRecords,
  nextWorkshopGoal,
  titleGoalLine,
  workshopRecordQualityText,
  type WorkshopRecipeView,
  type WorkshopRecordEntry,
  type WorkshopState,
} from "./guildWorkshopPanelModel";

// 대장장이 성장 패널 — GuildWorkshopPanel 의 growth 모드 블록(성장/효과/기록/성장표,
// 읽기 전용)을 분리(2026-07, WorkshopDismantlePanel 과 같은 분해 레시피).
// 모든 표시는 워크숍 상태(state)의 순수 파생이라 prop 은 state 하나다.
export function WorkshopGrowthPanel({ state }: { state: WorkshopState }) {
  const blacksmithLevel = state.artisan.blacksmith.level ?? 1;
  const currentBlacksmithJob = blacksmithJobForLevel(blacksmithLevel);
  const nextBlacksmithJob =
    BLACKSMITH_ARTISAN_JOBS.find(
      (job) => job.requiredLevel > blacksmithLevel,
    ) ?? null;
  const nextBlacksmithSkill =
    BLACKSMITH_ARTISAN_SKILLS.find((skill) => skill.level > blacksmithLevel) ??
    null;
  const nextBlacksmithReward = nextArtisanMilestone(
    BLACKSMITH_REWARD_MILESTONES,
    blacksmithLevel,
  );
  const nextSmithyUnlockRecipes = useMemo(() => {
    const currentLevel = state.smithyLevel ?? 1;
    const nextLevel = currentLevel + 1;
    return state.recipes
      .filter((recipe) => recipe.requiredSmithyLevel === nextLevel)
      .sort(
        (a, b) =>
          a.requiredArtisanLevel - b.requiredArtisanLevel ||
          a.itemName.localeCompare(b.itemName, "ko"),
      );
  }, [state]);
  const currentEffectSummary = useMemo(() => {
    const sampleRecipe = state.recipes[0];
    const normalQualityChance = sampleRecipe?.qualityChancePct ?? 0;
    const masterworkQualityChance =
      sampleRecipe?.masterwork?.qualityChancePct ?? 0;
    const unlockedRecipes = state.recipes.filter(
      (recipe) => recipe.levelOk && recipe.smithyLevelOk,
    );
    const craftOnlyUnlocked = unlockedRecipes.filter(
      (recipe) => recipe.craftOnly,
    ).length;
    const maxTier = unlockedRecipes.reduce(
      (max, recipe) => Math.max(max, recipe.tier),
      0,
    );
    return {
      normalQualityChance,
      masterworkQualityChance,
      maxTier,
      unlockedRecipeCount: unlockedRecipes.length,
      totalRecipeCount: state.recipes.length,
      craftOnlyUnlocked,
      masterworkUnlocked: blacksmithLevel >= BLACKSMITH_MASTERWORK_LEVEL,
      plus2Unlocked: blacksmithLevel >= BLACKSMITH_PLUS2_QUALITY_LEVEL,
    };
  }, [blacksmithLevel, state]);
  const workshopRecords = state.workshopRecords ?? emptyWorkshopRecords();
  const topRecipeRecords = useMemo(() => {
    if (!state.workshopRecords) return [];
    return Object.entries(state.workshopRecords.recipes)
      .map(([id, record]) => {
        const recipe = state.recipes.find((r) => r.id === id);
        return recipe && record ? { id, recipe, record } : null;
      })
      .filter(
        (
          entry,
        ): entry is {
          id: string;
          recipe: WorkshopRecipeView;
          record: WorkshopRecordEntry;
        } => entry != null,
      )
      .sort(
        (a, b) =>
          b.record.crafts - a.record.crafts ||
          b.record.bestQualityLevel - a.record.bestQualityLevel ||
          b.recipe.tier - a.recipe.tier,
      )
      .slice(0, 4);
  }, [state]);

  return (
    <div className="space-y-3 border-b border-zinc-200 pb-3 text-xs text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
      <div className="grid gap-3 lg:grid-cols-[1.05fr_1fr]">
        <div className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                대장장이 성장
              </div>
              <div className="mt-1 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                Lv {blacksmithLevel.toLocaleString()} ·{" "}
                {currentBlacksmithJob.name}
              </div>
              <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                {currentBlacksmithJob.tier}차 · {currentBlacksmithJob.role}
              </div>
            </div>
            <div className="min-w-36 text-right">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                다음 레벨
              </div>
              <div className="mt-1 font-semibold">
                {Math.max(
                  0,
                  state.artisan.blacksmith.xpForNext -
                    state.artisan.blacksmith.xpIntoLevel,
                ).toLocaleString()}{" "}
                XP 남음
              </div>
            </div>
          </div>
          <div className="mt-3">
            <div className="war-meter-track h-2 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
              <div
                className="war-meter-fill h-full rounded bg-emerald-600 dark:bg-emerald-400"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      (state.artisan.blacksmith.xpIntoLevel /
                        Math.max(1, state.artisan.blacksmith.xpForNext)) *
                        100,
                    ),
                  )}%`,
                }}
              />
            </div>
            <div className="mt-1 flex justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>
                {state.artisan.blacksmith.xpIntoLevel.toLocaleString()}/
                {state.artisan.blacksmith.xpForNext.toLocaleString()} XP
              </span>
              <span>
                제작 {state.artisan.blacksmith.crafts.toLocaleString()}회
              </span>
            </div>
          </div>
          <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              다음에 할 일
            </div>
            <div className="mt-1 font-semibold text-emerald-950 dark:text-emerald-100">
              {nextWorkshopGoal(state)}
            </div>
            <div className="mt-1 text-[11px] text-emerald-800 dark:text-emerald-200">
              칭호: {titleGoalLine(state)}
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <div className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              다음 차수
            </div>
            <div className="mt-1 font-semibold">
              {nextBlacksmithJob
                ? `${nextBlacksmithJob.tier}차 · ${nextBlacksmithJob.name}`
                : "최종 차수"}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              {nextBlacksmithJob
                ? `Lv ${nextBlacksmithJob.requiredLevel} · ${nextBlacksmithJob.role}`
                : "모든 생산직 차수 해금"}
            </div>
          </div>
          <div className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              다음 스킬
            </div>
            <div className="mt-1 font-semibold">
              {nextBlacksmithSkill
                ? `Lv ${nextBlacksmithSkill.level} · ${nextBlacksmithSkill.name}`
                : "전부 적용"}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              {nextBlacksmithSkill?.description ?? "대장장이 패시브 완료"}
            </div>
          </div>
          <div className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
              다음 보상
            </div>
            <div className="mt-1 font-semibold">
              {nextBlacksmithReward
                ? `Lv ${nextBlacksmithReward.level} · ${nextBlacksmithReward.title}`
                : "전부 해금"}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              {nextBlacksmithReward?.description ??
                "모든 대장장이 보상을 해금했습니다."}
            </div>
          </div>
        </div>
      </div>

      {currentEffectSummary ? (
        <div>
          <div className="mb-2 font-semibold">현재 적용 효과</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "제작 해금",
                value:
                  currentEffectSummary.maxTier > 0
                    ? `T${currentEffectSummary.maxTier}`
                    : "없음",
                detail: `${currentEffectSummary.unlockedRecipeCount}/${currentEffectSummary.totalRecipeCount}종 · 전용 ${currentEffectSummary.craftOnlyUnlocked}종`,
              },
              {
                label: "★ 품질",
                value: `${currentEffectSummary.normalQualityChance}%`,
                detail: `위력 +${CRAFT_QUALITY_BONUS_PCT[1]}% · 최대 ${GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT}%`,
              },
              {
                label: "명장 제작",
                value: currentEffectSummary.masterworkUnlocked
                  ? `${currentEffectSummary.masterworkQualityChance}%`
                  : `Lv ${BLACKSMITH_MASTERWORK_LEVEL} 필요`,
                detail: `품질 상한 ${GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT}% · 명장 각인`,
              },
              {
                label: "★★ 품질",
                value: currentEffectSummary.plus2Unlocked
                  ? `${GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT}%`
                  : `Lv ${BLACKSMITH_PLUS2_QUALITY_LEVEL} 필요`,
                detail: `위력 +${CRAFT_QUALITY_BONUS_PCT[2]}% · 명장 제작 전용`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {item.label}
                </div>
                <div className="mt-1 font-semibold">{item.value}</div>
                <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 lg:grid-cols-[1fr_1fr]">
        <div>
          <div className="mb-2 font-semibold">제작 기록</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                누적 제작
              </div>
              <div className="mt-1 font-semibold">
                {workshopRecords.totalCrafts.toLocaleString()}회
              </div>
            </div>
            <div className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                품질 제작
              </div>
              <div className="mt-1 font-semibold">
                {workshopRecords.qualityCrafts.toLocaleString()}회
              </div>
            </div>
            <div className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                최고 기록
              </div>
              <div className="mt-1 font-semibold">
                {workshopRecords.highestTier > 0
                  ? `T${workshopRecords.highestTier}`
                  : "없음"}{" "}
                · {workshopRecordQualityText(workshopRecords.bestQualityLevel)}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            제작 전용 {workshopRecords.craftOnlyCrafts.toLocaleString()}회 ·
            명장 {workshopRecords.masterworkCrafts.toLocaleString()}회
          </div>
        </div>

        <div>
          <div className="mb-2 font-semibold">대장간 보너스</div>
          <div className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                대장간 Lv {(state.smithyLevel ?? 1).toLocaleString()} ·{" "}
                {state.smithyBonus?.label ?? "기본 제작"}
              </span>
              <span className="font-semibold">
                품질 +{state.smithyBonus?.qualityChanceBonusPct ?? 0}%p
              </span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              길드 제작 {state.guildBonus.totalCrafts.toLocaleString()}회 ·
              누적 품질 보너스 +
              {state.guildBonus.qualityChanceBonusPct.toLocaleString()}%
              {state.guildBonus.nextTotalCrafts == null
                ? " · 최대 단계"
                : ` · 다음 보너스까지 ${Math.max(
                    0,
                    state.guildBonus.nextTotalCrafts -
                      state.guildBonus.totalCrafts,
                  ).toLocaleString()}회`}
            </div>
          </div>
        </div>
      </div>

      {topRecipeRecords.length > 0 ? (
        <details className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
          <summary className="cursor-pointer text-sm font-semibold">
            자주 제작한 장비
          </summary>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {topRecipeRecords.map(({ id, recipe, record }) => (
              <div
                key={id}
                className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{recipe.itemName}</span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {record.crafts.toLocaleString()}회
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  최고 {workshopRecordQualityText(record.bestQualityLevel)} ·
                  명장 {record.masterworkCrafts.toLocaleString()}회
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <details className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <summary className="cursor-pointer text-sm font-semibold">
          세부 성장표
        </summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <div className="font-semibold">생산직 차수</div>
            <div className="mt-2 grid gap-1">
              {BLACKSMITH_ARTISAN_JOBS.map((job) => {
                const unlocked = blacksmithLevel >= job.requiredLevel;
                return (
                  <div
                    key={job.id}
                    className={`rounded border px-2 py-1 ${
                      unlocked
                        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
                        : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {job.tier}차 · {job.name}
                      </span>
                      <span className="text-[10px]">
                        {job.id === currentBlacksmithJob.id
                          ? "현재"
                          : unlocked
                            ? "해금"
                            : job.unlockText}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] opacity-80">
                      {job.role}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="font-semibold">제작 스킬</div>
            <div className="mt-2 grid gap-1">
              {BLACKSMITH_ARTISAN_SKILLS.map((skill) => {
                const unlocked = blacksmithLevel >= skill.level;
                return (
                  <div
                    key={skill.id}
                    className={`rounded border px-2 py-1 ${
                      unlocked
                        ? "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
                        : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        Lv {skill.level} · {skill.name}
                      </span>
                      <span className="text-[10px]">
                        {unlocked
                          ? "적용 중"
                          : skill.implemented
                            ? `Lv ${skill.level}`
                            : "예정"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] opacity-80">
                      {skill.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-1 sm:grid-cols-2">
          {BLACKSMITH_REWARD_MILESTONES.map((milestone) => {
            const unlocked = blacksmithLevel >= milestone.level;
            return (
              <div
                key={milestone.level}
                className={`rounded border px-2 py-1 ${
                  unlocked
                    ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
                    : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    Lv {milestone.level} · {milestone.title}
                  </span>
                  <span className="text-[10px]">
                    {unlocked ? "해금" : "잠김"}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] opacity-80">
                  {milestone.description}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      <details className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <summary className="cursor-pointer text-sm font-semibold">
          대장간 Lv 해금
        </summary>
        <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          ★ 품질 확률은 Lv1 3%, 이후 레벨당 +2%p, 길드 보너스 합산 최대
          25%입니다. 대장장이 효과는 현재 전투 직업과 무관하게 대장간
          제작 시 적용됩니다.
        </div>
        {nextSmithyUnlockRecipes.length > 0 ? (
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {nextSmithyUnlockRecipes.slice(0, 4).map((recipe) => (
              <div
                key={recipe.id}
                className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{recipe.itemName}</span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    대장간 Lv {recipe.requiredSmithyLevel}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  대장장이 Lv {recipe.requiredArtisanLevel} ·{" "}
                  {recipe.costText}
                </div>
              </div>
            ))}
            {nextSmithyUnlockRecipes.length > 4 ? (
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                외 {nextSmithyUnlockRecipes.length - 4}종 추가 해금
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 text-zinc-600 dark:text-zinc-400">
            다음 대장간 레벨에 새 제작품이 없습니다.
          </div>
        )}
      </details>
    </div>
  );
}
