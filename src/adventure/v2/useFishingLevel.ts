"use client";

import { useEffect, useState } from "react";

// 낚시 레벨만 읽는다. 의뢰·주간 순위·명예의 전당처럼 낚시 진행도를 따로 받지 않는 화면의
//   메뉴 잠금 표시용. 낚시 화면 사이를 오가도 1분 안에는 다시 묻지 않는다.
const CACHE_MS = 60_000;
let cached: { level: number; at: number } | null = null;

export function useFishingLevel(enabled: boolean): number | null {
  const [level, setLevel] = useState<number | null>(() => cached?.level ?? null);

  useEffect(() => {
    if (!enabled) return;
    if (cached && Date.now() - cached.at < CACHE_MS) return;
    let alive = true;
    fetch("/api/v2/fishing/progression")
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { progression?: { level?: unknown } } | null) => {
        const next = json?.progression?.level;
        if (typeof next !== "number" || !Number.isFinite(next)) return;
        cached = { level: next, at: Date.now() };
        if (alive) setLevel(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled]);

  return enabled ? level : null;
}
