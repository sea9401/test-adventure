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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useWoodcutting(): WoodcuttingHandlers {
  const [materials, setMaterials] = useState<Record<string, number>>({});
  const [log, setLog] = useState<WoodcuttingLogView>({ cuts: 0, xp: 0, timberEarned: 0 });

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
    if (!response.ok) throw new Error("woodcutting_start_failed");
    const json = await response.json();
    const durationMs = Math.max(1, Math.floor(Number(json?.durationMs) || 0));
    const chops = Math.max(1, Math.floor(Number(json?.chops) || 0));
    if (!json?.ok || typeof json.sessionId !== "string" || !durationMs || !chops) {
      throw new Error("woodcutting_start_failed");
    }
    setMaterials(parseMaterials(json.materials));
    setLog(parseLog(json.log));
    return {
      sessionId: json.sessionId,
      spotId,
      tree: parseTree(json.tree),
      durationMs,
      chops,
    };
  }, []);

  const finish = useCallback(async (sessionId: string): Promise<WoodcuttingOutcome> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("/api/v2/woodcutting/chop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!response.ok) throw new Error("woodcutting_finish_failed");
      const json = await response.json();
      if (!json?.ok) throw new Error("woodcutting_finish_failed");
      if (!json.success && json.reason === "not_ready" && attempt === 0) {
        await wait(Math.max(25, Math.floor(Number(json.retryAfterMs) || 0) + 25));
        continue;
      }
      if (!json.success) {
        return {
          success: false,
          reason: typeof json.reason === "string" ? json.reason : "unknown",
        };
      }
      const nextMaterials = parseMaterials(json.materials);
      const nextLog = parseLog(json.log);
      setMaterials(nextMaterials);
      setLog(nextLog);
      return {
        success: true,
        tree: parseTree(json.tree),
        materialName: String(json.materialName ?? "원목"),
        materialGained: Math.max(0, Math.floor(Number(json.materialGained) || 0)),
        xpGained: Math.max(0, Math.floor(Number(json.xpGained) || 0)),
        log: nextLog,
      };
    }
    throw new Error("woodcutting_finish_failed");
  }, []);

  return { start, finish, materials, log };
}
