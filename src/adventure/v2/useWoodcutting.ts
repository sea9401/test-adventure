"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WoodcuttingHandlers,
  WoodcuttingLogView,
  WoodcuttingOutcome,
  WoodcuttingStart,
  WoodcuttingTreeView,
} from "./WoodcuttingView";
import type { WoodcuttingSpotId } from "@/adventure/data/v2/woodcuttingSpots";
import { useActivityVerification } from "./useActivityVerification";
import type {
  AutoGatheringResultView,
  AutoGatheringSessionView,
} from "./AutoGatheringCard";
import type { AutoGatheringActivity } from "./autoGathering";
import { useGameState } from "./GameStateProvider";

function parseAutoActivity(value: unknown): AutoGatheringActivity | null {
  return value === "woodcutting" || value === "mining" ? value : null;
}

function parseLog(value: unknown): WoodcuttingLogView {
  const item = (value ?? {}) as Record<string, unknown>;
  const cuts = Math.max(0, Math.floor(Number(item.cuts) || 0));
  const storedXp = Number(item.xp);
  return {
    cuts,
    xp:
      Object.prototype.hasOwnProperty.call(item, "xp") && Number.isFinite(storedXp)
        ? Math.max(0, Math.floor(storedXp))
        : cuts * 10,
    timberEarned: Math.max(0, Math.floor(Number(item.timberEarned) || 0)),
  };
}

function parseTree(value: unknown): WoodcuttingTreeView {
  const item = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? "나무"),
    materialId: String(item.materialId ?? "v2_timber"),
    xp: Math.max(0, Math.floor(Number(item.xp) || 10)),
  };
}

function parseMaterials(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([id, count]) => [
      id,
      Math.max(0, Math.floor(Number(count) || 0)),
    ]),
  );
}

function parseNextActionAt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function parseAutoSession(value: unknown): AutoGatheringSessionView | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.sessionId !== "string" || typeof item.sourceId !== "string") return null;
  const readyAt = Number(item.readyAt);
  const startedAt = Number(item.startedAt);
  if (!Number.isFinite(readyAt) || !Number.isFinite(startedAt)) return null;
  return {
    sessionId: item.sessionId,
    sourceId: item.sourceId,
    sourceName: String(item.sourceName ?? "나무"),
    materialId: String(item.materialId ?? ""),
    startedAt: Math.floor(startedAt),
    readyAt: Math.floor(readyAt),
    attempts: Math.max(1, Math.floor(Number(item.attempts) || 1)),
  };
}

