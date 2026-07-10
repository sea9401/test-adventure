"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WoodcuttingHandlers,
  WoodcuttingHitView,
  WoodcuttingLogView,
  WoodcuttingOutcome,
  WoodcuttingRoundView,
  WoodcuttingStart,
} from "./WoodcuttingView";

function parseLog(value: unknown): WoodcuttingLogView {
  const v = (value ?? {}) as {
    cuts?: unknown;
    perfectCuts?: unknown;
    timberEarned?: unknown;
    bestReactionMs?: unknown;
    bestCombo?: unknown;
  };
  const best = Number(v.bestReactionMs);
  return {
    cuts: Math.max(0, Math.floor(Number(v.cuts) || 0)),
    perfectCuts: Math.max(0, Math.floor(Number(v.perfectCuts) || 0)),
    timberEarned: Math.max(0, Math.floor(Number(v.timberEarned) || 0)),
    bestReactionMs: Number.isFinite(best) && best > 0 ? Math.floor(best) : null,
    bestCombo: Math.max(0, Math.floor(Number(v.bestCombo) || 0)),
  };
}

function parseRound(value: unknown): WoodcuttingRoundView {
  const v = (value ?? {}) as {
    index?: unknown;
    total?: unknown;
    weakSpot?: unknown;
    readyDelayMs?: unknown;
    windowMs?: unknown;
  };
  return {
    index: Math.max(1, Math.floor(Number(v.index) || 1)),
    total: Math.max(1, Math.floor(Number(v.total) || 3)),
    weakSpot:
      v.weakSpot === "root" ||
      v.weakSpot === "left" ||
      v.weakSpot === "center" ||
      v.weakSpot === "right"
        ? v.weakSpot
        : "center",
    readyDelayMs: Math.max(0, Math.floor(Number(v.readyDelayMs) || 0)),
    windowMs: Math.max(1, Math.floor(Number(v.windowMs) || 900)),
  };
}

function parseHit(value: unknown): WoodcuttingHitView | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const grade = String(v.grade);
  const reason = String(v.reason);
  const spot = String(v.spot);
  const weakSpot = String(v.weakSpot);
  if (!["perfect", "good", "clean", "miss"].includes(grade)) return null;
  if (!["ok", "expired", "too_early", "missed_window", "wrong_spot"].includes(reason)) {
    return null;
  }
  if (!["root", "left", "center", "right"].includes(spot)) return null;
  if (!["root", "left", "center", "right"].includes(weakSpot)) return null;
  return {
    round: Math.max(1, Math.floor(Number(v.round) || 1)),
    spot: spot as WoodcuttingHitView["spot"],
    weakSpot: weakSpot as WoodcuttingHitView["weakSpot"],
    reactionMs: Math.max(0, Math.floor(Number(v.reactionMs) || 0)),
    grade: grade as WoodcuttingHitView["grade"],
    score: Math.max(0, Math.floor(Number(v.score) || 0)),
    reason: reason as WoodcuttingHitView["reason"],
  };
}

function parseHits(value: unknown): WoodcuttingHitView[] {
  return Array.isArray(value)
    ? value.map(parseHit).filter((h): h is WoodcuttingHitView => h != null)
    : [];
}

export function useWoodcutting(): WoodcuttingHandlers {
  const [timber, setTimber] = useState(0);
  const [log, setLog] = useState<WoodcuttingLogView>({
    cuts: 0,
    perfectCuts: 0,
    timberEarned: 0,
    bestReactionMs: null,
    bestCombo: 0,
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
    if (!j?.ok || typeof j.sessionId !== "string" || !j.round) {
      throw new Error("woodcutting_start_failed");
    }
    setTimber(Math.max(0, Math.floor(Number(j.timber) || 0)));
    setLog(parseLog(j.log));
    return {
      sessionId: j.sessionId,
      tree: {
        id: String(j.tree?.id ?? ""),
        name: String(j.tree?.name ?? "나무"),
        tier: String(j.tree?.tier ?? "softwood"),
      },
      round: parseRound(j.round),
    };
  }, []);

  const chop = useCallback(
    async (
      sessionId: string,
      spot: WoodcuttingHitView["spot"],
      reactionMs: number,
    ): Promise<WoodcuttingOutcome> => {
      const res = await fetch("/api/v2/woodcutting/chop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, spot, reactionMs }),
      });
      if (!res.ok) throw new Error("woodcutting_chop_failed");
      const j = await res.json();
      if (!j?.ok) throw new Error("woodcutting_chop_failed");
      const hit = parseHit(j.hit);
      if (!j.complete) {
        if (!hit || !j.round) throw new Error("woodcutting_chop_failed");
        return {
          complete: false,
          hit,
          combo: Math.max(0, Math.floor(Number(j.combo) || 0)),
          bestCombo: Math.max(0, Math.floor(Number(j.bestCombo) || 0)),
          round: parseRound(j.round),
        };
      }
      if (!j.success) {
        const nextLog = j.log ? parseLog(j.log) : log;
        setLog(nextLog);
        return {
          complete: true,
          success: false,
          reason: typeof j.reason === "string" ? j.reason : "unknown",
          tree: j.tree
            ? {
                id: String(j.tree?.id ?? ""),
                name: String(j.tree?.name ?? "나무"),
                tier: String(j.tree?.tier ?? "softwood"),
              }
            : null,
          hit,
          hits: parseHits(j.hits),
          score: Math.max(0, Math.floor(Number(j.score) || 0)),
          combo: Math.max(0, Math.floor(Number(j.combo) || 0)),
          bestCombo: Math.max(0, Math.floor(Number(j.bestCombo) || 0)),
          log: nextLog,
        };
      }
      const nextLog = parseLog(j.log);
      const nextTimber = Math.max(0, Math.floor(Number(j.timber) || 0));
      setTimber(nextTimber);
      setLog(nextLog);
      return {
        complete: true,
        success: true,
        tree: {
          id: String(j.tree?.id ?? ""),
          name: String(j.tree?.name ?? "나무"),
          tier: String(j.tree?.tier ?? "softwood"),
        },
        grade: j.grade === "perfect" || j.grade === "good" ? j.grade : "clean",
        timberGained: Math.max(0, Math.floor(Number(j.timberGained) || 0)),
        timber: nextTimber,
        hit,
        hits: parseHits(j.hits),
        score: Math.max(0, Math.floor(Number(j.score) || 0)),
        combo: Math.max(0, Math.floor(Number(j.combo) || 0)),
        bestCombo: Math.max(0, Math.floor(Number(j.bestCombo) || 0)),
        log: nextLog,
      };
    },
    [log],
  );

  return { start, chop, timber, log };
}
