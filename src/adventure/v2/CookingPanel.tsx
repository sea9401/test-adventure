"use client";

import { useCallback, useEffect, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { SURFACE_ACCENT, SURFACE_CARD } from "@/components/ui/surfaces";
import { PlumpGameIcon } from "@/components/icons/PlumpGameIcon";
import { useSystemMessageState } from "./RewardToastProvider";
import { useRefreshGameState } from "./GameStateRefreshContext";
import { LifeLevelMilestoneNotice } from "./LifeLevelMilestoneNotice";
import { ProductionJobAdvanceNotice } from "./ProductionJobAdvanceNotice";
import { CookingResearchPanel } from "./cooking/CookingResearchPanel";
import { CookingCodexPanel } from "./cooking/CookingCodexPanel";
import { CookingPublicDiscoveryPanel } from "./cooking/CookingPublicDiscoveryPanel";
import { CookingSpecialtyPanel } from "./cooking/CookingSpecialtyPanel";
import { CookingDeliveryPanel } from "./cooking/CookingDeliveryPanel";
import { CookingProcessingPanel } from "./cooking/CookingProcessingPanel";
import type { CookingMutation, CookingResponse } from "./cooking/clientTypes";
import { COOKING_FIELD_NAMES } from "./cooking/types";

export { SurplusCropLabel } from "./SurplusExchangePanel";

type CookingSection = "research" | "codex" | "public" | "specialty" | "delivery" | "processing";

const ERROR_TEXT: Record<string, string> = {
  duplicate_combination: "이미 실패한 조합입니다. 재료는 소비하지 않았습니다.",
  method_locked: "아직 사용할 수 없는 조리법입니다.",
  too_few_ingredients: "재료를 2개 이상 선택해 주세요.",
  too_many_ingredients: "현재 레벨의 연구 슬롯을 초과했습니다.",
  invalid_ingredient: "사용할 수 없는 재료가 포함되어 있습니다.",
  not_enough_ingredients: "선택한 연구 재료가 부족합니다.",
  recipe_already_known: "이미 발견한 레시피입니다.",
  recipe_locked: "아직 발견하지 않았거나 요리 레벨이 부족합니다.",
  not_enough_farm_items: "농장·목장 재료가 부족합니다.",
  not_enough_fishing_items: "어획물이 부족합니다.",
  not_enough_kitchen_items: "주방 재료가 부족합니다.",
  not_enough_cooking_prep_sets: "요리 준비 세트가 조리 수량보다 부족합니다.",
  not_enough_gold: "골드가 부족합니다.",
  specialty_locked: "요리 Lv 20과 숨은 레시피 10종 발견이 필요합니다.",
  specialty_permanent: "주 전문 분야는 이미 확정되어 변경할 수 없습니다.",
  food_not_eligible: "이 납품 조건에 맞지 않는 음식입니다.",
  delivery_completed: "이미 완료한 납품 요청입니다.",
  cooked_food_unavailable: "선택한 완성 음식을 보유하고 있지 않습니다.",
  standing_delivery_limit: "오늘의 상시 납품 한도를 모두 사용했습니다.",
  rate_limited: "요리 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
};

export function cookingErrorText(code: string): string {
  return ERROR_TEXT[code] ?? "요리 작업을 마치지 못했습니다.";
}

async function fetchCookingData(): Promise<CookingResponse> {
  const response = await fetch("/api/v2/cooking", { cache: "no-store" });
  const json = await response.json() as CookingResponse & { error?: string };
  if (!response.ok || !json.ok) throw new Error(json.error ?? "load_failed");
  return json;
}

export function cookingLevelProgressView(input: { xp: number; currentLevelXp: number; nextLevelXp: number | null }) {
  if (input.nextLevelXp == null) return { percent: 100, label: "최종 숙련 달성 · MAX" };
  const current = Math.max(0, Math.floor(input.xp - input.currentLevelXp));
  const needed = Math.max(1, Math.floor(input.nextLevelXp - input.currentLevelXp));
  return {
    percent: Math.round(Math.max(0, Math.min(100, current / needed * 100)) * 10) / 10,
    label: `${current.toLocaleString("ko-KR")} / ${needed.toLocaleString("ko-KR")} XP`,
  };
}

function resultMessage(data: CookingResponse): string {
  const result = data.result ?? {};
  if (result.action === "research") {
    if (result.outcome === "success") {
      return `${String(result.recipeName)} 레시피 발견!${result.firstDiscovery ? " 서버 최초 개발자로 등록되어 이 음식을 만들면 성능 +10%가 붙습니다." : ""}`;
    }
    const earnedXp = Math.max(0, Math.floor(Number(result.earnedXp) || 0));
    const failedDishCount = Math.max(0, Math.floor(Number(result.failedDishCount) || 0));
    return `조합 연구 실패 · 선택 재료 각 1개 소비 · 요리 XP +${earnedXp.toLocaleString("ko-KR")} · 실패 음식 +${failedDishCount.toLocaleString("ko-KR")}`;
  }
  if (result.action === "craft") return `${data.knownRecipes.find((entry) => entry.id === result.recipeId)?.name ?? "요리"} ${Number(result.quantity) || 1}개 완성 · ${String(result.quality ?? "normal")}${Number(result.usedPrepSets) > 0 ? ` · 준비 세트 ${Number(result.usedPrepSets)}개 사용` : ""}`;
  if (result.action === "choose_specialty") return `${COOKING_FIELD_NAMES[result.field as keyof typeof COOKING_FIELD_NAMES]} 전문 분야를 영구 확정했습니다.`;
  if (result.action === "deliver") return result.completedNow ? "납품 목표를 달성해 보상을 받았습니다." : `납품 점수 +${Number(result.scoreAdded) || 0}`;
  if (result.action === "standing_delivery") return `상시 납품 완료 · ${Number(result.gold).toLocaleString()}골드`;
  if (result.action === "buy_pantry") return "주방 재료를 구매했습니다.";
  if (result.action === "process") return "주방 재료 가공을 마쳤습니다.";
  return "주방 상태를 갱신했습니다.";
}

export function CookingWorkspace({ data, section, onSectionChange, busy, mutate }: {
  data: CookingResponse;
  section: CookingSection;
  onSectionChange: (section: CookingSection) => void;
  busy: boolean;
  mutate: CookingMutation;
}) {
  const progress = cookingLevelProgressView({ xp: data.cooking.xp, currentLevelXp: data.currentLevelXp, nextLevelXp: data.nextLevelXp });
  const recipeTotal = data.recipeTotal;
  return <div className="space-y-4">
    <section className={`${SURFACE_CARD} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-zinc-100"><PlumpGameIcon name="cooking" size={22} />레시피 연구실 · 요리 Lv {data.level}</h2><p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{recipeTotal}종의 레시피 조합을 연구하고, 거래 가능한 12시간 음식을 만듭니다.</p></div>
        <div className="text-right text-xs text-zinc-600 dark:text-zinc-300"><div>{data.cookingJobName ?? "요리 직업 미전직"}</div><div>발견 {data.cooking.discoveredRecipeIds.length}/{recipeTotal} · 실패 음식 {data.failedCookingDishes}개</div><div>농장 증표 {data.farmReputation}</div></div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"><div className="h-full bg-amber-500" style={{ width: `${progress.percent}%` }} /></div>
      <div className="mt-1 text-right text-[11px] text-zinc-500">{progress.label}</div>
    </section>
    <div className={`${SURFACE_CARD} px-1`}><TabBar tabs={[
      { key: "research", label: "연구" }, { key: "codex", label: "도감" }, { key: "public", label: "공개 발견" }, { key: "specialty", label: "전문 분야" }, { key: "delivery", label: "납품" }, { key: "processing", label: "재료 가공" },
    ]} active={section} onChange={onSectionChange} ariaLabel="요리 연구실 메뉴" className="justify-around" scrollable /></div>
    {section === "research" ? <CookingResearchPanel data={data} busy={busy} mutate={mutate} /> : null}
    {section === "codex" ? <CookingCodexPanel data={data} busy={busy} mutate={mutate} /> : null}
    {section === "public" ? <CookingPublicDiscoveryPanel discoveries={data.publicDiscoveries} /> : null}
    {section === "specialty" ? <CookingSpecialtyPanel data={data} busy={busy} mutate={mutate} /> : null}
    {section === "delivery" ? <CookingDeliveryPanel data={data} busy={busy} mutate={mutate} /> : null}
    {section === "processing" ? <CookingProcessingPanel data={data} busy={busy} mutate={mutate} /> : null}
  </div>;
}

export function CookingPanel({ onFarmChanged }: { onFarmChanged?: () => void }) {
  const refreshGameState = useRefreshGameState();
  const [data, setData] = useState<CookingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<CookingSection>("research");
  const [notice, setNotice] = useSystemMessageState();

  useEffect(() => {
    void fetchCookingData().then(setData).catch(() => setNotice("주방 상태를 불러오지 못했습니다.")).finally(() => setLoading(false));
  }, [setNotice]);

  const mutate = useCallback<CookingMutation>(async (body) => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/v2/cooking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json() as CookingResponse & { error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error ?? "cooking_failed");
      setData(json);
      setNotice(resultMessage(json));
      onFarmChanged?.();
      await refreshGameState();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setNotice(cookingErrorText(code));
      return { error: code };
    } finally {
      setBusy(false);
    }
  }, [onFarmChanged, refreshGameState, setNotice]);

  if (loading && !data) return <div className={`${SURFACE_CARD} p-6 text-center text-sm text-zinc-500`}>주방을 정리하는 중…</div>;
  if (!data) return <div className={`${SURFACE_CARD} p-6 text-center text-sm text-zinc-500`}>주방을 불러오지 못했습니다.</div>;
  return <>
    {notice ? <div role="status" className={`${SURFACE_ACCENT} mb-4 px-3 py-2 text-sm font-semibold text-amber-950 dark:text-amber-100`}>{notice}</div> : null}
    <ProductionJobAdvanceNotice refreshKey={data.level} />
    <LifeLevelMilestoneNotice activity="cooking" level={data.level} />
    <CookingWorkspace data={data} section={section} onSectionChange={setSection} busy={busy} mutate={mutate} />
  </>;
}
