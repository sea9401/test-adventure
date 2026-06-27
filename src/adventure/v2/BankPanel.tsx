"use client";

import { useState } from "react";
import { useGameState } from "./GameStateProvider";
import { NumberInput, parseAmount } from "@/components/ui/NumberInput";

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
  const { gold, bankedGold, setGold, setBankedGold, coreLoopOn } =
    useGameState();
  // 코어루프 — 출금 폐지(입금만). 골드 소비 시 은행이 우선 쓰이므로 은행은 "안전 저축 + 자동 지갑".
  const depositOnly = coreLoopOn;
  const [amountText, setAmountText] = useState("");
  const [busyAction, setBusyAction] = useState<BankAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const canSubmit = amount > 0 && busyAction === null;

  function fillAll(action: BankAction) {
    const max = action === "deposit" ? gold : bankedGold;
    setAmountText(max > 0 ? max.toLocaleString("en-US") : "");
    setMessage(null);
  }

  // amountOverride 를 주면 입력칸 대신 그 값으로 처리(전액 입금 원탭 버튼용). 서버가
  //   moved=min(amount, 보유)로 클램프하므로 살짝 stale 해도 과입금 에러 없이 보유분만 들어간다.
  async function submit(action: BankAction, amountOverride?: number) {
    const amt = amountOverride ?? amount;
    if (amt <= 0 || busyAction !== null) {
      setMessage("금액을 확인해 주세요");
      return;
    }
    setBusyAction(action);
    setMessage(null);
    try {
      const res = await fetch("/api/v2/me/bank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, amount: amt }),
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

      {depositOnly ? (
        // 코어루프 — 출금이 없고, 은행 잔액은 안전+우선소비라 '전부 입금'이 항상 이득.
        //   금액 입력 없이 원탭으로 보유 골드 전부 입금(사용자 요청).
        <button
          type="button"
          onClick={() => submit("deposit", gold)}
          disabled={busyAction !== null || gold <= 0}
          className="mt-3 w-full rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "deposit"
            ? "입금 중…"
            : gold > 0
              ? `전액 입금 (${gold.toLocaleString()}G)`
              : "입금할 골드 없음"}
        </button>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
            <NumberInput
              value={amountText}
              onValueChange={(v) => {
                setAmountText(v);
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
        </>
      )}
      {depositOnly && (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          입금한 골드는 패배 세금에서 안전합니다. 출금은 없지만, 골드를 쓸 때
          은행 잔액이 먼저 사용됩니다(상점·치료·강화 등).
        </p>
      )}
      {message && (
        <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {message}
        </div>
      )}
    </div>
  );
}
