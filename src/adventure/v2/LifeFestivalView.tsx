"use client";

import { useCallback, useEffect, useState } from "react";
import { Minus, Plus, Tent } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { confirmGameAction } from "@/components/ui/gameDialog";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { LIFE_FESTIVAL_DELIVERY_TIMES_MAX } from "@/adventure/data/v2/lifeFestival";
import {
  defaultDishSelection,
  lifeFestivalErrorLabel,
  remainingTimeLabel,
  type LifeFestivalDishOptionView,
  type LifeFestivalOrderView,
  type LifeFestivalRankingData,
  type LifeFestivalShopView,
  type LifeFestivalViewData,
} from "./lifeFestivalClient";

type Notice = { tone: "success" | "error"; text: string };
type PostResult =
  | { ok: true; view: LifeFestivalViewData; gained?: { tokens: number; score: number } }
  | { ok: false; error?: string };

const CONFIRM_TOKEN_COST = 200;

async function postFestival(body: Record<string, unknown>): Promise<PostResult> {
  try {
    const response = await fetch("/api/v2/life-festival", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as PostResult;
  } catch {
    return { ok: false };
  }
}

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

export function LifeFestivalView({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<LifeFestivalViewData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dishOrderId, setDishOrderId] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v2/life-festival");
      const json = (await response.json()) as { ok?: boolean } & LifeFestivalViewData;
      if (!response.ok || !json.ok) throw new Error("load_failed");
      setLoadFailed(false);
      setView(json);
      setLoadedAt(Date.now());
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 서버 상태를 불러온 뒤 렌더링한다.
    void load();
  }, [load]);

  const submit = async (key: string, body: Record<string, unknown>, success: (result: Extract<PostResult, { ok: true }>) => string) => {
    setBusyKey(key);
    setNotice(null);
    const result = await postFestival(body);
    setBusyKey(null);
    if (result.ok) {
      setView(result.view);
      setNotice({ tone: "success", text: success(result) });
      return true;
    }
    setNotice({ tone: "error", text: lifeFestivalErrorLabel(result.error) });
    return false;
  };

  const deliver = (order: LifeFestivalOrderView, times: number, foodIds?: Record<string, number>) =>
    submit(
      `order:${order.id}`,
      { action: "deliver", orderId: order.id, times, ...(foodIds ? { foodIds } : {}) },
      (result) =>
        `증표 +${formatNumber(result.gained?.tokens ?? 0)} · 점수 +${formatNumber(result.gained?.score ?? 0)}`,
    );

  const buy = async (item: LifeFestivalShopView) => {
    if (item.tokenCost >= CONFIRM_TOKEN_COST) {
      const confirmed = await confirmGameAction({
        title: "축제 상점",
        message: `축제 증표 ${formatNumber(item.tokenCost)}개로 ${item.name}을(를) 교환합니다.`,
        confirmLabel: "교환",
      });
      if (!confirmed) return;
    }
    await submit(`shop:${item.id}`, { action: "buy", itemId: item.id }, () => `${item.name} 교환 완료`);
  };

  const dishOrder = view?.orders.find((order) => order.id === dishOrderId) ?? null;

  return (
    <PageShell spacing="tight">
      <SubViewHeader
        title="생활 축제"
        onBack={onBack}
        help={
          <ul className="list-disc space-y-1 pl-4">
            <li>매주 월요일 0시에 축제 테마가 바뀌고, 테마 활동에 산출·경험치 보너스가 붙습니다.</li>
            <li>축제 주문은 횟수 제한 없이 반복 납품할 수 있습니다. 같은 주문의 6번째부터 보상이 50%, 16번째부터 20%가 됩니다.</li>
            <li>주간 점수 상위 30명은 다음 주 월요일에 우편으로 축제 증표를 받습니다.</li>
            <li>축제 증표는 주가 바뀌어도 사라지지 않습니다.</li>
          </ul>
        }
      />

      {loadFailed ? <LoadErrorBanner onRetry={() => void load()} /> : null}
      {notice ? <StatusBanner tone={notice.tone}>{notice.text}</StatusBanner> : null}

      {view ? (
        <>
          <ThemeCard view={view} now={loadedAt} />
          <StatusRow view={view} />
          <OrdersSection
            orders={view.orders}
            busyKey={busyKey}
            onDeliver={(order, times) => void deliver(order, times)}
            onPickDishes={(order) => setDishOrderId(order.id)}
          />
          <RankingSection refreshKey={view.weeklyScore} />
          <ShopSection
            items={view.shop}
            tokens={view.tokens}
            busyKey={busyKey}
            onBuy={(item) => void buy(item)}
          />
        </>
      ) : !loadFailed ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</p>
      ) : null}

      {dishOrder ? (
        <DishPicker
          order={dishOrder}
          options={view?.dishOptions[dishOrder.id] ?? []}
          busy={busyKey === `order:${dishOrder.id}`}
          onClose={() => setDishOrderId(null)}
          onConfirm={async (foodIds) => {
            if (await deliver(dishOrder, 1, foodIds)) setDishOrderId(null);
          }}
        />
      ) : null}
    </PageShell>
  );
}

