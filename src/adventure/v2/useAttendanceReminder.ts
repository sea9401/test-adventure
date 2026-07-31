"use client";

import { useEffect, useState } from "react";

const ATTENDANCE_STATUS_MAX_AGE_MS = 5 * 60 * 1000;
const DAY_CHANGE_CHECK_MS = 60 * 1000;

let cachedCanClaim: boolean | null = null;
let lastFetchedAt = 0;
let pendingRequest: Promise<void> | null = null;
const listeners = new Set<(canClaim: boolean) => void>();

function kstDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function setAttendanceReminder(canClaim: boolean) {
  cachedCanClaim = canClaim;
  lastFetchedAt = Date.now();
  listeners.forEach((listener) => listener(canClaim));
}

async function refreshAttendanceReminder(force = false): Promise<void> {
  if (
    !force &&
    cachedCanClaim !== null &&
    Date.now() - lastFetchedAt < ATTENDANCE_STATUS_MAX_AGE_MS
  ) {
    return;
  }
  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    try {
      const response = await fetch("/api/v2/me/attendance", {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        canClaim?: boolean;
      } | null;
      if (response.ok && data?.ok && typeof data.canClaim === "boolean") {
        setAttendanceReminder(data.canClaim);
      }
    } catch {
      // 일시적인 네트워크 오류는 다음 포커스 또는 주기 갱신에서 다시 확인한다.
    } finally {
      pendingRequest = null;
    }
  })();

  return pendingRequest;
}

/** 오늘 아직 받을 수 있는 출석 보상이 있으면 true를 반환한다. */
export function useAttendanceReminder(): boolean {
  const [canClaim, setCanClaim] = useState(cachedCanClaim ?? false);

  useEffect(() => {
    listeners.add(setCanClaim);
    void refreshAttendanceReminder();

    let observedDayKey = kstDayKey();
    const checkDayChange = () => {
      const nextDayKey = kstDayKey();
      if (nextDayKey === observedDayKey) return;
      observedDayKey = nextDayKey;
      void refreshAttendanceReminder(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      checkDayChange();
      void refreshAttendanceReminder();
    };

    const intervalId = window.setInterval(checkDayChange, DAY_CHANGE_CHECK_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      listeners.delete(setCanClaim);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return canClaim;
}
