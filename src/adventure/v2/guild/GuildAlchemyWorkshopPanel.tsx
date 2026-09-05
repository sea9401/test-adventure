"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type GuildAlchemyChargeTarget,
  type GuildAlchemyRecipe,
} from "@/adventure/data/v2/guildAlchemy";
import { useGameResourceState } from "@/adventure/v2/GameStateProvider";
import { GameIcon } from "@/adventure/v2/GameIcon";
import { FarmItemIcon } from "@/adventure/v2/FarmItemIcon";
import { DraftNumberInput } from "@/components/ui/DraftNumberInput";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import {
  weeklyFacilityActionLimit,
  weeklyFacilityConflictNotice,
} from "./weeklyFacilityClient";

type WorkshopState = {
  level: number;
  stageLabel: string;
  weekKey: string;
  weeklySourceEligible?: boolean;
  weeklyEnergy: { used: number; limit: number; remaining: number };
  materials: { herb: number; silverleaf: number };
  charges: { hp: number; mp: number; max: number };
  staminaPotions: number;
  craftedMaterials: Record<string, number>;
  recipes: Array<GuildAlchemyRecipe & { unlocked: boolean }>;
};

type WorkshopResponse = WorkshopState & {
  ok?: boolean;
  error?: string;
  crafted?: {
    recipeName: string;
    output: GuildAlchemyRecipe["output"];
    target: GuildAlchemyChargeTarget;
    quantity: number;
    hpCharged: number;
    mpCharged: number;
    totalCharged: number;
    staminaPotionsGranted: number;
    staminaPotions: number;
    materialId: string | null;
    materialName: string | null;
    materialGranted: number;
    materialBalance: number;
  };
};

const TARGETS: Array<{ id: GuildAlchemyChargeTarget; label: string }> = [
  { id: "hp", label: "HP 충전" },
  { id: "mp", label: "MP 충전" },
  { id: "balanced", label: "반반 충전" },
];

const ALCHEMY_PANEL_CLASS = `${SURFACE_CARD} space-y-3 border-violet-200 p-3 text-sm text-zinc-900 dark:border-violet-900 dark:text-zinc-100`;

