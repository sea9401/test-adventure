"use client";

import { useCallback, useEffect, useState } from "react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

type Order = {
  orderId: string;
  userId: string | null;
  packageId: string;
  coinAmount: number;
  amountKrw: number;
  status: string;
  method: string | null;
  requestedAt: string;
  approvedAt: string | null;
};

type Refund = {
  id: string;
  orderId: string;
  userId: string | null;
  requestedCoins: number;
  amountKrw: number;
  reason: string;
  status: string;
  processedByEmail: string | null;
  createdAt: string;
};

type ReviewAction =
  | { kind: "approve_refund"; refund: Refund }
  | { kind: "reject_refund"; refund: Refund }
  | { kind: "reconcile_order"; order: Order };

export function MuseunCoinPaymentsAdmin() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState("");
  const [coins, setCoins] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams();
      if (query.trim()) search.set("query", query.trim());
      if (status) search.set("status", status);
      const response = await fetch(
        `/api/admin/museun-coin-payments${search.size ? `?${search}` : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("load_failed");
      const body = (await response.json()) as { orders?: Order[]; refunds?: Refund[] };
      setOrders(Array.isArray(body.orders) ? body.orders : []);
      setRefunds(Array.isArray(body.refunds) ? body.refunds : []);
    } catch {
      setError("결제 운영 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  function openReview(action: ReviewAction) {
    setReview(action);
    setReason("");
    setCoins(action.kind === "approve_refund" ? action.refund.requestedCoins : 0);
  }

  async function submitReview() {
    if (!review || reason.trim().length < 2 || submitting) return;
    setSubmitting(true);
    setError(null);
    const payload =
      review.kind === "reconcile_order"
        ? { action: review.kind, orderId: review.order.orderId, reason: reason.trim() }
        : review.kind === "approve_refund"
          ? { action: review.kind, refundId: review.refund.id, coins, reason: reason.trim() }
          : { action: review.kind, refundId: review.refund.id, reason: reason.trim() };
    try {
      const response = await fetch("/api/admin/museun-coin-payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("action_failed");
      setReview(null);
      await load();
    } catch {
      setError("결제 작업을 완료하지 못했습니다. 주문 상태를 다시 조회해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <header className={`${SURFACE_CARD} p-5`}>
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">운영자 전용</p>
        <h1 className="mt-1 text-2xl font-bold">무슨 코인 결제 운영</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">주문·환불 상태를 조회하고, 검토가 필요한 건만 처리합니다.</p>
      </header>

      <section className={`${SURFACE_CARD} p-4`} aria-label="결제 검색">
        <form className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <label className="text-sm font-medium">주문·사용자 검색
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900" />
          </label>
          <label className="text-sm font-medium">주문 상태
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900">
              <option value="">전체</option><option value="paid">결제 완료</option><option value="review_required">확인 필요</option><option value="canceled">환불 완료</option><option value="failed">실패</option>
            </select>
          </label>
          <button type="submit" className="self-end rounded-md bg-zinc-900 px-4 py-2 font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">조회</button>
        </form>
      </section>

      {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {loading ? <p role="status" className={`${SURFACE_CARD} p-5 text-sm`}>불러오는 중…</p> : (
        <>
          <section className={`${SURFACE_CARD} overflow-hidden`} aria-labelledby="orders-title">
            <h2 id="orders-title" className="border-b border-zinc-200 p-4 font-bold dark:border-zinc-700">주문 {orders.length}건</h2>
            <div className="space-y-2 p-3">
              {orders.map((order) => (
                <article key={order.orderId} className={`${SURFACE_INSET} grid gap-3 p-3 sm:grid-cols-[1fr_auto]`}>
                  <div className="min-w-0 text-sm"><p className="font-mono font-semibold">{order.orderId}</p><p className="mt-1 text-zinc-600 dark:text-zinc-300">{order.userId ?? "탈퇴 사용자"} · {order.coinAmount.toLocaleString()}코인 · {order.amountKrw.toLocaleString()}원 · {order.status}</p></div>
                  <button type="button" onClick={() => openReview({ kind: "reconcile_order", order })} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">상태 재확인</button>
                </article>
              ))}
              {orders.length === 0 ? <p className="p-3 text-sm text-zinc-500">조건에 맞는 주문이 없습니다.</p> : null}
            </div>
          </section>

          <section className={`${SURFACE_CARD} overflow-hidden`} aria-labelledby="refunds-title">
            <h2 id="refunds-title" className="border-b border-zinc-200 p-4 font-bold dark:border-zinc-700">환불 검토 {refunds.length}건</h2>
            <div className="space-y-2 p-3">
              {refunds.map((refund) => (
                <article key={refund.id} className={`${SURFACE_INSET} grid gap-3 p-3 sm:grid-cols-[1fr_auto]`}>
                  <div className="text-sm"><p className="font-mono font-semibold">{refund.id}</p><p className="mt-1">주문 {refund.orderId} · {refund.requestedCoins.toLocaleString()}코인 · {refund.status}</p><p className="mt-1 text-zinc-600 dark:text-zinc-300">{refund.reason}</p></div>
                  {refund.status === "review_required" || refund.status === "pending" ? <div className="flex gap-2"><button type="button" onClick={() => openReview({ kind: "approve_refund", refund })} className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-bold text-white">환불 승인</button><button type="button" onClick={() => openReview({ kind: "reject_refund", refund })} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">환불 거절</button></div> : null}
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {review ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="payment-review-title" className={`${SURFACE_CARD} w-full max-w-md p-5`}>
            <h2 id="payment-review-title" className="text-lg font-bold">{review.kind === "approve_refund" ? "환불 승인 확인" : review.kind === "reject_refund" ? "환불 거절 확인" : "주문 상태 재확인"}</h2>
            {review.kind === "approve_refund" ? <label className="mt-4 block text-sm font-medium">환불 코인<input type="number" min={1} max={review.refund.requestedCoins} value={coins} onChange={(event) => setCoins(Number(event.target.value))} className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900" /></label> : null}
            <label className="mt-4 block text-sm font-medium">처리 사유<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1 block w-full rounded-md border border-zinc-300 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-900" /></label>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setReview(null)} className="rounded-md px-3 py-2">취소</button><button type="button" disabled={reason.trim().length < 2 || submitting || (review.kind === "approve_refund" && (!Number.isSafeInteger(coins) || coins <= 0 || coins > review.refund.requestedCoins))} onClick={() => void submitReview()} className="rounded-md bg-red-600 px-3 py-2 font-bold text-white disabled:opacity-50">{review.kind === "approve_refund" ? "승인 확정" : review.kind === "reject_refund" ? "거절 확정" : "재확인 실행"}</button></div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
