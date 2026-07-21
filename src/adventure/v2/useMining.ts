"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  MiningHandlers,
  MiningLogView,
  MiningNodeView,
  MiningOutcome,
  MiningStart,
} from "./MiningView";
import type { MiningSpotId } from "@/adventure/data/v2/miningSpots";
import { useActivityVerification } from "./useActivityVerification";
import type {
  AutoGatheringResultView,
  AutoGatheringSessionView,
} from "./AutoGatheringCard";
import type { AutoGatheringActivity } from "./autoGathering";

function parseAutoActivity(value: unknown): AutoGatheringActivity | null {
  return value === "woodcutting" || value === "mining" ? value : null;
}

function parseLog(value: unknown): MiningLogView {
  const item = (value ?? {}) as Record<string, unknown>;
  const successes = Math.max(0, Math.floor(Number(item.successes) || 0));
  const storedXp = Number(item.xp);
  return {
    successes,
    xp:
      Object.prototype.hasOwnProperty.call(item, "xp") && Number.isFinite(storedXp)
        ? Math.max(0, Math.floor(storedXp))
        : successes * 10,
    oreEarned: Math.max(0, Math.floor(Number(item.oreEarned) || 0)),
    byproductsEarned: Math.max(
      0,
      Math.floor(Number(item.byproductsEarned) || 0),
    ),
  };
}

function parseNode(value: unknown): MiningNodeView {
  const item = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(item.id ?? ""),
    name: String(item.name ?? "광맥"),
    materialId: String(item.materialId ?? "v2_iron_ore"),
    xp: Math.max(0, Math.floor(Number(item.xp) || 5)),
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
    sourceName: String(item.sourceName ?? "광맥"),
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
    materialName: String(item.materialName ?? "광석"),
    materialsGained: Math.max(0, Math.floor(Number(item.materialsGained) || 0)),
    xpGained: Math.max(0, Math.floor(Number(item.xpGained) || 0)),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useMining(): MiningHandlers {
  const { verification, verifyHuman, readJson } = useActivityVerification("mining");
  const [materials, setMaterials] = useState<Record<string, number>>({});
  const [log, setLog] = useState<MiningLogView>({
    successes: 0,
    xp: 0,
    oreEarned: 0,
    byproductsEarned: 0,
  });
  const [autoSession, setAutoSession] = useState<AutoGatheringSessionView | null>(null);
  const [autoResult, setAutoResult] = useState<AutoGatheringResultView | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [activeAutoActivity, setActiveAutoActivity] =
    useState<AutoGatheringActivity | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch("/api/v2/mining/status");
        if (!response.ok) return;
        const json = await response.json();
        if (!alive || !json?.ok) return;
        setMaterials(parseMaterials(json.materials));
        setLog(parseLog(json.log));
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

  const start = useCallback(
    async (spotId: MiningSpotId): Promise<MiningStart> => {
      const response = await fetch("/api/v2/mining/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spotId }),
      });
      const json = await readJson(response);
      if (!response.ok) {
        const active = parseAutoActivity(json?.activeAutoActivity);
        if (active) setActiveAutoActivity(active);
        throw new Error("mining_start_failed");
      }
      const durationMs = Math.max(1, Math.floor(Number(json?.durationMs) || 0));
      const strikes = Math.max(1, Math.floor(Number(json?.strikes) || 0));
      if (!json?.ok || typeof json.sessionId !== "string" || !durationMs || !strikes) {
        throw new Error("mining_start_failed");
      }
      setMaterials(parseMaterials(json.materials));
      setLog(parseLog(json.log));
      return {
        sessionId: json.sessionId,
        spotId,
        node: parseNode(json.node),
        durationMs,
        strikes,
        failureRate: Math.min(1, Math.max(0, Number(json.failureRate) || 0)),
      };
    },
    [readJson],
  );

  const finish = useCallback(
    async (sessionId: string): Promise<MiningOutcome> => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch("/api/v2/mining/strike", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const json = await readJson(response);
        if (!response.ok || !json?.ok) {
          const active = parseAutoActivity(json?.activeAutoActivity);
          if (active) setActiveAutoActivity(active);
          throw new Error("mining_finish_failed");
        }
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
        setMaterials(nextMaterials);
        setLog(nextLog);
        return {
          success: true,
          node: parseNode(json.node),
          materialName: String(json.materialName ?? "광석"),
          materialGained: Math.max(0, Math.floor(Number(json.materialGained) || 0)),
          nextActionAt: parseNextActionAt(json.nextActionAt),
          byproducts: Array.isArray(json.byproducts)
            ? json.byproducts.map((item: unknown) => {
                const entry = (item ?? {}) as Record<string, unknown>;
                return {
                  materialId: String(entry.materialId ?? ""),
                  name: String(entry.name ?? "부산물"),
                  amount: Math.max(0, Math.floor(Number(entry.amount) || 0)),
                };
              })
            : [],
          xpGained: Math.max(0, Math.floor(Number(json.xpGained) || 0)),
          log: nextLog,
        };
      }
      throw new Error("mining_finish_failed");
    },
    [readJson],
  );

  const startAuto = useCallback(async (spotId: MiningSpotId): Promise<void> => {
    setAutoLoading(true);
    try {
      const response = await fetch("/api/v2/mining/auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", spotId }),
      });
      const json = await readJson(response);
      if (!response.ok || !json?.ok) {
        const active = parseAutoActivity(json?.activeAutoActivity);
        if (active) setActiveAutoActivity(active);
        throw new Error("mining_auto_start_failed");
      }
      setAutoSession(parseAutoSession(json.autoSession));
      setActiveAutoActivity("mining");
      setAutoResult(null);
    } finally {
      setAutoLoading(false);
    }
  }, [readJson]);

  const claimAuto = useCallback(async (): Promise<void> => {
    setAutoLoading(true);
    try {
      const response = await fetch("/api/v2/mining/auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      const json = await readJson(response);
      if (!response.ok || !json?.ok) throw new Error("mining_auto_claim_failed");
      setMaterials(parseMaterials(json.materials));
      setLog(parseLog(json.log));
      setAutoSession(null);
      setActiveAutoActivity(parseAutoActivity(json.activeAutoActivity));
      setAutoResult(parseAutoResult(json));
    } finally {
      setAutoLoading(false);
    }
  }, [readJson]);

  const cancelAuto = useCallback(async (): Promise<void> => {
    setAutoLoading(true);
    try {
      const response = await fetch("/api/v2/mining/auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const json = await readJson(response);
      if (!response.ok || !json?.ok) throw new Error("mining_auto_cancel_failed");
      setAutoSession(null);
      setActiveAutoActivity(parseAutoActivity(json.activeAutoActivity));
      setAutoResult(null);
    } finally {
      setAutoLoading(false);
    }
  }, [readJson]);

  return {
    start,
    finish,
    materials,
    log,
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
