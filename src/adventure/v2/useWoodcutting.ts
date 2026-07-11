"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WoodcuttingBackCut,
  WoodcuttingChallengeView,
  WoodcuttingHandlers,
  WoodcuttingJudgmentView,
  WoodcuttingLane,
  WoodcuttingLogView,
  WoodcuttingOutcome,
  WoodcuttingStart,
  WoodcuttingTreeView,
} from "./WoodcuttingView";

function parseLog(value: unknown): WoodcuttingLogView {
  const item = (value ?? {}) as Record<string, unknown>;
  const best = Number(item.bestReactionMs);
  return {
    cuts: Math.max(0, Math.floor(Number(item.cuts) || 0)),
    perfectCuts: Math.max(0, Math.floor(Number(item.perfectCuts) || 0)),
    timberEarned: Math.max(0, Math.floor(Number(item.timberEarned) || 0)),
    bestReactionMs: Number.isFinite(best) && best > 0 ? Math.floor(best) : null,
    bestCombo: Math.max(0, Math.floor(Number(item.bestCombo) || 0)),
  };
}

function isLane(value: unknown): value is WoodcuttingLane {
  return typeof value === "number" && [-2, -1, 0, 1, 2].includes(value);
}

function isBackCut(value: unknown): value is WoodcuttingBackCut {
  return value === "low" || value === "level" || value === "high";
}

function parseTree(value: unknown): WoodcuttingTreeView {
  const item = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? "나무"),
    tier: String(item.tier ?? "softwood"),
  };
}

function parseChallenge(value: unknown): WoodcuttingChallengeView | null {
  const item = (value ?? {}) as Record<string, unknown>;
  if (
    !isLane(item.wind) ||
    Math.abs(item.wind) > 1 ||
    !isLane(item.safeLane) ||
    !isBackCut(item.idealBackCut)
  ) {
    return null;
  }
  return {
    wind: item.wind as -1 | 0 | 1,
    safeLane: item.safeLane,
    idealBackCut: item.idealBackCut,
  };
}

function parseJudgment(value: unknown): WoodcuttingJudgmentView | null {
  const item = (value ?? {}) as Record<string, unknown>;
  const challenge = parseChallenge(item);
  if (
    !challenge ||
    !isLane(item.selectedLane) ||
    !isBackCut(item.backCut) ||
    !isLane(item.landingLane) ||
    (item.grade !== null &&
      item.grade !== "perfect" &&
      item.grade !== "good" &&
      item.grade !== "clean") ||
    (item.reason !== "ok" && item.reason !== "unsafe_fall")
  ) {
    return null;
  }
  return {
    ...challenge,
    selectedLane: item.selectedLane,
    backCut: item.backCut,
    landingLane: item.landingLane,
    directionError: Math.max(0, Math.floor(Number(item.directionError) || 0)),
    backCutError: Math.max(0, Math.floor(Number(item.backCutError) || 0)),
    score: Math.max(0, Math.floor(Number(item.score) || 0)),
    grade: item.grade,
    reason: item.reason,
  };
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
        const response = await fetch("/api/v2/woodcutting/status");
        if (!response.ok) return;
        const json = await response.json();
        if (!alive || !json?.ok) return;
        setTimber(Math.max(0, Math.floor(Number(json.timber) || 0)));
        setLog(parseLog(json.log));
      } catch {
        // 표시용 상태라 실패해도 화면 진입은 유지한다.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(async (): Promise<WoodcuttingStart> => {
    const response = await fetch("/api/v2/woodcutting/start", { method: "POST" });
    if (!response.ok) throw new Error("woodcutting_start_failed");
    const json = await response.json();
    const challenge = parseChallenge(json?.challenge);
    if (!json?.ok || typeof json.sessionId !== "string" || !challenge) {
      throw new Error("woodcutting_start_failed");
    }
    setTimber(Math.max(0, Math.floor(Number(json.timber) || 0)));
    setLog(parseLog(json.log));
    return {
      sessionId: json.sessionId,
      tree: parseTree(json.tree),
      challenge,
    };
  }, []);

  const fell = useCallback(
    async (
      sessionId: string,
      selectedLane: WoodcuttingLane,
      backCut: WoodcuttingBackCut,
    ): Promise<WoodcuttingOutcome> => {
      const response = await fetch("/api/v2/woodcutting/chop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, selectedLane, backCut }),
      });
      if (!response.ok) throw new Error("woodcutting_fell_failed");
      const json = await response.json();
      if (!json?.ok) throw new Error("woodcutting_fell_failed");
      const judgment = parseJudgment(json.judgment);
      const nextLog = json.log ? parseLog(json.log) : log;
      setLog(nextLog);

      if (!json.success) {
        return {
          complete: true,
          success: false,
          reason: typeof json.reason === "string" ? json.reason : "unknown",
          tree: json.tree ? parseTree(json.tree) : null,
          judgment,
          log: nextLog,
        };
      }
      if (!judgment) throw new Error("woodcutting_fell_failed");
      const nextTimber = Math.max(0, Math.floor(Number(json.timber) || 0));
      setTimber(nextTimber);
      return {
        complete: true,
        success: true,
        tree: parseTree(json.tree),
        grade: json.grade === "perfect" || json.grade === "good" ? json.grade : "clean",
        timberGained: Math.max(0, Math.floor(Number(json.timberGained) || 0)),
        timber: nextTimber,
        judgment,
        log: nextLog,
      };
    },
    [log],
  );

  return { start, fell, timber, log };
}
