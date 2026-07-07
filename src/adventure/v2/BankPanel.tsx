"use client";

import { useState } from "react";
import { useGameState } from "./GameStateProvider";
import { NumberInput, parseAmount } from "@/components/ui/NumberInput";
import { useSystemToast } from "./RewardToastProvider";

// 은행 패널 — 골드 입금/출금.

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
  const { gold, bankedGold, applyResourcePatch, coreLoopOn } = useGameState();
  // 코어루프 — 출금 폐지(입금만). 골드 소비 시 은행이 우선 쓰이므로 은행은 패배 페널티 완충 + 자동 지갑.
  const depositOnly = coreLoopOn;
  const [amountText, setAmountText] = useState("");
  const [busyAction, setBusyAction] = useState<BankAction | null>(null);
  const { notifySystem } = useSystemToast();

  const amount = parseAmount(amountText);
  const canSubmit = amount > 0 && busyAction === null;

  function fillAll(action: BankAction) {
    const max = action === "deposit" ? gold : bankedGold;
    setAmountText(max > 0 ? max.toLocaleString("en-US") : "");
  }

  // amountOverride 를 주면 입력칸 대신 그 값으로 처리. "all" 은 서버가 save lock 이후
  //   최신 보유/은행 잔액 기준으로 전액 계산한다(클라 gold 가 stale 해도 잔액이 남지 않음).
  async function submit(action: BankAction, amountOverride?: number | "all") {
    const amt = amountOverride ?? amount;
    if ((amt !== "all" && amt <= 0) || busyAction !== null) {
      notifySystem("✗ 금액을 확인해 주세요");
      return;
    }
    setBusyAction(action);
    try {
      const res = await fetch("/api/v2/me/bank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, amount: amt }),
      });
      const j = (await res.json().catch(() => null)) as BankResult | null;
      if (!j?.ok) {
        notifySystem(`✗ ${BANK_ERROR_TEXT[j?.error ?? ""] ?? "알 수 없는 오류입니다"}`);
        return;
      }
      applyResourcePatch({ gold: j.gold, bankedGold: j.bankedGold });
      setAmountText("");
      notifySystem(
        `✓ ${action === "deposit" ? "입금" : "출금"} ${j.moved.toLocaleString()}G 완료`,
      );
    } catch (err) {
      notifySystem(`✗ 네트워크 오류: ${(err as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="ui-bank-panel rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-zinc-800 dark:text-zinc-100">은행</div>
        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span>보유 골드</span>
          <span className="ui-money-value text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
            {gold.toLocaleString()}G
          </span>
          <span>은행 잔액</span>
          <span className="ui-money-value text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
            {bankedGold.toLocaleString()}G
          </span>
        </div>
      </div>

      {depositOnly ? (
        // 코어루프 — 출금이 없고, 은행 잔액은 패배 페널티 완충+우선소비라 '전부 입금'이 기본 선택.
        //   금액 입력 없이 원탭으로 보유 골드 전부 입금(사용자 요청).
        <button
          type="button"
          onClick={() => submit("deposit", "all")}
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
          입금한 골드는 사냥 패배 페널티에서 안전합니다.
        </p>
      )}
    </div>
  );
}
