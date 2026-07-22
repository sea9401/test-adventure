"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClockCountdown, Coins, Ticket } from "@phosphor-icons/react";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import {
  LOTTERY_FEE_PERCENT,
  LOTTERY_MAX_TICKETS_PER_ROUND,
  LOTTERY_TICKET_PRICE,
  lotteryPrizeAmounts,
  parseLotteryCommand,
  type LotterySnapshot,
} from "@/lib/lottery";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  buyLotteryTickets,
  fetchLotterySnapshot,
  lotteryErrorMessage,
} from "./lotteryApi";

const POLL_MS = 2_000;

function countdownLabel(endsAt: number, now: number) {
  const remaining = Math.max(0, endsAt - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function LotteryRules() {
  return (
    <div
      className={`${SURFACE_INSET} space-y-1.5 p-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300`}
    >
      <p>
        <strong>구매:</strong> <code>/복권</code> 또는 <code>/복권 1~10</code>
      </p>
      <p>
        장당 {LOTTERY_TICKET_PRICE.toLocaleString()}G · 1인당 회차 최대{" "}
        {LOTTERY_MAX_TICKETS_PER_ROUND}장
      </p>
      <p>
        매시 정각(한국시간) 마감 · 수수료 {LOTTERY_FEE_PERCENT}% 공제 후 1등
        70% / 2등 20% / 3등 10%
      </p>
      <p>
        서로 다른 티켓 번호를 추첨하며, 여러 장 구매자는 복수 등수에 당첨될 수
        있습니다.
      </p>
      <p>
        고유 참여자가 2명 이하이면 추첨하지 않고, 수수료를 제외한 상금 전액을 다음
        회차로 이월합니다.
      </p>
    </div>
  );
}

export function LotteryRoom() {
  const { setGold, setBankedGold } = useGameState();
  const [snapshot, setSnapshot] = useState<LotterySnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [rulesOpen, setRulesOpen] = useState(false);
  // 응답을 받지 못한 결제 재시도는 같은 requestId 를 재사용해 중복 차감을 막는다.
  const pendingRequestRef = useRef<{ command: string; id: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await fetchLotterySnapshot();
        if (cancelled) return;
        setSnapshot(next);
        setGold(next.viewerGold);
        setBankedGold(next.viewerBankedGold);
      } catch {
        // 일시 오류는 다음 폴링에서 복구한다.
      }
    };
    void refresh();
    const poll = window.setInterval(refresh, POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [setBankedGold, setGold]);

  const prizes = useMemo(
    () =>
      lotteryPrizeAmounts(
        snapshot?.round.grossPool ?? 0,
        snapshot?.round.carryIn ?? 0,
      ).prizes,
    [snapshot?.round.carryIn, snapshot?.round.grossPool],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const command = parseLotteryCommand(draft);
    if (command.kind === "info") {
      setRulesOpen(true);
      setFeedback("복권 규칙을 펼쳤습니다.");
      setError(null);
      setDraft("");
      return;
    }
    if (command.kind !== "buy") {
      setError("복권방에서는 /복권 또는 /복권 1~10 명령어만 사용할 수 있습니다.");
      setFeedback(null);
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const normalizedCommand = `/복권 ${command.count}`;
      const request =
        pendingRequestRef.current?.command === normalizedCommand
          ? pendingRequestRef.current
          : { command: normalizedCommand, id: requestId() };
      pendingRequestRef.current = request;
      const result = await buyLotteryTickets(command.count, request.id);
      setSnapshot(result.snapshot);
      setGold(result.snapshot.viewerGold);
      setBankedGold(result.snapshot.viewerBankedGold);
      setDraft("");
      pendingRequestRef.current = null;
      setFeedback(
        `복권 ${result.purchasedTickets}장 구매 완료 · ${result.amountPaid.toLocaleString()}G`,
      );
    } catch (purchaseError) {
      setError(lotteryErrorMessage(purchaseError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <section className={`${SURFACE_ACCENT} p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                제 {snapshot?.round.id ?? "-"}회 복권
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                당첨금 {snapshot?.round.prizePool.toLocaleString() ?? "-"}G
              </p>
              {(snapshot?.round.carryIn ?? 0) > 0 && (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                  이전 회차 이월금 {snapshot?.round.carryIn.toLocaleString()}G 포함
                </p>
              )}
            </div>
            <div className="text-right text-xs text-zinc-600 dark:text-zinc-300">
              <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                <ClockCountdown size={15} weight="duotone" />
                {snapshot
                  ? countdownLabel(snapshot.round.endsAt, now)
                  : "--:--:--"}
              </span>
              <p className="mt-1">매시 정각 추첨</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {prizes.map((prize, index) => (
              <div key={index} className={`${SURFACE_INSET} px-2 py-2`}>
                <p className="text-zinc-500 dark:text-zinc-400">{index + 1}등</p>
                <p className="mt-0.5 break-all font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                  {prize.toLocaleString()}G
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <span className="inline-flex items-center gap-1">
              <Ticket size={15} weight="duotone" /> 판매{" "}
              {snapshot?.round.totalTickets ?? 0}장 · 참여{" "}
              {snapshot?.round.participantCount ?? 0}명 · 내 복권{" "}
              {snapshot?.myTickets ?? 0}장
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Coins size={15} weight="duotone" /> 총 구매액{" "}
              {snapshot?.round.grossPool.toLocaleString() ?? 0}G
            </span>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setRulesOpen((open) => !open)}
          className="text-xs font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
        >
          {rulesOpen ? "복권 규칙 접기" : "복권 규칙 보기"}
        </button>
        {rulesOpen && <LotteryRules />}

        {snapshot?.previousRound && (
          <section className={`${SURFACE_INSET} p-3`}>
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              제 {snapshot.previousRound.id}회 추첨 결과
            </p>
            {snapshot.previousRound.status === "rolled_over" ? (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                참여자 {snapshot.previousRound.participantCount}명으로 추첨 없이 상금{" "}
                {snapshot.previousRound.prizePool.toLocaleString()}G가 다음 회차로
                이월되었습니다.
              </p>
            ) : snapshot.previousRound.status === "refunded" ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                이전 운영 규칙에 따라 구매액이 전액 환불되었습니다.
              </p>
            ) : (
              <ol className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                {snapshot.previousRound.winners.map((winner) => (
                  <li
                    key={winner.rank}
                    className={
                      winner.mine
                        ? "font-semibold text-amber-700 dark:text-amber-300"
                        : ""
                    }
                  >
                    {winner.rank}등 {winner.actorName} · #
                    {winner.ticketNumber.toLocaleString()} ·{" "}
                    {winner.prizeAmount.toLocaleString()}G
                    {winner.mine ? " (나)" : ""}
                  </li>
                ))}
              </ol>
            )}
            <details className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-500">
              <summary className="cursor-pointer">추첨 검증값</summary>
              <p className="mt-1 break-all">
                commit {snapshot.previousRound.commitHash}
              </p>
              <p className="mt-1 break-all">
                secret {snapshot.previousRound.revealSecret}
              </p>
            </details>
          </section>
        )}

        <section>
          <p className="mb-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            이번 회차 구매 소식
          </p>
          {snapshot?.recentPurchases.length ? (
            <ul className="space-y-1.5">
              {snapshot.recentPurchases.map((purchase) => (
                <li
                  key={purchase.id}
                  className="text-sm text-zinc-700 dark:text-zinc-200"
                >
                  <span
                    className={
                      purchase.mine
                        ? "font-semibold text-blue-600 dark:text-blue-400"
                        : "font-semibold"
                    }
                  >
                    {purchase.actorName}
                  </span>
                  님이 복권 {purchase.ticketCount}장을 구매했습니다.
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-xs text-zinc-400">
              아직 구매자가 없습니다.
            </p>
          )}
        </section>
      </div>

      {feedback && (
        <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          {feedback}
        </div>
      )}
      {error && (
        <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      )}
      <form
        onSubmit={submit}
        className="flex items-center gap-2.5 border-t border-zinc-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-800"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="/복권 또는 /복권 1~10"
          maxLength={20}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={
            busy ||
            !draft.trim() ||
            (snapshot?.remainingTickets ?? 0) <= 0
          }
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
        >
          {busy ? "구매 중" : "입력"}
        </button>
      </form>
    </div>
  );
}
