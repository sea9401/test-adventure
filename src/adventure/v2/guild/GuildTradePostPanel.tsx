"use client";

import { useCallback, useEffect, useState } from "react";
import type {
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
  rewardBonusPct: number;
  tokenYieldBonusPct: number;
  contribution: { points: number; cap: number; remaining: number };
  tokens: number;
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
  };
};

const PANEL_CLASS = `${SURFACE_CARD} space-y-3 p-3 text-sm text-zinc-900 dark:text-zinc-100`;
const SHARED_TOKENS_POLL_MS = 10_000;

export function GuildTradePostPanel() {
  const [state, setState] = useState<TradeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v2/guild/trade-post", {
        cache: "no-store",
      });
      const json = (await response.json().catch(() => null)) as TradeResponse | null;
      if (!response.ok || !json?.ok) {
        setNotice({ kind: "err", text: tradeErrorText(json?.error) });
        return;
      }
      setState(json);
    } catch {
      setNotice({ kind: "err", text: "길드 교역소 정보를 불러오지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }, []);

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
      const response = await fetch("/api/v2/guild/trade-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as TradeResponse | null;
      if (!response.ok || !json?.ok) {
        setNotice({ kind: "err", text: tradeErrorText(json?.error) });
        // 다른 길드원이 먼저 공동 잔고를 사용했을 수 있으므로 실패 뒤 최신 잔고를 받는다.
        void load();
        return;
      }
      setState(json);
      setNotice({ kind: "ok", text: successText(json) });
    } catch {
      setNotice({ kind: "err", text: "길드 교역소 요청에 실패했습니다." });
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
          {notice?.text ?? "길드 교역소를 이용할 수 없습니다."}
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
              <h3 className="text-base font-bold">길드 교역소 Lv.{state.level}</h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {state.stageLabel} · 납품 토큰 +{state.tokenYieldBonusPct}% · 완료 보상 +
              {state.rewardBonusPct}%
            </p>
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-right shadow-sm dark:bg-zinc-900">
            <div className="text-[11px] text-zinc-500">길드 공동 교역 토큰</div>
            <div className="text-base font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
              {state.tokens.toLocaleString()}개
            </div>
          </div>
        </div>
      </section>

      {!state.eligible && (
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
          누가 납품하든 납품 점수에 교역소 Lv 보너스를 적용한 공동 토큰이 쌓입니다.
          모든 길드원이 개인 구매에 사용하며 다음 주에도 유지됩니다.
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h4 className="font-bold">주간 교역 계약</h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              계약 {state.contracts.length}건 · 개인 납품 한도 {state.contribution.cap}점
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
                  완료 보상 · 길드 자금 +{contract.reward.gold.toLocaleString()}G · 명성 +
                  {contract.reward.fame.toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      void submit(
                        `deliver:${contract.id}`,
                        { action: "deliver", contractId: contract.id, batches: 1 },
                        deliveryNotice,
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
                        deliveryNotice,
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

      <section className="space-y-2">
        <div>
          <h4 className="font-bold">교역 토큰 상점</h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            공동 토큰으로 나에게 지급되는 품목을 구매합니다. 구매 횟수는 개인별
            주간 한도이며, 구매자·품목·수량·사용 토큰은 길드 활동 내역에 남습니다.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {state.shop.map((item) => {
            const disabled =
              Boolean(busyKey) ||
              !item.unlocked ||
              item.remaining <= 0 ||
              !item.affordable;
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
                      if (
                        !window.confirm(
                          `${item.name}을(를) 구매할까요?\n보상은 내 계정에 즉시 지급되며 공동 토큰 ${item.tokenCost.toLocaleString()}개가 사용됩니다. 구매 기록은 길드 활동 내역에 남습니다.`,
                        )
                      ) {
                        return;
                      }
                      void submit(
                        `buy:${item.id}`,
                        { action: "buy", shopItemId: item.id },
                        (json) => {
                          const purchase = json.purchased;
                          return `${purchase?.itemName ?? item.name} ${(purchase?.quantity ?? item.output.count).toLocaleString()}개 구매 완료 · 공동 토큰 -${(purchase?.tokenCost ?? item.tokenCost).toLocaleString()} · 잔액 ${(purchase?.remainingTokens ?? json.tokens).toLocaleString()}`;
                        },
                      );
                    }}
                    className="w-full rounded-md border border-cyan-700 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-cyan-300 dark:hover:bg-zinc-900"
                  >
                    {shopButtonText(item)}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function deliveryNotice(json: TradeResponse): string {
  const delivery = json.delivered;
  if (!delivery) return "납품 완료";
  const reward = json.guildReward;
  return `${delivery.itemName} ${delivery.quantity.toLocaleString()}개 납품 · 공동 토큰 +${delivery.tokensGained.toLocaleString()} · 길드 기여 +${(delivery.contributionPoints ?? 0).toLocaleString()}점${
    reward
      ? ` · 계약 완료! 길드 자금 +${reward.gold.toLocaleString()}G, 명성 +${reward.fame.toLocaleString()}`
      : ""
  }`;
}

function shopButtonText(item: TradeShopItem): string {
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
    case "not_eligible":
      return "이번 주 계약에는 참여할 수 없습니다.";
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
      return "이번 주 개인 구매 한도에 도달했습니다.";
    case "insufficient_tokens":
      return "길드 공동 교역 토큰이 부족합니다.";
    case "invalid_shop_item":
      return "구매할 수 없는 품목입니다.";
    default:
      return "길드 교역소 요청을 처리하지 못했습니다.";
  }
}