export function GuildAlchemyWorkshopPanel({
  endpoint = "/api/v2/guild/alchemy-workshop",
  title = "연금 공방",
}: {
  endpoint?: string;
  title?: string;
} = {}) {
  const { applyResourcePatch } = useGameResourceState();
  const [state, setState] = useState<WorkshopState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRecipeId, setBusyRecipeId] = useState<string | null>(null);
  const [target, setTarget] = useState<GuildAlchemyChargeTarget>("hp");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      const json = (await res.json().catch(() => null)) as WorkshopResponse | null;
      if (!res.ok || !json?.ok) {
        setNotice({ kind: "err", text: alchemyErrorText(json?.error) });
        return;
      }
      setState(json);
      applyResourcePatch({
        hpCharges: json.charges.hp,
        mpCharges: json.charges.mp,
        staminaPotions: json.staminaPotions,
      });
    } catch {
      setNotice({ kind: "err", text: "연금 공방 정보를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }, [applyResourcePatch, endpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function craft(recipe: GuildAlchemyRecipe) {
    if (!state || busyRecipeId || state.weeklySourceEligible === false) return;
    const maxQuantity = maxCraftQuantity(state, recipe, target);
    const quantity = Math.max(1, Math.min(maxQuantity, quantities[recipe.id] ?? 1));
    if (maxQuantity <= 0) return;
    setBusyRecipeId(recipe.id);
    setNotice(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: recipe.id, target, quantity }),
      });
      const json = (await res.json().catch(() => null)) as WorkshopResponse | null;
      if (!res.ok || !json?.ok || !json.crafted) {
        setNotice({ kind: "err", text: alchemyErrorText(json?.error) });
        return;
      }
      setState(json);
      setQuantities((prev) => ({ ...prev, [recipe.id]: 1 }));
      applyResourcePatch({
        hpCharges: json.charges.hp,
        mpCharges: json.charges.mp,
        staminaPotions: json.staminaPotions,
      });
      if (json.crafted.output === "stamina_potion") {
        setNotice({
          kind: "ok",
          text: `${json.crafted.recipeName} 조제 완료 · 스태미나 회복약 +${json.crafted.staminaPotionsGranted.toLocaleString()}개`,
        });
        return;
      }
      if (json.crafted.output === "material") {
        setNotice({
          kind: "ok",
          text: `${json.crafted.recipeName} 조제 완료 · ${json.crafted.materialName ?? "연성 재료"} +${json.crafted.materialGranted.toLocaleString()}개`,
        });
        return;
      }
      const gains = [
        json.crafted.hpCharged > 0
          ? `HP +${json.crafted.hpCharged.toLocaleString()}`
          : null,
        json.crafted.mpCharged > 0
          ? `MP +${json.crafted.mpCharged.toLocaleString()}`
          : null,
      ].filter(Boolean);
      setNotice({
        kind: "ok",
        text: `${json.crafted.recipeName} ${json.crafted.quantity}회 조제 완료 · ${gains.join(" · ")}`,
      });
    } catch {
      setNotice({ kind: "err", text: "충전액 조제에 실패했습니다." });
    } finally {
      setBusyRecipeId(null);
    }
  }

  const stageName = useMemo(() => state?.stageLabel, [state]);

  if (loading && !state) {
    return (
      <section className={ALCHEMY_PANEL_CLASS}>
        <p className="text-zinc-500 dark:text-zinc-400">연금 공방 확인 중…</p>
      </section>
    );
  }
  if (!state) {
    return (
      <section className={ALCHEMY_PANEL_CLASS}>
        <p className="text-red-600 dark:text-red-300">
          {notice?.text ?? "연금 공방을 이용할 수 없습니다."}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-semibold dark:border-zinc-700"
        >
          다시 시도
        </button>
      </section>
    );
  }

  return (
    <section className={ALCHEMY_PANEL_CLASS}>
      <section className={`${SURFACE_ACCENT} border-violet-200 p-4 dark:border-violet-900`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <GameIcon name="Flask" size={22} />
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {title} Lv.{state.level}
              </h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {stageName ?? "연금 조제 시설"} · 회복, 장비 강화, 협동 보스 소환에 필요한 자원을 선택해 연성합니다.
            </p>
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-right shadow-sm dark:bg-zinc-900">
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">주간 연성력</div>
            <div className="text-sm font-bold tabular-nums text-violet-700 dark:text-violet-300">
              {state.weeklyEnergy.remaining} / {state.weeklyEnergy.limit}
            </div>
          </div>
        </div>
      </section>

      {state.weeklySourceEligible === false && (
        <div className={`${SURFACE_INSET} px-3 py-2 text-xs text-amber-800 dark:text-amber-200`}>
          {weeklyFacilityConflictNotice("연금 공방")}
        </div>
      )}

      <section className="grid gap-2 sm:grid-cols-3">
        <ChargeSummary label="HP 충전약" current={state.charges.hp} max={state.charges.max} color="bg-red-500" />
        <ChargeSummary label="MP 충전약" current={state.charges.mp} max={state.charges.max} color="bg-blue-500" />
        <StaminaPotionSummary count={state.staminaPotions} />
      </section>

      <section className={`${SURFACE_INSET} p-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
            <span>보유 재료</span>
            <span className="inline-flex items-center gap-1.5">
              <FarmItemIcon itemId="herb" className="h-7 w-7" />
              허브 <b>{state.materials.herb.toLocaleString()}</b>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FarmItemIcon itemId="silverleaf" className="h-7 w-7" />
              은빛잎 <b>{state.materials.silverleaf.toLocaleString()}</b>
            </span>
          </div>
          <div>
            <div className="mb-1 text-[10px] text-zinc-500 dark:text-zinc-400">충전액 분배</div>
            <div className="flex rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700">
              {TARGETS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTarget(option.id)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                    target === option.id
                      ? "bg-violet-600 text-white"
                      : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {notice && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            notice.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-zinc-950 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-zinc-950 dark:text-red-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      <section className="grid gap-2 md:grid-cols-2">
        {state.recipes.map((recipe) => {
          const maxQuantity = maxCraftQuantity(state, recipe, target);
          const quantity = Math.max(1, Math.min(maxQuantity || 1, quantities[recipe.id] ?? 1));
          const output = recipe.chargeAmount * quantity;
          const staminaPotionOutput = (recipe.staminaPotionAmount ?? 0) * quantity;
          const materialOutput = (recipe.outputMaterialAmount ?? 0) * quantity;
          return (
            <article
              key={recipe.id}
              className={`${recipe.unlocked ? SURFACE_CARD : SURFACE_INSET} p-3 ${
                recipe.unlocked ? "" : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{recipe.name}</h4>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {recipe.description}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-violet-100 px-2 py-1 text-[11px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                  {recipe.output === "stamina_potion"
                    ? `회복약 ${recipe.staminaPotionAmount ?? 0}개`
                    : recipe.output === "material"
                      ? `${recipe.outputMaterialName ?? "연성 재료"} ${recipe.outputMaterialAmount ?? 0}개`
                    : `+${recipe.chargeAmount.toLocaleString()}`}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <span className="inline-flex items-center gap-1">
                  <FarmItemIcon itemId="herb" className="h-6 w-6" />
                  {recipe.ingredients.herb}
                </span>
                {recipe.ingredients.silverleaf > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <FarmItemIcon itemId="silverleaf" className="h-6 w-6" />
                    {recipe.ingredients.silverleaf}
                  </span>
                )}
                <span>· 연성력 {recipe.energyCost}</span>
              </div>
              {recipe.output === "stamina_potion" && recipe.unlocked ? (
                <p className="mt-2 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                  충전액 분배 설정과 무관하게 스태미나 회복약을 지급합니다.
                </p>
              ) : null}
              {recipe.output === "material" && recipe.unlocked ? (
                <p className="mt-2 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                  현재 보유 {recipe.outputMaterialId ? (state.craftedMaterials[recipe.outputMaterialId] ?? 0).toLocaleString() : 0}개 · 충전액 분배 설정과 무관
                </p>
              ) : null}
              {!recipe.unlocked ? (
                <p className="mt-3 text-center text-xs font-semibold text-zinc-500">공방 Lv.{recipe.minFacilityLevel} 필요</p>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <DraftNumberInput
                    min={1}
                    max={Math.max(1, maxQuantity)}
                    value={quantity}
                    onValueChange={(next) =>
                      setQuantities((prev) => ({ ...prev, [recipe.id]: next }))
                    }
                    disabled={busyRecipeId != null || maxQuantity <= 0}
                    className="h-9 w-16 rounded-md border border-zinc-300 bg-white px-2 text-center text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
                    aria-label={`${recipe.name} 조제 수량`}
                  />
                  <button
                    type="button"
                    onClick={() => void craft(recipe)}
                    disabled={busyRecipeId != null || maxQuantity <= 0}
                    className="h-9 flex-1 rounded-md bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyRecipeId === recipe.id
                      ? "조제 중…"
                      : recipe.output === "stamina_potion"
                        ? `스태미나 회복약 ${staminaPotionOutput.toLocaleString()}개 조제`
                        : recipe.output === "material"
                          ? `${recipe.outputMaterialName ?? "연성 재료"} ${materialOutput.toLocaleString()}개 연성`
                        : `${output.toLocaleString()} 충전 조제`}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        연성력은 매주 월요일 00:00 KST에 초기화됩니다. 길드를 옮겨도 이번 주 사용량은 유지됩니다.
      </p>
    </section>
  );
}

function ChargeSummary({
  label,
  current,
  max,
  color,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, (current / Math.max(1, max)) * 100);
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex justify-between gap-2 text-xs">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-zinc-500">{current.toLocaleString()} / {max.toLocaleString()}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StaminaPotionSummary({ count }: { count: number }) {
  return (
    <div className={SURFACE_INSET + " p-3"}>
      <div className="text-xs font-semibold">스태미나 회복약</div>
      <div className="mt-2 text-lg font-bold tabular-nums text-violet-700 dark:text-violet-300">
        {count.toLocaleString()}개
      </div>
      <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">1개 사용 시 스태미나 200 회복</div>
    </div>
  );
}

function maxCraftQuantity(
  state: WorkshopState,
  recipe: GuildAlchemyRecipe & { unlocked?: boolean },
  target: GuildAlchemyChargeTarget,
): number {
  if (recipe.unlocked === false) return 0;
  if (state.weeklySourceEligible === false) return 0;
  let max = Math.floor(state.weeklyEnergy.remaining / recipe.energyCost);
  max = Math.min(max, Math.floor(state.materials.herb / recipe.ingredients.herb));
  if (recipe.ingredients.silverleaf > 0) {
    max = Math.min(max, Math.floor(state.materials.silverleaf / recipe.ingredients.silverleaf));
  }
  if (recipe.output !== "charge") {
    return weeklyFacilityActionLimit(
      state.weeklySourceEligible,
      Math.min(15, max),
    );
  }
  const hpRoom = state.charges.max - state.charges.hp;
  const mpRoom = state.charges.max - state.charges.mp;
  if (target === "hp") max = Math.min(max, Math.floor(hpRoom / recipe.chargeAmount));
  if (target === "mp") max = Math.min(max, Math.floor(mpRoom / recipe.chargeAmount));
  if (target === "balanced") {
    const hpEach = Math.floor(recipe.chargeAmount / 2);
    const mpEach = recipe.chargeAmount - hpEach;
    max = Math.min(max, Math.floor(hpRoom / hpEach), Math.floor(mpRoom / mpEach));
  }
  return weeklyFacilityActionLimit(
    state.weeklySourceEligible,
    Math.min(15, max),
  );
}

function alchemyErrorText(error?: string): string {
  switch (error) {
    case "no_guild":
      return "소속 길드가 없습니다.";
    case "alchemy_workshop_required":
      return "길드 시설에 연금 공방이 필요합니다.";
    case "recipe_locked":
      return "연금 공방 레벨이 부족합니다.";
    case "insufficient_energy":
      return "이번 주 연성력이 부족합니다.";
    case "insufficient_materials":
      return "허브 또는 은빛잎이 부족합니다.";
    case "charge_capacity":
      return "충전약 보유 한도를 넘습니다. 일부를 사용한 뒤 다시 조제해 주세요.";
    case "weekly_source_conflict":
      return "이번 주 연금 공방 보상처를 이미 다른 곳으로 선택했습니다.";
    case "rate_limited":
      return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return "충전액 조제에 실패했습니다.";
  }
}
