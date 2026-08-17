"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Flag, X } from "@phosphor-icons/react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  MARKETPLACE_TRADE_REPORT_REASONS,
  UGC_REPORT_REASON_LABELS,
} from "@/lib/ugc-safety";

type MarketplaceTradeReportReason =
  (typeof MARKETPLACE_TRADE_REPORT_REASONS)[number];

export function marketplaceTradeReportResponseMessage(
  status: number,
  text: string,
): string {
  if (status === 409 || text === "already reported") {
    return "이미 접수되어 검토 중인 거래입니다.";
  }
  if (status === 429 || text === "rate limited") {
    return "신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
  }
  if (status === 404 || text === "not found") {
    return "거래 기록을 찾을 수 없거나 더 이상 신고할 수 없습니다.";
  }
  return "신고를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

export function MarketplaceTradeReportDialog({
  tradeId,
  itemName,
  reason,
  details,
  busy,
  feedback,
  onReasonChange,
  onDetailsChange,
  onSubmit,
  onClose,
}: {
  tradeId: number;
  itemName: string;
  reason: MarketplaceTradeReportReason;
  details: string;
  busy: boolean;
  feedback: string | null;
  onReasonChange: (reason: MarketplaceTradeReportReason) => void;
  onDetailsChange: (details: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`marketplace-trade-report-title-${tradeId}`}
        className={`${SURFACE_CARD} w-full max-w-md p-5 text-zinc-900 dark:text-zinc-100`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id={`marketplace-trade-report-title-${tradeId}`}
              className="text-lg font-bold"
            >
              {itemName} 거래 신고
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              의심되는 사유를 선택해주세요. 거래 당시 기록은 운영자에게만 전달됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="거래 신고 창 닫기"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" aria-hidden />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">신고 사유</legend>
          <div className="mt-2 space-y-2">
            {MARKETPLACE_TRADE_REPORT_REASONS.map((value) => (
              <label
                key={value}
                className={`${SURFACE_INSET} flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm`}
              >
                <input
                  type="radio"
                  name={`marketplace-trade-report-reason-${tradeId}`}
                  value={value}
                  checked={reason === value}
                  onChange={() => onReasonChange(value)}
                />
                <span>{UGC_REPORT_REASON_LABELS[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label
          className="mt-4 block text-sm font-semibold"
          htmlFor={`marketplace-trade-report-details-${tradeId}`}
        >
          추가 설명 <span className="font-normal text-zinc-500">(선택)</span>
        </label>
        <textarea
          id={`marketplace-trade-report-details-${tradeId}`}
          value={details}
          onChange={(event) => onDetailsChange(event.target.value)}
          maxLength={500}
          rows={4}
          placeholder="운영자가 확인할 내용을 적어주세요."
          className="mt-2 w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="mt-1 text-right text-[11px] tabular-nums text-zinc-500">
          {details.length} / 500
        </div>
        {feedback ? (
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-400" role="status">
            {feedback}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="min-h-11 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? "접수 중…" : "신고 접수"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function MarketplaceTradeReportButton({
  tradeId,
  itemName,
}: {
  tradeId: number;
  itemName: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] =
    useState<MarketplaceTradeReportReason>("abnormal_price");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, open]);

  const submit = async () => {
    if (busy || reported) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/safety/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType: "content",
          sourceType: "marketplace_trade",
          sourceId: tradeId,
          reason,
          details,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        setFeedback(
          marketplaceTradeReportResponseMessage(response.status, text),
        );
        return;
      }
      setReported(true);
      setOpen(false);
      setDetails("");
      setFeedback("신고가 접수됐습니다.");
    } catch {
      setFeedback("네트워크 상태를 확인한 뒤 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const dialog = open ? (
    <MarketplaceTradeReportDialog
      tradeId={tradeId}
      itemName={itemName}
      reason={reason}
      details={details}
      busy={busy}
      feedback={feedback}
      onReasonChange={setReason}
      onDetailsChange={setDetails}
      onSubmit={() => void submit()}
      onClose={() => setOpen(false)}
    />
  ) : null;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setFeedback(null);
          setOpen(true);
        }}
        disabled={busy || reported}
        aria-label={`${itemName} 거래 신고`}
        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-rose-300 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
      >
        <Flag size={14} weight="bold" aria-hidden />
        {reported ? "접수됨" : "신고"}
      </button>
      {feedback && !open ? (
        <span className="text-[11px] text-zinc-600 dark:text-zinc-300" role="status">
          {feedback}
        </span>
      ) : null}
      {typeof document !== "undefined" && dialog
        ? createPortal(dialog, document.body)
        : null}
    </div>
  );
}
