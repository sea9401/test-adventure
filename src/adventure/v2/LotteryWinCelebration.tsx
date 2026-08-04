"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bank, Confetti, Ticket, X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  NOTIF_POLL_MS,
  type LotteryWonNotificationPayload,
  type V2NotificationEntry,
} from "@/lib/v2-notification-config";

type LotteryWinNotification = V2NotificationEntry & {
  type: "lottery_won";
  payload: LotteryWonNotificationPayload;
};

const CONFETTI = Array.from({ length: 22 }, (_, index) => ({
  left: `${(index * 37) % 100}%`,
  delay: `${(index % 7) * 0.13}s`,
  duration: `${2.2 + (index % 5) * 0.24}s`,
  color: ["#facc15", "#fb7185", "#60a5fa", "#34d399", "#c084fc"][index % 5],
}));

function isLotteryWinNotification(
  item: V2NotificationEntry,
): item is LotteryWinNotification {
  return item.type === "lottery_won";
}

function rankLabel(rank: number): string {
  return `${rank}등`;
}

export function LotteryWinCelebration() {
  const [notification, setNotification] =
    useState<LotteryWinNotification | null>(null);

  const loadWinner = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/v2/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        notifications?: V2NotificationEntry[];
      };
      const winner = (json.notifications ?? [])
        .filter(isLotteryWinNotification)
        .find((item) => item.readAt === null);
      if (winner) setNotification((current) => current ?? winner);
    } catch {
      // 일시적인 조회 실패는 다음 폴링/화면 복귀 때 재시도한다.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 영구 알림 조회
    void loadWinner();
    const timer = window.setInterval(() => void loadWinner(), NOTIF_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadWinner();
    };
    const onCelebrate = (event: Event) => {
      const item = (event as CustomEvent<V2NotificationEntry>).detail;
      if (item && isLotteryWinNotification(item)) setNotification(item);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("lottery:celebrate", onCelebrate);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("lottery:celebrate", onCelebrate);
    };
  }, [loadWinner]);

  if (!notification) return null;
  return (
    <LotteryWinDialog
      notification={notification}
      onDismiss={() => setNotification(null)}
    />
  );
}

function LotteryWinDialog({
  notification,
  onDismiss,
}: {
  notification: LotteryWinNotification;
  onDismiss: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const payload = notification.payload;
  const bestRank = Math.min(...payload.ranks);

  const acknowledge = useCallback(async () => {
    onDismiss();
    try {
      await fetch("/api/v2/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notificationId: notification.id }),
      });
      window.dispatchEvent(new Event("v2notif:read"));
    } catch {
      // 다음 알림 조회 때 다시 표시되어 당첨 안내가 유실되지 않는다.
    }
  }, [notification.id, onDismiss]);

  const openLottery = useCallback(() => {
    void acknowledge();
    window.dispatchEvent(new Event("chat:open-lottery"));
  }, [acknowledge]);

  useEscapeKey(() => void acknowledge());
  useModalA11y(contentRef);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lottery-win-title"
      className="ui-modal-reveal fixed inset-0 z-[110] flex items-end justify-center overflow-hidden bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {CONFETTI.map((piece, index) => (
          <span
            key={index}
            className="lottery-confetti absolute -top-8 h-3 w-1.5 rounded-sm motion-reduce:hidden"
            style={{
              left: piece.left,
              backgroundColor: piece.color,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
            }}
          />
        ))}
      </div>

      <div
        ref={contentRef}
        className="ui-modal-panel relative w-full max-w-lg overflow-hidden rounded-3xl border-2 border-amber-300 bg-amber-50 shadow-[0_0_80px_rgba(251,191,36,0.55)] dark:border-amber-500 dark:bg-zinc-950"
      >
        <div aria-hidden="true" className="lottery-golden-halo absolute -inset-24 rounded-full bg-amber-300/40 blur-3xl motion-reduce:animate-none" />
        <button
          type="button"
          onClick={() => void acknowledge()}
          aria-label="당첨 안내 닫기"
          className="absolute right-3 top-3 z-20 rounded-full bg-white/90 p-2 text-zinc-600 shadow hover:bg-white dark:bg-zinc-900 dark:text-zinc-300"
        >
          <X size={18} weight="bold" />
        </button>

        <div className="relative z-10 px-5 pb-6 pt-9 text-center sm:px-8 sm:pb-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-300 bg-gradient-to-br from-yellow-200 via-amber-400 to-yellow-600 text-amber-950 shadow-lg">
            <Confetti size={34} weight="duotone" />
          </div>
          <p className="mt-4 text-xs font-black tracking-[0.28em] text-amber-700 dark:text-amber-300">
            GOLDEN TICKET
          </p>
          <h2
            id="lottery-win-title"
            className="mt-2 text-3xl font-black text-zinc-950 dark:text-amber-100 sm:text-4xl"
          >
            복권 {rankLabel(bestRank)} 당첨!
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            제 {payload.roundId}회 복권의 행운이 찾아왔습니다.
          </p>

          <div className="lottery-ticket-shine relative mt-6 overflow-hidden rounded-2xl border-2 border-dashed border-amber-600 bg-gradient-to-br from-yellow-100 via-amber-300 to-yellow-500 px-5 py-5 text-amber-950 shadow-xl dark:from-amber-200 dark:via-amber-400 dark:to-yellow-600">
            <Ticket size={28} weight="fill" className="mx-auto" />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm font-bold">
              {payload.ranks.map((rank, index) => (
                <span key={`${rank}-${payload.ticketNumbers[index]}`} className="rounded-full bg-amber-950/10 px-3 py-1">
                  {rankLabel(rank)} · #{payload.ticketNumbers[index]}
                </span>
              ))}
            </div>
            <p className="mt-4 text-3xl font-black tabular-nums sm:text-4xl">
              {payload.prizeAmount.toLocaleString()}G
            </p>
          </div>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <Bank size={16} weight="duotone" />
            당첨금은 은행에 자동 입금되었습니다.
          </p>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void acknowledge()}
              className="rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-amber-50 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              확인
            </button>
            <button
              type="button"
              onClick={openLottery}
              className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white shadow-lg hover:bg-amber-500 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
            >
              지난 회차 결과 보기
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
