"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Hammer, Mountains, Sparkle, Tree } from "@phosphor-icons/react";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_INSET } from "@/components/ui/surfaces";
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
import { LIFE_CRAFTING_RECIPES, type LifeCraftingRecipe, type LifeFinishedItemId } from "./lifeCrafting";
import { LifeRequestBoard } from "./LifeRequestBoard";

type WorkshopRecipeView = {
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
  gold: number;
  bankedGold: number;
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
  result?: {
    action: string;
    produced?: number;
    bonusCount?: number;
    outputId?: LifeProcessedMaterialId;
    grantedTitles?: string[];
    itemId?: LifeFinishedItemId;
    recipeId?: string;
    blueprintRecipeId?: string;
  };
};

type WorkshopTab = "requests" | "process" | "craft" | "tools" | "specialization" | "codex";

const TAB_LABELS: Array<{ id: WorkshopTab; label: string }> = [
  { id: "requests", label: "생활 의뢰" },
  { id: "process", label: "재료 가공" },
  { id: "craft", label: "생활 제작" },
  { id: "tools", label: "생활 도구" },
  { id: "specialization", label: "전문화" },
  { id: "codex", label: "가공 도감" },
];

const ACTIVITY_LABEL: Record<LifeWorkshopActivity, string> = {
  woodcutting: "벌목",
  mining: "채광",
};

const ERROR_TEXT: Record<string, string> = {
  bad_recipe: "가공법을 확인할 수 없습니다.",
  level_required: "생활 레벨이 부족합니다.",
  not_enough_materials: "필요한 재료가 부족합니다.",
  not_enough_gold: "전문화 변경에 필요한 골드가 부족합니다.",
  already_selected: "이미 선택한 전문화입니다.",
  max_tool: "도구를 최고 단계까지 승급했습니다.",
  bad_craft_recipe: "제작법을 확인할 수 없습니다.",
  blueprint_required: "아직 숨겨진 도안을 발견하지 못했습니다.",
  batch_locked: "제작 기록이 부족해 해당 수량을 한 번에 만들 수 없습니다.",
  aid_in_use: "사용 중인 보조품의 횟수를 먼저 소진해야 합니다.",
  aid_not_owned: "활성화할 보조품을 보유하고 있지 않습니다.",
  aid_not_active: "활성화된 보조품이 없습니다.",
};

function materialName(id: string): string {
  return V2_MATERIALS[id]?.name ?? id;
}

function requirementText(
  costs: Record<string, number>,
  materials: Record<string, number>,
): string {
  return Object.entries(costs)
    .map(([id, amount]) => `${materialName(id)} ${materials[id] ?? 0}/${amount}`)
    .join(" · ");
}

