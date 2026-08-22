"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ASSOCIATION_DINING_POINTS_PER_TICKET,
  GUILD_DINING_EFFECT_DURATION_HOURS,
  GUILD_DINING_POINTS_PER_TICKET,
  type GuildDiningEffectKind,
  type GuildDiningIngredient,
  type GuildDiningMenu,
  type GuildDiningMenuId,
} from "@/adventure/data/v2/guildDining";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { GameIcon } from "@/adventure/v2/GameIcon";
import { FarmItemIcon } from "@/adventure/v2/FarmItemIcon";
import type { FarmItemId } from "@/adventure/v2/farm";
import { FishingCatchItemIcon } from "@/adventure/v2/FishingCatchItemIcon";
import type { FishingCatchItemId } from "@/adventure/v2/fishingStock";
import { DraftNumberInput } from "@/components/ui/DraftNumberInput";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import {
  associationDiningContributionProgress,
  diningDonationQuantityLimit,
  guildDiningMenuUnavailableReason,
  guildDiningUnavailableReasons,
  type DiningFacilitySource,
} from "./guildDiningAvailability";

const DINING_PANEL_CLASS = `${SURFACE_CARD} space-y-3 p-3 text-sm text-zinc-900 dark:text-zinc-100`;

type DiningState = {
  level: number;
  stageLabel: string;
  weekKey: string;
  eligible: boolean;
  weeklySource?: DiningFacilitySource | null;
  pantry: { points: number; target: number; remaining: number; ready: boolean };
  tickets: {
    base: number;
    contributionEarned: number;
    earned: number;
    used: number;
    available: number;
    contributionCap: number | null;
  };
  contributionPoints: number;
  ingredients: Array<GuildDiningIngredient & { owned: number }>;
  menus: Array<GuildDiningMenu & { unlocked: boolean }>;
  activeEffect: {
    menuId: GuildDiningMenuId;
    name: string;
    kind: GuildDiningEffectKind;
    bonusPct: number;
    lifeBonusPct?: number;
    expiresAt: number;
  } | null;
  charges: { hp: number; mp: number; max: number };
};

type DiningResponse = DiningState & {
  ok?: boolean;
  error?: string;
  donated?: {
    ingredientName: string;
    quantity: number;
    points: number;
    contributionPoints?: number;
  };
  ordered?: {
    menuName: string;
    recovery: { hp: number; mp: number };
  };
};

