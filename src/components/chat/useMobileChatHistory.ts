"use client";

import { useCallback, useEffect, useRef } from "react";

export const CHAT_CLOSE_REQUEST_EVENT = "chat:request-close";
export const MOBILE_CHAT_HISTORY_STATE_KEY = "__adventureMobileChat";

type MobileChatHistoryLayer = "rooms" | "detail";

export type MobileChatHistoryMarker = {
  sessionId: string;
  layer: MobileChatHistoryLayer;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readMobileChatHistoryMarker(
  state: unknown,
): MobileChatHistoryMarker | null {
  if (!isRecord(state)) return null;
  const marker = state[MOBILE_CHAT_HISTORY_STATE_KEY];
  if (!isRecord(marker)) return null;
  if (typeof marker.sessionId !== "string") return null;
  if (marker.layer !== "rooms" && marker.layer !== "detail") return null;
  return {
    sessionId: marker.sessionId,
    layer: marker.layer,
  };
}

export function withMobileChatHistoryMarker(
  state: unknown,
  marker: MobileChatHistoryMarker,
) {
  return {
    ...(isRecord(state) ? state : {}),
    [MOBILE_CHAT_HISTORY_STATE_KEY]: marker,
  };
}

export function resolveMobileChatPopState(
  state: unknown,
  sessionId: string,
): MobileChatHistoryLayer | "close" {
  const marker = readMobileChatHistoryMarker(state);
  return marker?.sessionId === sessionId ? marker.layer : "close";
}

function isMobileViewport() {
  if (typeof window.matchMedia === "function") {
    return !window.matchMedia("(min-width: 640px)").matches;
  }
  return window.innerWidth < 640;
}

function createSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function useMobileChatHistory({
  open,
  detailOpen,
  onReturnToRooms,
  onClose,
}: {
  open: boolean;
  detailOpen: boolean;
  onReturnToRooms: () => void;
  onClose: () => void;
}) {
  const sessionIdRef = useRef<string | null>(null);
  const historyDepthRef = useRef(0);
  const detailOpenRef = useRef(detailOpen);
  const onReturnToRoomsRef = useRef(onReturnToRooms);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    detailOpenRef.current = detailOpen;
    onReturnToRoomsRef.current = onReturnToRooms;
    onCloseRef.current = onClose;
  }, [detailOpen, onClose, onReturnToRooms]);

  const pushLayer = useCallback((layer: MobileChatHistoryLayer) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !isMobileViewport()) return false;

    const currentMarker = readMobileChatHistoryMarker(window.history.state);
    if (
      currentMarker?.sessionId === sessionId &&
      currentMarker.layer === layer
    ) {
      return true;
    }

    window.history.pushState(
      withMobileChatHistoryMarker(window.history.state, {
        sessionId,
        layer,
      }),
      "",
      window.location.href,
    );
    historyDepthRef.current = layer === "rooms" ? 1 : 2;
    return true;
  }, []);

  const enterDetail = useCallback(() => {
    pushLayer("detail");
  }, [pushLayer]);

  const backToRooms = useCallback(() => {
    const sessionId = sessionIdRef.current;
    const marker = readMobileChatHistoryMarker(window.history.state);
    if (
      sessionId &&
      marker?.sessionId === sessionId &&
      marker.layer === "detail"
    ) {
      window.history.back();
      return;
    }
    onReturnToRoomsRef.current();
  }, []);

  const closeChat = useCallback(() => {
    const sessionId = sessionIdRef.current;
    const marker = readMobileChatHistoryMarker(window.history.state);
    const historyDepth = historyDepthRef.current;

    // 닫기 버튼으로 종료할 때 채팅이 추가한 기록만 함께 걷어낸다. 현재 기록이
    // 다른 페이지로 바뀌었다면 실제 페이지 기록을 건드리지 않는다.
    if (
      sessionId &&
      marker?.sessionId === sessionId &&
      historyDepth > 0
    ) {
      window.history.go(-historyDepth);
    }
    sessionIdRef.current = null;
    historyDepthRef.current = 0;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) {
      sessionIdRef.current = null;
      historyDepthRef.current = 0;
      return;
    }

    const handleCloseRequest = () => closeChat();
    window.addEventListener(CHAT_CLOSE_REQUEST_EVENT, handleCloseRequest);

    if (!isMobileViewport()) {
      return () => {
        window.removeEventListener(CHAT_CLOSE_REQUEST_EVENT, handleCloseRequest);
      };
    }

    // Strict Mode의 effect 재실행에서도 동일 세션을 재사용해 기록이 중복되지 않게 한다.
    if (!sessionIdRef.current) {
      sessionIdRef.current = createSessionId();
      pushLayer("rooms");
      if (detailOpenRef.current) pushLayer("detail");
    }

    const handlePopState = (event: PopStateEvent) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const nextLayer = resolveMobileChatPopState(event.state, sessionId);

      if (nextLayer === "rooms") {
        historyDepthRef.current = 1;
        onReturnToRoomsRef.current();
        return;
      }

      if (nextLayer === "detail") {
        historyDepthRef.current = 2;
        return;
      }

      // 채팅 목록 기록에서도 한 단계 더 뒤로 갔으므로 패널을 닫는다.
      sessionIdRef.current = null;
      historyDepthRef.current = 0;
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener(CHAT_CLOSE_REQUEST_EVENT, handleCloseRequest);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [closeChat, open, pushLayer]);

  // 외부 이벤트로 곧바로 복권방 등에 진입한 경우에도 방 상세 기록을 보장한다.
  useEffect(() => {
    if (open && detailOpen) enterDetail();
  }, [detailOpen, enterDetail, open]);

  return {
    enterDetail,
    backToRooms,
    closeChat,
  };
}