export function LifeWorkshopView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<WorkshopPayload | null>(null);
  const [tab, setTab] = useState<WorkshopTab>("requests");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v2/life-workshop");
      const json = (await response.json().catch(() => null)) as WorkshopPayload | null;
      setData(response.ok && json?.ok ? json : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 서버 상태를 불러온 뒤 렌더링한다.
    void refresh();
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
          | (WorkshopPayload & { error?: string; requiredLevel?: number })
          | null;
        if (!response.ok || !json?.ok) {
          const base = ERROR_TEXT[json?.error ?? ""] ?? "작업을 완료하지 못했습니다.";
          setNotice(
            json?.error === "level_required" && json.requiredLevel
              ? `${base} (필요 Lv.${json.requiredLevel})`
              : base,
          );
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
          setNotice("보조품을 활성화했습니다. 성공한 관련 행동에만 횟수가 소모됩니다.");
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

  const recipesByActivity = useMemo(() => {
    if (!data) return { woodcutting: [], mining: [] };
    return {
      woodcutting: data.recipes.filter((recipe) => recipe.activity === "woodcutting"),
      mining: data.recipes.filter((recipe) => recipe.activity === "mining"),
    };
  }, [data]);

  return (
    <PageShell spacing="normal">
      <SubViewHeader title="생활 조합 작업장" onBack={onBack} />

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

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 sm:grid-cols-6 dark:bg-zinc-900">
        {TAB_LABELS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-lg px-1 py-2 text-[11px] font-semibold transition sm:text-xs ${
              tab === entry.id
                ? "bg-white text-amber-700 shadow-sm dark:bg-zinc-800 dark:text-amber-300"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {notice ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <Card padding="md"><Skeleton rows={5} /></Card>
      ) : !data ? (
        <LoadErrorBanner onRetry={() => void refresh()} />
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
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                  대성공 {lifeProcessingGreatSuccessPct(activity, data.state, data.levels[activity])}%
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {recipesByActivity[activity].map((recipe) => {
                  const unlocked = data.levels[activity] >= recipe.requiredLevel;
                  return (
                    <div key={recipe.id} className={`${SURFACE_INSET} flex flex-col gap-2 p-3 sm:flex-row sm:items-center`}>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">
                          {materialName(recipe.inputId)} {recipe.inputAmount}개 → {materialName(recipe.outputId)} {recipe.outputAmount}개
                        </div>
                        <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          필요 Lv.{recipe.requiredLevel} · 보유 {data.materials[recipe.inputId] ?? 0}개
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="xs"
                          variant="secondary"
                          disabled={!unlocked || recipe.maxBatches < 1 || busy !== null}
                          onClick={() => void mutate(`process:${recipe.id}:1`, { action: "process", recipeId: recipe.id, batches: 1 })}
                        >
                          1회
                        </Button>
                        <Button
                          size="xs"
                          disabled={!unlocked || recipe.maxBatches < 1 || busy !== null}
                          onClick={() => void mutate(`process:${recipe.id}:max`, { action: "process", recipeId: recipe.id, batches: recipe.maxBatches })}
                        >
                          최대 {recipe.maxBatches}회
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      ) : tab === "craft" ? (
        <div className="space-y-3">
          {(["aid", "furniture"] as const).map((kind) => (
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
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold">{hiddenUnknown ? "숨겨진 도안" : recipe.name}</div>
                        <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-300">보유 {owned}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hiddenUnknown ? `${recipe.blueprintSource ?? "생활"} 활동 중 아주 낮은 확률로 발견됩니다.` : recipe.description}</p>
                      {!hiddenUnknown ? (
                        <>
                          <div className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300">{requirementText(recipe.costs, data.materials)}</div>
                          <div className="mt-1 text-[10px] text-zinc-500">제작 기록 {recipe.craftCount}회 · 단계 {recipe.masteryStage}/5 · 일괄 한도 {recipe.batchLimit}</div>
                          <div className="mt-2 flex gap-1">
                            {[1, recipe.maxCraftable].filter((value, index, list) => value > 0 && list.indexOf(value) === index).map((quantity) => (
                              <Button key={quantity} size="xs" disabled={busy !== null || recipe.maxCraftable < quantity} onClick={() => void mutate(`craft:${recipe.id}:${quantity}`, { action: "craft", recipeId: recipe.id, quantity })}>
                                {quantity === 1 ? "1개 제작" : `${quantity}개 일괄 제작`}
                              </Button>
                            ))}
                            {recipe.maxCraftable === 0 ? <span className="self-center text-[11px] text-rose-600">재료 또는 레벨 부족</span> : null}
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
      ) : tab === "tools" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card padding="md" className="sm:col-span-2">
            <h2 className="text-sm font-bold">활성 보조품</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(["woodcutting", "mining", "fishing"] as const).map((activity) => {
                const active = data.state.crafting.activeAids[activity];
                const candidates = LIFE_CRAFTING_RECIPES.filter((recipe) => recipe.kind === "aid" && ((activity === "woodcutting" && recipe.outputId.startsWith("logging_wedge_")) || (activity === "mining" && recipe.outputId.startsWith("mining_probe_")) || (activity === "fishing" && recipe.outputId === "tidy_bait_box")));
                return (
                  <div key={activity} className={`${SURFACE_INSET} p-3`}>
                    <div className="font-bold">{activity === "woodcutting" ? "벌목" : activity === "mining" ? "채광" : "낚시"}</div>
                    {active ? (
                      <>
                        <div className="mt-1 text-xs">{LIFE_CRAFTING_RECIPES.find((recipe) => recipe.outputId === active.itemId)?.name ?? active.itemId}</div>
                        <div className="text-[11px] text-zinc-500">남은 성공 {active.remainingUses.toLocaleString()}회 · {active.enabled ? "사용 중" : "일시 정지"}</div>
                        <Button className="mt-2 w-full" size="xs" variant="secondary" disabled={busy !== null} onClick={() => void mutate(`toggle:${activity}`, { action: "toggle_aid", activity })}>{active.enabled ? "사용 끄기" : "사용 켜기"}</Button>
                      </>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {candidates.filter((recipe) => (data.state.crafting.balances[recipe.outputId] ?? 0) > 0).map((recipe) => (
                          <Button key={recipe.id} className="w-full" size="xs" disabled={busy !== null} onClick={() => void mutate(`aid:${recipe.outputId}`, { action: "activate_aid", itemId: recipe.outputId })}>{recipe.name} 활성화</Button>
                        ))}
                        {candidates.every((recipe) => (data.state.crafting.balances[recipe.outputId] ?? 0) < 1) ? <div className="text-xs text-zinc-500">활성화 가능한 보조품이 없습니다.</div> : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
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
                          onClick={() => {
                            if (changeCost > 0 && !window.confirm(`${changeCost.toLocaleString()}골드를 사용해 전문화를 변경할까요?`)) return;
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
