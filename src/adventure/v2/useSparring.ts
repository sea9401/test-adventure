"use client";

import { useCallback, useRef, useState } from "react";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";

// 훈련장 허수아비 모의전 hook — /api/v2/training/spar 호출.
// 사냥(useDungeonHunt)과 달리 스태미너/보상 없음. 결과의 replay 를 ReplayBattleScene 에 넘긴다.
export type SparResult = {
  won: boolean;
  turns: number;
  enemyName: string;
  replay?: ReplayPayload;
  startPlayerHp?: number;
};

type SparResponse = {
  ok?: boolean;
  error?: string;
  result?: SparResult;
};

export function useSparring() {
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<SparResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 동시 제출 가드 — setBusy 는 async 라 빠른 더블클릭이 둘 다 통과할 수 있다(useDungeonHunt
  // 와 달리 stamina 서버 가드가 없으므로 ref 로 직접 막는다).
  const inFlight = useRef(false);

  const spar = useCallback(async (): Promise<SparResult | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setLastResult(null); // 로딩 중 이전 리플레이가 남지 않게.
    try {
      const res = await fetch("/api/v2/training/spar", { method: "POST" });
      const json = (await res.json().catch(() => null)) as SparResponse | null;
      if (!json?.ok || !json.result) {
        setError(json?.error ?? `http ${res.status}`);
        return null;
      }
      setLastResult(json.result);
      return json.result;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, []);

  return { busy, lastResult, error, spar };
}