function ThemeCard({ view, now }: { view: LifeFestivalViewData; now: number }) {
  return (
    <section className={`${SURFACE_ACCENT} flex items-start gap-3 p-3`} aria-labelledby="life-festival-theme">
      <span className="grid size-10 shrink-0 place-items-center rounded-md border border-amber-300 bg-white text-rose-500 dark:border-amber-800 dark:bg-zinc-900">
        <Tent size={22} weight="duotone" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          이번 주 축제 · {view.theme.activityName}
        </p>
        <h2 id="life-festival-theme" className="font-bold text-zinc-900 dark:text-zinc-100">
          {view.theme.name}
        </h2>
        <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-200">{view.theme.effectText}</p>
      </div>
      <span className="shrink-0 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        {remainingTimeLabel(view.endsAt, now)}
      </span>
    </section>
  );
}

function StatusRow({ view }: { view: LifeFestivalViewData }) {
  const cells = [
    { label: "보유 증표", value: formatNumber(view.tokens) },
    { label: "이번 주 점수", value: formatNumber(view.weeklyScore) },
    { label: "현재 순위", value: view.myRank ? `${view.myRank}위` : "—" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map((cell) => (
        <div key={cell.label} className={`${SURFACE_INSET} p-2.5 text-center`}>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{cell.label}</p>
          <p className="mt-0.5 font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{cell.value}</p>
        </div>
      ))}
    </div>
  );
}

