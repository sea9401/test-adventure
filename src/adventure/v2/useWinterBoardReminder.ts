"use client";

import { useEffect, useState } from "react";
import { winterPhase } from "@/adventure/data/v2/winterBoard";

// 상단 메뉴가 항상 떠 있으므로 이 조회가 그날 주사위 적립도 겸한다(서버가 조회 때 적립).
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const STATUS_MAX_AGE_MS = 60 * 1000;

let cachedPending: number | null = null;
let lastFetchedAt = 0;
let pendingRequest: Promise<void> | null = null;
const listeners = new Set<(pending: number) => void>();

/** 겨울 이벤트 화면이 받은 최신 상태를 알림에 바로 반영한다. */
export function setWinterBoardReminder(pending: number) {
  cachedPending = Math.max(0, Math.floor(pending));
  lastFetchedAt = Date.now();
  listeners.forEach((listener) => listener(cachedPending ?? 0));
}

async function refreshWinterBoardReminder(force = false): Promise<void> {
  if (winterPhase(Date.now()) === "ended") {
    if (cachedPending !== 0) setWinterBoardReminder(0);
    return;
  }
  if (
    !force &&
    cachedPending !== null &&
    Date.now() - lastFetchedAt < STATUS_MAX_AGE_MS
  ) {
    return;
  }
  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    try {
      const response = await fetch("/api/v2/events/winter-board", {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        pending?: number;
      } | null;
      if (response.ok && data?.ok && typeof data.pending === "number") {
        setWinterBoardReminder(data.pending);
      }
    } catch {
      // 일시적인 네트워크 오류는 다음 주기나 화면 복귀 때 다시 확인한다.
    } finally {
      pendingRequest = null;
    }
  })();

  return pendingRequest;
}

/** 굴릴 주사위와 받을 바퀴 보상의 수. 이벤트가 끝나면 0이고 조회하지 않는다. */
export function useWinterBoardReminder(): number {
  const [pending, setPending] = useState(cachedPending ?? 0);

  useEffect(() => {
    if (winterPhase(Date.now()) === "ended") return;
    listeners.add(setPending);
    void refreshWinterBoardReminder();

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshWinterBoardReminder();
    };
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshWinterBoardReminder(true);
      }
    }, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      listeners.delete(setPending);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);

  return pending;
}
