"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  GuildDiningIngredient,
  GuildDiningMenu,
  GuildDiningMenuId,
} from "@/adventure/data/v2/guildDining";
import { useGameState } from "@/adventure/v2/GameStateProvider";

type DiningState = {
  level: number;
  stageLabel: string;
  weekKey: string;
  canManage: boolean;
  eligible: boolean;
  pantry: { points: number; target: number; remaining: number; ready: boolean };
  tickets: { earned: number; used: number; available: number; contributionCap: number };
  contributionPoints: number;
  menuSlots: number;
  ingredients: Array<GuildDiningIngredient & { owned: number }>;
  menus: Array<GuildDiningMenu & { unlocked: boolean; selected: boolean }>;
  activeEffect: {
    menuId: GuildDiningMenuId;
    name: string;
    bonusPct: number;
    remainingUses: number;
  } | null;
  charges: { hp: number; mp: number; max: number };
};

type DiningResponse = DiningState & {
  ok?: boolean;
  error?: string;
  donated?: { ingredientName: string; quantity: number; points: number };
  ordered?: {
    menuName: string;
    recovery: { hp: number; mp: number };
  };
};

export function GuildDiningHallPanel() {
  const { applyResourcePatch } = useGameState();
  const [state, setState] = useState<DiningState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedMenuIds, setSelectedMenuIds] = useState<GuildDiningMenuId[]>([]);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const applyState = useCallback(
    (next: DiningState) => {
      setState(next);
      setSelectedMenuIds(next.menus.filter((menu) => menu.selected).map((menu) => menu.id));
      setIngredientId((current) =>
        next.ingredients.some((item) => item.id === current)
          ? current
          : next.ingredients.find((item) => item.owned > 0)?.id ?? next.ingredients[0]?.id ?? "",
      );
      applyResourcePatch({ hpCharges: next.charges.hp, mpCharges: next.charges.mp });
    },
    [applyResourcePatch],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/guild/dining-hall");
      const json = (await res.json().catch(() => null)) as DiningResponse | null;
      if (!res.ok || !json?.ok) {
        setNotice({ kind: "err", text: diningErrorText(json?.error) });
        return;
      }
      applyState(json);
    } catch {
      setNotice({ kind: "err", text: "길드 식당 정보를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }, [applyState]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(body: Record<string, unknown>, successText: (json: DiningResponse) => string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/guild/dining-hall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as DiningResponse | null;
      if (!res.ok || !json?.ok) {
        setNotice({ kind: "err", text: diningErrorText(json?.error) });
        return;
      }
      applyState(json);
      setQuantity(1);
      setNotice({ kind: "ok", text: successText(json) });
    } catch {
      setNotice({ kind: "err", text: "길드 식당 요청에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  const selectedIngredient = useMemo(
    () => state?.ingredients.find((item) => item.id === ingredientId) ?? null,
    [ingredientId, state],
  );
  const maxDonation = useMemo(() => {
    if (!state || !selectedIngredient) return 0;
    const personalRoom = state.tickets.contributionCap - state.contributionPoints;
    return Math.max(
      0,
      Math.min(
        selectedIngredient.owned,
        Math.floor(personalRoom / selectedIngredient.pointValue),
        Math.floor(state.pantry.remaining / selectedIngredient.pointValue),
        999,
      ),
    );
  }, [selectedIngredient, state]);

  if (loading && !state) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">길드 식당 확인 중…</p>;
  }
  if (!state) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600 dark:text-red-300">
          {notice?.text ?? "길드 식당을 이용할 수 없습니다."}
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
      </div>
    );
  }

  const menuEditable = state.canManage && state.pantry.points === 0;

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-xl">🍲</span>
              <h3 className="text-base font-bold">길드 식당 Lv.{state.level}</h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {state.stageLabel} · 식재료를 함께 준비하고 주간 식권으로 식사합니다.
            </p>
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-right shadow-sm dark:bg-zinc-900">
            <div className="text-[11px] text-zinc-500">내 식권</div>
            <div className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {state.tickets.available} / {state.tickets.earned}장
            </div>
          </div>
        </div>
      </section>

      {!state.eligible && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          이번 주 준비가 시작된 뒤 가입했습니다. 다음 주부터 기부와 식사가 가능합니다.
        </p>
      )}

      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold">공동 식재료 준비</span>
          <span className="tabular-nums text-zinc-500">
            {state.pantry.points} / {state.pantry.target}점
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className="h-full rounded-full bg-amber-500"
            style={{ width: `${Math.min(100, (state.pantry.points / state.pantry.target) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          내 기여 {state.contributionPoints}/{state.tickets.contributionCap}점 · 15점마다 식권 1장
        </p>
      </section>

      {notice && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            notice.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
        <h4 className="text-sm font-bold">식재료 기부</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_80px_auto]">
          <select
            value={ingredientId}
            onChange={(event) => {
              setIngredientId(event.target.value);
              setQuantity(1);
            }}
            disabled={busy || !state.eligible || state.pantry.ready}
            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {state.ingredients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.icon} {item.name} · {item.pointValue}점 · {item.owned}개
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, maxDonation)}
            value={Math.min(quantity, Math.max(1, maxDonation))}
            onChange={(event) =>
              setQuantity(
                Math.max(1, Math.min(maxDonation || 1, Math.floor(Number(event.target.value) || 1))),
              )
            }
            disabled={busy || maxDonation <= 0}
            aria-label="식재료 기부 수량"
            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-center text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            disabled={busy || maxDonation <= 0}
            onClick={() =>
              void submit(
                {
                  action: "donate",
                  ingredientId,
                  quantity: Math.min(quantity, maxDonation),
                },
                (json) =>
                  `${json.donated?.ingredientName ?? "식재료"} ${json.donated?.quantity ?? 0}개 기부 · +${json.donated?.points ?? 0}점`,
              )
            }
            className="h-9 rounded-md bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "처리 중…" : "기부"}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-bold">이번 주 메뉴</h4>
          {menuEditable && (
            <button
              type="button"
              disabled={busy || selectedMenuIds.length < 1}
              onClick={() =>
                void submit(
                  { action: "select_menus", menuIds: selectedMenuIds },
                  () => "이번 주 메뉴를 확정했습니다.",
                )
              }
              className="rounded-md border border-amber-600 px-3 py-1 text-xs font-bold text-amber-700 disabled:opacity-50 dark:text-amber-300"
            >
              메뉴 확정
            </button>
          )}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {state.menus.map((menu) => {
            const checked = selectedMenuIds.includes(menu.id);
            return (
              <article
                key={menu.id}
                className={`rounded-lg border p-3 ${
                  checked
                    ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20"
                    : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                } ${menu.unlocked ? "" : "opacity-60"}`}
              >
                <div className="flex items-start gap-2">
                  {menuEditable && menu.unlocked && (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedMenuIds((current) => {
                          if (current.includes(menu.id)) {
                            return current.length > 1
                              ? current.filter((id) => id !== menu.id)
                              : current;
                          }
                          if (current.length >= state.menuSlots) return current;
                          return [...current, menu.id];
                        });
                      }}
                      aria-label={`${menu.name} 선택`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h5 className="text-sm font-bold">
                      {menu.icon} {menu.name}
                    </h5>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{menu.description}</p>
                  </div>
                </div>
                {!menu.unlocked ? (
                  <p className="mt-3 text-center text-xs font-semibold">식당 Lv.{menu.minFacilityLevel} 필요</p>
                ) : menu.selected ? (
                  <button
                    type="button"
                    disabled={busy || !state.eligible || !state.pantry.ready || state.tickets.available <= 0}
                    onClick={() =>
                      void submit(
                        { action: "order", menuId: menu.id },
                        (json) => `${json.ordered?.menuName ?? menu.name} 식사를 마쳤습니다.`,
                      )
                    }
                    className="mt-3 h-9 w-full rounded-md bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    식권 1장으로 주문
                  </button>
                ) : (
                  <p className="mt-3 text-center text-xs text-zinc-500">이번 주 선택되지 않은 메뉴</p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {state.activeEffect && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          적용 중: {state.activeEffect.name} · +{state.activeEffect.bonusPct}% · 남은 횟수 {state.activeEffect.remainingUses}회
        </p>
      )}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        식재료·식권·메뉴는 매주 월요일 00:00 KST에 초기화됩니다. 새 효과식 주문 시 기존 식사 효과는 교체됩니다.
      </p>
    </div>
  );
}

function diningErrorText(error?: string): string {
  switch (error) {
    case "no_guild":
      return "소속 길드가 없습니다.";
    case "dining_hall_required":
      return "길드 식당을 먼저 개방해야 합니다.";
    case "not_authorized":
      return "메뉴를 선택할 권한이 없습니다.";
    case "not_eligible":
      return "다음 주부터 식당을 이용할 수 있습니다.";
    case "menu_locked":
      return "식재료 기부가 시작되어 이번 주 메뉴를 바꿀 수 없습니다.";
    case "invalid_menus":
      return "선택 가능한 메뉴 수와 시설 레벨을 확인해주세요.";
    case "contribution_cap":
      return "개인 기여 한도 또는 공동 준비 목표를 넘습니다.";
    case "insufficient_ingredients":
      return "보유 식재료가 부족합니다.";
    case "pantry_not_ready":
      return "공동 식재료 준비가 아직 끝나지 않았습니다.";
    case "no_meal_ticket":
      return "사용 가능한 식권이 없습니다.";
    case "menu_unavailable":
      return "이번 주에 주문할 수 없는 메뉴입니다.";
    case "charge_capacity":
      return "HP·MP 충전량이 이미 가득 찼습니다.";
    default:
      return "길드 식당 요청을 처리하지 못했습니다.";
  }
}