function OrdersSection({
  orders,
  busyKey,
  onDeliver,
  onPickDishes,
}: {
  orders: readonly LifeFestivalOrderView[];
  busyKey: string | null;
  onDeliver: (order: LifeFestivalOrderView, times: number) => void;
  onPickDishes: (order: LifeFestivalOrderView) => void;
}) {
  return (
    <section className={`${SURFACE_CARD} p-3`}>
      <SectionHeading title="축제 주문" />
      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
        {orders.map((order) => {
          const quantity = order.requirement.quantity;
          const maxTimes = Math.min(LIFE_FESTIVAL_DELIVERY_TIMES_MAX, Math.floor(order.held / quantity));
          const busy = busyKey === `order:${order.id}`;
          const nextTokens = Math.floor(order.baseTokens * order.nextMultiplier);
          return (
            <li key={order.id} data-testid={`festival-order-${order.id}`} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{order.label}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  보유 {formatNumber(order.held)} · 이번 주 {order.delivered}회 · 증표 {nextTokens}
                  {order.nextMultiplier < 1 ? ` (다음 납품 보상 ${Math.round(order.nextMultiplier * 100)}%)` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {order.requirement.kind === "dish" ? (
                  <Button size="sm" disabled={maxTimes < 1 || busy} onClick={() => onPickDishes(order)}>
                    요리 고르기
                  </Button>
                ) : (
                  <>
                    <Button size="sm" disabled={maxTimes < 1} loading={busy} onClick={() => onDeliver(order, 1)}>
                      납품
                    </Button>
                    {maxTimes >= 2 ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDeliver(order, maxTimes)}>
                        {maxTimes}회 모두 납품
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DishPicker({
  order,
  options,
  busy,
  onClose,
  onConfirm,
}: {
  order: LifeFestivalOrderView;
  options: readonly LifeFestivalDishOptionView[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (foodIds: Record<string, number>) => void;
}) {
  const quantity = order.requirement.quantity;
  const allowMasterpiece =
    order.requirement.kind === "dish" && order.requirement.minQuality === "masterpiece";
  const [selection, setSelection] = useState<Record<string, number>>(() =>
    defaultDishSelection(options, quantity, allowMasterpiece),
  );
  const total = Object.values(selection).reduce((sum, count) => sum + count, 0);
  const change = (foodId: string, delta: number) =>
    setSelection((current) => {
      const nextCount = Math.max(0, (current[foodId] ?? 0) + delta);
      const next = { ...current, [foodId]: nextCount };
      if (nextCount === 0) delete next[foodId];
      return next;
    });

  return (
    <div className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="life-festival-dish-title"
        className={`${SURFACE_CARD} ui-modal-panel flex max-h-[85vh] w-full max-w-md flex-col p-4 shadow-2xl`}
      >
        <h2 id="life-festival-dish-title" className="font-bold text-zinc-900 dark:text-zinc-100">
          {order.label}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          {total} / {quantity}개 선택
        </p>
        <ul className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {options.map((option) => {
            const selected = selection[option.foodId] ?? 0;
            return (
              <li key={option.foodId} className={`${SURFACE_INSET} flex items-center gap-2 p-2`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{option.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {option.tier}등급 · 보유 {formatNumber(option.count)}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${option.name} 1개 빼기`}
                  disabled={selected <= 0}
                  onClick={() => change(option.foodId, -1)}
                >
                  <Minus size={16} aria-hidden />
                </Button>
                <span className="w-6 text-center text-sm font-bold tabular-nums">{selected}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${option.name} 1개 더`}
                  disabled={selected >= option.count || total >= quantity}
                  onClick={() => change(option.foodId, 1)}
                >
                  <Plus size={16} aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" disabled={total !== quantity} loading={busy} onClick={() => onConfirm(selection)}>
            선택한 요리 납품
          </Button>
        </div>
      </div>
    </div>
  );
}

function RankingSection({ refreshKey }: { refreshKey: number }) {
  const [week, setWeek] = useState<"current" | "previous">("current");
  const [ranking, setRanking] = useState<LifeFestivalRankingData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v2/life-festival/ranking?week=${week}`)
      .then((response) => response.json() as Promise<{ ok?: boolean } & LifeFestivalRankingData>)
      .then((json) => {
        if (cancelled) return;
        if (!json.ok) throw new Error("ranking_failed");
        setFailed(false);
        setRanking(json);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [week, refreshKey]);

  const meOutsideTop = ranking?.me && !ranking.top.some((row) => row.rank === ranking.me?.rank);

  return (
    <section className={`${SURFACE_CARD} p-3`}>
      <SectionHeading title="주간 순위" />
      <SegmentedControl
        className="mt-2"
        ariaLabel="순위 주차"
        value={week}
        onChange={setWeek}
        options={[
          { key: "current", label: "이번 주" },
          { key: "previous", label: "지난 주" },
        ]}
      />
      {failed ? (
        <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">순위를 불러오지 못했습니다.</p>
      ) : ranking && ranking.top.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">아직 납품한 모험가가 없습니다.</p>
      ) : (
        <ol className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
          {ranking?.top.map((row) => (
            <li key={row.userId} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 py-1.5 text-sm">
              <span className="font-bold tabular-nums text-zinc-500 dark:text-zinc-400">{row.rank}</span>
              <span className="min-w-0 truncate text-zinc-900 dark:text-zinc-100">{row.name}</span>
              <span className="text-right font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                {formatNumber(row.score)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {meOutsideTop && ranking?.me ? (
        <p className="mt-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          내 순위 {ranking.me.rank}위
        </p>
      ) : null}
    </section>
  );
}

function ShopSection({
  items,
  tokens,
  busyKey,
  onBuy,
}: {
  items: readonly LifeFestivalShopView[];
  tokens: number;
  busyKey: string | null;
  onBuy: (item: LifeFestivalShopView) => void;
}) {
  return (
    <section className={`${SURFACE_CARD} p-3`}>
      <SectionHeading title="축제 상점" />
      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map((item) => {
          const soldOut =
            item.weeklyLimit === null ? item.owned : item.purchased >= item.weeklyLimit;
          const limitText =
            item.weeklyLimit === null
              ? item.owned
                ? "보유 중"
                : "1회 한정"
              : soldOut
                ? "이번 주 구매 완료"
                : `이번 주 ${item.purchased}/${item.weeklyLimit}`;
          return (
            <li key={item.id} data-testid={`festival-shop-${item.id}`} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{item.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.description}</p>
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                  증표 {formatNumber(item.tokenCost)} · <span>{limitText}</span>
                </p>
              </div>
              <Button
                size="sm"
                className="shrink-0"
                disabled={soldOut || tokens < item.tokenCost}
                loading={busyKey === `shop:${item.id}`}
                onClick={() => onBuy(item)}
              >
                교환
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
