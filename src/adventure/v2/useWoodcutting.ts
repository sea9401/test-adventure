"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WoodcuttingHandlers,
  WoodcuttingLogView,
  WoodcuttingOutcome,
  WoodcuttingStart,
} from "./WoodcuttingView";

function parseLog(value: unknown): WoodcuttingLogView {
  const v = (value ?? {}) as {
    cuts?: unknown;
    perfectCuts?: unknown;
    timberEarned?: unknown;
    bestReactionMs?: unknown;
  };
  const best = Number(v.bestReactionMs);
  return {
    cuts: Math.max(0, Math.floor(Number(v.cuts) || 0)),
    perfectCuts: Math.max(0, Math.floor(Number(v.perfectCuts) || 0)),
    timberEarned: Math.max(0, Math.floor(Number(v.timberEarned) || 0)),
    bestReactionMs: Number.isFinite(best) && best > 0 ? Math.floor(best) : null,
  };
}

export function useWoodcutting(): WoodcuttingHandlers {
  const [timber, setTimber] = useState(0);
  const [log, setLog] = useState<WoodcuttingLogView>({
    cuts: 0,
    perfectCuts: 0,
    timberEarned: 0,
    bestReactionMs: null,
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/v2/woodcutting/status");
        if (!res.ok) return;
        const j = await res.json();
        if (!alive || !j?.ok) return;
        setTimber(Math.max(0, Math.floor(Number(j.timber) || 0)));
        setLog(parseLog(j.log));
      } catch {
        // 표시용 상태라 실패해도 화면 진입은 유지한다.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(async (): Promise<WoodcuttingStart> => {
    const res = await fetch("/api/v2/woodcutting/start", { method: "POST" });
    if (!res.ok) throw new Error("woodcutting_start_failed");
    const j = await res.json();
    if (
      !j?.ok ||
      typeof j.sessionId !== "string" ||
      typeof j.readyDelayMs !== "number"
    ) {
      throw new Error("woodcutting_start_failed");
    }
    setTimber(Math.max(0, Math.floor(Number(j.timber) || 0)));
    setLog(parseLog(j.log));
    return { sessionId: j.sessionId, readyDelayMs: j.readyDelayMs };
  }, []);

  const chop = useCallback(
    async (sessionId: string, reactionMs: number): Promise<WoodcuttingOutcome> => {
      const res = await fetch("/api/v2/woodcutting/chop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, reactionMs }),
      });
      if (!res.ok) throw new Error("woodcutting_chop_failed");
      const j = await res.json();
      if (!j?.ok) throw new Error("woodcutting_chop_failed");
      if (!j.success) {
        return {
          success: false,
          reason: typeof j.reason === "string" ? j.reason : "unknown",
        };
      }
      const nextLog = parseLog(j.log);
      const nextTimber = Math.max(0, Math.floor(Number(j.timber) || 0));
      setTimber(nextTimber);
      setLog(nextLog);
      return {
        success: true,
        tree: {
          id: String(j.tree?.id ?? ""),
          name: String(j.tree?.name ?? "나무"),
          tier: String(j.tree?.tier ?? "softwood"),
        },
        grade: j.grade === "perfect" || j.grade === "good" ? j.grade : "clean",
        timberGained: Math.max(0, Math.floor(Number(j.timberGained) || 0)),
        timber: nextTimber,
        log: nextLog,
      };
    },
    [],
  );

  return { start, chop, timber, log };
}
