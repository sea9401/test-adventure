"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  GuildFacilitySupportTarget,
  GuildTradeItem,
  GuildTradeShopItem,
} from "@/adventure/data/v2/guildTrade";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { GameIcon } from "@/adventure/v2/GameIcon";
import { FarmItemIcon } from "@/adventure/v2/FarmItemIcon";
import type { FarmItemId } from "@/adventure/v2/farm";
import { FishingCatchItemIcon } from "@/adventure/v2/FishingCatchItemIcon";
import type { FishingCatchItemId } from "@/adventure/v2/fishingStock";

type TradeContract = GuildTradeItem & {
  progress: number;
  target: number;
  remainingPoints: number;
  completed: boolean;
  owned: number;
  maxBatches: number;
  reward: { gold: number; fame: number };
};

type TradeShopItem = GuildTradeShopItem & {
  unlocked: boolean;
  purchased: number;
  remaining: number;
  affordable: boolean;
};

type TradeState = {
  level: number;
  stageLabel: string;
  weekKey: string;
  eligible: boolean;
  canManage: boolean;
  canPurchase: boolean;
  rewardBonusPct: number;
  tokenYieldBonusPct: number;
  contribution: { points: number; cap: number; remaining: number };
  tokens: number;
  claimableRewards?: Array<{ contractId: string; itemName: string; tokens: number }>;
  facilitySupportTargets?: GuildFacilitySupportTarget[];
  contracts: TradeContract[];
  shop: TradeShopItem[];
};

type TradeResponse = TradeState & {
  ok?: boolean;
  error?: string;
  delivered?: {
    itemName: string;
    quantity: number;
    points: number;
    tokensGained: number;
    completed: boolean;
    contributionPoints?: number;
  };
  guildReward?: { gold: number; fame: number } | null;
  purchased?: {
    itemId: string;
    itemName: string;
    quantity: number;
    tokenCost: number;
    remainingTokens: number;
    recipientCount?: number;
    facilitySupport?: {
      buildingId: string;
      buildingName: string;
      targetLevel: number;
      crop: number;
      ore: number;
    };
  };
  completionReward?: { contracts: number; tokensGained: number };
};

const PANEL_CLASS = `${SURFACE_CARD} space-y-3 p-3 text-sm text-zinc-900 dark:text-zinc-100`;
const SHARED_TOKENS_POLL_MS = 10_000;

