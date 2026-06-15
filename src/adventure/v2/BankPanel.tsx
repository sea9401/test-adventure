"use client";

import { useState } from "react";
import { useGameState } from "./GameStateProvider";

// 은행 패널 — 골드 입금/출금. 거점 hub(OutpostView)와 마을 탭(/town/bank) 양쪽에서 재사용.
// 안전 위치 게이트(다른 길드 점령지 불가)는 서버(/api/v2/me/bank)가 unsafe_location 으로 최종 판정.

type BankAction = "deposit" | "withdraw";

type BankResult =
  | {
      ok: true;
      action: BankAction;
      moved: number;
      gold: number;
      bankedGold: number;
    }
  | { ok: false; error?: string };

const BANK_ERROR_TEXT: Record<string, string> = {
  unsafe_location: "안전한 곳에서만 이용할 수 있습니다",
  insufficient_gold: "보유 골드가 부족합니다",
  insufficient_banked: "은행 잔액이 부족합니다",
  bad_amount: "금액을 확인해 주세요",
  bad_action: "알 수 없는 오류입니다",
};

export function BankPanel() {
  const { gold, bankedGold, setGold, setBankedGold } = useGameState();
  const [amountText, setAmountText] = useState("");
  const [busyAction, setBusyAction] = useState<BankAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const amount = Math.max(0, Math.floor(Number(amountText)));
  const canSubmit = amount > 0 && busyAction === null;

  function fillAll(action: BankAction) {
    const max = action === "deposit" ? gold : bankedGold;
    setAmountText(max > 0 ? String(max) : "");
    setMessage(null);
  }

  async function submit(action: BankAction) {
    if (!canSubmit) {
      setMessage("금액을 확인해 주세요");
      return;
    }
    setBusyAction(action);
    setMessage(null);
    try {
      const res = await fetch("/api/v2/me/bank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, amount }),
      });
      const j = (await res.json().catch(() => null)) as BankResult | null;
      if (!j?.ok) {
        setMessage(BANK_ERROR_TEXT[j?.error ?? ""] ?? "알 수 없는 오류입니다");
        return;
      }
      setGold(j.gold);
      setBankedGold(j.bankedGold);
      setAmountText("");
      setMessage(
        `${action === "deposit" ? "입금" : "출금"} ${j.moved.toLocaleString()}G 완료`,
      );
    } catch (err) {
      setMessage(`네트워크 오류: ${(err as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-zinc-800 dark:text-zinc-100">은행</div>
        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span>보유 골드</span>
          <span className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
            {gold.toLocaleString()}G
          </span>
          <span>은행 잔액</span>
          <span className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
            {bankedGold.toLocaleString()}G
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={amountText}
          onChange={(e) => {
            setAmountText(e.target.value);
            setMessage(null);
          }}
          placeholder="금액"
          className="min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={() => fillAll("deposit")}
          disabled={busyAction !== null || gold <= 0}
          className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          전액
        </button>
        <button
          type="button"
          onClick={() => fillAll("withdraw")}
          disabled={busyAction !== null || bankedGold <= 0}
          className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          전액
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => submit("deposit")}
          disabled={!canSubmit}
          className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "deposit" ? "처리 중…" : "입금"}
        </button>
        <button
          type="button"
          onClick={() => submit("withdraw")}
          disabled={!canSubmit}
          className="rounded-md border border-sky-600 bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "withdraw" ? "처리 중…" : "출금"}
        </button>
      </div>
      {message && (
        <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {message}
        </div>
      )}
    </div>
  );
}