function parseAutoResult(value: unknown): AutoGatheringResultView {
  const item = (value ?? {}) as Record<string, unknown>;
  return {
    attempts: Math.max(0, Math.floor(Number(item.attempts) || 0)),
    successes: Math.max(0, Math.floor(Number(item.successes) || 0)),
    materialName: String(item.materialName ?? "원목"),
    materialsGained: Math.max(0, Math.floor(Number(item.materialsGained) || 0)),
    xpGained: Math.max(0, Math.floor(Number(item.xpGained) || 0)),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useWoodcutting(): WoodcuttingHandlers {
  const { setAutoGathering } = useGameState();
  const { verification, verifyHuman, readJson } = useActivityVerification("woodcutting");
  const [materials, setMaterials] = useState<Record<string, number>>({});
  const [log, setLog] = useState<WoodcuttingLogView>({ cuts: 0, xp: 0, timberEarned: 0 });
  const [durationReductionPct, setDurationReductionPct] = useState(0);
  const [autoSession, setAutoSession] = useState<AutoGatheringSessionView | null>(null);
  const [autoResult, setAutoResult] = useState<AutoGatheringResultView | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [activeAutoActivity, setActiveAutoActivity] =
    useState<AutoGatheringActivity | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/v2/woodcutting/status");
        if (!response.ok) return;
        const json = await response.json();
        if (!alive || !json?.ok) return;
        setMaterials(parseMaterials(json.materials));
        setLog(parseLog(json.log));
        setDurationReductionPct(
          Math.min(50, Math.max(0, Number(json.durationReductionPct) || 0)),
        );
        setAutoSession(parseAutoSession(json.autoSession));
        setActiveAutoActivity(parseAutoActivity(json.activeAutoActivity));
      } catch {
        // 표시용 상태라 실패해도 화면 진입은 유지한다.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(async (spotId: WoodcuttingSpotId): Promise<WoodcuttingStart> => {
    const response = await fetch("/api/v2/woodcutting/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spotId }),
    });
    const json = await readJson(response);
    if (!response.ok) {
      const active = parseAutoActivity(json?.activeAutoActivity);
      if (active) setActiveAutoActivity(active);
      throw new Error("woodcutting_start_failed");
    }
    const durationMs = Math.max(1, Math.floor(Number(json?.durationMs) || 0));
    const chops = Math.max(1, Math.floor(Number(json?.chops) || 0));
    if (!json?.ok || typeof json.sessionId !== "string" || !durationMs || !chops) {
      throw new Error("woodcutting_start_failed");
    }
    setMaterials(parseMaterials(json.materials));
    setLog(parseLog(json.log));
    setDurationReductionPct(
      Math.min(50, Math.max(0, Number(json.durationReductionPct) || 0)),
    );
    return {
      sessionId: json.sessionId,
      spotId,
      tree: parseTree(json.tree),
      durationMs,
      chops,
      failureRate: Math.min(1, Math.max(0, Number(json.failureRate) || 0)),
    };
  }, [readJson]);

  const finish = useCallback(async (sessionId: string): Promise<WoodcuttingOutcome> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("/api/v2/woodcutting/chop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await readJson(response);
      if (!response.ok) {
        const active = parseAutoActivity(json?.activeAutoActivity);
        if (active) setActiveAutoActivity(active);
        throw new Error("woodcutting_finish_failed");
      }
      if (!json?.ok) throw new Error("woodcutting_finish_failed");
      if (!json.success && json.reason === "not_ready" && attempt === 0) {
        await wait(Math.max(25, Math.floor(Number(json.retryAfterMs) || 0) + 25));
        continue;
      }
      if (!json.success) {
        return {
          success: false,
          reason: typeof json.reason === "string" ? json.reason : "unknown",
          nextActionAt: parseNextActionAt(json.nextActionAt),
        };
      }
      const nextMaterials = parseMaterials(json.materials);
      const nextLog = parseLog(json.log);
      const seedDrop =
        json.seedDrop &&
        typeof json.seedDrop === "object" &&
        typeof json.seedDrop.cropId === "string" &&
        typeof json.seedDrop.seedName === "string"
          ? {
              cropId: json.seedDrop.cropId,
              seedName: json.seedDrop.seedName,
              quantity: Math.max(
                1,
                Math.floor(Number(json.seedDrop.quantity) || 1),
              ),
            }
          : null;
      setMaterials(nextMaterials);
      setLog(nextLog);
      return {
        success: true,
        tree: parseTree(json.tree),
        materialName: String(json.materialName ?? "원목"),
        materialGained: Math.max(0, Math.floor(Number(json.materialGained) || 0)),
        bonusMaterialGained: Math.max(
          0,
          Math.floor(Number(json.bonusMaterialGained) || 0),
        ),
        nextActionAt: parseNextActionAt(json.nextActionAt),
        recovered: json.recovered === true,
        xpGained: Math.max(0, Math.floor(Number(json.xpGained) || 0)),
        jobName: typeof json.jobName === "string" ? json.jobName : null,
        masteryGained: Math.max(0, Math.floor(Number(json.masteryGained) || 0)),
        masteryAfter:
          json.masteryAfter == null
            ? null
            : Math.max(0, Math.floor(Number(json.masteryAfter) || 0)),
        seedDrop,
        log: nextLog,
      };
    }
    throw new Error("woodcutting_finish_failed");
  }, [readJson]);

  const startAuto = useCallback(async (spotId: WoodcuttingSpotId): Promise<void> => {
    setAutoLoading(true);
    try {
      const response = await fetch("/api/v2/woodcutting/auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", spotId }),
      });
      const json = await readJson(response);
      if (!response.ok || !json?.ok) {
        const active = parseAutoActivity(json?.activeAutoActivity);
        if (active) setActiveAutoActivity(active);
        throw new Error("woodcutting_auto_start_failed");
      }
      const session = parseAutoSession(json.autoSession);
      setAutoSession(session);
      setActiveAutoActivity("woodcutting");
      setAutoResult(null);
      setAutoGathering(
        session
          ? {
              activity: "woodcutting",
              sourceName: session.sourceName,
              readyAt: session.readyAt,
            }
          : null,
      );
    } finally {
      setAutoLoading(false);
    }
  }, [readJson, setAutoGathering]);

  const claimAuto = useCallback(async (): Promise<void> => {
    setAutoLoading(true);
    try {
      const response = await fetch("/api/v2/woodcutting/auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      const json = await readJson(response);
      if (!response.ok || !json?.ok) throw new Error("woodcutting_auto_claim_failed");
      setMaterials(parseMaterials(json.materials));
      setLog(parseLog(json.log));
      setAutoSession(null);
      setActiveAutoActivity(parseAutoActivity(json.activeAutoActivity));
      setAutoResult(parseAutoResult(json));
      setAutoGathering(null);
    } finally {
      setAutoLoading(false);
    }
  }, [readJson, setAutoGathering]);

  const cancelAuto = useCallback(async (): Promise<void> => {
    setAutoLoading(true);
    try {
      const response = await fetch("/api/v2/woodcutting/auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const json = await readJson(response);
      if (!response.ok || !json?.ok) throw new Error("woodcutting_auto_cancel_failed");
      setMaterials(parseMaterials(json.materials));
      setLog(parseLog(json.log));
      setAutoSession(null);
      setActiveAutoActivity(parseAutoActivity(json.activeAutoActivity));
      setAutoResult(parseAutoResult(json));
      setAutoGathering(null);
    } finally {
      setAutoLoading(false);
    }
  }, [readJson, setAutoGathering]);

  return {
    start,
    finish,
    materials,
    log,
    durationReductionPct,
    autoSession,
    autoResult,
    autoLoading,
    activeAutoActivity,
    startAuto,
    claimAuto,
    cancelAuto,
    verification,
    verifyHuman,
  };
}