export function GuildTradePostPanel({
  shopOnly = false,
  endpoint = "/api/v2/guild/trade-post",
  title = "길드 교역소",
  sharedTokens = true,
}: {
  shopOnly?: boolean;
  endpoint?: string;
  title?: string;
  sharedTokens?: boolean;
}) {
  const [state, setState] = useState<TradeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [supportDialogItem, setSupportDialogItem] =
    useState<TradeShopItem | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
      });
      const json = (await response.json().catch(() => null)) as TradeResponse | null;
      if (!response.ok || !json?.ok) {
        setNotice({ kind: "err", text: tradeErrorText(json?.error) });
        return;
      }
      setState(json);
    } catch {
      setNotice({ kind: "err", text: `${title} 정보를 불러오지 못했습니다.` });
    } finally {
      setLoading(false);
    }
  }, [endpoint, title]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, SHARED_TOKENS_POLL_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [load]);

  async function submit(
    key: string,
    body: Record<string, unknown>,
    successText: (json: TradeResponse) => string,
  ) {
    if (busyKey) return;
    setBusyKey(key);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as TradeResponse | null;
      if (!response.ok || !json?.ok) {
        setNotice({ kind: "err", text: tradeErrorText(json?.error) });
        // 공동 잔고 또는 계약 진행도가 달라졌을 수 있으므로 실패 뒤 최신 상태를 받는다.
        void load();
        return;
      }
      setState(json);
      setNotice({ kind: "ok", text: successText(json) });
    } catch {
      setNotice({ kind: "err", text: `${title} 요청에 실패했습니다.` });
    } finally {
      setBusyKey(null);
    }
  }

  if (loading && !state) {
    return (
      <section className={PANEL_CLASS}>
        <p className="text-zinc-500 dark:text-zinc-400">교역 계약 확인 중…</p>
      </section>
    );
  }

  if (!state) {
    return (
      <section className={PANEL_CLASS}>
        <p className="text-red-600 dark:text-red-300">
          {notice?.text ?? `${title}를 이용할 수 없습니다.`}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="rounded-md border border-zinc-300 px-3 py-1.5 font-semibold dark:border-zinc-700"
        >
          다시 시도
        </button>
      </section>
    );
  }

  return (
    <section className={PANEL_CLASS}>
      <section className={`${SURFACE_ACCENT} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <GameIcon name="Scales" size={22} />
              <h3 className="text-base font-bold">{title} Lv.{state.level}</h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {state.stageLabel} · 납품 토큰 +{state.tokenYieldBonusPct}% · 완료 보상 +
              {state.rewardBonusPct}%
            </p>
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-right shadow-sm dark:bg-zinc-900">
            <div className="text-[11px] text-zinc-500">
              {sharedTokens ? "길드 공동 교역 토큰" : "내 협회 교역 토큰"}
            </div>
            <div className="text-base font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
              {state.tokens.toLocaleString()}개
            </div>
          </div>
        </div>
      </section>

      {!shopOnly && !state.eligible && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          이번 주 계약이 열린 뒤 가입했습니다. 다음 주 계약부터 납품할 수 있습니다.
        </p>
      )}

      {notice && (
        <p
          className={`rounded-md border px-3 py-2 ${
            notice.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      {!sharedTokens && (state.claimableRewards?.length ?? 0) > 0 && (
        <section className={`${SURFACE_ACCENT} flex flex-wrap items-center justify-between gap-3 p-3`}>
          <div>
            <h4 className="font-bold">공동 계약 기여 보상</h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              참여한 완료 계약 {state.claimableRewards?.length ?? 0}건 · 개인 토큰 +
              {(state.claimableRewards ?? []).reduce((sum, reward) => sum + reward.tokens, 0).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            disabled={Boolean(busyKey)}
            onClick={() =>
              void submit(
                "claim-rewards",
                { action: "claim_rewards" },
                (json) =>
                  `완료 계약 ${json.completionReward?.contracts ?? 0}건 기여 보상 · 개인 토큰 +${(json.completionReward?.tokensGained ?? 0).toLocaleString()}`,
              )
            }
            className="rounded-md bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            보상 받기
          </button>
        </section>
      )}

      {!shopOnly && (
        <>
          <section className={`${SURFACE_INSET} p-3`}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold">이번 주 내 납품</span>
              <span className="tabular-nums text-zinc-500">
                {state.contribution.points} / {state.contribution.cap}점
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-cyan-500"
                style={{
                  width: `${Math.min(100, (state.contribution.points / state.contribution.cap) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {sharedTokens
                ? "누가 납품하든 레벨 보너스를 적용한 공동 토큰이 쌓이며, 관리자가 길드원 전원에게 지급할 물품을 선택합니다."
                : "내가 납품한 점수에 레벨 보너스를 적용한 개인 토큰이 쌓이며, 다음 주에도 유지됩니다."}
            </p>
          </section>

          <section className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h4 className="font-bold">주간 교역 계약</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  계약 {state.contracts.length}건 · 개인 납품 한도{" "}
                  {state.contribution.cap}점
                </p>
              </div>
              <span className="text-xs text-zinc-400">{state.weekKey}</span>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {state.contracts.map((contract) => {
            const percent = Math.min(100, (contract.progress / contract.target) * 100);
            const disabled =
              Boolean(busyKey) ||
              !state.eligible ||
              contract.completed ||
              contract.maxBatches <= 0;
            return (
              <article
                key={contract.id}
                className={`${SURFACE_INSET} space-y-2 p-3 ${contract.completed ? "border-emerald-300 dark:border-emerald-800" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {contract.source === "farm" ? (
                      <FarmItemIcon
                        itemId={contract.sourceItemId as FarmItemId}
                        className="h-9 w-9"
                      />
                    ) : contract.source === "fishing_item" ? (
                      <FishingCatchItemIcon
                        itemId={contract.sourceItemId as FishingCatchItemId}
                        size={22}
                      />
                    ) : (
                      <GameIcon name={contract.iconName} size={20} />
                    )}
                    <div>
                      <h5 className="font-semibold">{contract.name}</h5>
                      <p className="text-[11px] text-zinc-500">
                        {contract.batchSize.toLocaleString()}개당 {contract.pointValue}점 · 보유 {contract.owned.toLocaleString()}개
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${
                      contract.completed
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {contract.completed ? "계약 완료" : `${contract.progress}/${contract.target}점`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-cyan-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {sharedTokens
                    ? `완료 보상 · 길드 자금 +${contract.reward.gold.toLocaleString()}G · 명성 +${contract.reward.fame.toLocaleString()}`
                    : "공동 계약 완료 시 이번 주 기여자에게 개인 보너스가 열립니다."}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      void submit(
                        `deliver:${contract.id}`,
                        { action: "deliver", contractId: contract.id, batches: 1 },
                        (json) => deliveryNotice(json, sharedTokens),
                      )
                    }
                    className="flex-1 rounded-md border border-cyan-700 bg-white px-2 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-950 dark:text-cyan-300 dark:hover:bg-zinc-900"
                  >
                    1묶음 납품
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      void submit(
                        `deliver-max:${contract.id}`,
                        {
                          action: "deliver",
                          contractId: contract.id,
                          batches: contract.maxBatches,
                        },
                        (json) => deliveryNotice(json, sharedTokens),
                      )
                    }
                    className="flex-1 rounded-md bg-cyan-700 px-2 py-1.5 text-xs font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    최대 {contract.maxBatches}묶음
                  </button>
                </div>
              </article>
            );
              })}
            </div>
          </section>
        </>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-bold">교역 토큰 상점</h4>
              {sharedTokens && (
                <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  관리자 선택 · 길드 전체 혜택
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {sharedTokens
                ? "길드장과 관리자가 공동 토큰으로 품목을 선택합니다. 길드원 전원 지급 상품과 길드 공용 자원 상품이 있으며, 구매 한도는 길드 전체에 적용됩니다."
                : "내 협회 토큰으로 구매합니다. 상품 재고와 구매 한도도 이용자별로 관리됩니다."}
            </p>
          </div>
        </div>
        {sharedTokens && !state.canManage && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            길드장 또는 관리자만 공동 토큰으로 물품을 선택할 수 있습니다. 선택된
            물품은 길드원 전원에게 지급됩니다.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {state.shop.map((item) => {
            const targetsGuildPool = sharedTokens && item.target === "guild";
            const isFacilitySupport =
              item.output.kind === "guild_facility_support";
            const eligibleFacilityTargets = (
              state.facilitySupportTargets ?? []
            ).filter((target) => target.eligible);
            const disabled =
              Boolean(busyKey) ||
              !state.canPurchase ||
              !item.unlocked ||
              item.remaining <= 0 ||
              !item.affordable ||
              (isFacilitySupport && eligibleFacilityTargets.length === 0);
            return (
              <article key={item.id} className={`${SURFACE_INSET} flex flex-col p-3`}>
                <div className="flex items-start gap-2">
                  <GameIcon name={item.iconName} size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h5 className="font-semibold">{item.name}</h5>
                      <span className="shrink-0 text-xs font-bold text-cyan-700 dark:text-cyan-300">
                        {item.tokenCost.toLocaleString()} 토큰
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {item.description}
                    </p>
                  </div>
                </div>
                <div className="mt-auto pt-3">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (isFacilitySupport) {
                        setSelectedFacilityId(
                          eligibleFacilityTargets[0]?.buildingId ?? null,
                        );
                        setSupportDialogItem(item);
                        return;
                      }
                      if (
                        !window.confirm(
                          sharedTokens
                            ? targetsGuildPool
                              ? `${item.name}을(를) 길드 공용 보상으로 적용할까요?\n길드 공동 토큰 ${item.tokenCost.toLocaleString()}개가 사용됩니다.`
                              : `${item.name}을(를) 길드원 전원에게 지급할까요?\n길드 공동 토큰 ${item.tokenCost.toLocaleString()}개가 사용됩니다.`
                            : `${item.name}을(를) 구매할까요?\n내 협회 토큰 ${item.tokenCost.toLocaleString()}개가 사용됩니다.`,
                        )
                      ) {
                        return;
                      }
                      void submit(
                        `buy:${item.id}`,
                        { action: "buy", shopItemId: item.id },
                        (json) => {
                          const purchase = json.purchased;
                          return sharedTokens
                            ? targetsGuildPool
                              ? `${purchase?.itemName ?? item.name} 길드 공용 보상 적용 완료 · 공동 토큰 -${(purchase?.tokenCost ?? item.tokenCost).toLocaleString()} · 잔액 ${(purchase?.remainingTokens ?? json.tokens).toLocaleString()}`
                              : `${purchase?.itemName ?? item.name} 길드원 ${(purchase?.recipientCount ?? 0).toLocaleString()}명 지급 완료 · 공동 토큰 -${(purchase?.tokenCost ?? item.tokenCost).toLocaleString()} · 잔액 ${(purchase?.remainingTokens ?? json.tokens).toLocaleString()}`
                            : `${purchase?.itemName ?? item.name} ${(purchase?.quantity ?? item.output.count).toLocaleString()}개 구매 완료 · 토큰 -${(purchase?.tokenCost ?? item.tokenCost).toLocaleString()} · 잔액 ${(purchase?.remainingTokens ?? json.tokens).toLocaleString()}`;
                        },
                      );
                    }}
                    className="w-full rounded-md border border-cyan-700 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-cyan-300 dark:hover:bg-zinc-900"
                  >
                    {isFacilitySupport && eligibleFacilityTargets.length === 0
                      ? "지원 가능한 시설 없음"
                      : shopButtonText(item, state.canPurchase)}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {supportDialogItem && (
        <GuildFacilitySupportDialog
          targets={state.facilitySupportTargets ?? []}
          selectedFacilityId={selectedFacilityId}
          tokenCost={supportDialogItem.tokenCost}
          busy={Boolean(busyKey)}
          onSelect={setSelectedFacilityId}
          onClose={() => setSupportDialogItem(null)}
          onConfirm={() => {
            const facilityId = selectedFacilityId;
            const item = supportDialogItem;
            if (!facilityId) return;
            setSupportDialogItem(null);
            void submit(
              `buy:${item.id}`,
              { action: "buy", shopItemId: item.id, facilityId },
              (json) => {
                const purchase = json.purchased;
                const support = purchase?.facilitySupport;
                return `${support?.buildingName ?? "선택한 시설"} Lv.${support?.targetLevel ?? "?"} 지원 완료 · 통나무 +${(support?.crop ?? 0).toLocaleString()} · 철광석 +${(support?.ore ?? 0).toLocaleString()} · 공동 토큰 -${(purchase?.tokenCost ?? item.tokenCost).toLocaleString()} · 잔액 ${(purchase?.remainingTokens ?? json.tokens).toLocaleString()}`;
              },
            );
          }}
        />
      )}
    </section>
  );
}

export function GuildFacilitySupportDialog({
  targets,
  selectedFacilityId,
  tokenCost,
  busy,
  onSelect,
  onConfirm,
  onClose,
}: {
  targets: GuildFacilitySupportTarget[];
  selectedFacilityId: string | null;
  tokenCost: number;
  busy: boolean;
  onSelect: (buildingId: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const selected = targets.find(
    (target) => target.buildingId === selectedFacilityId && target.eligible,
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="guild-facility-support-title"
        className={`${SURFACE_CARD} flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden shadow-2xl`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div>
            <h2 id="guild-facility-support-title" className="text-base font-bold">
              시설 지원 대상 선택
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              선택한 시설의 다음 업그레이드에 통나무·철광석 총 200개를 즉시
              지원합니다. 개인 인벤토리나 별도 길드 재화로 들어가지 않습니다.
            </p>
          </div>
          <button
            type="button"
            aria-label="시설 지원 닫기"
            disabled={busy}
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-lg text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 space-y-2 overflow-y-auto p-4">
          {targets.map((target) => {
            const isSelected = target.buildingId === selectedFacilityId;
            return (
              <button
                key={target.buildingId}
                type="button"
                disabled={!target.eligible || busy}
                aria-pressed={isSelected}
                onClick={() => onSelect(target.buildingId)}
                className={`${SURFACE_INSET} w-full p-3 text-left transition-colors disabled:cursor-not-allowed ${
                  isSelected
                    ? "border-cyan-500 ring-1 ring-cyan-500"
                    : "hover:border-cyan-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold">
                    {target.buildingName} Lv.{target.currentLevel} → Lv.
                    {target.targetLevel}
                  </span>
                  <span
                    className={`shrink-0 text-[11px] font-semibold ${
                      target.eligible
                        ? "text-cyan-700 dark:text-cyan-300"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {target.eligible ? (isSelected ? "선택됨" : "선택 가능") : "지원 불가"}
                  </span>
                </div>

                {target.eligible ? (
                  <div className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
                    <FacilitySupportResourcePreview
                      label="통나무"
                      current={target.crop.current}
                      after={target.crop.after}
                      required={target.crop.required}
                      grant={target.crop.grant}
                    />
                    <FacilitySupportResourcePreview
                      label="철광석"
                      current={target.ore.current}
                      after={target.ore.after}
                      required={target.ore.required}
                      grant={target.ore.grant}
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {facilitySupportUnavailableText(target.reason)}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            구매 후에는 지원 대상을 변경할 수 없습니다.
          </span>
          <button
            type="button"
            disabled={!selected || busy}
            onClick={onConfirm}
            className="shrink-0 rounded-md bg-cyan-700 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            공동 토큰 {tokenCost.toLocaleString()}개로 지원하기
          </button>
        </footer>
      </section>
    </div>
  );
}

function FacilitySupportResourcePreview({
  label,
  current,
  after,
  required,
  grant,
}: {
  label: string;
  current: number;
  after: number;
  required: number;
  grant: number;
}) {
  return (
    <div className="rounded-md bg-white px-2.5 py-2 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
          +{grant.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 tabular-nums text-zinc-500 dark:text-zinc-400">
        {current.toLocaleString()} → {after.toLocaleString()} / {required.toLocaleString()}
      </div>
    </div>
  );
}

function facilitySupportUnavailableText(
  reason: GuildFacilitySupportTarget["reason"],
): string {
  switch (reason) {
    case "max_level":
      return "이미 최고 레벨에 도달한 시설입니다.";
    case "materials_not_required":
      return "다음 업그레이드에 통나무·철광석이 필요하지 않습니다.";
    case "remaining_below_200":
      return "남은 통나무·철광석 요구량이 200개 미만입니다.";
    default:
      return "현재 지원할 수 없는 시설입니다.";
  }
}

function deliveryNotice(json: TradeResponse, sharedTokens: boolean): string {
  const delivery = json.delivered;
  if (!delivery) return "납품 완료";
  const reward = json.guildReward;
  return `${delivery.itemName} ${delivery.quantity.toLocaleString()}개 납품 · ${sharedTokens ? "공동" : "개인"} 토큰 +${delivery.tokensGained.toLocaleString()}${sharedTokens ? ` · 길드 기여 +${(delivery.contributionPoints ?? 0).toLocaleString()}점` : ""}${
    reward
      ? ` · 계약 완료! 길드 자금 +${reward.gold.toLocaleString()}G, 명성 +${reward.fame.toLocaleString()}`
      : ""
  }`;
}

function shopButtonText(item: TradeShopItem, canPurchase: boolean): string {
  if (!canPurchase) return "관리자 전용";
  if (!item.unlocked) return `교역소 Lv.${item.minFacilityLevel} 필요`;
  if (item.remaining <= 0) return "이번 주 구매 완료";
  return `구매 · 주 ${item.remaining}/${item.weeklyLimit}회 남음`;
}

function tradeErrorText(error?: string): string {
  switch (error) {
    case "no_guild":
      return "소속 길드가 없습니다.";
    case "trade_post_required":
      return "길드 교역소를 먼저 개발해야 합니다.";
    case "guild_admin_required":
      return "길드장 또는 관리자만 공동 토큰으로 물품을 선택할 수 있습니다.";
    case "no_recipients":
      return "물품을 지급할 길드원이 없습니다.";
    case "not_eligible":
      return "이번 주 계약에는 참여할 수 없습니다.";
    case "weekly_source_conflict":
      return "이번 주 교역소 보상처를 길드·협회 중 다른 쪽으로 선택했습니다.";
    case "contract_complete":
      return "이미 완료된 계약입니다.";
    case "invalid_delivery":
      return "납품 수량을 확인해 주세요.";
    case "contribution_cap":
      return "계약 목표 또는 이번 주 개인 납품 한도를 넘습니다.";
    case "insufficient_items":
      return "납품할 아이템이 부족합니다.";
    case "source_unavailable":
      return "해당 아이템 보관함을 확인할 수 없습니다.";
    case "shop_item_locked":
      return "교역소 레벨이 부족한 품목입니다.";
    case "purchase_limit":
      return "이번 주 길드 전체 구매 한도에 도달했습니다.";
    case "insufficient_tokens":
      return "길드 공동 교역 토큰이 부족합니다.";
    case "invalid_shop_item":
      return "구매할 수 없는 품목입니다.";
    case "no_claimable_reward":
      return "받을 수 있는 공동 계약 기여 보상이 없습니다.";
    default:
      return "길드 교역소 요청을 처리하지 못했습니다.";
  }
}
