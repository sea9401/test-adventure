"use client";

import { useEffect } from "react";

// 모달/오버레이 — Escape 키로 닫기. onClose 가 안정 참조가 아니면 매 렌더 재등록되니
// 호출 측에서 useCallback 으로 감싸거나 단순한 () => setOpen(false) 같은 식이면 OK.
export function useEscapeKey(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, onClose]);
}
