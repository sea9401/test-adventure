"use client";

import {
  type MarketplaceStackGroup
} from "@/adventure/v2/marketplace/marketplaceShared";
import { Card } from "@/components/ui/Card";
import { NumberInput, parseAmount } from "@/components/ui/NumberInput";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  X
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export type PriceAlert = {
  id: number;
  kind: "material" | "consumable";
  itemId: string;
  itemName: string;
  targetUnitPrice: number;
  status: "active" | "triggered" | "cancelled";
  createdAt: string;
  triggeredAt: string | null;
};



export function PriceAlertManagement({
  alerts,
  busy,
  onCancelAlert,
}: {
  alerts: PriceAlert[] | null;
  busy: boolean;
  onCancelAlert: (alert: PriceAlert) => unknown;
}) {
  if (alerts === null) {
    return <Card padding="sm"><div className="text-xs text-zinc-400">가격 알림을 불러오는 중…</div></Card>;
  }
  const activeAlerts = alerts.filter((alert) => alert.status === "active");
  return (
    <Card padding="sm">
      <div className="text-sm font-semibold">시작 입찰가 알림</div>
      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        설정한 개당 기준가 이하로 경매가 등록되면 알려드립니다.
      </p>
      {activeAlerts.length === 0 ? (
        <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">활성 가격 알림이 없어요.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {activeAlerts.map((alert) => (
            <div key={alert.id} className={`${SURFACE_INSET} flex items-center justify-between gap-2 p-2.5`}>
              <div className="text-xs">
                <span className="font-semibold">{alert.itemName}</span>
                <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                  개당 {alert.targetUnitPrice.toLocaleString()}G 이하
                </span>
              </div>
              <button
                type="button"
                onClick={() => onCancelAlert(alert)}
                disabled={busy}
                className="text-[11px] font-medium text-rose-600 disabled:opacity-50 dark:text-rose-400"
              >
                취소
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}



export type PriceHistoryPoint = {
  date: string;
  volume: number;
  trades: number;
  averageUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
};



export function MarketToolsDialog({
  group,
  existingAlert,
  busy,
  onCreateAlert,
  onClose,
}: {
  group: MarketplaceStackGroup;
  existingAlert?: PriceAlert;
  busy: boolean;
  onCreateAlert: (
    group: MarketplaceStackGroup,
    targetUnitPrice: number,
  ) => Promise<unknown>;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<PriceHistoryPoint[] | null>(null);
  const [alertPrice, setAlertPrice] = useState(
    String(existingAlert?.targetUnitPrice ?? group.minUnitPrice),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const sellLevels = (() => {
    const levels = new Map<
      number,
      { unitPrice: number; totalQuantity: number; orderCount: number }
    >();
    for (const listing of group.listings) {
      const unitPrice = Math.max(
        1,
        Math.ceil(listing.price / Math.max(1, listing.quantity)),
      );
      const level = levels.get(unitPrice);
      if (level) {
        level.totalQuantity += listing.quantity;
        level.orderCount++;
      } else {
        levels.set(unitPrice, {
          unitPrice,
          totalQuantity: listing.quantity,
          orderCount: 1,
        });
      }
    }
    return [...levels.values()]
      .sort((a, b) => a.unitPrice - b.unitPrice)
      .slice(0, 5);
  })();

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/v2/marketplace/price-history?kind=${encodeURIComponent(group.kind)}&itemId=${encodeURIComponent(group.itemId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return { points: [] };
        return (await response.json()) as { points?: PriceHistoryPoint[] };
      })
      .then((payload) => setHistory(payload.points ?? []))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setHistory([]);
      });
    return () => controller.abort();
  }, [group.itemId, group.kind]);

  const averages = history?.map((point) => point.averageUnitPrice) ?? [];
  const chartMax = Math.max(...averages, 1);
  const chartMin = Math.min(...averages, chartMax);
  const chartRange = Math.max(1, chartMax - chartMin);
  const chartPoints = (history ?? [])
    .map((point, index, rows) => {
      const x = rows.length <= 1 ? 150 : (index / (rows.length - 1)) * 300;
      const y = 90 - ((point.averageUnitPrice - chartMin) / chartRange) * 75;
      return `${x},${y}`;
    })
    .join(" ");

  const submitAlert = () => {
    const target = parseAmount(alertPrice);
    if (!Number.isInteger(target) || target < 1) {
      setLocalError("알림 가격을 확인해 주세요.");
      return;
    }
    setLocalError(null);
    void onCreateAlert(group, target);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-5 shadow-xl sm:rounded-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">{group.itemName}</h2>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">시세·시작 입찰가 알림</div>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        <div className={`${SURFACE_INSET} mt-4 p-3`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">현재 경매 시작가</div>
            <div className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              10초마다 갱신
            </div>
          </div>
          <div className="mt-2">
            <OrderBookSide title="등록된 경매" tone="sell" levels={sellLevels} />
          </div>
          <div className="mt-2 text-center text-[10px] text-zinc-400">
            묶음 시작가를 수량으로 나눈 개당 환산값입니다.
          </div>
        </div>

        <div className={`${SURFACE_INSET} mt-3 p-3`}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">최근 30일 개당 평균가</span>
            {history && history.length > 0 ? (
              <span className="tabular-nums text-sky-700 dark:text-sky-300">
                {history[history.length - 1].averageUnitPrice.toLocaleString()}G
              </span>
            ) : null}
          </div>
          {history === null ? (
            <div className="mt-3 h-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400">최근 체결 기록이 없어요.</div>
          ) : (
            <>
              <svg viewBox="0 0 300 100" role="img" aria-label="최근 30일 평균가 추이" className="mt-2 h-28 w-full overflow-visible">
                <polyline points={chartPoints} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" className="text-sky-500" />
              </svg>
              <div className="flex justify-between text-[10px] text-zinc-400">
                <span>{history[0].date.slice(5)}</span>
                <span>거래량 {history.reduce((sum, point) => sum + point.volume, 0).toLocaleString()}개</span>
                <span>{history[history.length - 1].date.slice(5)}</span>
              </div>
            </>
          )}
        </div>

        <div className={`${SURFACE_INSET} mt-3 p-3`}>
          <div className="text-sm font-semibold">시작 입찰가 알림</div>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            새 경매의 묶음 시작가를 개당 가격으로 환산해 비교합니다.
          </p>
          <div className="mt-2 flex gap-2">
            <NumberInput aria-label="가격 알림 기준" placeholder="개당 가격" value={alertPrice} onValueChange={setAlertPrice} className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
            <button type="button" onClick={submitAlert} disabled={busy} className="rounded-md border border-sky-700 bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {existingAlert ? "알림 수정" : "알림 설정"}
            </button>
          </div>
        </div>
        {localError ? <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">{localError}</div> : null}
      </div>
    </div>
  );
}



export function OrderBookSide({
  title,
  tone,
  levels,
}: {
  title: string;
  tone: "buy" | "sell";
  levels: Array<{
    unitPrice: number;
    totalQuantity: number;
    orderCount: number;
  }>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="grid grid-cols-[1fr_auto] border-b border-zinc-200 px-2 py-1.5 text-[10px] font-semibold text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        <span>{title}</span>
        <span>잔량</span>
      </div>
      {levels.length === 0 ? (
        <div className="px-2 py-5 text-center text-[10px] text-zinc-400">
          호가 없음
        </div>
      ) : (
        levels.map((level) => (
          <div
            key={level.unitPrice}
            className="grid grid-cols-[1fr_auto] gap-1 border-b border-zinc-100 px-2 py-1.5 text-[10px] last:border-b-0 dark:border-zinc-800"
          >
            <span
              className={`font-semibold tabular-nums ${
                tone === "buy"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-rose-700 dark:text-rose-300"
              }`}
            >
              {level.unitPrice.toLocaleString()}G
            </span>
            <span className="text-right tabular-nums text-zinc-600 dark:text-zinc-300">
              {level.totalQuantity.toLocaleString()}
              <span className="ml-1 text-zinc-400">({level.orderCount}건)</span>
            </span>
          </div>
        ))
      )}
    </div>
  );
}
