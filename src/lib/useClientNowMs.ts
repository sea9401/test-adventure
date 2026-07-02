"use client";

import { useEffect, useState } from "react";

// SSR 하이드레이션 안전 "현재 시각" — 마운트 전엔 null(서버/클라 첫 렌더 일치),
// 마운트 후 refreshMs 간격으로 갱신. TileMap·OutpostView 의 로컬 구현을 단일화(2026-07).
export function useClientNowMs(refreshMs = 30_000): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);
  return nowMs;
}
