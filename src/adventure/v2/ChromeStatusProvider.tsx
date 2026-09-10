"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { NOTIF_POLL_MS } from "@/lib/v2-notification-config";
import {
  startAdaptiveVisiblePolling,
  type AdaptivePollOutcome,
} from "@/lib/adaptiveVisiblePolling";

type ChromeStatusContextValue = {
  notificationUnread: number;
  mailUnread: number;
  hasUnreadNotice: boolean;
  setNotificationUnread: Dispatch<SetStateAction<number>>;
  setMailUnread: Dispatch<SetStateAction<number>>;
};

type ChromeStatusResponse = {
  ok?: boolean;
  notificationUnread?: number;
  mailUnread?: number;
  hasUnreadNotice?: boolean;
};

const ChromeStatusContext = createContext<ChromeStatusContextValue | null>(
  null,
);

export function useChromeStatus() {
  return useContext(ChromeStatusContext);
}

export function ChromeStatusProvider({ children }: { children: ReactNode }) {
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [mailUnread, setMailUnread] = useState(0);
  const [hasUnreadNotice, setHasUnreadNotice] = useState(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(false);
  const snapshotRef = useRef<string | null>(null);

  const refresh = useCallback(async (): Promise<AdaptivePollOutcome> => {
    if (runningRef.current) return "failed";
    runningRef.current = true;
    try {
      const response = await fetch("/api/v2/chrome-status", {
        cache: "no-store",
      });
      if (!response.ok) return "failed";
      const result = (await response.json()) as ChromeStatusResponse;
      if (!result.ok || !mountedRef.current) return "failed";
      const notificationCount = result.notificationUnread ?? 0;
      const mailCount = result.mailUnread ?? 0;
      const unreadNotice = result.hasUnreadNotice === true;
      const snapshot = JSON.stringify([
        notificationCount,
        mailCount,
        unreadNotice,
      ]);
      const outcome = snapshot === snapshotRef.current ? "unchanged" : "changed";
      snapshotRef.current = snapshot;
      setNotificationUnread(notificationCount);
      setMailUnread(mailCount);
      setHasUnreadNotice(unreadNotice);
      return outcome;
    } catch {
      // 마지막 성공 상태를 유지하고 다음 폴링 또는 refresh 이벤트에서 회복한다.
      return "failed";
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const startPolling = () =>
      startAdaptiveVisiblePolling({
        task: refresh,
        delayMs: (idle) => (idle >= 2 ? NOTIF_POLL_MS * 2 : NOTIF_POLL_MS),
      });
    let stopPolling = startPolling();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      // 사용자 행동 후에는 이전 예약을 취소하고 기본 간격부터 다시 시작한다.
      stopPolling();
      stopPolling = startPolling();
    };
    window.addEventListener("v2notif:read", tick);
    window.addEventListener("v2inbox:refresh", tick);
    window.addEventListener("bulletin:read", tick);
    return () => {
      mountedRef.current = false;
      stopPolling();
      window.removeEventListener("v2notif:read", tick);
      window.removeEventListener("v2inbox:refresh", tick);
      window.removeEventListener("bulletin:read", tick);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      notificationUnread,
      mailUnread,
      hasUnreadNotice,
      setNotificationUnread,
      setMailUnread,
    }),
    [hasUnreadNotice, mailUnread, notificationUnread],
  );

  return (
    <ChromeStatusContext.Provider value={value}>
      {children}
    </ChromeStatusContext.Provider>
  );
}