export function GuildDiningHallPanel({
  endpoint = "/api/v2/guild/dining-hall",
  title = "길드 식당",
  source = "guild",
}: {
  endpoint?: string;
  title?: string;
  source?: DiningFacilitySource;
} = {}) {
  const { applyResourcePatch } = useGameState();
  const [state, setState] = useState<DiningState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const applyState = useCallback(
    (next: DiningState) => {
      setState(next);
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
      const res = await fetch(endpoint);
      const json = (await res.json().catch(() => null)) as DiningResponse | null;
      if (!res.ok || !json?.ok) {
        setNotice({ kind: "err", text: diningErrorText(json?.error) });
        return;
      }
      applyState(json);
    } catch {
      setNotice({ kind: "err", text: `${title} 정보를 불러오지 못했습니다.` });
    } finally {
      setLoading(false);
    }
  }, [applyState, endpoint, title]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function submit(body: Record<string, unknown>, successText: (json: DiningResponse) => string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(endpoint, {
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
      setNotice({ kind: "ok", text: successText(json) });
    } catch {
      setNotice({ kind: "err", text: `${title} 요청에 실패했습니다.` });
    } finally {
      setBusy(false);
    }
  }

  const selectedIngredient = useMemo(
    () => state?.ingredients.find((item) => item.id === ingredientId) ?? null,
    [ingredientId, state],
  );
  const selectedBatchSize = selectedIngredient?.batchSize ?? 1;
  const maxDonation = useMemo(() => {
    if (!state || !selectedIngredient) return 0;
    return diningDonationQuantityLimit({
      source,
      owned: selectedIngredient.owned,
      batchSize: selectedIngredient.batchSize,
      pointValue: selectedIngredient.pointValue,
      contributionPoints: state.contributionPoints,
      contributionCap: state.tickets.contributionCap,
      pantryRemaining: state.pantry.remaining,
    });
  }, [selectedIngredient, source, state]);
  const donationQuantity =
    maxDonation > 0
      ? Math.max(
          selectedBatchSize,
          Math.min(
            maxDonation,
            Math.floor(quantity / selectedBatchSize) * selectedBatchSize,
          ),
        )
      : selectedBatchSize;

  if (loading && !state) {
    return (
      <section className={DINING_PANEL_CLASS}>
        <p className="text-zinc-500 dark:text-zinc-400">{title} 확인 중…</p>
      </section>
    );
  }
  if (!state) {
    return (
      <section className={DINING_PANEL_CLASS}>
        <p className="text-red-600 dark:text-red-300">
          {notice?.text ?? `${title}을 이용할 수 없습니다.`}
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

  const sourceConflict =
    state.weeklySource != null && state.weeklySource !== source;
  const isAssociation = source === "association";
  const canParticipate = state.eligible && !sourceConflict;
  const unavailableReasons = guildDiningUnavailableReasons({
    eligible: state.eligible,
    weeklySource: state.weeklySource,
    currentSource: source,
    pantry: state.pantry,
    contributionPoints: state.contributionPoints,
    availableTickets: state.tickets.available,
  });
  const associationProgress = associationDiningContributionProgress(
    state.contributionPoints,
  );
  const activeEffect =
    state.activeEffect && state.activeEffect.expiresAt > clockNow
      ? state.activeEffect
      : null;

  return (
    <section className={DINING_PANEL_CLASS}>
      <section className={`${SURFACE_ACCENT} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <GameIcon name="CookingPot" size={22} />
              <h3 className="text-base font-bold">{title} Lv.{state.level}</h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {state.stageLabel} · {isAssociation
                ? `개인 식재료 ${ASSOCIATION_DINING_POINTS_PER_TICKET}점마다 식권 1장을 얻습니다.`
                : "공동 목표를 달성하면 각자 원하는 메뉴를 고를 수 있습니다."}
            </p>
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-right shadow-sm dark:bg-zinc-900">
            <div className="text-[11px] text-zinc-500">
              {isAssociation || state.pantry.ready
                ? "내 식권"
                : "목표 달성 시 식권"}
            </div>
            <div className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {state.tickets.available} / {state.tickets.earned}장
            </div>
          </div>
        </div>
      </section>

      {isAssociation ? (
        <section className={`${SURFACE_INSET} p-3`}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold">개인 식재료 기여</span>
            <span className="tabular-nums text-zinc-500">
              이번 주 {state.contributionPoints.toLocaleString("ko-KR")}점 · 다음 식권까지 {associationProgress.remaining}점
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{
                width: `${(associationProgress.points / associationProgress.target) * 100}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {ASSOCIATION_DINING_POINTS_PER_TICKET}점마다 식권 1장 · 주간 납품 제한 없음
          </p>
        </section>
      ) : (
        <section className={`${SURFACE_INSET} p-3`}>
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
            목표 달성 후 주간 참여자 기본 {state.tickets.base}장 사용 가능 · 내 기여 {state.contributionPoints}/
            {state.tickets.contributionCap}점 · {GUILD_DINING_POINTS_PER_TICKET}점마다 추가 식권 1장
          </p>
        </section>
      )}

      {unavailableReasons.length > 0 && (
        <section
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="text-sm font-bold">지금 식권을 사용할 수 없는 이유</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs leading-relaxed">
            {unavailableReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}

      {notice && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            notice.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      <section className={`${SURFACE_INSET} p-3`}>
        <h4 className="text-sm font-bold">식재료 기부</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_80px_auto]">
          {selectedIngredient?.source === "farm" ? (
            <FarmItemIcon
              itemId={selectedIngredient.sourceItemId as FarmItemId}
              className="h-9 w-9"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center text-sky-600 dark:text-sky-400">
              <FishingCatchItemIcon
                itemId={selectedIngredient?.sourceItemId as FishingCatchItemId}
                size={22}
              />
            </span>
          )}
          <select
            value={ingredientId}
            onChange={(event) => {
              setIngredientId(event.target.value);
              setQuantity(
                state.ingredients.find((item) => item.id === event.target.value)
                  ?.batchSize ?? 1,
              );
            }}
            disabled={busy || !canParticipate || (!isAssociation && state.pantry.ready)}
            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {(["farm", "fishing_item"] as const).map((source) => (
              <optgroup
                key={source}
                label={source === "farm" ? "농장 식재료" : "낚시 어획물"}
              >
                {state.ingredients
                  .filter((item) => item.source === source)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.batchSize}개당{" "}
                      {item.pointValue}점 · 보유 {item.owned}개
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <DraftNumberInput
            min={selectedBatchSize}
            step={selectedBatchSize}
            max={Math.max(selectedBatchSize, maxDonation)}
            value={donationQuantity}
            normalizeValue={(value) =>
              Math.max(
                selectedBatchSize,
                Math.min(
                  maxDonation || selectedBatchSize,
                  Math.floor(value / selectedBatchSize) * selectedBatchSize,
                ),
              )
            }
            onValueChange={setQuantity}
            disabled={busy || !canParticipate || maxDonation <= 0}
            aria-label="식재료 기부 수량"
            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-center text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="button"
            disabled={busy || !canParticipate || maxDonation <= 0}
            onClick={() =>
              void submit(
                {
                  action: "donate",
                  ingredientId,
                  quantity: donationQuantity,
                },
                (json) =>
                  isAssociation
                    ? `${json.donated?.ingredientName ?? "식재료"} ${json.donated?.quantity ?? 0}개 기부 · 개인 기여 +${json.donated?.points ?? 0}점`
                    : `${json.donated?.ingredientName ?? "식재료"} ${json.donated?.quantity ?? 0}개 기부 · 식당 +${json.donated?.points ?? 0}점 · 길드 기여 +${json.donated?.contributionPoints ?? 0}점`,
              )
            }
            className="h-9 rounded-md bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "처리 중…" : "기부"}
          </button>
        </div>
      </section>

      <section className={`${SURFACE_INSET} space-y-2 p-3`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold">시설 메뉴</h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              식당 Lv.{state.level} · 해금된 메뉴 중 원하는 메뉴를 직접 선택
            </p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {state.menus.map((menu) => {
            const menuUnavailableReason = guildDiningMenuUnavailableReason({
              isRecoveryMenu: menu.effect.kind === "recovery",
              charges: state.charges,
            });
            const orderUnavailableReason =
              unavailableReasons[0] ?? menuUnavailableReason;
            const menuSurface = !menu.unlocked
              ? SURFACE_INSET
              : SURFACE_CARD;
            return (
              <article
                key={menu.id}
                className={`${menuSurface} p-3 ${
                  menu.unlocked ? "" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <div className="flex items-start gap-2">
                  <Image
                    src={menu.imageSrc}
                    alt=""
                    width={80}
                    height={80}
                    unoptimized
                    className="h-[72px] w-[72px] shrink-0 object-contain md:h-20 md:w-20"
                  />
                  <div className="min-w-0 flex-1">
                    <h5 className="text-sm font-bold">{menu.name}</h5>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{menu.description}</p>
                  </div>
                </div>
                {!menu.unlocked ? (
                  <p className="mt-3 text-center text-xs font-semibold">식당 Lv.{menu.minFacilityLevel} 필요</p>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy || orderUnavailableReason != null}
                      onClick={() => {
                        if (
                          menu.effect.kind !== "recovery" &&
                          activeEffect &&
                          activeEffect.menuId !== menu.id &&
                          !window.confirm(
                            `현재 적용 중인 ${activeEffect.name} 효과와 남은 시간이 사라집니다. ${menu.name} 메뉴로 교체할까요?`,
                          )
                        ) {
                          return;
                        }
                        void submit(
                          { action: "order", menuId: menu.id },
                          (json) => `${json.ordered?.menuName ?? menu.name} 식사를 마쳤습니다.`,
                        );
                      }}
                      className="mt-3 h-9 w-full rounded-md bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      식권 1장으로 주문
                    </button>
                    {orderUnavailableReason && (
                      <p className="mt-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                        {orderUnavailableReason}
                      </p>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {activeEffect && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          적용 중: {activeEffect.name} · {activeEffect.kind === "all_xp" && activeEffect.lifeBonusPct != null
            ? `사냥 +${activeEffect.bonusPct}% · 생활 +${activeEffect.lifeBonusPct}%`
            : `+${activeEffect.bonusPct}%`} · 남은 시간 {formatDiningRemaining(activeEffect.expiresAt - clockNow)}
        </p>
      )}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        효과식은 한 번에 하나만 적용됩니다. 같은 메뉴를 다시 주문하면 {GUILD_DINING_EFFECT_DURATION_HOURS}시간이 추가되고, 다른 효과식은 기존 효과와 남은 시간을 교체합니다. {isAssociation ? "개인 기여·식권·효과" : "공동 준비·개인 기여·식권·효과"}는 매주 월요일 00:00 KST에 초기화됩니다.
      </p>
    </section>
  );
}

function formatDiningRemaining(remainingMs: number): string {
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}분`;
  if (minutes <= 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

function diningErrorText(error?: string): string {
  switch (error) {
    case "no_guild":
      return "소속 길드가 없습니다.";
    case "dining_hall_required":
      return "길드 식당을 먼저 개방해야 합니다.";
    case "not_eligible":
      return "다음 주부터 식당을 이용할 수 있습니다.";
    case "weekly_source_conflict":
      return "이번 주 식당 보상처를 길드·협회 중 다른 쪽으로 선택했습니다.";
    case "contribution_cap":
      return "개인 기여 한도 또는 공동 준비 목표를 넘습니다.";
    case "insufficient_ingredients":
      return "보유 식재료가 부족합니다.";
    case "pantry_not_ready":
      return "공동 식재료 준비가 아직 끝나지 않았습니다.";
    case "no_meal_ticket":
      return "사용 가능한 식권이 없습니다.";
    case "menu_unavailable":
      return "현재 시설 레벨에서 주문할 수 없는 메뉴입니다.";
    case "charge_capacity":
      return "HP·MP 충전량이 이미 가득 찼습니다.";
    default:
      return "길드 식당 요청을 처리하지 못했습니다.";
  }
}
