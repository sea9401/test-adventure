"use client";

import { useCallback, useEffect, useState } from "react";
import { useGameState } from "./GameStateProvider";
import { NumberInput, parseAmount } from "@/components/ui/NumberInput";

// 길드 골드 입금 패널 — 길드원이 개인 골드를 길드 공용 골드 풀에 넣는다.
// 거점 페이지에서 (마을 탭으로 분리한) 개인 은행 자리를 대체한다.
// 길드 골드 = 거점 점령/공성 비용·성벽 자동 수리의 단일 재원(거점 금고 회수 + 이 입금으로 충원).

const DEPOSIT_ERROR_TEXT: Record<string, string> = {
  no_guild: "길드에 소속돼 있어야 입금할 수 있습니다",
  insufficient_gold: "보유 골드가 부족합니다",
  bad_amount: "금액을 확인해 주세요",
};

export function GuildGoldDepositPanel({
  onChanged,
}: {
  // 입금 성공 후 호출 — 부모(길드 정보)가 길드 자금·활동 내역을 다시 받아오게.
  onChanged?: () => void;
}) {
  const { gold, bankedGold, setGold, setBankedGold } = useGameState();
  const [guildGold, setGuildGold] = useState<number | null>(null);
  const [amountText, setAmountText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/v2/me/resources");
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        resources?: { gold?: number } | null;
      } | null;
      if (j?.ok) setGuildGold(j.resources?.gold ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch
    refresh();
  }, [refresh]);

  // 입금 가능액 = 보유 + 은행(차감은 은행 우선, 서버 spendGold).
  const spendable = gold + bankedGold;
  const amount = parseAmount(amountText);
  const canSubmit = amount > 0 && amount <= spendable && !busy;

  function fillAll() {
    setAmountText(spendable > 0 ? spendable.toLocaleString("en-US") : "");
    setMessage(null);
  }

  const submit = useCallback(async () => {
    if (amount <= 0 || amount > spendable || busy) {
      setMessage("금액을 확인해 주세요");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v2/guild/resources/deposit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        deposited?: number;
        gold?: number;
        bankedGold?: number;
        guildGold?: number;
      } | null;
      if (!j?.ok) {
        setMessage(DEPOSIT_ERROR_TEXT[j?.error ?? ""] ?? "입금에 실패했어요");
        return;
      }
      if (typeof j.gold === "number") setGold(j.gold);
      if (typeof j.bankedGold === "number") setBankedGold(j.bankedGold);
      if (typeof j.guildGold === "number") setGuildGold(j.guildGold);
      setAmountText("");
      setMessage(`길드 금고에 ${(j.deposited ?? 0).toLocaleString()} G 입금 완료`);
      onChanged?.();
    } catch (err) {
      setMessage(`네트워크 오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [amount, spendable, busy, setGold, setBankedGold, onChanged]);

  return (
    <div className="rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-zinc-800 dark:text-zinc-100">
          길드 금고 입금
        </div>
        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span>길드 골드</span>
          <span className="text-right font-medium tabular-nums text-amber-700 dark:text-amber-400">
            {guildGold == null ? "…" : `${guildGold.toLocaleString()}G`}
          </span>
          <span>내 골드(보유+은행)</span>
          <span className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
            {spendable.toLocaleString()}G
          </span>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        길드 골드는 거점 점령·공성 비용과 성벽 수리의 재원입니다. 은행 잔액부터
        차감됩니다.
      </p>

      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
        <NumberInput
          value={amountText}
          onValueChange={(v) => {
            setAmountText(v);
            setMessage(null);
          }}
          placeholder="입금 금액"
          className="min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={fillAll}
          disabled={busy || spendable <= 0}
          className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          전액
        </button>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="mt-2 w-full rounded-md border border-amber-600 bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "처리 중…" : "길드 금고에 입금"}
      </button>
      {message && (
        <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {message}
        </div>
      )}
    </div>
  );
}
