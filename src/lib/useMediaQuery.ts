"use client";

import { useSyncExternalStore } from "react";

// CSS 미디어 쿼리 일치 여부. 서버 렌더와 matchMedia가 없는 환경에서는 false(휴대폰 배치)로 시작한다.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}
