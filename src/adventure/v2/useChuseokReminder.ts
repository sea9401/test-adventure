"use client";

import { useEffect, useState } from "react";
import { chuseokPhase, type ChuseokState } from "@/adventure/data/v2/chuseokEvent";
import { kstDayKey } from "@/lib/kst";

const MAX_AGE_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
let cachedState: ChuseokState | null = null;
let lastFetchedAt = 0;
let revision = 0;
let pendingRequest: Promise<void> | null = null;
const listeners = new Set<(pending: boolean) => void>();

function isPending(): boolean {
  return cachedState?.phase === "active"
    && chuseokPhase(cachedState.window, Date.now()) === "active"
    && (cachedState.attendance.canClaim || cachedState.raid.attacksRemaining > 0);
}

function notify() {
  const pending = isPending();
  listeners.forEach((listener) => listener(pending));
}

export function setChuseokReminder(state: ChuseokState) {
  cachedState = state;
  lastFetchedAt = Date.now();
  revision += 1;
  notify();
}

async function refresh(): Promise<void> {
  // Expire the badge locally even if the request at event end fails.
  notify();
  if (cachedState && Date.now() - lastFetchedAt < MAX_AGE_MS
    && kstDayKey(new Date(lastFetchedAt)) === kstDayKey()
    && chuseokPhase(cachedState.window, Date.now()) === cachedState.phase) return;
  if (pendingRequest) return pendingRequest;
  const requestedRevision = revision;
  pendingRequest = (async () => {
    try {
      const response = await fetch("/api/v2/events/chuseok", { cache: "no-store" });
      const state = await response.json() as ChuseokState;
      if (response.ok && state?.ok && state.attendance && state.raid
        && requestedRevision === revision) setChuseokReminder(state);
    } catch {
      // Keep the last known state and retry while visible or on return.
    } finally {
      pendingRequest = null;
    }
  })();
  return pendingRequest;
}

/** 추석 출석 보상이나 복주머니 공격 기회가 남았는지 공유한다. */
export function useChuseokReminder(): boolean {
  const [pending, setPending] = useState(isPending);
  useEffect(() => {
    listeners.add(setPending);
    const check = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      listeners.delete(setPending);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return pending;
}
